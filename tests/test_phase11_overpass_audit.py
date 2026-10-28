"""Phase 11A scenarios retained as corrected-behavior regressions for Phase 11B.

Historical defect evidence remains in the unchanged Phase 11A reports.
All HTTP and waits are mocked or bounded by test-only synchronization events.
"""
import json
import logging
import threading
from concurrent.futures import ThreadPoolExecutor
from unittest.mock import Mock, patch

import requests
import pytest
from flask import Flask, g
import overpass_helper as oh
from voyagr.utils import request_budget as rb, overpass_audit as audit


def client(endpoints=None, retries=1):
    endpoints=[{'local':'http://localhost:8080/api/interpreter','public':'https://overpass-api.de/api/interpreter'}.get(e,e) for e in (endpoints or ['http://localhost:8080/api/interpreter'])]
    return oh.OverpassClient(endpoints=endpoints,
                             max_retries=retries, cache=oh.OverpassCache())


def response(status=200, data=None):
    r=requests.Response();r.status_code=status;r._content=json.dumps({'elements':[]} if data is None else data).encode();r._content_consumed=True;r.headers['Content-Type']='application/json';return r


@pytest.mark.parametrize('status', [502, 429])
def test_corrected_retry_exhaustion_and_final_unnecessary_wait(status):
    c=client(['local', 'public'], retries=3)
    with patch.object(rb, 'post', return_value=response(status)) as post, patch.object(rb, 'retry_wait') as wait:
        result=c.query('synthetic', skip_cache=True)
    assert not result['success']
    assert post.call_count == (4 if status==502 else 2)
    assert [v.args[0] for v in wait.call_args_list] == ([1,2] if status==502 else [])


@pytest.mark.parametrize('payload', ['<html>502 upstream</html>', '', '{"elements":['])
def test_invalid_json_falls_back_without_caching(payload):
    c=client(['local','public'])
    bad=response();bad._content=payload.encode()
    with patch.object(rb, 'post', side_effect=[bad,response()]) as post:
        result=c.query('synthetic')
    assert result['success'] and post.call_count == 2
    assert c.cache.stats['size'] == 1


@pytest.mark.parametrize('data', [{}, {'remark':'runtime error: out of memory'}, {'elements':[], 'remark':'runtime error: timeout'}])
def test_corrected_incomplete_json_reported_as_empty_success(data):
    c=client()
    with patch.object(rb, 'post', return_value=response(data=data)) as post:
        assert not c.query('synthetic')['success']
    assert c.cache.stats['size'] == 0
    assert post.call_count == 1


def test_corrected_non_list_elements_accepted():
    with patch.object(rb, 'post', return_value=response(data={'elements': {'unexpected':1}})):
        assert not client().query('synthetic')['success']


def test_empty_valid_response_and_large_result_are_not_errors():
    c=client()
    for size in (0,5295):
        with patch.object(rb, 'post', return_value=response(data={'elements':[{'type':'node','id':1,'lat':53.5,'lon':-1.2}]*size})):
            assert len(c.query('synthetic', skip_cache=True)['elements']) == size


def test_corrected_local_failure_history_demoting_local_on_next_query():
    c=client(['local','public']);clock=[0];c.clock=lambda:clock[0]
    with patch.object(rb, 'post', side_effect=[rb.requests.ConnectionError(),response(),response()]) as post:
        assert c.query('first')['success']
        clock[0]=3
        assert c.query('second')['success']
    assert [call.args[0] for call in post.call_args_list] == [c.endpoints[0],c.endpoints[1],c.endpoints[0]]


def test_corrected_429_can_reselect_same_endpoint_without_trying_public():
    c=client(['local','public'])
    c._health[c.endpoints[1]]=c.clock()+100
    with patch.object(rb, 'post', return_value=response(429)) as post, patch.object(rb,'retry_wait'):
        c.query('synthetic')
    assert [call.args[0] for call in post.call_args_list] == [c.endpoints[0]]


def test_expired_budget_blocks_io_but_is_misclassified_as_provider_timeout(caplog):
    app=Flask(__name__)
    with app.test_request_context('/api/route'), caplog.at_level(logging.WARNING):
        g.routing_budget=rb.RoutingBudget(0)
        with patch.object(rb.requests,'post') as post:
            with pytest.raises(rb.RoutingDeadlineExceeded): client().query('synthetic')
        post.assert_not_called()
    assert 'Timeout on' not in caplog.text


def test_slow_response_rejected_and_no_public_attempt():
    clock=[0]
    def slow(*args, **kwargs):
        assert kwargs['timeout'] == (3,5)
        clock[0]=6
        return response()
    app=Flask(__name__)
    with app.test_request_context('/api/route'):
        g.routing_budget=rb.RoutingBudget(5,clock=lambda:clock[0])
        with patch.object(rb.requests,'post',side_effect=slow) as post:
            with pytest.raises(rb.RoutingDeadlineExceeded): client(['local','public']).query('synthetic')
        assert post.call_count == 1


def test_corrected_cache_hit_bypassing_budget_check():
    c=client(); c.cache.set('key',[])
    app=Flask(__name__)
    with app.test_request_context('/api/route'):
        g.routing_budget=rb.RoutingBudget(0)
        with pytest.raises(rb.RoutingDeadlineExceeded): c.query('synthetic', cache_key='key')


def test_corrected_concurrent_identical_misses_not_coalesced():
    entered=threading.Event();release=threading.Event()
    c=client()
    def post(*args, **kwargs):
        entered.set();assert release.wait(2)
        return response()
    with patch.object(rb,'post',side_effect=post) as transport, ThreadPoolExecutor(max_workers=2) as pool:
        owner=pool.submit(c.query,'identical');assert entered.wait(2)
        waiter=pool.submit(c.query,'identical');release.set()
        assert owner.result(timeout=3)['success'] and waiter.result(timeout=3)['success']
    assert transport.call_count == 1


def test_corrected_equivalent_query_custom_keys_bypassing_shared_cache():
    c=client()
    query=oh.build_traffic_signals_query(1,2,1.1,2.1)
    with patch.object(rb,'post',return_value=response()) as post:
        c.query(query,cache_key='tl_bbox_1_2_3_4')
        c.query(query,cache_key='traffic_lights_1_2_3_4')
    assert post.call_count == 1


def test_corrected_viewport_wait_timeout_leaves_task_alive_without_route_budget(caplog):
    from voyagr.api import hazards
    started=threading.Event();release=threading.Event();finished=threading.Event();observed=[]
    def work():
        observed.append((rb.current_budget(),audit.trace()['id']))
        started.set()
        try: assert release.wait(2)
        finally: finished.set()
        return []
    app=Flask(__name__);audit.register(app)
    with caplog.at_level(logging.INFO), app.test_request_context('/api/traffic-lights/area'):
        app.preprocess_request();identity=audit.trace()['id']
        g.routing_budget=rb.RoutingBudget(30)
        try:
            with patch.object(hazards,'_OSM_AREA_FETCH_TIMEOUT_SEC',0.02):
                assert hazards._run_osm_area_fetch(work) == []
            assert started.is_set() and not finished.is_set()
            assert len(observed)==1 and isinstance(observed[0][0],rb.WorkBudget)
            assert observed[0][1]==identity and observed[0][0].cancel_event.is_set()
        finally: release.set();assert finished.wait(2)
    assert 'area_wait_timeout' in caplog.text


def test_client_cancellation_has_no_server_signal():
    """Simulate client abandonment; Flask has no browser AbortSignal in this path."""
    app=Flask(__name__);audit.register(app)
    abandoned=threading.Event()
    def transport(*args, **kwargs):
        abandoned.set()  # Browser could stop waiting here; server still returns.
        return response()
    with app.test_request_context('/api/route'):
        app.preprocess_request();g.routing_budget=rb.RoutingBudget(30)
        with patch.object(rb.requests,'post',side_effect=transport):
            assert client().query('synthetic')['success']
    assert abandoned.is_set()


def test_diagnostics_correlate_request_and_hide_query_and_client_id(caplog):
    app=Flask(__name__);audit.register(app)
    @app.get('/api/test')
    def endpoint():
        client().query('PRIVATE_COORDINATES secret-token',cache_key='private-key')
        return {'ok':True}
    with caplog.at_level(logging.INFO), patch.object(rb,'post',return_value=response()):
        result=app.test_client().get('/api/test',headers={'X-Voyagr-Request-ID':'untrusted-token'})
    identity=result.headers['X-Voyagr-Request-ID']
    records=[r.getMessage() for r in caplog.records if r.name==audit.__name__]
    assert len(identity)==32 and all(identity in r for r in records)
    assert any('attempt_started' in r for r in records) and any('response_ready' in r for r in records)
    assert not any(value in '\n'.join(records) for value in ['PRIVATE_COORDINATES','secret-token','untrusted-token','private-key','localhost'])


def test_corrected_runtime_error_becoming_available_empty_hazard_coverage():
    from voyagr.services.hazards import fetch_traffic_lights_osm_bbox
    c=client()
    with patch.object(oh,'get_client',return_value=c), patch.object(rb,'post',return_value=response(data={'remark':'runtime error: out of memory'})):
        result=fetch_traffic_lights_osm_bbox(53.5,53.51,-1.2,-1.19)
    assert result == [] and result.coverage['status'] == 'UNKNOWN'


def test_corrected_routing_hazard_preparation_swallowing_deadlines():
    from voyagr.services.routing.hazard_prep import HazardPrefs, prepare_route_hazards
    import voyagr_web as web
    prefs=HazardPrefs([],True,True,True,True)
    with patch.object(web,'fetch_hazards_for_route',return_value={}), patch.object(web,'fetch_tomtom_incidents',return_value={}), patch.object(web,'filter_camera_hazards_by_preferences'), patch('voyagr.services.hazards.fetch_traffic_lights_osm_bbox',side_effect=rb.RoutingDeadlineExceeded()) as lights, patch('voyagr.services.hazards.fetch_railway_crossings_osm_bbox',side_effect=rb.RoutingDeadlineExceeded()) as railway:
        with pytest.raises(rb.RoutingDeadlineExceeded): prepare_route_hazards(53.5,-1.2,53.51,-1.19,prefs)
    assert lights.call_count == 1 and railway.call_count == 0


def test_corrected_lane_direct_request_bypassing_expired_routing_budget():
    from voyagr.api import navigation
    app=Flask(__name__)
    with app.test_request_context('/api/lane-guidance'):
        g.routing_budget=rb.RoutingBudget(0)
        with patch.dict(navigation._lane_data_cache,clear=True), patch.object(navigation.requests,'get',return_value=response()) as transport:
            with pytest.raises(rb.RoutingDeadlineExceeded): navigation._fetch_osm_lane_data(53.5,-1.2)
        transport.assert_not_called()


def test_concurrent_flask_requests_keep_separate_diagnostic_identity(caplog):
    app=Flask(__name__);audit.register(app)
    c=client();barrier=threading.Barrier(2);seen=[]
    @app.get('/api/test')
    def endpoint():
        c.query('synthetic_'+audit.trace()['id'],skip_cache=True)
        return {'ok':True}
    def post(*args,**kwargs):
        seen.append(audit.trace()['id'])
        barrier.wait(timeout=2)
        return response()
    def fetch():
        with app.test_client() as browser:
            return browser.get('/api/test').headers['X-Voyagr-Request-ID']
    with caplog.at_level(logging.INFO), patch.object(rb,'post',side_effect=post), ThreadPoolExecutor(max_workers=2) as pool:
        futures=[pool.submit(fetch) for _ in range(2)]
        identities=[future.result(timeout=3) for future in futures]
    assert len(set(identities)) == 2 and set(seen) == set(identities)
    for identity in identities:
        messages=[r.getMessage() for r in caplog.records if r.name==audit.__name__ and identity in r.getMessage()]
        assert sum('query_started' in m for m in messages) == 1
        assert sum('response_ready' in m for m in messages) == 1

"""Selected-route coverage with synthetic map/camera transport; no private history."""
from unittest.mock import MagicMock,patch
import time
import math
import re
import pytest
from flask import Flask
import overpass_helper as oh
from voyagr.api.hazards import hazards_bp
from voyagr.services.routing import route_warning_scan as service
from voyagr.utils import request_budget as rb

BENT=[[53,-1],[53,-.7],[53.3,-.7],[53.3,-1]]


@pytest.fixture
def db(monkeypatch):
    import voyagr.models as models
    connection=MagicMock();connection.cursor.return_value.fetchall.return_value=[]
    monkeypatch.setattr(models,'get_db_connection',lambda:connection)
    monkeypatch.setattr(models,'return_db_connection',lambda _c:None)
    return connection


def payload(elements):
    return {'success':True,'elements':elements,'retrieved_at':time.time(),'endpoint_class':'LOCAL',
            'dataset_timestamp':'2026-11-17T00:00:00Z'}


def node(identity,lat,lon,kind='traffic_light'):
    return {'type':'node','id':identity,'lat':lat,'lon':lon,
            'tags':{'highway':'traffic_signals'} if kind=='traffic_light' else {'railway':'level_crossing'}}


def run(points=BENT):
    pts,binding=service.prepare({'geometry':points,'geometry_precision':6})
    return service.scan(pts,binding)


def test_actual_bent_route_finds_far_from_endpoint_chord_and_filters_unrelated_points(db):
    db.cursor.return_value.fetchall.return_value=[(53.15,-.7005,'speed_camera','Mapped camera')]
    data=payload([node(1,53.15,-.7),node(2,53.3,-.8,'railway_crossing'),node(3,53.15,-.85)])
    with patch.object(oh,'query_overpass',return_value=data) as transport:
        result=run()
    assert {h['type'] for h in result['hazards']}=={'camera_speed','traffic_light','railway_crossing'}
    assert all(c['route_scan']=='ALL_SEGMENTS_QUERIED' for c in result['warning_coverage'].values())
    assert all(c['dataset_completeness_verified'] is False for c in result['warning_coverage'].values())
    assert all('53.1500000,-0.7000000' not in call.args[0] for call in transport.call_args_list) # observations are not query anchors
    assert '53.3000000,-0.7000000' in ''.join(c.args[0] for c in transport.call_args_list)
    assert 'FROM cameras' in db.cursor.return_value.execute.call_args.args[0]
    assert 'community' not in db.cursor.return_value.execute.call_args.args[0]


def test_long_detailed_route_chunks_obey_transport_cap_without_dropping_bends():
    points=[[53+i*.0008,-1+.003*(i%2)] for i in range(2000)]
    queries=service.build_queries(points)
    assert 1<len(queries)<=12 and all(len(q.encode())<65536 for q in queries)
    from shapely.geometry import LineString,Point
    from shapely.ops import unary_union
    chunks=[]
    for query in queries:
        for numbers in re.findall(r'around:200,([^)]*)',query):
            values=list(map(float,numbers.split(',')))
            chunks.append(LineString([(values[i+1]*67000,values[i]*110574) for i in range(0,len(values),2)]))
    corridor=unary_union(chunks)
    assert max(corridor.distance(Point(lon*67000,lat*110574)) for lat,lon in points)<50


def test_all_parts_and_empty_results_mean_queried_not_verified_hazard_absence(db):
    with patch.object(oh,'query_overpass',return_value=payload([])):
        result=run()
    assert result['hazards']==[]
    status=result['warning_coverage']['traffic_light']
    assert status['status']=='AVAILABLE' and status['route_scan']=='ALL_SEGMENTS_QUERIED'
    assert status['dataset_completeness_verified'] is False


def test_failed_provider_keeps_local_cameras_but_does_not_claim_route_scanned(db):
    db.cursor.return_value.fetchall.return_value=[(53.15,-.7,'speed_camera','Mapped')]
    with patch.object(oh,'query_overpass',return_value={'success':False,'elements':[]}):result=run()
    assert len(result['hazards'])==1
    assert result['warning_coverage']['cameras']['status']=='AVAILABLE'
    assert result['warning_coverage']['traffic_light']['route_scan']=='NOT_QUERIED'


@pytest.mark.parametrize('age,status',[(301,'STALE'),(None,'UNKNOWN')])
def test_source_age_is_preserved_instead_of_relabelled_fresh(db,age,status):
    data=payload([node(1,53.15,-.7)])
    data['retrieved_at']=None if age is None else time.time()-age
    with patch.object(oh,'query_overpass',return_value=data):result=run()
    assert result['warning_coverage']['traffic_light']['status']==status


def test_truncation_malformed_records_and_duplicates_cannot_claim_full_results(db):
    with patch.object(oh,'query_overpass',return_value=payload([node(1,53.15,-.7),node(1,53.15,-.7),node(2,True,-.7)])):
        result=run()
    assert len(result['hazards'])==1
    assert result['warning_coverage']['traffic_light']['route_scan']=='LIMITED'
    with patch.object(oh,'query_overpass',return_value=payload([node(i+1,53.15,-.7) for i in range(5001)])):
        result=run()
    assert len(result['hazards'])<=5000
    assert result['warning_coverage']['traffic_light']['reason']=='result_limit'


def test_child_deadline_does_not_publish_expired_provider_output_or_fail_route(db):
    now=[0];parent=rb.RoutingBudget(30,clock=lambda:now[0])
    def expire(*args,**kwargs):now[0]=9;return payload([node(1,53.15,-.7)])
    with rb.use_budget(parent),patch.object(oh,'query_overpass',side_effect=expire):result=run()
    assert result['success'] is True and result['hazards']==[]
    assert result['warning_coverage']['traffic_light']['reason']=='deadline'
    assert result['warning_coverage']['traffic_light']['route_scan']=='NOT_QUERIED'


def test_endpoint_validates_and_returns_geometry_binding_without_account_services(db):
    from voyagr.personal_use import install
    app=Flask(__name__);install(app);app.register_blueprint(hazards_bp,url_prefix='/api')
    with patch.object(oh,'query_overpass',return_value=payload([])):
        response=app.test_client().post('/api/route-warning-observations',json={'geometry':BENT,'geometry_precision':6})
    assert response.status_code==200 and response.headers['Cache-Control']=='no-store'
    assert response.get_json()['geometry_binding']==service.prepare({'geometry':BENT})[1]
    with patch.object(oh,'query_overpass') as transport:
        assert app.test_client().post('/api/route-warning-observations',json={'geometry':[[True,0],[1,0]]}).status_code==400
    transport.assert_not_called()


def test_parent_deadline_remains_a_request_deadline(db):
    with rb.use_budget(rb.RoutingBudget(0)),patch.object(oh,'query_overpass') as transport:
        with pytest.raises(rb.RoutingDeadlineExceeded):run()
    transport.assert_not_called()


def test_retry_reuses_successful_query_parts_and_completes_the_remaining_corridor(db):
    import requests,json
    points=[[53+i*.0008,-1+.003*(i%2)] for i in range(2000)]
    now=[0];calls=[]
    client=oh.OverpassClient(endpoints=['http://localhost:8080/api/interpreter'],cache=oh.OverpassCache(),max_retries=1)
    def transport(*args,**kwargs):
        calls.append(args[0]);now[0]+=5 if len(calls)==1 else 4
        response=requests.Response();response.status_code=200;response.headers['Content-Type']='application/json'
        response._content_consumed=True
        response._content=json.dumps({'elements':[node(1,53,-1)],'osm3s':{'timestamp_osm_base':'2026-11-17T00:00:00Z'}}).encode()
        return response
    with patch.object(oh,'get_client',return_value=client),patch.object(rb,'post',side_effect=transport):
        with rb.use_budget(rb.RoutingBudget(30,clock=lambda:now[0])):first=run(points)
        with rb.use_budget(rb.RoutingBudget(30,clock=lambda:now[0])):second=run(points)
    assert first['warning_coverage']['traffic_light']['route_scan']=='LIMITED'
    assert second['warning_coverage']['traffic_light']['route_scan']=='ALL_SEGMENTS_QUERIED'
    assert len(calls)==3


def test_bounded_spatial_index_preserves_wide_fallback_and_cooperative_cancellation():
    from voyagr.utils.hazard_matching import SegmentIndex
    points=[[53+i*.0001,-1+.001*(i%2)] for i in range(500)]
    checks=[]
    index=SegmentIndex(points,max_cells=32,check=lambda:checks.append(True))
    assert sum(len(entries) for entries in index.grid.values())<=32
    assert index.wide
    assert any(distance==0 for distance,_ in index.nearby(*points[-1],150))
    assert checks

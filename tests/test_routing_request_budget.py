"""Deterministic monotonic clock and transport mocks, no real network."""
from unittest.mock import patch,Mock
from flask import Flask,g,jsonify
import pytest
from voyagr.utils import request_budget as rb
from voyagr.services.routing.integrity_api import register_avoidance_integrity


def test_shared_budget_shrinks_across_provider_failover_and_refuses_late_result():
    now=[0.0];app=Flask(__name__)
    with app.test_request_context():
        g.routing_budget=rb.RoutingBudget(5,clock=lambda:now[0])
        with patch.object(rb.requests,'post',return_value=Mock()) as post:
            rb.post('http://127.0.0.1:8002/route',timeout=10)
            assert post.call_args.kwargs['timeout']==(3,5)
            now[0]=4
            rb.post('http://127.0.0.1:8989/route',timeout=10)
            assert post.call_args.kwargs['timeout']==(1,1)
            now[0]=5
            with pytest.raises(rb.RoutingDeadlineExceeded): rb.post('http://127.0.0.1/route',timeout=10)
            assert post.call_count==2
        assert g.routing_budget.calls==2


def test_late_transport_response_is_discarded_not_treated_as_compliant():
    now=[0.0];app=Flask(__name__)
    with app.test_request_context():
        g.routing_budget=rb.RoutingBudget(5,clock=lambda:now[0])
        def slow(*a,**kw): now[0]=6;return Mock(status_code=200)
        with patch.object(rb.requests,'get',side_effect=slow),pytest.raises(rb.RoutingDeadlineExceeded): rb.get('http://127.0.0.1',timeout=10)


def test_retry_backoff_cannot_exceed_remaining_budget():
    app=Flask(__name__)
    with app.test_request_context(),patch.object(rb.time,'sleep') as sleep:
        g.routing_budget=rb.RoutingBudget(1,clock=lambda:0)
        with pytest.raises(rb.RoutingDeadlineExceeded): rb.retry_wait(2)
        sleep.assert_not_called()


def test_request_budgets_are_isolated_and_no_context_preserves_existing_timeout():
    app=Flask(__name__)
    with app.test_request_context():
        g.routing_budget=rb.RoutingBudget(0,clock=lambda:0)
    with app.test_request_context(): assert rb.current_budget() is None
    with patch.object(rb.requests,'get') as get:
        rb.get('http://127.0.0.1',timeout=17)
        assert get.call_args.kwargs['timeout']==17


def test_http_boundary_returns_504_for_late_success():
    app=Flask(__name__);register_avoidance_integrity(app)
    @app.post('/api/route')
    def route():
        g.routing_budget=rb.RoutingBudget(0,clock=lambda:0)
        return jsonify(success=True,geometry=[[53,-1],[53.1,-1]])
    rv=app.test_client().post('/api/route',json={'avoid_caz':False})
    assert rv.status_code==504
    assert rv.json['error_code']=='ROUTING_DEADLINE_EXCEEDED'
    assert rv.json['automatic_selection_allowed'] is False


def test_overpass_rate_limit_stops_when_shared_budget_is_exhausted():
    import overpass_helper as oh
    now=[0.0];app=Flask(__name__)
    with app.test_request_context():
        g.routing_budget=rb.RoutingBudget(.5,clock=lambda:now[0])
        client=oh.OverpassClient(endpoints=['http://127.0.0.1/overpass'],max_retries=3)
        with patch.object(rb.requests,'post',return_value=Mock(status_code=429)) as post,patch.object(rb.time,'sleep') as sleep:
            # Insufficient backoff budget exits the helper rather than repeatedly sleeping.
            with pytest.raises(rb.RoutingDeadlineExceeded): client.query('synthetic-query',skip_cache=True)
            assert post.call_count==1
            sleep.assert_not_called()

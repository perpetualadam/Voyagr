"""Actual policy, matching and deadline paths; no live routing claims."""
import copy
from unittest.mock import patch, Mock

import pytest
from flask import Flask, g
from voyagr.services.routing.integrity import assess_response, assess_route, normalize_requirements
from voyagr.services.routing.route_variety import finalize_route_variety
from voyagr.services.routing.engines import route_with_graphhopper
from voyagr.services.routing.orchestrator import post_valhalla_route
from voyagr.utils import request_budget as rb
from voyagr.utils.hazard_matching import HazardDataset

NOW=1800000000
LINE=[[53.52,-1.13],[53.53,-1.13]]
OTHER=[[53.52,-1.129],[53.53,-1.129]]


def route(engine='GraphHopper',geometry=None,cameras=20):
    return {'source':engine,'name':'⚡ Optimised' if engine=='GraphHopper' else 'Fastest','geometry':geometry or LINE,'geometry_precision':6,'distance_km':2,'duration_minutes':26 if engine=='GraphHopper' else 25,'hazard_count':cameras,'hazard_penalty_seconds':cameras*1000,'maneuvers':[]}


def requirements(mode='preference'):
    return normalize_requirements({'avoid_caz':False,'avoidance_requirements':[{'category':'speed_cameras','enabled':True,'mode':mode}]})


def coverage(items):
    return HazardDataset({'camera_speed':items},coverage={'camera_speed':{'status':'AVAILABLE','retrieved_at':NOW,'bounds':[53.5,-1.2,53.55,-1],'source':'synthetic'},'camera_average_speed':{'status':'AVAILABLE','retrieved_at':NOW,'bounds':[53.5,-1.2,53.55,-1],'source':'synthetic'}})


def test_preference_graphhopper_is_first_despite_twice_the_proximity_count():
    payload={'success':True,'routes':[route('Valhalla',OTHER,10),route()]}
    out=assess_response(payload,requirements(),{},now=NOW)
    assert out['routes'][0]['source']=='GraphHopper'
    assert out['routes'][0]['route_comparison']['ranking_reason']=='graphhopper_primary_policy'
    assert out['routes'][0]['avoidance_assessment']['status']=='UNVERIFIED'


def test_mandatory_ineligible_graphhopper_cannot_displace_verified_alternative():
    gh=route();vh=route('Valhalla',OTHER,10)
    vh['road_segments']=[{'begin_shape_index':0,'end_shape_index':1,'osm_way_id':'20','observed_at_ms':NOW*1000}]
    hazard={'id':'x','lat':53.525,'lon':-1.13,'osm_way_id':'10','observed_at_ms':NOW*1000,'directionality':'both'}
    out=assess_response({'success':True,'routes':[gh,vh]},requirements('mandatory'),coverage([hazard]),now=NOW)
    assert out['routes'][0]['source']=='Valhalla'
    assert out['routes'][1]['route_comparison']['automatic_selection_allowed'] is False


def test_graphhopper_same_geometry_is_not_deleted_before_compliance_assessment():
    gh=route();vh=route('Valhalla')
    with patch('voyagr.services.routing.route_variety.routes_are_distinct',return_value=False):
        result=finalize_route_variety([vh,gh],max_detour_percent=20)
    assert any(r['source']=='GraphHopper' for r in result)


def test_conflicting_camera_identity_records_cannot_be_deduplicated_into_clearance():
    r=route();r['road_segments']=[{'begin_shape_index':0,'end_shape_index':1,'osm_way_id':'10','observed_at_ms':NOW*1000}]
    h={'id':'shared','lat':53.525,'lon':-1.13,'observed_at_ms':NOW*1000,'directionality':'both'}
    items=[dict(h,osm_way_id='20'),dict(h,osm_way_id='10')]
    assessment=assess_route(r,requirements('mandatory'),coverage(items),now=NOW)
    active=next(row for row in assessment['requirements'] if row['enabled'])
    assert active['status']=='VIOLATED'
    assert active['conflicts']==1
    assert assessment['automatic_selection_allowed'] is False


def test_graphhopper_exhaustion_is_not_reported_as_provider_timeout(caplog):
    app=Flask(__name__)
    with app.test_request_context():
        g.routing_budget=rb.RoutingBudget(0,clock=lambda:0)
        with patch('voyagr.services.routing.engines.get_graphhopper_capabilities',return_value={'state':'unavailable','encoded_values':{}}),patch('voyagr.services.hazards.build_graphhopper_combined_camera_model',return_value={'priority':[{'if':'in_camera_area_0','multiply_by':'0'}]}),pytest.raises(rb.RoutingDeadlineExceeded):
            route_with_graphhopper(53,-1,54,-2)
    assert 'Request timeout after' not in caplog.text


def test_valhalla_deadline_propagates_without_transport_or_retry():
    app=Flask(__name__)
    with app.test_request_context():
        g.routing_budget=rb.RoutingBudget(0,clock=lambda:0)
        with patch.object(rb,'post') as post,pytest.raises(rb.RoutingDeadlineExceeded):
            post_valhalla_route('http://isolated.invalid/route',{}, {},10)
        post.assert_not_called()


@pytest.mark.parametrize('kind,field', [('adjacent','confirmed_unrelated'),('opposing','confirmed_unrelated'),('ambiguous','possible'),('stale','unknown_or_stale')])
def test_camera_evidence_distinguishes_association_and_uncertainty(kind,field):
    r=route();r['road_segments']=[{'begin_shape_index':0,'end_shape_index':1,'osm_way_id':'10','observed_at_ms':NOW*1000}]
    h={'id':'x','lat':53.525,'lon':-1.13,'osm_way_id':'10','observed_at_ms':NOW*1000,'directionality':'both'}
    if kind=='adjacent':h['osm_way_id']='20'
    if kind=='opposing':h.update(travel_bearing_deg=180,directionality='forward')
    if kind=='ambiguous':h.pop('osm_way_id')
    if kind=='stale':h['observed_at_ms']-=601000
    out=assess_response({'success':True,'routes':[r]},requirements('mandatory'),coverage([h]),now=NOW)
    assert out['routes'][0]['camera_evidence'][field]==1
    if kind in ('ambiguous','stale'):assert not out['automatic_selection_allowed']


def test_both_compliant_mandatory_options_still_prefer_graphhopper():
    gh=route();vh=route('Valhalla',OTHER,10)
    for r in (gh,vh):r['road_segments']=[{'begin_shape_index':0,'end_shape_index':1,'osm_way_id':'20','observed_at_ms':NOW*1000}]
    h={'id':'x','lat':53.525,'lon':-1.13,'osm_way_id':'10','observed_at_ms':NOW*1000,'directionality':'both'}
    out=assess_response({'success':True,'routes':[vh,gh]},requirements('mandatory'),coverage([h]),now=NOW)
    assert out['routes'][0]['source']=='GraphHopper'
    assert out['routes'][0]['avoidance_assessment']['status']=='SATISFIED'


def test_zero_proximity_count_and_missing_coverage_never_prove_camera_free():
    gh=route(cameras=0)
    out=assess_response({'success':True,'routes':[gh]},requirements('mandatory'),{},now=NOW)
    assert out['avoidance_assessment']['status']=='UNVERIFIED'
    assert not out['automatic_selection_allowed']


def test_invalid_graphhopper_geometry_does_not_pin_over_valid_fallback():
    gh=route();gh['geometry']=None
    out=assess_response({'success':True,'routes':[gh,route('Valhalla',OTHER)]},requirements(),{},now=NOW)
    assert out['routes'][0]['source']=='Valhalla'
    assert not out['routes'][1]['avoidance_assessment']['automatic_selection_allowed']


def test_slow_valhalla_exhaustion_stops_before_next_retry_and_preserves_remaining_budget():
    now=[0.0];app=Flask(__name__)
    with app.test_request_context():
        g.routing_budget=rb.RoutingBudget(5,clock=lambda:now[0])
        def slow(*args,**kwargs):now[0]=6;return Mock(status_code=200)
        with patch.object(rb.requests,'post',side_effect=slow) as post,pytest.raises(rb.RoutingDeadlineExceeded):
            post_valhalla_route('http://isolated.invalid/route',{}, {},30)
        assert post.call_count==1
        assert post.call_args.kwargs['timeout']==(3,5)


def test_actual_flask_hazard_deadline_never_enters_provider_fallback():
    import voyagr_web as vw
    def exhausted(*args,**kwargs):
        g.routing_budget.deadline=g.routing_budget.clock()-1
        return {}
    with patch.object(vw,'prepare_route_hazards',side_effect=exhausted),patch.object(vw,'attempt_graphhopper_camera_route') as gh,patch.object(vw,'post_valhalla_route') as vh,patch.object(vw.requests,'get') as get:
        rv=vw.app.test_client().post('/api/route',json={'start':'53,-1','end':'53.1,-1.1','avoid_caz':False,'force_refresh':True})
    assert rv.status_code==504 and rv.is_json
    assert rv.json['error_origin']=='application'
    assert rv.headers['X-Voyagr-Error-Origin']=='application'
    gh.assert_not_called();vh.assert_not_called();get.assert_not_called()


def test_late_serialization_is_replaced_by_structured_deadline():
    from voyagr.services.routing.integrity_api import register_avoidance_integrity
    app=Flask(__name__);register_avoidance_integrity(app);now=[0.0]
    original=app.json.dumps
    def slow(data,*args,**kwargs):
        value=original(data,*args,**kwargs)
        if isinstance(data,dict) and data.get('avoidance_assessment'):now[0]=6
        return value
    @app.post('/api/route')
    def endpoint():
        from flask import jsonify
        g.routing_budget=rb.RoutingBudget(5,clock=lambda:now[0])
        return jsonify(success=True,routes=[route()])
    with patch.object(app.json,'dumps',side_effect=slow):rv=app.test_client().post('/api/route',json={'avoid_caz':False})
    assert rv.status_code==504 and rv.json['error_code']=='ROUTING_DEADLINE_EXCEEDED'
    assert rv.json['stage_timings']['serialization']['elapsed_ms']==6000


def test_multistop_deadline_is_not_converted_to_provider_failure():
    from voyagr.services.routing.multidrop import _osrm_leg
    app = Flask(__name__)
    with app.test_request_context('/api/multi-stop-route'):
        g.routing_budget = rb.RoutingBudget(0)
        with patch.object(rb.requests, 'get') as transport:
            with pytest.raises(rb.RoutingDeadlineExceeded):
                _osrm_leg({'lat':53.5,'lon':-1.1}, {'lat':53.6,'lon':-1.2})
        transport.assert_not_called()

"""Real journey assembly and HTTP boundary, synthetic UK roads; providers mocked."""
import copy
from unittest.mock import patch
import polyline
import pytest
from voyagr.services.routing import multidrop as md
from voyagr.services.routing.journey_geometry import stitch_legs,decode_geometry,IncompleteJourney,geometry_binding
from voyagr.services.routing.integrity import assess_response,normalize_requirements

POINTS=[(round(53.52+i*.002,6),round(-1.13+i*.001,6)) for i in range(8)]
def wp(p): return {'lat':p[0],'lon':p[1]}
def leg(a,b,precision=6):
    return {'geometry':polyline.encode([a,b],precision=precision),'geometry_precision':precision,
            'distance_km':1.25,'duration_seconds':120,'source':'Valhalla',
            'maneuvers':[{'instruction':'Start','type':1,'begin_shape_index':0,'end_shape_index':1},
                         {'instruction':'Arrive','type':4,'begin_shape_index':1,'end_shape_index':1}]}
def build(n=3,**kw):
    def provider(a,b,*args,**kwargs): return leg((a['lat'],a['lon']),(b['lat'],b['lon']))
    with patch.object(md,'_route_leg',side_effect=provider):
        return md.build_multidrop_route(wp(POINTS[0]),wp(POINTS[n+1]),
            [dict(wp(p),name=f'Stop {i}',duration=1) for i,p in enumerate(POINTS[1:n+1])],optimize_order=False,**kw)

@pytest.mark.parametrize('n',[2,3,5])
def test_complete_journey_not_first_leg(n):
    out=build(n)
    assert out['success']
    assert decode_geometry(out['geometry'])==POINTS[:n+2]
    assert out['total_distance_km']==(n+1)*1.25
    assert out['total_duration_seconds']==(n+1)*120+n*60
    assert [l['to'] for l in out['legs']]==[wp(p) for p in POINTS[1:n+2]]
    assert out['maneuvers'][-1]['begin_shape_index']==n+1
    assert [m['leg_index'] for m in out['maneuvers']]==[i for i in range(n+1) for _ in range(2)]
    assert out['leg_geometry_ranges'][-1]['end_shape_index']==n+1
    assert out['legs'][1]['maneuvers'][0]['begin_shape_index']==0  # local remains local


def test_optimized_visit_order_is_used_by_full_geometry():
    order=[dict(wp(POINTS[i]),name=str(i),sequence=j+1,original_index=i) for j,i in enumerate((3,1,2))]
    def provider(a,b,*args,**kw): return leg((a['lat'],a['lon']),(b['lat'],b['lon']))
    with patch.object(md,'optimize_stop_order',return_value={'optimized_stops':order}),patch.object(md,'_route_leg',side_effect=provider):
        out=md.build_multidrop_route(wp(POINTS[0]),wp(POINTS[4]),order)
    assert decode_geometry(out['geometry'])==[POINTS[i] for i in (0,3,1,2,4)]
    assert [s['name'] for s in out['ordered_stops']]==['3','1','2']


@pytest.mark.parametrize('bad',[None,'not a polyline',[],[(0,0)],[(0,0),(float('nan'),0)]])
def test_missing_invalid_intermediate_leg_returns_no_partial_navigation(bad):
    calls=[leg(POINTS[0],POINTS[1]),dict(leg(POINTS[1],POINTS[2]),geometry=bad),leg(POINTS[2],POINTS[3])]
    with patch.object(md,'_route_leg',side_effect=calls):
        out=md.build_multidrop_route(wp(POINTS[0]),wp(POINTS[3]),[wp(p) for p in POINTS[1:3]],optimize_order=False)
    assert out['success'] is False
    assert out['error_code']=='INCOMPLETE_ROUTE'
    assert out['geometry_complete'] is False
    assert not out.get('geometry')
    assert out['automatic_selection_allowed'] is False


def test_mixed_precision_and_geojson_multiline_keep_latlon_and_offsets():
    a,b,c,d=POINTS[:4]
    legs=[leg(a,b,5),dict(leg(b,c),geometry={'type':'LineString','coordinates':[[b[1],b[0]],[c[1],c[0]]]}),
          dict(leg(c,d),geometry={'type':'MultiLineString','coordinates':[[[c[1],c[0]],[d[1],d[0]]]]})]
    out=stitch_legs(legs)
    assert decode_geometry(out['geometry'])==[a,b,c,d]
    assert out['geometry_precision']==6
    assert out['maneuvers'][-1]['end_shape_index']==3


@pytest.mark.parametrize('mutation',['reversed','disconnected','maneuver'])
def test_inconsistent_route_fails_safely(mutation):
    a,b,c=POINTS[:3];legs=[dict(leg(a,b),**{'from':wp(a),'to':wp(b)}),dict(leg(b,c),**{'from':wp(b),'to':wp(c)})]
    if mutation=='reversed': legs[1]['geometry']={'type':'LineString','coordinates':[[b[0],b[1]],[c[0],c[1]]]}
    elif mutation=='disconnected': legs[1]['geometry']=polyline.encode([POINTS[6],POINTS[7]],precision=6)
    else: legs[1]['maneuvers'][0]['end_shape_index']=999
    with pytest.raises(IncompleteJourney): stitch_legs(legs)


def test_full_summary_and_leg_assessments_cannot_disagree():
    out=build(2);out['routes']=[dict(out)]
    req=normalize_requirements({'avoid_caz':False})
    checked=assess_response(out,req)
    assert checked['automatic_selection_allowed']
    assert checked['avoidance_assessment']['geometry_binding']==geometry_binding(checked['routes'][0])
    out['routes'][0]['geometry']=leg(POINTS[0],POINTS[1])['geometry']
    checked=assess_response(out,req)
    assert checked['automatic_selection_allowed'] is False
    assert checked['avoidance_assessment']['geometry_valid'] is False


def test_optimized_api_summary_uses_all_legs():
    from voyagr.services.routing.request_params import parse_route_request
    p=parse_route_request({'start':'53.52,-1.13','end':f'{POINTS[3][0]},{POINTS[3][1]}',
        'via_points':[wp(x) for x in POINTS[1:3]],'optimize_stop_order':True,'enable_hazard_avoidance':False})
    full=build(2)
    with patch.object(md,'build_multidrop_route',return_value=full): out=md.build_route_multidrop_response(p)
    assert decode_geometry(out['geometry'])==POINTS[:4]
    assert out['routes'][0]['geometry']==out['geometry']
    assert out['routes'][0]['leg_geometry_ranges']==out['leg_geometry_ranges']


def test_optimized_incomplete_result_does_not_fall_through_to_route_skipping_stops():
    from voyagr.services.routing.request_params import parse_route_request
    p=parse_route_request({'start':'53.52,-1.13','end':'53.53,-1.12',
        'via_points':[wp(x) for x in POINTS[1:3]],'optimize_stop_order':True})
    incomplete={'success':False,'error_code':'INCOMPLETE_ROUTE','geometry_complete':False}
    with patch.object(md,'build_multidrop_route',return_value=incomplete):
        assert md.build_route_multidrop_response(p)==incomplete


@pytest.mark.parametrize('hazard_leg',[1,2])
def test_camera_on_intermediate_or_final_leg_cannot_be_hidden(hazard_leg):
    from voyagr.utils.hazard_matching import HazardDataset
    out=build(2)
    for i,l in enumerate(out['legs']): l['road_segments']=[{'begin_shape_index':0,'end_shape_index':1,'road_id':str(i),'road_id_namespace':'phase5-fixture','observed_at_ms':1800000000000}]
    p=POINTS[hazard_leg];q=POINTS[hazard_leg+1]
    h={'lat':(p[0]+q[0])/2,'lon':(p[1]+q[1])/2,'road_id':str(hazard_leg),'road_id_namespace':'phase5-fixture','observed_at_ms':1800000000000,'directionality':'both'}
    req=normalize_requirements({'avoid_caz':False,'avoidance_requirements':[{'category':'speed_cameras','enabled':True,'mode':'mandatory'}]})
    checked=assess_response(out,req,HazardDataset({'camera_speed':[h]}),now=1800000000)
    assert checked['legs'][hazard_leg]['avoidance_assessment']['status']=='VIOLATED'
    assert checked['avoidance_status']=='NO_COMPLIANT_ROUTE'
    assert not checked['automatic_selection_allowed']


def test_remaining_stop_order_is_preserved_on_multistop_reroute():
    from voyagr.services.routing.request_params import parse_route_request
    p=parse_route_request({'start':'53.52,-1.13','end':'53.53,-1.12','stops':[wp(POINTS[2])],
                          'preserve_stop_order':True,'is_reroute':True})
    with patch.object(md,'build_multidrop_route',return_value=build(1)) as core:
        assert md.build_route_multidrop_response(p)['success']
        assert core.call_args.kwargs['optimize_order'] is False
        assert core.call_args.kwargs['stops'][0]['lat']==POINTS[2][0]


def test_multileg_valhalla_standard_entry_stitches_geometry_and_global_indices():
    from voyagr.services.routing.route_entries import build_valhalla_route_entry
    from unittest.mock import Mock
    trip={'summary':{'length':2.5,'time':240},'legs':[
        {'shape':leg(POINTS[0],POINTS[1])['geometry'],'summary':{'length':1.25,'time':120},
         'maneuvers':leg(POINTS[0],POINTS[1])['maneuvers']},
        {'shape':leg(POINTS[1],POINTS[2])['geometry'],'summary':{'length':1.25,'time':120},
         'maneuvers':leg(POINTS[1],POINTS[2])['maneuvers']}]}
    cost=Mock();cost.calculate_costs.return_value=dict(fuel_cost=0,fuel_litres=0,toll_cost=0,caz_cost=0)
    out=build_valhalla_route_entry(trip=trip,name='Fastest',route_id=1,traffic_multiplier=1,hazards={},
        cost_calculator=cost,vehicle_type='petrol_diesel',fuel_efficiency=6,fuel_price=1.5,energy_efficiency=20,
        electricity_price=.3,include_tolls=False,include_caz=False,caz_exempt=False)
    assert decode_geometry(out['geometry'])==POINTS[:3]
    assert out['maneuvers'][-1]['begin_shape_index']==2
    checked=assess_response({'success':True,'routes':[out]},normalize_requirements({'avoid_caz':False}))
    assert all('avoidance_assessment' in l for l in checked['routes'][0]['legs'])
    assert checked['automatic_selection_allowed']


def test_actual_flask_optimized_pipeline_returns_entire_journey_and_leg_assessments():
    import voyagr_web as vw
    def provider(a,b,*args,**kwargs): return leg((a['lat'],a['lon']),(b['lat'],b['lon']))
    with patch.object(md,'_valhalla_matrix',return_value=None),patch.object(md,'_route_leg',side_effect=provider):
        rv=vw.app.test_client().post('/api/route',json={'start':'53.52,-1.13',
            'end':f'{POINTS[4][0]},{POINTS[4][1]}','stops':[dict(wp(p),name=str(i)) for i,p in enumerate(POINTS[1:4])],
            'optimize_stop_order':True,'avoid_caz':False,'enable_hazard_avoidance':False,'force_refresh':True})
    out=rv.json
    assert rv.status_code==200 and out['success']
    assert decode_geometry(out['geometry'])==POINTS[:5]
    assert out['routes'][0]['geometry']==out['geometry']
    assert out['automatic_selection_allowed']
    assert len(out['legs'])==4
    assert all(l['avoidance_assessment']['geometry_valid'] for l in out['legs'])
    assert out['routes'][0]['maneuvers'][-1]['end_shape_index']==4
    assert 'routing;dur=' in rv.headers['Server-Timing']


def test_real_cache_reassessment_rejects_first_leg_only_journey_even_avoidance_disabled():
    import voyagr_web as vw
    cached=build(2);cached['routes']=[dict(cached,geometry=cached['legs'][0]['geometry'])]
    with patch.object(vw.route_cache,'get',return_value=cached):
        rv=vw.app.test_client().post('/api/route',json={'start':'53.52,-1.13','end':'53.526,-1.127','avoid_caz':False})
    assert rv.json['cached']
    assert rv.json['automatic_selection_allowed'] is False
    assert rv.json['avoidance_assessment']['geometry_valid'] is False


def test_replay_tools_reject_remote_targets_and_detect_full_segment_polygon_crossing():
    import importlib.util
    from pathlib import Path
    spec=importlib.util.spec_from_file_location('routing_replay',Path('scripts/replay-routing-engines.py'))
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
    with pytest.raises(ValueError): module.loopback('https://production.example/route')
    with pytest.raises(ValueError): module.loopback('http://user:secret@localhost:8002')
    polygon=[(53.522,-1.131),(53.524,-1.131),(53.524,-1.129),(53.522,-1.129)]
    assert module.intersects_forbidden([(53.52,-1.13),(53.526,-1.13)],[polygon])
    assert not module.intersects_forbidden([(53.52,-1.12),(53.526,-1.12)],[polygon])


def test_reversed_visit_order_on_same_segment_is_not_accepted():
    from voyagr.services.routing.journey_geometry import visits_in_order
    r={'geometry':[POINTS[0],POINTS[6]],'geometry_precision':6}
    assert visits_in_order(r,[wp(POINTS[2]),wp(POINTS[4])])
    assert not visits_in_order(r,[wp(POINTS[4]),wp(POINTS[2])])


def test_round_trip_destination_is_the_origin_and_not_the_unused_end():
    from voyagr.services.routing.request_params import parse_route_request
    def provider(a,b,*args,**kw):return leg((a['lat'],a['lon']),(b['lat'],b['lon']))
    p=parse_route_request({'start':'53.52,-1.13','end':'53.534,-1.123','stops':[wp(x) for x in POINTS[1:3]],
                         'round_trip':True,'optimize_stop_order':True,'avoid_caz':False})
    with patch.object(md,'_valhalla_matrix',return_value=None),patch.object(md,'_route_leg',side_effect=provider):
        out=md.build_route_multidrop_response(p)
    assert out['end_lat']==out['start_lat'] and out['end_lon']==out['start_lon']
    assert decode_geometry(out['geometry'])[-1]==POINTS[0]


def test_missing_requested_visit_is_incomplete_even_if_provider_avoided_all_hazards():
    from voyagr.services.routing.journey_geometry import visits_in_order
    r={'geometry':[POINTS[0],POINTS[6]],'geometry_precision':6}
    visits=[{'lat':54,'lon':-2}]
    assert not visits_in_order(r,visits)
    result=assess_response({'success':True,'routes':[r]},normalize_requirements({'avoid_caz':False}),waypoints=visits)
    assert result['error_code']=='INCOMPLETE_ROUTE'
    assert result['success'] is False
    assert result['automatic_selection_allowed'] is False


@pytest.mark.parametrize('parser',['standard_routes','preference_entry'])
def test_recovery_and_preference_parsers_preserve_all_leg_geometry(parser):
    from voyagr.services.routing import valhalla_parsing as vp
    from unittest.mock import Mock
    native={'trip':{'summary':{'length':2.5,'time':240},'legs':[
        {'shape':leg(POINTS[0],POINTS[1])['geometry'],'maneuvers':leg(POINTS[0],POINTS[1])['maneuvers']},
        {'shape':leg(POINTS[1],POINTS[2])['geometry'],'maneuvers':leg(POINTS[1],POINTS[2])['maneuvers']}]}}
    cost=Mock();cost.calculate_costs.return_value=dict(fuel_cost=0,fuel_litres=0,toll_cost=0,caz_cost=0)
    common=dict(hazards={},cost_calculator=cost,vehicle_type='petrol_diesel',fuel_efficiency=6,fuel_price=1.5,
        energy_efficiency=20,electricity_price=.3,include_tolls=False,include_caz=False,caz_exempt=False)
    if parser=='standard_routes':
        routes=vp.valhalla_route_json_to_standard_routes(dict(native,alternates=[copy.deepcopy(native)]),
            valhalla_costing='auto',start_lat=53.52,start_lon=-1.13,traffic_factors=(1,'fixture'),**common)
    else: routes=[vp.valhalla_trip_json_to_std_route_entry('Quiet',native,1,**common)]
    for route in routes:
        assert decode_geometry(route['geometry'])==POINTS[:3]
        assert route['maneuvers'][-1]['begin_shape_index']==2
        assert len(route['legs'])==2


def test_multistop_summary_with_wrong_destination_is_incomplete():
    r={'geometry':POINTS[:3],'geometry_precision':6}
    checked=assess_response({'success':True,'routes':[r]},normalize_requirements({'avoid_caz':False}),
        waypoints=[wp(POINTS[1])],endpoints=(POINTS[0],POINTS[7]))
    assert checked['success'] is False
    assert checked['error_code']=='INCOMPLETE_ROUTE'
    assert checked['automatic_selection_allowed'] is False

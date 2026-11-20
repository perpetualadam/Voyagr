"""Independent warnings with real preparation/serialization and synthetic providers."""
from contextlib import contextmanager
from unittest.mock import MagicMock, patch
import copy
import time
import polyline
import pytest
from flask import Flask
from voyagr.services import hazards as hz
from voyagr.services.routing import warning_observations as warnings
from voyagr.services.routing.hazard_prep import HazardPrefs, prepare_route_hazards
from voyagr.utils.hazard_matching import HazardList
from voyagr.utils import request_budget as rb

LINE = [[53.5,-1.2],[53.502,-1.2]]
CAMERA = {'lat':53.501,'lon':-1.2,'type':'camera_speed'}
RED_CAMERA = {'lat':53.501,'lon':-1.2,'type':'camera_red_light'}


@contextmanager
def empty_preferences():
    db=MagicMock()
    db.cursor.return_value.fetchall.return_value=[]
    yield db


def observations(*area):
    return HazardList([{'lat':53.501,'lon':-1.2,'id':'node_1','source':'Overpass OSM','observed_at_ms':100000}],
                      coverage={'status':'PARTIAL','endpoint_class':'LOCAL','dataset_timestamp':'synthetic','retrieved_at':100})


@pytest.mark.parametrize('avoid',[False,True])
def test_preparation_retains_warnings_without_reintroducing_engine_exclusions(avoid,monkeypatch):
    import voyagr_web as web
    monkeypatch.setenv('VOYAGR_PERSONAL_MODE','1')
    app=Flask(__name__)
    with app.test_request_context('/api/route'),patch.object(web,'fetch_hazards_for_route',return_value={'camera_speed':[CAMERA],'camera_red_light':[RED_CAMERA]}), \
            patch.object(web,'fetch_tomtom_incidents',return_value={}), \
            patch.object(web,'filter_camera_hazards_by_preferences',side_effect=web.clear_camera_hazard_buckets), \
            patch.object(hz,'fetch_traffic_lights_osm_bbox',side_effect=observations), \
            patch.object(hz,'fetch_railway_crossings_osm_bbox',side_effect=observations), \
            patch.object(hz,'db_connection',empty_preferences):
        dataset=prepare_route_hazards(*LINE[0],*LINE[-1],HazardPrefs([],avoid,avoid,avoid,avoid))
        # Camera subtype preferences are off in this fixture regardless of master.
        assert dataset['camera_speed']==[]
        assert dataset['camera_red_light']==[]
        assert bool(dataset['traffic_light']) is avoid
        assert bool(dataset['railway_crossing']) is avoid
        rows=hz.get_hazards_on_route(LINE,dataset)
        assert {r['type'] for r in rows}=={'camera_speed','camera_red_light','traffic_light','railway_crossing'}
        assert all(r['source']=='Overpass OSM' for r in rows if not r['type'].startswith('camera_'))
        if not avoid:
            assert hz.score_route_by_hazards(LINE,dataset)==(0,0)
            assert hz.build_valhalla_exclude_locations(dataset)==[]
        copied=copy.deepcopy(dataset)
        copied['camera_speed'].append({'lat':54,'lon':-2})
        assert copied.warning_observations['camera_speed']==[CAMERA]


def test_moderate_journey_no_longer_skips_signal_and_crossing_acquisition():
    import overpass_helper as oh
    from voyagr.services.routing.warning_observations import collect
    fixture={'success':True,'elements':[{'type':'node','id':1,'lat':53.5,'lon':-1.2,'tags':{}}],
             'endpoint_class':'LOCAL','retrieved_at':time.time(),'dataset_coverage':'UNVERIFIED'}
    with patch.object(oh,'query_overpass',return_value=fixture) as transport:
        result=collect([[53.38,-1.2],[53.55,-1.2]],{})
    assert transport.call_count==2
    assert len(result['traffic_light'])==len(result['railway_crossing'])==1
    assert result['traffic_light'].coverage['status']=='PARTIAL'
    assert len(warnings.planning_areas([[53.38,-1.2],[53.55,-1.2]]))==1


def test_long_bent_journey_uses_at_most_four_small_areas_and_preserves_partial_coverage():
    points=[[53,-2],[54,-2],[54,-1],[55,-1]]
    def at_center(s,n,w,e):
        return HazardList([{'lat':(s+n)/2,'lon':(w+e)/2,'id':'same'},{'lat':(s+n)/2,'lon':(w+e)/2,'id':'same'}],coverage={'status':'AVAILABLE'})
    with patch.object(hz,'fetch_traffic_lights_osm_bbox',side_effect=at_center) as signals, \
            patch.object(hz,'fetch_railway_crossings_osm_bbox',side_effect=at_center) as crossings:
        result=warnings.collect(points,{})
    assert signals.call_count==crossings.call_count==4
    assert len(result['traffic_light'])==4
    for call in signals.call_args_list:
        s,n,w,e=call.args
        assert 0<n-s<=.35 and 0<e-w<=.35
    assert result['traffic_light'].coverage['status']=='PARTIAL'
    assert result['traffic_light'].coverage['reason']=='bounded_planning_areas'


def test_provider_failure_is_unknown_not_empty_complete_coverage():
    failed=HazardList(coverage={'status':'UNKNOWN'})
    with patch.object(hz,'fetch_traffic_lights_osm_bbox',return_value=failed),patch.object(hz,'fetch_railway_crossings_osm_bbox',return_value=failed):
        data=warnings.collect(LINE,{})
    assert data['traffic_light']==[] and data['traffic_light'].coverage['status']=='UNKNOWN'
    assert data['railway_crossing'].coverage['acquired_area_count']==0


def test_child_deadline_stops_queries_without_publishing_expired_observations():
    now=[0]
    parent=rb.RoutingBudget(30,clock=lambda:now[0])
    def expire(*area):
        now[0]=9
        return observations(*area)
    with rb.use_budget(parent),patch.object(hz,'fetch_traffic_lights_osm_bbox',side_effect=expire) as signals, \
            patch.object(hz,'fetch_railway_crossings_osm_bbox') as crossings:
        result=warnings.collect(LINE,{})
    assert signals.call_count==1 and crossings.call_count==0
    assert result['traffic_light']==[] and result['traffic_light'].coverage['status']=='UNKNOWN'


def test_parent_deadline_remains_an_error():
    with rb.use_budget(rb.RoutingBudget(0)),patch.object(hz,'fetch_traffic_lights_osm_bbox') as transport:
        with pytest.raises(rb.RoutingDeadlineExceeded):warnings.collect(LINE,{})
    transport.assert_not_called()


@pytest.mark.parametrize('engine',['GraphHopper','Valhalla','OSRM'])
def test_real_route_builders_serialize_warning_rows_with_avoidance_off(engine):
    from voyagr.services.routing.route_entries import build_graphhopper_optimised_route_entry,build_valhalla_route_entry
    data=warnings.attach({},
                         {'camera_speed':[CAMERA],'traffic_light':observations(),'railway_crossing':observations()})
    # collect() normally assigns observation kind while keeping provider fields.
    for kind in ('traffic_light','railway_crossing'):
        for row in data.warning_observations[kind]:row['type']=kind
    calc=MagicMock()
    calc.calculate_costs.return_value={'fuel_cost':0,'fuel_litres':0,'toll_cost':0,'caz_cost':0}
    common=dict(hazards=data,cost_calculator=calc,vehicle_type='petrol_diesel',fuel_efficiency=6,fuel_price=1.5,
                energy_efficiency=18,electricity_price=.3,include_tolls=False,include_caz=False,caz_exempt=False)
    with patch.object(hz,'db_connection',empty_preferences):
        if engine=='GraphHopper':
            route=build_graphhopper_optimised_route_entry({'success':True,'geometry':polyline.encode(LINE,5),'distance_km':1,'duration_seconds':60},**common)
        elif engine=='OSRM':
            from voyagr.services.routing.osrm_fallback import OsrmRouteContext,build_osrm_routes
            context=OsrmRouteContext(**{key:value for key,value in common.items() if key!='cost_calculator'})
            route=build_osrm_routes({'routes':[{'geometry':polyline.encode(LINE,5),'distance':200,'duration':60,'legs':[{'steps':[]}]}]},context)[0]
        else:
            route=build_valhalla_route_entry(trip={'summary':{'length':1,'time':60},'legs':[{'shape':polyline.encode(LINE,6),'maneuvers':[]}]},name='Fastest',route_id=1,traffic_multiplier=1,**common)
    assert route is not None
    assert {r['type'] for r in route['hazards']}=={'camera_speed','traffic_light','railway_crossing'}
    assert route['hazard_count']==0 and route['hazard_penalty_seconds']==0
    assert route['warning_coverage']['railway_crossing']['status']=='PARTIAL'


@pytest.mark.parametrize('avoid',[False,True])
def test_multidrop_summary_and_legs_keep_warning_data_without_changing_engine_flags(avoid):
    from voyagr.services.routing import multidrop
    from voyagr.services.routing.request_params import parse_route_request
    params=parse_route_request({'start':'53.5,-1.2','end':'53.502,-1.2','optimize_stop_order':True,
                                'enable_hazard_avoidance':avoid,'avoid_caz':False,
                                'via_points':[{'lat':53.5005,'lon':-1.2},{'lat':53.5015,'lon':-1.2}]})
    fake={'success':True,'total_distance_km':1,'total_duration_minutes':1,
          'geometry':polyline.encode(LINE,6),'geometry_precision':6,'maneuvers':[],
          'legs':[{'geometry':polyline.encode(LINE,6),'geometry_precision':6}]}
    with patch.object(hz,'fetch_hazards_for_route',return_value={'camera_speed':[CAMERA]}), \
            patch.object(hz,'fetch_traffic_lights_osm_bbox',side_effect=observations), \
            patch.object(hz,'fetch_railway_crossings_osm_bbox',side_effect=observations), \
            patch.object(multidrop,'_merge_tomtom_incidents_for_bbox',side_effect=lambda data,bbox:data), \
            patch.object(multidrop,'build_multidrop_route',return_value=fake) as engine, \
            patch.object(hz,'db_connection',empty_preferences):
        result=multidrop.build_route_multidrop_response(params)
    for route in (result,result['routes'][0],result['legs'][0]):
        assert {r['type'] for r in route['hazards']}=={'camera_speed','traffic_light','railway_crossing'}
        assert route['warning_coverage']['traffic_light']['status']=='PARTIAL'
    assert engine.call_args.kwargs['enable_hazard_avoidance'] is avoid
    if not avoid:
        for field in ('exclude_locations','camera_hazards','traffic_light_hazards','railway_crossing_hazards'):
            assert engine.call_args.kwargs[field] is None


def test_single_verified_area_retains_provenance_for_existing_avoidance_assessment():
    data=HazardList(coverage={'status':'AVAILABLE','bounds':[53.49,-1.21,53.51,-1.19],
                             'endpoint_class':'LOCAL','dataset_coverage':'VERIFIED','retrieved_at':123})
    with patch.object(hz,'fetch_traffic_lights_osm_bbox',return_value=data),patch.object(hz,'fetch_railway_crossings_osm_bbox',return_value=data):
        result=warnings.collect(LINE,{})
    assert result['traffic_light'].coverage['status']=='AVAILABLE'
    assert result['traffic_light'].coverage['dataset_coverage']=='VERIFIED'
    assert result['traffic_light'].coverage['retrieved_at']==123


@pytest.mark.parametrize('points',[[[float('nan'),0],[1,0]],[[0,179],[0,-179]],[[True,0],[1,0]]])
def test_invalid_or_dateline_planning_geometry_remains_unknown_without_query(points):
    with patch.object(hz,'fetch_traffic_lights_osm_bbox') as transport:
        result=warnings.collect(points,{})
    assert result['traffic_light'].coverage['status']=='UNKNOWN'
    transport.assert_not_called()


def test_sampled_areas_do_not_mask_stale_provider_coverage():
    stale=HazardList(coverage={'status':'STALE','retrieved_at':100})
    with patch.object(hz,'fetch_traffic_lights_osm_bbox',return_value=stale),patch.object(hz,'fetch_railway_crossings_osm_bbox',return_value=stale):
        result=warnings.collect([[53,-2],[55,-1]],{})
    assert result['traffic_light'].coverage['status']=='STALE'
    assert result['traffic_light'].coverage['retrieved_at']==100


def test_warning_observations_survive_unavailable_preference_storage():
    data=warnings.attach({'camera_speed':[]}, {'camera_speed':[CAMERA], 'railway_crossing':observations()})
    with patch.object(hz,'db_connection',side_effect=RuntimeError('synthetic unavailable preferences')):
        rows=hz.get_hazards_on_route(LINE,data)
    assert {r['type'] for r in rows}=={'camera_speed','railway_crossing'}

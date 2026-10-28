"""Synthetic UK road fixtures; validate paths/compliance, never real driving accuracy."""
import copy
import time
from contextlib import contextmanager
from unittest.mock import patch

import pytest
from flask import Flask, g, jsonify, request

from voyagr.utils.hazard_matching import HazardDataset, HazardList, SegmentIndex
from voyagr.services.routing.integrity import normalize_requirements, assess_route, assess_response, CATEGORIES
from voyagr.services.routing.integrity_api import register_avoidance_integrity

NOW = 1800000000
MAIN = [(53.52,-1.13),(53.525,-1.13),(53.53,-1.13)]
ADJACENT = [(53.52,-1.1297),(53.525,-1.1297),(53.53,-1.1297)]


def requirements(category='speed_cameras', mode='mandatory'):
    return normalize_requirements({'avoid_caz':False, 'avoidance_requirements':[
        {'category':category,'enabled':True,'mode':mode}]})


def route(coords=MAIN, road='UK-main', source='Valhalla', minutes=10):
    return {'id':road, 'geometry':coords, 'geometry_precision':6,'source':source,
            'distance_km':2,'duration_minutes':minutes,'maneuvers':[],
            'road_segments':[{'begin_shape_index':0,'end_shape_index':len(coords)-1,'road_id':road,'road_id_namespace':'synthetic-fixture','observed_at_ms':NOW*1000,'level':0}]}


def dataset(category='speed_cameras', items=(), status='AVAILABLE', retrieved_at=NOW):
    buckets=CATEGORIES[category]
    return HazardDataset({b:(list(items) if i==0 else []) for i,b in enumerate(buckets)},
        coverage={b:{'status':status,'bounds':[53.50,-1.2,53.55,-1.0],
                     'retrieved_at':retrieved_at,'source':'synthetic-UK-fixture'} for b in buckets})


def hazard(**kw):
    return dict(lat=53.525,lon=-1.13,road_id='UK-main',road_id_namespace='synthetic-fixture',observed_at_ms=NOW*1000,travel_bearing_deg=0,id='camera-1',**kw)


def result(category='speed_cameras', items=(), r=None, status='AVAILABLE'):
    return assess_route(r or route(), requirements(category),dataset(category,items,status), now=NOW)


def enabled(assessment):
    return next(r for r in assessment['requirements'] if r['enabled'])


def test_actual_route_camera_is_conflict_and_compliant_alternative_is_selected():
    payload={'success':True,'source':'Valhalla','routes':[route(),route(ADJACENT,'UK-adjacent',minutes=14)]}
    out=assess_response(payload,requirements(),dataset(items=[hazard()]),now=NOW)
    assert out['routes'][0]['id']=='UK-adjacent'
    assert out['routes'][0]['avoidance_assessment']['status']=='SATISFIED'
    assert out['routes'][1]['avoidance_assessment']['status']=='VIOLATED'
    assert out['geometry']==ADJACENT
    assert out['automatic_selection_allowed'] is True
    assert out['routes'][0]['avoidance_tradeoff']['duration_detour_percent']==40
    assert payload['routes'][0]['id']=='UK-main'  # no shared-cache mutation


@pytest.mark.parametrize('road,coords', [('UK-adjacent',ADJACENT),('UK-motorway-slip',ADJACENT)])
def test_adjacent_or_slip_road_is_not_camera_encounter(road,coords):
    assessment=result(items=[hazard()],r=route(coords,road))
    assert assessment['status']=='SATISFIED'
    assert enabled(assessment)['conflicts']==0


def test_camera_facing_opposite_traffic_is_clear():
    camera=hazard();camera['travel_bearing_deg']=180
    assert result(items=[camera])['status']=='SATISFIED'


def test_unknown_road_or_direction_is_not_invented():
    camera=hazard();del camera['road_id'];del camera['travel_bearing_deg']
    assessment=result(items=[camera])
    assert assessment['status']=='UNVERIFIED'
    assert assessment['automatic_selection_allowed'] is False
    assert enabled(assessment)['uncertain_matches']==1


@pytest.mark.parametrize('category', ['traffic_lights','railway_crossings'])
def test_junction_crossing_on_matched_road_is_conflict(category):
    assert result(category, [hazard()])['status']=='VIOLATED'


def test_rail_crossing_on_parallel_road_is_clear():
    assert result('railway_crossings',[hazard()],route(ADJACENT,'UK-parallel'))['status']=='SATISFIED'


def test_junction_road_unknown_is_unverified():
    h=hazard();del h['road_id']
    assert result('traffic_lights',[h])['status']=='UNVERIFIED'


def test_bridge_level_and_outdated_hazard_not_falsely_confirmed():
    h=hazard(level=1)
    assert result(items=[h])['status']=='SATISFIED'
    h=hazard(valid_until=NOW-1)
    assert result(items=[h])['status']=='UNVERIFIED'


def test_duplicates_not_double_counted():
    assessment=result(items=[hazard(),hazard()])
    assert enabled(assessment)['conflicts']==1


@pytest.mark.parametrize('coverage',['UNKNOWN','PARTIAL','STALE'])
def test_unknown_partial_and_stale_coverage_never_passes_empty_dataset(coverage):
    assessment=result(status=coverage)
    assert assessment['status']=='UNVERIFIED'
    assert assessment['requires_acceptance'] is True


def test_out_of_bbox_and_expired_snapshot_remain_unverified():
    assert result(r=route([(54,-1.13),(54.01,-1.13)]))['status']=='UNVERIFIED'
    assert assess_route(route(),requirements(),dataset(retrieved_at=NOW-601),now=NOW)['status']=='UNVERIFIED'


def test_all_candidates_conflict_returns_no_compliant_route():
    out=assess_response({'success':True,'routes':[route(),route(source='OSRM')]},requirements(),dataset(items=[hazard()]),now=NOW)
    assert out['avoidance_status']=='NO_COMPLIANT_ROUTE'
    assert out['automatic_selection_allowed'] is False
    assert all(r['avoidance_assessment']['requires_acceptance'] for r in out['routes'])


@pytest.mark.parametrize('source',['Valhalla','GraphHopper','OSRM','Unknown'])
def test_provider_label_does_not_bypass_independent_conflict_evaluation(source):
    assessment=result(items=[hazard()],r=route(source=source))
    assert assessment['status']=='VIOLATED'
    assert not assessment['automatic_selection_allowed']


def test_osrm_cannot_claim_native_toll_enforcement_without_evidence():
    assessment=assess_route(route(source='OSRM'),requirements('tolls'),now=NOW)
    assert assessment['status']=='UNSUPPORTED'
    assert not assessment['automatic_selection_allowed']


def test_native_option_or_estimated_toll_cost_is_not_proof():
    r=route();r['toll_cost']=0;r['avoid_tolls']=True
    assert assess_route(r,requirements('tolls'),now=NOW)['status']=='UNVERIFIED'
    r['road_segments'][0]['toll']=True
    assert assess_route(r,requirements('tolls'),now=NOW)['status']=='VIOLATED'
    r['road_segments'][0]['toll']=False
    assert assess_route(r,requirements('tolls'),now=NOW)['status']=='UNVERIFIED'
    r['road_attributes_verified_at']=NOW
    assert assess_route(r,requirements('tolls'),now=NOW)['status']=='SATISFIED'


@pytest.mark.parametrize('geometry',[None,'',[(float('nan'),0),(53,0)],[(53,0)],[(53,0),(53,0)]])
def test_missing_malformed_geometry_cannot_be_selected(geometry):
    r=route();r['geometry']=geometry
    assessment=assess_route(r,requirements(),now=NOW)
    assert not assessment['geometry_valid']
    assert not assessment['automatic_selection_allowed']


def test_preferences_keep_existing_ranking_and_report_detour():
    payload={'success':True,'routes':[route(minutes=10),route(ADJACENT,'UK-adjacent',minutes=50)]}
    out=assess_response(payload,requirements(mode='preference'),dataset(items=[hazard()]),now=NOW)
    assert [r['id'] for r in out['routes']]==['UK-main','UK-adjacent']
    assert out['routes'][0]['avoidance_assessment']['automatic_selection_allowed']
    assert out['routes'][1]['avoidance_tradeoff']['duration_detour_percent']==400


def test_no_enabled_avoidance_preserves_ordinary_navigation():
    req=normalize_requirements({'avoid_caz':False})
    assessment=assess_route(route(),req,now=NOW)
    assert assessment['claim']=='avoidance_disabled'
    assert assessment['automatic_selection_allowed']


def test_multidrop_checks_every_leg_not_just_first_geometry():
    payload={'success':True,'source':'Voyagr Multi-Drop','routes':[route(ADJACENT,'UK-adjacent')],
             'legs':[route(ADJACENT,'UK-adjacent'),route()]}
    out=assess_response(payload,requirements(),dataset(items=[hazard()]),now=NOW)
    assert out['legs'][0]['avoidance_assessment']['status']=='SATISFIED'
    assert out['legs'][1]['avoidance_assessment']['status']=='VIOLATED'
    assert out['avoidance_status']=='NO_COMPLIANT_ROUTE'
    assert out['routes'][0]['avoidance_assessment']['scope']=='all_legs'


@pytest.fixture
def client(monkeypatch):
    import voyagr.services.routing.integrity as integrity
    monkeypatch.setattr(integrity.time,'time',lambda:NOW)
    app=Flask(__name__)
    register_avoidance_integrity(app)
    @app.post('/api/route')
    def provider():
        # Trusted server acquisition, not client-submitted hazard data.
        if app.config.get('dataset') is not None: g.route_avoidance_hazards=app.config['dataset']
        return jsonify(app.config['payload'])
    return app,app.test_client()


def test_http_boundary_chooses_verified_alternative_after_failover(client):
    app,c=client
    app.config.update(dataset=dataset(items=[hazard()]), payload={'success':True,'source':'OSRM (Fallback)',
        'routes':[route(source='OSRM'),route(ADJACENT,'UK-adjacent',source='OSRM')]})
    rv=c.post('/api/route',json={'start':'53.52,-1.13','end':'53.53,-1.13','avoid_caz':False,
        'avoidance_requirements':[{'category':'speed_cameras','enabled':True,'mode':'mandatory'}]})
    assert rv.status_code==200
    assert rv.json['routes'][0]['id']=='UK-adjacent'
    assert rv.json['avoidance_status']=='SATISFIED'
    assert rv.headers['Cache-Control']=='no-store'


def test_client_cannot_forge_hazard_coverage(client):
    app,c=client
    app.config.update(dataset={},payload={'success':True,'routes':[route()]})
    rv=c.post('/api/route',json={'avoid_caz':False,'coverage':{'status':'AVAILABLE'},
        'hazards':{},'avoidance_requirements':[{'category':'speed_cameras','enabled':True,'mode':'mandatory','coverage':'AVAILABLE'}]})
    assert rv.json['avoidance_status']=='NO_COMPLIANT_ROUTE'
    assert rv.json['avoidance_assessment']['status']=='UNVERIFIED'


def test_http_reassesses_cached_claim_instead_of_trusting_it(client):
    app,c=client
    r=route();r['avoidance_assessment']={'status':'SATISFIED'}
    app.config.update(dataset=dataset(items=[hazard()]), payload={'success':True,'cached':True,'routes':[r]})
    rv=c.post('/api/route',json={'avoid_caz':False,'avoidance_requirements':[{'category':'speed_cameras','enabled':True,'mode':'mandatory'}]})
    assert rv.json['cached'] is True
    assert rv.json['avoidance_assessment']['status']=='VIOLATED'
    assert app.config['payload']['routes'][0]['avoidance_assessment']=={'status':'SATISFIED'}


@pytest.mark.parametrize('body',[
    {'avoidance_mode':'strict-ish'}, {'avoid_cameras':'false'},
    {'avoidance_requirements':[{'category':'unknown','enabled':True,'mode':'mandatory'}]},
    {'avoidance_requirements':[{'category':'speed_cameras','enabled':True,'mode':'preference','scope':'somewhere'}]},
])
def test_invalid_contract_is_rejected_not_silently_downgraded(client,body):
    _,c=client
    assert c.post('/api/route',json=body).status_code==400


def test_scoring_and_display_find_hazard_late_in_route_without_point_sampling():
    from voyagr.services import hazards as service
    @contextmanager
    def db():
        class Cursor:
            def execute(self,*a): pass
            def fetchall(self): return [('camera_speed',1000,80)]
        class Conn:
            def cursor(self): return Cursor()
        yield Conn()
    # Hazard lies on a long segment, far from both endpoint vertices.
    coords=[(53.50,-1.13),(53.55,-1.13)]
    points={'camera_speed':[{'lat':53.525,'lon':-1.13}]}
    with patch.object(service,'db_connection',db):
        penalty,count=service.score_route_by_hazards(coords,points)
        assert penalty>0 and count==1
        with patch.object(service,'_load_hazard_proximity_preferences',return_value={'camera_speed':{'threshold':80}}):
            assert len(service.get_hazards_on_route(coords,points))==1


def test_query_failure_and_truncation_distinguished_from_empty_success():
    from voyagr.services.hazards import fetch_traffic_lights_osm_bbox
    with patch('overpass_helper.query_overpass',return_value={'success':False,'elements':[]}):
        assert fetch_traffic_lights_osm_bbox(53.50,53.55,-1.2,-1.1).coverage['status']=='UNKNOWN'
    with patch('overpass_helper.query_overpass',return_value={'success':True,'elements':[],'dataset_coverage':'VERIFIED'}):
        assert fetch_traffic_lights_osm_bbox(53.50,53.55,-1.2,-1.1).coverage['status']=='AVAILABLE'
    elements=[{'lat':53.52,'lon':-1.13}]*3
    with patch('overpass_helper.query_overpass',return_value={'success':True,'elements':elements}):
        assert fetch_traffic_lights_osm_bbox(53.50,53.55,-1.2,-1.1,max_nodes=2).coverage['status']=='PARTIAL'


@pytest.mark.parametrize('uncertainty',[float('nan'),float('inf'),-1,10000])
def test_unknown_position_uncertainty_cannot_prove_clear_route(uncertainty):
    h=hazard(position_uncertainty_m=uncertainty); h['lon']=-1.131
    assert result(items=[h])['status']=='UNVERIFIED'


def test_osrm_precision_five_geometry_is_scored_in_correct_location():
    import polyline
    import voyagr_web as vw
    from voyagr.services.routing.osrm_fallback import OsrmRouteContext, build_osrm_routes
    coords=[(53.50,-1.13),(53.55,-1.13)]
    ctx=OsrmRouteContext(hazards={'camera_speed':[{'lat':53.525,'lon':-1.13}]},
        vehicle_type='petrol_diesel',fuel_efficiency=6,fuel_price=1.5,energy_efficiency=20,
        electricity_price=.3,include_tolls=False,include_caz=False,caz_exempt=False)
    payload={'routes':[{'distance':5000,'duration':600,'geometry':polyline.encode(coords,precision=5),'legs':[]}]}
    # Real scorers and decoded geometry, no mocked matching result.
    routes=build_osrm_routes(payload,ctx)
    assert routes[0]['hazard_count']==1
    assert routes[0]['hazard_penalty_seconds']>0
    assert len(routes[0]['hazards'])==1


def test_malformed_geojson_does_not_drop_bad_vertex_to_claim_compliance():
    r=route(); r['geometry']={'type':'LineString','coordinates':[[-1.13,53.52],[],[-1.13,53.53]]}
    assert result(r=r)['geometry_valid'] is False


def test_legacy_valhalla_adapter_decodes_all_legs_and_preserves_kilometres():
    import polyline
    from routing_engines import ValhallaEngine
    response={'trip':{'summary':{'length':2.5,'time':600},'legs':[
        {'shape':polyline.encode(MAIN[:2],precision=6)},
        {'shape':polyline.encode(MAIN[1:],precision=6)}]}}
    with patch('routing_engines.requests.post') as post:
        post.return_value.json.return_value=response
        out=ValhallaEngine().calculate_route(*MAIN[0],*MAIN[-1])
    assert out['distance_km']==2.5
    assert out['duration_minutes']==10
    assert polyline.decode(out['geometry'],precision=out['geometry_precision'])==MAIN


def test_legacy_osrm_adapter_preserves_precision_and_rejects_non_driving():
    import polyline
    from routing_engines import OSRMEngine
    encoded=polyline.encode(MAIN,precision=6)
    with patch('routing_engines.requests.get') as get:
        get.return_value.json.return_value={'code':'Ok','routes':[{'distance':2000,'duration':600,'geometry':encoded}]}
        engine=OSRMEngine()
        assert engine.calculate_route(*MAIN[0],*MAIN[-1],'pedestrian') is None
        get.assert_not_called()
        out=engine.calculate_route(*MAIN[0],*MAIN[-1])
        assert get.call_args.kwargs['params']['geometries']=='polyline6'
        assert polyline.decode(out['geometry'],precision=out['geometry_precision'])==MAIN


def test_manager_validates_each_fallback_and_does_not_retry_preferred_twice():
    from routing_engines import RoutingEngineManager
    from unittest.mock import Mock
    manager=RoutingEngineManager()
    a=Mock(name='primary');a.name='valhalla';a.calculate_route.return_value=route()
    b=Mock(name='fallback');b.name='osrm';b.calculate_route.return_value=route(ADJACENT,'UK-other',source='OSRM')
    manager.engines=[a,b]
    # Independent validator can verify fixture coverage even for an engine without native exclusions.
    with patch('voyagr.services.routing.integrity.time.time',return_value=NOW):
        out=manager.calculate_route(*MAIN[0],*MAIN[-1],preferred_engine='valhalla',
            avoidance={'avoidance_requirements':[{'category':'speed_cameras','enabled':True,'mode':'mandatory'}]},
            hazards=dataset(items=[hazard()]))
    assert out['id']=='UK-other'
    assert out['avoidance_assessment']['automatic_selection_allowed'] is True
    assert a.calculate_route.call_count==b.calculate_route.call_count==1


def test_manager_returns_explicit_no_compliant_route_for_unknown_data():
    from routing_engines import RoutingEngineManager
    from unittest.mock import Mock
    manager=RoutingEngineManager();engine=Mock();engine.name='valhalla';engine.calculate_route.return_value=route()
    manager.engines=[engine]
    out=manager.calculate_route(*MAIN[0],*MAIN[-1],avoidance={
        'avoidance_requirements':[{'category':'speed_cameras','enabled':True,'mode':'mandatory'}]})
    assert out['avoidance_status']=='NO_COMPLIANT_ROUTE'
    assert out['avoidance_assessment']['automatic_selection_allowed'] is False


def test_real_route_cache_cannot_replay_satisfied_claim_for_mandatory_camera():
    import voyagr_web as vw
    cached={'success':True,'routes':[dict(route(),avoidance_assessment={'status':'SATISFIED'})]}
    with patch.object(vw.route_cache,'get',return_value=cached), \
         patch('voyagr.services.hazards.fetch_hazards_for_route',return_value={}) as acquire:
        rv=vw.app.test_client().post('/api/route',json={'start':'53.52,-1.13','end':'53.53,-1.13',
            'avoid_caz':False,'enable_hazard_avoidance':True,'avoidance_mode':'mandatory'})
    assert rv.json['cached'] is True
    assert rv.json['avoidance_status']=='NO_COMPLIANT_ROUTE'
    assert rv.json['avoidance_assessment']['status']=='UNVERIFIED'
    assert rv.json['automatic_selection_allowed'] is False
    acquire.assert_called_once()  # current local SQL; no paid/network enrichment on cache hits


def test_provider_scoring_filter_cannot_erase_mandatory_camera_evidence():
    import voyagr_web as vw
    from voyagr.services.routing.hazard_prep import prepare_route_hazards, HazardPrefs
    from flask import g
    data=dataset(items=[hazard()])
    def clear_cameras(h):
        for key in list(h): h[key]=[]
    with vw.app.test_request_context('/api/route'), \
         patch.object(vw,'fetch_hazards_for_route',return_value=data), \
         patch.object(vw,'fetch_tomtom_incidents',return_value={}), \
         patch.object(vw,'filter_camera_hazards_by_preferences',side_effect=clear_cameras):
        scored=prepare_route_hazards(*MAIN[0],*MAIN[-1],HazardPrefs([],True,False,False,True))
        assert scored['camera_speed']==[]
        assert assess_route(route(),requirements(),g.route_avoidance_hazards,now=NOW)['status']=='VIOLATED'
        assert data['camera_speed']  # cached acquisition object is not mutated


def test_invalid_category_type_is_rejected_not_internal_error(client):
    _,c=client
    assert c.post('/api/route',json={'avoidance_requirements':[
        {'category':[],'enabled':True,'mode':'mandatory'}]}).status_code==400


@pytest.mark.parametrize('fetch_name',['fetch_traffic_lights_osm_bbox','fetch_railway_crossings_osm_bbox'])
def test_overpass_cache_age_and_missing_coordinates_cannot_become_fresh_empty_coverage(fetch_name):
    from voyagr.services import hazards as service
    fetch=getattr(service,fetch_name)
    with patch('overpass_helper.query_overpass',return_value={'success':True,'elements':[],'cached':True}), \
         patch.object(service.time,'time',return_value=NOW):
        assert fetch(53.50,53.55,-1.2,-1.1).coverage['retrieved_at']==NOW-300
    with patch('overpass_helper.query_overpass',return_value={'success':True,'elements':[{'id':123}]}):
        assert fetch(53.50,53.55,-1.2,-1.1).coverage['status']=='PARTIAL'


@pytest.mark.parametrize('costing',['pedestrian','bicycle'])
def test_multidrop_osrm_does_not_invent_public_non_driving_capability(monkeypatch,costing):
    from voyagr.services.routing.multidrop import _osrm_leg
    monkeypatch.delenv('OSRM_SUPPORTED_PROFILES',raising=False)
    with patch('voyagr.services.routing.multidrop.requests.get') as get:
        assert _osrm_leg({'lat':53.52,'lon':-1.13},{'lat':53.53,'lon':-1.13},costing) is None
        get.assert_not_called()

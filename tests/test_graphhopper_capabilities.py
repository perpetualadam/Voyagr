"""Verified metadata, schema compatibility and fail-closed mixed routing."""
import copy
import json
from unittest.mock import patch, Mock

import pytest
import requests

from voyagr.services.routing import graphhopper_capabilities as cap
from voyagr.services.routing.costing import build_graphhopper_costing_preference_model as build
from voyagr.services.routing.engines import route_with_graphhopper
from voyagr.services.routing.integrity import assess_response, normalize_requirements

URL = 'http://metadata-fixture.invalid'
BASE = {'version':'8.0', 'profiles':[{'name':'car'}], 'encoded_values':{'road_class':['MOTORWAY','TRACK','PATH','LIVING_STREET'], 'road_environment':['FERRY'], 'max_speed':['>number','<number']}}


@pytest.fixture(autouse=True)
def isolated_cache():
    cap._cache.clear()
    yield
    cap._cache.clear()


def observed(toll=None):
    data=copy.deepcopy(BASE)
    if toll is not None: data['encoded_values']['toll']=toll
    return cap.normalise_info(data)


@pytest.mark.parametrize('toll,expected', [(None,None),(['NO','ALL','HGV'],'toll == ALL || toll == HGV'),(['true','false'],'toll == true'),(['>number','<number'],None)])
@pytest.mark.parametrize('optimization', ['fastest','cheapest'])
def test_no_unsupported_toll_expression_is_constructed(toll, expected, optimization):
    limitations=[]
    model=build(avoid_tolls=True, route_optimization=optimization, capabilities=observed(toll), limitations=limitations)
    rules=[r['if'] for r in model.get('priority',[]) if 'toll' in r['if']]
    assert rules == ([expected]*(2 if optimization=='cheapest' else 1) if expected else [])
    assert bool(limitations)==(expected is None)
    if not expected: assert limitations[0]['category']=='tolls'


def test_unknown_values_and_profiles_never_grant_capability():
    limits=[]
    assert build(avoid_tolls=True,avoid_motorways=True,capabilities=None,limitations=limits)=={}
    assert {l['category'] for l in limits}=={'tolls','motorways'}
    snapshot=observed(['NO','ALL']);snapshot['profile_available']=False
    assert build(avoid_tolls=True,capabilities=snapshot)=={}
    data=copy.deepcopy(BASE);data['encoded_values']=['toll']
    with pytest.raises(ValueError): cap.normalise_info(data)


def test_only_requested_supported_preferences_are_kept():
    snapshot=observed();del snapshot['encoded_values']['road_environment']
    limits=[]
    model=build(avoid_tolls=True,avoid_motorways=True,avoid_ferries=True,avoid_unpaved=True,capabilities=snapshot,limitations=limits)
    assert len(model['priority'])==2
    assert {l['category'] for l in limits}=={'tolls','ferries'}


def test_metadata_cache_freshness_endpoint_scope_invalidation_and_failed_refresh(monkeypatch):
    clock=[0];monkeypatch.setattr(cap.time,'monotonic',lambda:clock[0])
    reader=Mock(return_value=copy.deepcopy(BASE));monkeypatch.setattr(cap,'_read_info',reader)
    first=cap.get_graphhopper_capabilities(URL);first['encoded_values'].clear()
    assert cap.get_graphhopper_capabilities(URL)['encoded_values']
    assert reader.call_count==1
    cap.get_graphhopper_capabilities(URL+'/other');assert reader.call_count==2
    clock[0]=cap.TTL_SECONDS+1
    reader.side_effect=ValueError('private metadata secret')
    stale=cap.get_graphhopper_capabilities(URL)
    assert stale['state']=='unavailable' and not stale['encoded_values']
    cap.get_graphhopper_capabilities(URL);assert reader.call_count==3
    clock[0]+=cap.FAILURE_TTL_SECONDS+1;reader.side_effect=None
    assert cap.get_graphhopper_capabilities(URL)['state']=='verified'
    cap.invalidate_graphhopper_capabilities(URL)
    cap.get_graphhopper_capabilities(URL);assert reader.call_count==5


def response(body,status=200):
    r=requests.Response();r.status_code=status;r._content=json.dumps(body).encode();return r


@pytest.mark.parametrize('toll',[None,['NO','ALL','HGV']])
def test_mixed_camera_osm_caz_keeps_hard_rules_and_reports_toll_limit(toll):
    snapshot=observed(toll)
    camera={'priority':[{'if':'in_camera_area_0','multiply_by':'0'}]}
    # Actual hazard and CAZ builders; provider rejects any unsupported toll expression.
    def provider(*args,**kwargs):
        body=kwargs['json'];rules=body['custom_model']['priority']
        if toll is None and any('toll' in r['if'] for r in rules):
            return response({'message':'Cannot compile expression: toll not available'},400)
        return response({'paths':[{'distance':1000,'time':60000,'points':'_p~iF~ps|U_ulLnnqC_mqNvxq`@','instructions':[]}]})
    with patch('voyagr.services.routing.engines.get_graphhopper_capabilities',return_value=snapshot), \
         patch('voyagr.services.routing.engines.USE_GRAPHHOPPER_CAMERA_AVOIDANCE',True), \
         patch('voyagr.services.hazards.build_graphhopper_camera_avoidance_model',return_value=camera), \
         patch('voyagr.services.hazards.camera_map_data_filters_are_selective',return_value=False), \
         patch('voyagr.config.CAZ_ZONES_DATA',{'test':{'polygon':[(53.5,-1.5),(53.5,-1.4),(53.6,-1.4),(53.6,-1.5)]}}), \
         patch('voyagr.services.routing.engines.route_transport.post',side_effect=provider) as post, \
         patch('voyagr.services.routing.engines.route_transport.get') as get:
        route=route_with_graphhopper(53.51,-1.49,53.59,-1.41,avoid_tolls=True,avoid_caz_zones=True,camera_hazards={'camera_speed':[{'lat':53.54,'lon':-1.46}]},route_bbox={'min_lat':53.5,'max_lat':53.6,'min_lon':-1.5,'max_lon':-1.4},traffic_light_hazards=[{'lat':53.55,'lon':-1.45}])
    assert route and route['custom_model_applied'] and route['camera_avoidance']
    rules=post.call_args.kwargs['json']['custom_model']['priority']
    assert [r['multiply_by'] for r in rules[:4]]==['0','0','0','0.02']
    assert bool(route['provider_limitations'])==(toll is None)
    assert post.call_args.kwargs['json']['details']==['max_speed','road_class']
    get.assert_not_called()


def test_profile_absent_returns_failure_and_metadata_rejection_invalidates():
    snapshot=observed();snapshot['profile_available']=False
    with patch('voyagr.services.routing.engines.get_graphhopper_capabilities',return_value=snapshot),patch('voyagr.services.routing.engines.route_transport.get') as get,patch('voyagr.services.routing.engines.route_transport.post') as post:
        assert route_with_graphhopper(53,-1,54,-2) is None
        get.assert_not_called();post.assert_not_called()
    with patch('voyagr.services.routing.engines.get_graphhopper_capabilities',return_value=observed()),patch('voyagr.services.routing.engines.invalidate_graphhopper_capabilities') as invalidate,patch('voyagr.services.routing.engines.USE_GRAPHHOPPER_CAMERA_AVOIDANCE',True),patch('voyagr.services.hazards.build_graphhopper_combined_camera_model',return_value={'priority':[{'if':'in_camera_area_0','multiply_by':'0'}]}),patch('voyagr.services.routing.engines.route_transport.post',return_value=response({'message':'Cannot compile expression: toll not available'},400)),patch('voyagr.services.routing.engines.route_transport.get') as get:
        assert route_with_graphhopper(53,-1,54,-2,avoid_tolls=True) is None
        invalidate.assert_called_once();get.assert_not_called()


def test_mandatory_unknown_tolls_cannot_auto_select_but_verified_alternative_can():
    points=[[53,-1],[53.01,-1.01]]
    gh={'source':'GraphHopper','geometry':points,'duration_minutes':10,'provider_limitations':[{'category':'tolls','reason':'attribute_not_verified'}]}
    requirements=normalize_requirements({'avoid_caz':False,'avoidance_requirements':[{'category':'tolls','enabled':True,'mode':'mandatory'}]})
    blocked=assess_response({'success':True,'routes':[gh]},requirements,now=1000)
    assert not blocked['automatic_selection_allowed']
    assert blocked['avoidance_assessment']['status']=='UNVERIFIED'
    assert blocked['provider_limitations'][0]['category']=='tolls'
    verified={'source':'Valhalla','geometry':points,'duration_minutes':12,'road_segments':[{'begin_shape_index':0,'end_shape_index':1,'toll':False}], 'road_attributes_verified_at':1000}
    result=assess_response({'success':True,'routes':[gh,verified]},requirements,now=1000)
    assert result['automatic_selection_allowed']
    assert result['routes'][0]['source']=='Valhalla'
    assert not result.get('provider_limitations')


def test_metadata_transport_is_bounded_and_never_follows_redirects(monkeypatch):
    session=Mock();session.__enter__=Mock(return_value=session);session.__exit__=Mock(return_value=False)
    reply=Mock(status_code=200);reply.__enter__=Mock(return_value=reply);reply.__exit__=Mock(return_value=False)
    session.get.return_value=reply
    reply.iter_content.return_value=[b'x'*(cap.MAX_INFO_BYTES+1)]
    monkeypatch.setattr(cap.requests,'Session',Mock(return_value=session))
    with pytest.raises(ValueError, match='limit'):
        cap._read_info(URL)
    assert session.get.call_args.kwargs['allow_redirects'] is False
    assert session.get.call_args.kwargs['stream'] is True
    reply.status_code=302
    with pytest.raises(ValueError, match='HTTP'):
        cap._read_info(URL)


def test_concurrent_metadata_readers_share_one_observation(monkeypatch):
    import time
    from concurrent.futures import ThreadPoolExecutor
    def read(_):
        time.sleep(.02)
        return copy.deepcopy(BASE)
    reader=Mock(side_effect=read);monkeypatch.setattr(cap,'_read_info',reader)
    with ThreadPoolExecutor(max_workers=4) as pool:
        snapshots=list(pool.map(lambda _:cap.get_graphhopper_capabilities(URL), range(4)))
    assert reader.call_count==1
    assert all(s['state']=='verified' for s in snapshots)
    assert cap.public_capabilities(snapshots[0])['enforcement_verified'] is False


def test_unknown_toll_domain_cannot_leak_a_placeholder_expression():
    limitations=[]
    assert build(avoid_tolls=True,capabilities=observed(['__UNVERIFIED__']),limitations=limitations)=={}
    assert limitations[0]['category']=='tolls'


def test_provider_fallback_preserves_toll_request_for_valhalla():
    from voyagr.services.routing import multidrop
    from voyagr.services.routing.costing import build_auto_costing_options
    with patch.object(multidrop,'USE_GRAPHHOPPER_CAMERA_AVOIDANCE',True),patch.object(multidrop,'_graphhopper_leg',return_value=None),patch.object(multidrop,'_valhalla_leg',return_value={'source':'Valhalla'}) as valhalla:
        result=multidrop._route_leg({'lat':53,'lon':-1},{'lat':54,'lon':-2},use_graphhopper=True,avoid_tolls=True)
    assert result['source']=='Valhalla'
    assert valhalla.call_args.kwargs['avoid_tolls'] is True
    assert build_auto_costing_options(avoid_tolls=True)['use_tolls']==0


@pytest.mark.parametrize('explicit_routes',[False,True])
def test_multileg_limitations_survive_composition_and_keep_mandatory_gates(explicit_routes):
    import polyline
    from voyagr.services.routing import multidrop
    limitation={'engine':'GraphHopper','category':'tolls','reason':'attribute_not_verified','status':'UNVERIFIED'}
    def leg(a,b,*args,**kwargs):
        return {'source':'GraphHopper','distance_km':1,'duration_seconds':60,'geometry':polyline.encode([(a['lat'],a['lon']),(b['lat'],b['lon'])],precision=6),'geometry_precision':6,'maneuvers':[], 'provider_limitations':[limitation], 'provider_capabilities':{'enforcement_verified':False}}
    with patch.object(multidrop,'_route_leg',side_effect=leg):
        result=multidrop.build_multidrop_route({'lat':53,'lon':-1},{'lat':53.01,'lon':-1.01},[{'lat':53.005,'lon':-1.005}],optimize_order=False,avoid_tolls=True)
    assert result['success']
    assert all(l['provider_limitations']==[limitation] for l in result['legs'])
    if explicit_routes: result['routes']=[{'geometry':result['geometry'],'geometry_precision':6,'source':'GraphHopper'}]
    requirements=normalize_requirements({'avoid_caz':False,'avoidance_requirements':[{'category':'tolls','enabled':True,'mode':'mandatory'}]})
    assessed=assess_response(result,requirements,now=1000)
    assert assessed['provider_limitations']==[limitation]
    assert not assessed['automatic_selection_allowed']


def test_graphhopper_route_entry_preserves_provider_limitation():
    import polyline
    from voyagr.services.routing.route_entries import build_graphhopper_optimised_route_entry
    limitation={'engine':'GraphHopper','category':'tolls','reason':'attribute_not_verified'}
    gh={'success':True,'geometry':polyline.encode([(53,-1),(53.01,-1.01)]),'distance_km':1,'duration_seconds':60,'instructions':[],'provider_limitations':[limitation],'provider_capabilities':{'enforcement_verified':False}}
    calculator=Mock();calculator.calculate_costs.return_value={'fuel_cost':0,'fuel_litres':0,'toll_cost':0,'caz_cost':0}
    entry=build_graphhopper_optimised_route_entry(gh,{},calculator,vehicle_type='petrol',fuel_efficiency=6,fuel_price=1.5,energy_efficiency=15,electricity_price=.3,include_tolls=True,include_caz=True,caz_exempt=False)
    assert entry['provider_limitations']==[limitation]
    assert entry['provider_capabilities']['enforcement_verified'] is False

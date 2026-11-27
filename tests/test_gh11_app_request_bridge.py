"""Pure request adapter: actual JS builders with synthetic inputs, no live app."""
import copy
import json
import subprocess
import pytest
from prototypes.graphhopper11.app_request_bridge import adapt_app_request, normalize_app_request
from prototypes.graphhopper11.isolated_app import Refused


def app_bodies():
    script = """
const r=require('./static/js/modules/navigation/routing-request.js');
const p=require('./static/js/modules/navigation/route-prefs.js');
const storage={getItem:()=>null};
const shared={routingMode:'auto',vehicleType:'petrol_diesel',costParams:p.getRouteCostParams('petrol_diesel',storage),avoidCaz:false,routePrefs:{maxDetour:20}};
const normal=r.buildInitialRouteRequestBody({start:'0,0',end:'0,0.02',optimizeStopOrder:true,sharedOptions:shared});
const via=r.buildInitialRouteRequestBody({start:'0,0',end:'0,0.02',viaPoints:[{lat:.003,lon:.01,name:'Synthetic via',provenance:'coordinates',original_index:0}],sharedOptions:shared});
const reroute=r.buildRerouteRequestBody({startLat:.003,startLon:.01,destination:'0,0.02',includeTolls:true,includeCaz:true,sharedOptions:shared});
console.log(JSON.stringify({normal,via,reroute}));
"""
    return json.loads(subprocess.check_output(['node','-e',script],text=True,timeout=10))


def test_actual_normal_via_reroute_builders_preserve_every_supplied_field():
    bodies = app_bodies()
    for name,points in [('normal',[[0,0],[0,.02]]),('via',[[0,0],[.003,.01],[0,.02]]),('reroute',[[.003,.01],[0,.02]])]:
        supplied = bodies[name];before=copy.deepcopy(supplied)
        adapted = adapt_app_request(supplied,{'points':points})
        assert adapted['app_request'] == supplied == before
        assert adapted['visits'] == points
        assert adapted['policy_request']['app_settings']['max_detour'] == 20
        assert adapted['cost_warnings']
        assert adapted['is_reroute'] is (name == 'reroute')
        assert adapted['force_refresh'] is (name == 'reroute')


def test_general_normalization_does_not_make_unregistered_journeys_eligible():
    body = app_bodies()['via']
    body.update(start='40,-75',end='41,-74',
                via_points=[dict(lat=40.5,lon=-74.5,type='via',name='Public synthetic point')])
    before = copy.deepcopy(body)
    parsed = normalize_app_request(body)
    assert parsed['visits'] == [[40,-75],[40.5,-74.5],[41,-74]]
    assert parsed['app_request'] == before == body
    assert 'navigation_allowed' not in parsed and 'candidates' not in parsed
    # Syntax acceptance is not operator registration or route evidence.
    with pytest.raises(Refused,match='journey_not_registered'):
        adapt_app_request(body,{'points':[[0,0],[0,.02]]})
    parsed['app_request']['via_points'][0]['lat'] = 0
    assert body == before


@pytest.mark.parametrize('change',[
 {'unknown':True}, {'start':'nan,0'}, {'end':'90.1,0'}, {'is_reroute':1},
 {'heading':90}, {'headings':[90,180]}, {'bearing':90}, {'origin_heading':90},
 {'diagnose_origin':{'radius_m':1}}, {'audit_index_inventory':{'edge_limit':10000}}, {'audit_index_geometry':{'edge_limit':10000,'sample_limit':128}},
 {'stops':[{'lat':0,'lon':.01,'duration':0}]}, {'stops':None}, {'round_trip':True},
 {'via_points':[{'lat':0,'lon':.01}],'optimize_stop_order':True},
 {'departure_time':'2026-11-22T00:00:00Z'}, {'time_windows':[]}, {'total_stop_time':15},
 {'via_points':[{'lat':True,'lon':0}]}, {'fuel_efficiency':float('nan')},
 {'fuel_price_mode':'invent'}, {'fuel_category':'secret'},
 {'via_points':[{'lat':0,'lon':.01,'type':'stop'}]},
 {'via_points':[{'lat':0,'lon':.01,'proof':True}]}, {'avoid_points':[{'lat':0,'lon':0}]},
])
def test_unsupported_or_malformed_requests_refuse_without_coercion(change):
    supplied = dict({'start':'0,0','end':'0,0.02','avoid_caz':False},**change)
    with pytest.raises(Refused):
        normalize_app_request(supplied)
    with pytest.raises(Refused):
        adapt_app_request(supplied,{'points':[[0,0],[0,.02]]})


def test_changed_origin_and_reversed_vias_cannot_be_substituted():
    points = [[0,0],[.003,.01],[.004,.01],[0,.02]]
    body = dict(start='0,0',end='0,0.02',via_points=[dict(lat=.003,lon=.01),dict(lat=.004,lon=.01)])
    assert adapt_app_request(body,{'points':points})['visits'] == points
    with pytest.raises(Refused,match='journey_not_registered'):
        adapt_app_request(dict(body,via_points=list(reversed(body['via_points']))),{'points':points})
    with pytest.raises(Refused,match='journey_not_registered'):
        adapt_app_request(dict(body,start='0,0.001'),{'points':points})


def test_missing_manual_price_is_retained_as_unverified_not_fabricated():
    body=dict(start='0,0',end='0,0.02',fuel_price_mode='manual',fuel_price=None)
    adapted=adapt_app_request(body,{'points':[[0,0],[0,.02]]})
    assert {'setting':'fuel_price','value':None,'state':'UNVERIFIED'} in adapted['cost_warnings']


def mixed_app_body(duration=15):
    """The actual app's split arrays use via-then-stop fixed order."""
    script = '''
const r=require('./static/js/modules/navigation/routing-request.js');
const j=require('./static/js/modules/navigation/journey-plan.js');
const body=r.buildInitialRouteRequestBody({start:'0,0',end:'0,0.02',optimizeStopOrder:false,
 viaPoints:[{lat:.003,lon:.006,name:'Synthetic via',provenance:'coordinates'}],
 stops:[{lat:.003,lon:.014,name:'Synthetic stop',duration:JSON.parse(process.argv[1]),provenance:'coordinates'}],
 sharedOptions:{routingMode:'auto',vehicleType:'petrol_diesel',avoidCaz:false}});
body.total_stop_time=body.stops[0].duration;
body.journey_context=j.applyDrivingArrival(body,{dataset:{journeySource:'coordinates'}},{dataset:{journeySource:'coordinates'}},null);
console.log(JSON.stringify(body));
'''
    return json.loads(subprocess.check_output(['node','-e',script,json.dumps(duration)],text=True,timeout=10))


def test_registered_mixed_visits_preserve_types_canonical_order_and_complete_request():
    body=mixed_app_body(0);before=copy.deepcopy(body)
    case=dict(points=[[0,0],[.003,.006],[.003,.014],[0,.02]],stop_preview_mode='continuous_no_turn_reset')
    parsed=adapt_app_request(body,case)
    assert parsed['app_request'] == body == before
    assert [v['type'] for v in parsed['visit_plan']] == ['via','stop']
    assert [v['original_index'] for v in parsed['visit_plan']] == [0,1]
    assert parsed['stop_plan'][0]['original_index'] == 1
    assert parsed['dwell_minutes'] == 0
    assert parsed['visits'] == case['points']
    with pytest.raises(Refused,match='stop_semantics_not_supported'):
        normalize_app_request(body)
    with pytest.raises(Refused,match='stop_semantics_not_supported'):
        adapt_app_request(body,dict(case,alternatives=True))
    body['via_points'][0]['original_index']=7
    body['stops'][0]['original_index']=2
    parsed=adapt_app_request(body,case)
    assert [v['original_index'] for v in parsed['visit_plan']] == [7,2]
    assert parsed['visits'] == case['points']  # IDs do not reorder the arrays.


@pytest.mark.parametrize('change',[
    {'via_points':[dict(lat=.003,lon=.006,type='via',duration=15)]},
    {'via_points':[dict(lat=.003,lon=.006,original_index=1)]},
    {'via_points':None}, {'optimize_stop_order':True}, {'preserve_stop_order':False},
    {'total_stop_time':0}, {'departure_time':'2026-11-27T00:00:00Z'},
])
def test_mixed_visit_unsupported_or_ambiguous_requests_refuse(change):
    body=mixed_app_body();body.update(change)
    with pytest.raises(Refused):
        adapt_app_request(body,dict(points=[[0,0],[.003,.006],[.003,.014],[0,.02]],stop_preview_mode='continuous_no_turn_reset'))


@pytest.mark.parametrize('change',[
    {'duration':True}, {'duration':-1}, {'duration':1441}, {'duration':float('nan')},
    {'original_index':True}, {'type':'via'}, {'provenance':'invented'},
])
def test_registered_stop_contract_refuses_invalid_stop_metadata(change):
    stop = dict(lat=.003,lon=.01,type='stop',duration=15,original_index=0)
    stop.update(change)
    with pytest.raises(Refused):
        adapt_app_request(dict(start='0,0',end='0,0.02',stops=[stop]),
                          dict(points=[[0,0],[.003,.01],[0,.02]],stop_preview_mode='continuous_no_turn_reset'))


@pytest.mark.parametrize('change',[
    {'total_stop_time':0}, {'preserve_stop_order':False},
    {'via_points':[dict(lat=.001,lon=.01)]}, {'optimize_stop_order':True},
    {'departure_time':'2026-11-27T12:00:00Z'},
])
def test_registered_stop_contract_does_not_ignore_changed_semantics(change):
    body = dict(start='0,0',end='0,0.02',stops=[dict(lat=.003,lon=.01,duration=15)])
    body.update(change)
    with pytest.raises(Refused):
        adapt_app_request(body,dict(points=[[0,0],[.003,.01],[0,.02]],stop_preview_mode='continuous_no_turn_reset'))


def complete_calculate_body():
    """Include the final orchestration step omitted by the builder-only test."""
    body = app_bodies()['normal']
    script = """
const plan=require('./static/js/modules/navigation/journey-plan.js');
const body=JSON.parse(process.argv[1]);
const input={dataset:{journeySource:'coordinates'}};
body.journey_context=plan.applyDrivingArrival(body,input,input,null);
console.log(JSON.stringify(body));
"""
    return json.loads(subprocess.check_output(['node','-e',script,json.dumps(body)],text=True,timeout=10))


def test_complete_calculate_context_and_accuracy_are_retained_without_gps_authority():
    supplied = complete_calculate_body()
    supplied['origin_accuracy_m'] = 5
    before = copy.deepcopy(supplied)
    adapted = adapt_app_request(supplied,{'points':[[0,0],[0,.02]]})
    assert adapted['app_request'] == before == supplied
    assert adapted['app_request']['journey_context']['arrival_intent']['mode'] == 'place'
    assert 'navigation_allowed' not in adapted


@pytest.mark.parametrize('change',[
    {'purpose':'live_gps'}, {'version':True}, {'stops':[{'coordinates':[0,.01]}]},
    {'arrival_choice':{}}, {'arrival_intent':{'version':1,'mode':'roadside','target':[0,.02]}},
    {'arrival_intent':{'version':1,'mode':'place','target':[0,.01]}},
    {'origin':{'kind':'coordinates','coordinates':[0,.01]}},
    {'origin':{'kind':'gps','coordinates':[False,0]}},
    {'destination':{'kind':'searched','coordinates':[0,.02],'search_evidence':{}}},
    {'origin':{'kind':[],'coordinates':[0,0]}},
])
def test_unsupported_complete_calculate_context_refuses(change):
    supplied = complete_calculate_body()
    supplied['journey_context'].update(change)
    with pytest.raises(Refused):
        adapt_app_request(supplied,{'points':[[0,0],[0,.02]]})


@pytest.mark.parametrize('accuracy',[True,0,-1,151,float('nan'),'5',None])
def test_origin_accuracy_is_metadata_with_a_bounded_numeric_contract(accuracy):
    supplied = complete_calculate_body()
    supplied['origin_accuracy_m'] = accuracy
    with pytest.raises(Refused,match='origin_accuracy_contract'):
        adapt_app_request(supplied,{'points':[[0,0],[0,.02]]})


@pytest.mark.parametrize('case',[{}, {'points':[]}, {'points':[[True,0],[0,1]]}, {'points':[[91,0],[0,1]]}])
def test_anchor_only_or_invalid_cases_cannot_publish_coordinate_templates(case):
    from prototypes.graphhopper11.app_request_bridge import public_request_template
    with pytest.raises(Refused,match='case_request_not_available'):
        public_request_template(case)

"""Pure request adapter: actual JS builders with synthetic inputs, no live app."""
import copy
import json
import subprocess
import pytest
from prototypes.graphhopper11.app_request_bridge import adapt_app_request
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


@pytest.mark.parametrize('change',[
 {'unknown':True}, {'start':'nan,0'}, {'end':'90.1,0'}, {'is_reroute':1},
 {'heading':90}, {'headings':[90,180]}, {'bearing':90}, {'origin_heading':90},
 {'diagnose_origin':{'radius_m':1}},
 {'stops':[{'lat':0,'lon':.01,'duration':0}]}, {'stops':None}, {'round_trip':True},
 {'via_points':[{'lat':0,'lon':.01}],'optimize_stop_order':True},
 {'departure_time':'2026-11-22T00:00:00Z'}, {'time_windows':[]}, {'total_stop_time':15},
 {'via_points':[{'lat':True,'lon':0}]}, {'fuel_efficiency':float('nan')},
 {'fuel_price_mode':'invent'}, {'fuel_category':'secret'},
 {'via_points':[{'lat':0,'lon':.01,'type':'stop'}]},
 {'via_points':[{'lat':0,'lon':.01,'proof':True}]}, {'avoid_points':[{'lat':0,'lon':0}]},
])
def test_unsupported_or_malformed_requests_refuse_without_coercion(change):
    with pytest.raises(Refused):
        adapt_app_request(dict({'start':'0,0','end':'0,0.02','avoid_caz':False},**change),{'points':[[0,0],[0,.02]]})


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


@pytest.mark.parametrize('case',[{}, {'points':[]}, {'points':[[True,0],[0,1]]}, {'points':[[91,0],[0,1]]}])
def test_anchor_only_or_invalid_cases_cannot_publish_coordinate_templates(case):
    from prototypes.graphhopper11.app_request_bridge import public_request_template
    with pytest.raises(Refused,match='case_request_not_available'):
        public_request_template(case)

"""Synthetic UK directional lane/speed data; no survey/real-road accuracy claim."""
from unittest.mock import patch
import pytest
from voyagr.utils.navigation_evidence import lane_evidence,legal_speed_evidence

NOW=1800000000

def test_matched_directional_shared_lanes_keep_every_permitted_through_lane():
    r=lane_evidence({'lanes:forward':'3','turn:lanes:forward':'left|through|through;right'},road_matched=True,direction='forward')
    assert r['evidence_state']=='EXPLICIT'
    assert r['recommended_lanes']==[2,3]  # not automatically the left lane


def test_direction_and_bus_restrictions_are_not_inferred_from_turn_alone():
    tags={'oneway':'yes','lanes':'3','turn:lanes':'left|through|through','bus:lanes':'no|designated|no'}
    assert lane_evidence(tags,road_matched=True,direction='forward')['recommended_lanes']==[3]
    assert not lane_evidence(tags,road_matched=True,direction='backward')['show_lane_guidance']
    assert not lane_evidence(tags,direction='forward')['show_lane_guidance']


@pytest.mark.parametrize('maneuver',['roundabout','merge','uturn','exit'])
def test_turn_tokens_cannot_establish_roundabout_exit_or_merge_lane(maneuver):
    r=lane_evidence({'oneway':'yes','lanes':'2','turn:lanes':'through|right'},road_matched=True,direction='forward',maneuver=maneuver)
    assert not r['show_lane_guidance']


@pytest.mark.parametrize('jurisdiction',['England','Scotland','Wales','Northern Ireland'])
def test_fresh_matched_directional_mapped_limit(jurisdiction):
    r=legal_speed_evidence({'maxspeed':'40 mph','maxspeed:forward':'20 mph'},road_matched=True,direction='forward',vehicle='car',jurisdiction=jurisdiction,observed_at=NOW,now=NOW)
    assert r['speed_limit_mph']==20 and r['evidence_state']=='MAPPED_POSTED' and r['applicable']


@pytest.mark.parametrize('tags,state',[
    ({'highway':'motorway'},'UNKNOWN'),({'maxspeed':'GB:nsl_single'},'LEGAL_RULE_INFERRED'),
    ({'maxspeed':'30 mph','maxspeed:conditional':'20 @ (school_hours)'},'MAPPED_CONDITIONAL'),
    ({'maxspeed':'20;30 mph'},'CONFLICTING'),({'maxspeed':'signals'},'CONFLICTING')])
def test_legal_uncertainty_never_becomes_a_number(tags,state):
    r=legal_speed_evidence(tags,road_matched=True,direction='forward',vehicle='car',jurisdiction='Wales',observed_at=NOW,now=NOW)
    assert r['evidence_state']==state and r['speed_limit_mph'] is None and not r['applicable']


def test_speed_requires_fresh_road_vehicle_and_jurisdiction_context():
    for kw in ({'road_matched':False},{'vehicle':'truck'},{'jurisdiction':'UK'},{'observed_at':NOW-301},{'direction':None}):
        options=dict(road_matched=True,direction='forward',vehicle='car',jurisdiction='England',observed_at=NOW,now=NOW);options.update(kw)
        assert legal_speed_evidence({'maxspeed':'30 mph'},**options)['speed_limit_mph'] is None


def test_public_speed_lookup_cannot_promote_a_road_class_estimate_to_legal_limit():
    from speed_limit_detector import SpeedLimitDetector
    d=SpeedLimitDetector()
    with patch.object(d,'_get_posted_speed_limit',return_value=(70,'road-type-default','motorway')):
        out=d.get_speed_limit_for_location(53.52,-1.13,'motorway')
    assert out['speed_limit_mph'] is None
    assert out['evidence_state']=='LEGAL_RULE_INFERRED'


def test_lane_api_cannot_promote_unmatched_first_nearby_way_to_explicit():
    import voyagr_web as vw
    with patch('voyagr.api.navigation._fetch_osm_lane_data',return_value={'total_lanes':3,'lanes_forward':3,'turn_lanes':'left|through|right','highway':'motorway'}):
        out=vw.app.test_client().get('/api/lane-guidance?lat=53.52&lon=-1.13&maneuver=roundabout&roundabout_exit_count=3&distance=100').json
    assert not out['show_lane_guidance']
    assert out['recommended_lanes']==[]
    assert out['evidence_state']=='UNKNOWN'


def test_speed_warning_does_not_invent_legal_default():
    import voyagr_web as vw
    out=vw.app.test_client().get('/api/speed-warnings?speed=75&road_type=motorway').json
    assert out['status']=='unknown' and out['speed_limit_mph'] is None
    assert out['evidence_state']=='UNKNOWN'


def test_public_trusted_context_preserves_posted_limit_and_strict_alert_threshold():
    from speed_limit_detector import SpeedLimitDetector
    d=SpeedLimitDetector()
    with patch.object(d,'_get_posted_speed_limit',return_value=(70,'road-type-default','motorway')):
        r=d.get_speed_limit_for_location(53.52,-1.13,road_evidence={'tags':{'maxspeed':'30 mph'},
            'road_matched':True,'direction':'forward','vehicle':'car','jurisdiction':'England','observed_at':NOW,'now':NOW})
    assert r['speed_limit_mph']==30 and r['evidence_state']=='MAPPED_POSTED'
    assert d.check_speed_violation(30.1,30,warning_threshold_mph=0)['status']=='exceeding'
    assert d.check_speed_violation(29,30,warning_threshold_mph=0)['status']=='compliant'


def test_osrm_roundabout_exit_count_is_preserved_without_angle_inference():
    from voyagr.utils.osrm import build_osrm_maneuvers
    r={'legs':[{'steps':[{'maneuver':{'type':'roundabout','exit':3,'location':[-1.13,53.52]},'distance':50}]}]}
    out=build_osrm_maneuvers(r,[(53.52,-1.13),(53.521,-1.13)])
    assert out[0]['roundabout_exit_count']==3 and out[0]['roundabout_exit_source']=='OSRM'
    r['legs'][0]['steps'][0]['maneuver']['exit']=True
    assert 'roundabout_exit_count' not in build_osrm_maneuvers(r,[(53.52,-1.13),(53.521,-1.13)])[0]


def test_graphhopper_road_class_lanes_are_marked_inferred():
    from voyagr.utils.lane_maneuvers import build_lanes_for_maneuver
    lanes=build_lanes_for_maneuver(valhalla_type=20,road_class='motorway',path_lane_count=3)
    assert all(l['evidence_state']=='INFERRED' for l in lanes)


def test_desktop_exception_retains_position_instead_of_assigning_a_default():
    # Execute the actual handler body without importing unavailable Kivy/UI packages.
    import ast
    from pathlib import Path
    from types import SimpleNamespace
    tree=ast.parse(Path('satnav.py').read_text())
    cls=next(n for n in tree.body if isinstance(n,ast.ClassDef) and n.name=='SatNavApp')
    method=next(n for n in cls.body if isinstance(n,ast.FunctionDef) and n.name=='on_location')
    module=ast.Module(body=[method],type_ignores=[]);ast.fix_missing_locations(module)
    ns={'validate_coordinates':lambda *a:(True,None),'log_validation_error':lambda *a:None,
        'notification':SimpleNamespace(notify=lambda **kw:None),'time':SimpleNamespace(time=lambda:NOW)}
    exec(compile(module,'satnav.py','exec'),ns)
    obj=SimpleNamespace(current_pos=(51.5,-.1),gps_poll_count=0)
    # Invalid numeric speed raises downstream, after a valid coordinate admission.
    ns['on_location'](obj,lat=51.51,lon=-.11,speed=None)
    assert obj.current_pos==(51.51,-.11)
    assert obj.gps_fix_state=='UNKNOWN'


@pytest.mark.parametrize('kind,modifier,expected', [('fork','left',24),('fork','right',23),('on ramp','left',25),('on ramp',None,25),('off ramp','left',21)])
def test_motorway_fork_merge_and_exit_are_not_generic_turns(kind,modifier,expected):
    from voyagr.utils.osrm import build_osrm_maneuvers
    r={'legs':[{'steps':[{'maneuver':{'type':kind,'modifier':modifier,'location':[-1.13,53.52]},'name':'M1'}]}]}
    m=build_osrm_maneuvers(r,[(53.52,-1.13),(53.521,-1.13)])[0]
    assert m['type']==expected and m['maneuver_kind']==kind
    assert ('Keep' if kind=='fork' else 'Merge' if kind=='on ramp' else 'exit') in m['instruction']


@pytest.mark.parametrize('speed,limit,threshold',[(float('nan'),30,0),(40,float('nan'),0),(float('inf'),30,5),(40,30,float('nan'))])
def test_nonfinite_speed_data_cannot_be_compliant(speed,limit,threshold):
    from speed_limit_detector import SpeedLimitDetector
    assert SpeedLimitDetector().check_speed_violation(speed,limit,threshold)['status']=='unknown'


def test_candidate_default_cannot_overwrite_conditional_legal_provenance():
    from speed_limit_detector import SpeedLimitDetector
    d=SpeedLimitDetector()
    with patch.object(d,'_get_posted_speed_limit',return_value=(70,'road-type-default','motorway')):
        r=d.get_speed_limit_for_location(53.52,-1.13,road_evidence={'tags':{'maxspeed:conditional':'20 mph @ (school_hours)'},
            'road_matched':True,'direction':'forward','jurisdiction':'Wales','observed_at':NOW,'now':NOW})
    assert r['evidence_state']=='MAPPED_CONDITIONAL'
    assert r['speed_limit_mph'] is None and not r['applicable']

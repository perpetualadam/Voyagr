"""Synthetic directional source fixtures, never surveyed ground truth."""
import copy
import pytest
from voyagr.utils.road_matching import RoadIndex, match_position, attribute_bundle, hazard_association

NOW=1800000000000

def dataset():
    return {'schema_version':1,'source':'synthetic','revision':'fixture-v1','acquired_at_ms':NOW,
            'bounds':[53.50,-1.15,53.55,-1.10],'coverage':'COMPLETE',
            'roads':[{'osm_way_id':'100','node_ids':['1','2'],'geometry':[[53.52,-1.13],[53.53,-1.13]],
                      'tags':{'highway':'primary','oneway':'yes','lanes':'2','turn:lanes':'through|right','maxspeed':'30 mph'},'jurisdiction':'England'}]}

def fix(t=0,**coords):
    return {'timestamp':NOW+t,'coords':dict(latitude=53.525,longitude=-1.13,accuracy=5,speed=10,heading=0,**coords)}

def match(data=None,previous=None,t=0,position=None):
    return match_position(position or fix(t),RoadIndex(data or dataset()),previous=previous,now=NOW+t,route_generation=1)

def test_source_ids_direction_and_two_fix_attribute_gate():
    first=match();r=match(previous=first,t=1000)
    assert first['evidence_status']=='PROBABLE' and not first['attributes_allowed']
    assert r['osm_way_id']=='100' and r['direction']=='forward' and r['attributes_allowed']
    assert r['graph_edge_id'] is None and r['carriageway_id'] is None
    assert r['evidence_status']!='VERIFIED_AGAINST_SOURCE'
    bundle=attribute_bundle(dataset()['roads'][0],r,vehicle='car',now=NOW+1000)
    assert bundle['speed']['speed_limit_mph']==30
    assert bundle['lanes']['straight']['recommended_lanes']==[1]

def test_parallel_road_cannot_be_resolved_by_nearest_distance_or_route_hint():
    d=dataset();other=copy.deepcopy(d['roads'][0]);other.update(osm_way_id='200',node_ids=['3','4'],geometry=[[53.52,-1.1299],[53.53,-1.1299]])
    d['roads'].append(other)
    r=match(d)
    assert r['evidence_status']=='AMBIGUOUS' and not r['attributes_allowed']
    assert r['osm_way_id'] is None

def test_opposite_carriageway_is_excluded_only_with_qualified_heading():
    d=dataset();other=copy.deepcopy(d['roads'][0]);other.update(osm_way_id='200',node_ids=['4','3'],geometry=[[53.53,-1.1299],[53.52,-1.1299]])
    d['roads'].append(other)
    assert match(d)['osm_way_id']=='100'
    p=fix();p['coords']['speed']=0
    assert match(d,position=p)['evidence_status']=='AMBIGUOUS'

def test_source_age_invalid_geometry_and_partial_coverage_cannot_verify_attributes():
    d=dataset();d['acquired_at_ms']=NOW-86400001
    assert match(d)['evidence_status']=='STALE'
    d=dataset();d['roads'][0]['geometry'][0][0]=float('nan')
    assert match(d)['evidence_status']=='UNMATCHED'
    d=dataset();d['coverage']='PARTIAL'
    first=match(d);assert not match(d,first,1000)['attributes_allowed']

def test_stale_fix_route_switch_and_disconnected_transition_reset_trust():
    first=match();r=match_position(fix(),RoadIndex(dataset()),previous=first,now=NOW+16000,route_generation=1)
    assert r['evidence_status']=='STALE'
    r=match_position(fix(1000),RoadIndex(dataset()),previous=first,now=NOW+1000,route_generation=2)
    assert not r['attributes_allowed']
    d=dataset();d['roads'][0]['osm_way_id']='200';d['roads'][0]['node_ids']=['9','10']
    assert match(d,first,1000)['evidence_status']=='AMBIGUOUS'

def test_ids_are_namespaced_and_incomplete_hazards_stay_possible():
    r=match(previous=match(),t=1000)
    h={'osm_way_id':'200','direction':'forward','observed_at_ms':NOW,'position_uncertainty_m':5}
    assert hazard_association(r,h,NOW+1000)=='UNRELATED'
    h={'graph_edge_id':'100','graph_provider':'OSRM','observed_at_ms':NOW}
    assert hazard_association(r,h,NOW+1000)=='POSSIBLE'
    assert hazard_association(r,{'osm_way_id':'100','direction':'backward','observed_at_ms':NOW},NOW+1000)=='UNRELATED'
    assert hazard_association(r,{'osm_way_id':'100','direction':'forward','observed_at_ms':NOW},NOW+1000)=='APPLICABLE'
    assert hazard_association(r,{'osm_way_id':'200'},NOW+1000)=='POSSIBLE'

@pytest.mark.parametrize('field,value',[('accuracy',50),('heading',None),('headingAccuracy',90)])
def test_uncertain_gps_cannot_authorize_road_attributes(field,value):
    p=fix();p['coords'][field]=value
    r=match(position=p)
    assert not r['attributes_allowed']


def test_legacy_untyped_or_stale_ids_cannot_clear_mandatory_hazard():
    from voyagr.utils.hazard_matching import SegmentIndex
    index=SegmentIndex([[53.52,-1.13],[53.53,-1.13]],[{'begin_shape_index':0,'end_shape_index':1,'road_id':'100'}])
    hazard={'lat':53.525,'lon':-1.13,'road_id':'200','travel_bearing_deg':180}
    assert index.match(hazard,'speed_cameras',NOW/1000)=='POSSIBLE'


def test_http_context_is_operator_owned_and_match_claims_are_ignored(tmp_path,monkeypatch):
    import json
    import voyagr_web as vw
    d=dataset();d['source_kind']='REVIEWED_PROVIDER'
    path=tmp_path/'source.json';path.write_text(json.dumps(d));monkeypatch.setenv('VOYAGR_ROAD_EVIDENCE_FILE',str(path))
    client=vw.app.test_client()
    with __import__('unittest.mock',fromlist=['patch']).patch('time.time',return_value=(NOW+1000)/1000):
        response=client.post('/api/road-context',json={'lat':53.525,'lon':-1.13,'road_id':'evil','source':'/etc/passwd','vehicle_type':'car'})
        assert response.status_code==200 and response.headers['Cache-Control']=='no-store'
        assert response.json['context']['roads'][0]['osm_way_id']=='100'
        result=client.post('/api/road-match',json={'position':fix(1000),'previous_position':fix(),'vehicle_type':'car',
            'road_match':{'evidence_status':'VERIFIED_AGAINST_SOURCE','osm_way_id':'evil'}}).json
        assert result['road_match']['osm_way_id']=='100' and result['road_match']['attributes_allowed']
        assert result['attributes']['speed']['speed_limit_mph']==30
        assert client.post('/api/road-context',json={'lat':'nan','lon':-1.13}).status_code==400
        monkeypatch.delenv('VOYAGR_ROAD_EVIDENCE_FILE')
        assert client.post('/api/road-context',json={'lat':53.525,'lon':-1.13}).json['context'] is None


def test_synthetic_or_malformed_source_file_is_not_a_live_authority(tmp_path,monkeypatch):
    import json
    from voyagr.services.road_context import load_context
    path=tmp_path/'source.json';monkeypatch.setenv('VOYAGR_ROAD_EVIDENCE_FILE',str(path))
    path.write_text(json.dumps(dict(dataset(),source_kind='SYNTHETIC')))
    assert load_context() is None
    path.write_text('{invalid')
    assert load_context() is None


def test_source_boundary_and_unsupported_restrictions_preserve_uncertainty():
    d=dataset();d['bounds'][1]=-1.13001
    first=match(d);assert not match(d,first,1000)['attributes_allowed']
    d=dataset();d['restrictions']=[{'unsupported':True}]
    first=match(d);assert not match(d,first,1000)['attributes_allowed']


def test_oneway_reverse_roundabout_and_turn_restrictions():
    d=dataset();d['roads'][0]['tags'].update(oneway='-1',junction='roundabout')
    assert match(d)['evidence_status']=='UNMATCHED'
    p=fix();p['coords']['heading']=180
    assert match(d,position=p)['direction']=='backward'
    d=dataset();road=copy.deepcopy(d['roads'][0]);road.update(osm_way_id='200',node_ids=['2','3'],geometry=[[53.53,-1.13],[53.54,-1.13]])
    d['roads'].append(road);d['restrictions']=[{'from_way':'100','via_node':'2','to_way':'200','restriction':'no_straight_on'}]
    p=fix();p['coords']['latitude']=53.5298
    previous=match(d,position=p)
    p=fix(1000);p['coords']['latitude']=53.53015
    assert match(d,previous,1000,p)['evidence_status']=='AMBIGUOUS'


def test_roundabout_exits_follow_source_topology_not_angles_or_ineligible_service_roads():
    import json
    from pathlib import Path
    from voyagr.utils.junction_topology import validate_roundabout
    d=json.loads(Path('tests/fixtures/phase7/uk-junctions-v1.json').read_text())['roundabout_graph']
    r=validate_roundabout(d,['a','b','c'],'exit2',2,now=NOW)
    assert r['status']=='VERIFIED_AGAINST_SOURCE' and r['exit_count']==2
    assert validate_roundabout(d,['a','b','c'],'exit2',3,now=NOW)['status']=='CONFLICTING'
    d['coverage']='PARTIAL'
    assert validate_roundabout(d,['a','b','c'],'exit2',2,now=NOW)['exit_count'] is None


def test_junction_manifest_cannot_claim_acquired_or_surveyed_validation():
    import json
    from pathlib import Path
    d=json.loads(Path('tests/fixtures/phase7/uk-junctions-v1.json').read_text())
    assert len(d['cases'])==14
    assert d['provenance']['kind']=='SYNTHETIC'
    assert all(c['real_source_validation']=='NOT_EXECUTED' for c in d['cases'])


def _replay_cases():
    import json
    from pathlib import Path
    fixture=json.loads(Path('tests/fixtures/phase7/directional-replay-v1.json').read_text())
    return [(s,fixture['contexts'][s['context']]) for s in fixture['scenarios']]


@pytest.mark.parametrize('scenario,context',_replay_cases(),ids=lambda v:v.get('name','context'))
def test_shared_directional_replay_contract_in_python(scenario,context):
    index=RoadIndex(context);previous=None;result=None
    for f in scenario['frames']:
        now=NOW+f['t'];p={'timestamp':now,'coords':dict(latitude=f['lat'],longitude=f['lon'],accuracy=f.get('accuracy',5),speed=f.get('speed',0),heading=f.get('heading'))}
        result=match_position(p,index,previous=previous,now=now,route_generation=1)
        if f.get('signal') is False:result=dict(result,evidence_status='UNMATCHED',osm_way_id=None,attributes_allowed=False)
        previous=result if result['evidence_status']=='PROBABLE' else None
    assert result['evidence_status']==scenario['expected_match_state']
    assert result['osm_way_id']==scenario['expected_road']
    assert result['attributes_allowed']==scenario['expected_attributes']


def test_conflicting_graph_edge_binding_is_not_trusted():
    d=dataset();d['roads'][0].update(graph_edge_id='1',graph_provider='fixture')
    other=copy.deepcopy(d['roads'][0]);other['osm_way_id']='other';d['roads'].append(other)
    assert match(d)['evidence_status']=='UNMATCHED'


@pytest.mark.parametrize('value',[[],{'bounds':None},dict(dataset(),source_kind='REVIEWED_PROVIDER',bounds='invalid')])
def test_invalid_source_structure_is_unavailable_not_a_server_error(tmp_path,monkeypatch,value):
    import json
    from voyagr.services.road_context import load_context
    path=tmp_path/'source.json';path.write_text(json.dumps(value));monkeypatch.setenv('VOYAGR_ROAD_EVIDENCE_FILE',str(path))
    assert load_context() is None

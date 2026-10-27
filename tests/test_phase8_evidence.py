"""Bounded local evidence/tool regression tests; no real graph or survey claims."""
import copy
import importlib.util
from pathlib import Path
from unittest.mock import Mock,patch
import pytest
from voyagr.utils.road_matching import RoadIndex


def script(name):
    spec=importlib.util.spec_from_file_location(name.replace('-','_'),Path('scripts')/(name+'.py'))
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);return module


def test_conflicting_shared_node_coordinates_are_rejected():
    roads=[{'osm_way_id':'1','node_ids':['a','b'],'geometry':[[53.52,-1.13],[53.53,-1.13]],'tags':{}},
           {'osm_way_id':'2','node_ids':['a','c'],'geometry':[[53.54,-1.13],[53.55,-1.13]],'tags':{}}]
    assert RoadIndex({'roads':roads}).invalid


def test_duplicate_source_way_is_not_a_second_trustworthy_road():
    road={'osm_way_id':'1','node_ids':['a','b'],'geometry':[[53.52,-1.13],[53.53,-1.13]],'tags':{}}
    assert RoadIndex({'roads':[road,copy.deepcopy(road)]}).invalid


def test_multiple_via_members_are_not_silently_reduced_to_a_simple_restriction():
    m=script('acquire-phase7-osm')
    xml=b'<osm><relation id="5"><member type="way" ref="1" role="from"/><member type="node" ref="2" role="via"/><member type="node" ref="3" role="via"/><member type="way" ref="4" role="to"/><tag k="type" v="restriction"/><tag k="restriction" v="no_right_turn"/></relation></osm>'
    d=m.normalize(xml,[53.5,-1.2,53.6,-1.1],1800000000000,'synthetic-test')
    assert d['restrictions'][0].get('unsupported') is True


def test_bad_request_is_not_proof_of_no_compliant_route():
    m=script('replay-routing-engines')
    manifest={'graph_fixture_verified':True,'providers':{'Valhalla':{'url':'http://127.0.0.1:8002','metadata_path':'/status'}},
              'cases':[{'name':'no_compliant_route','providers':{'Valhalla':{'path':'/route','expect_no_route':True}}}]}
    manifest['cases'][0]['providers']['Valhalla']['oracle']={'reviewed':True,'source_sha256':'a'*64,'engine_version':'unit-mock','graph_revision':'unit-mock','profile':'car'}
    with patch.object(m,'bounded_request',side_effect=[(200,{'version':'unit-mock'}),(400,{'error':'Bad request','error_code':100})]):
        assert m.run(manifest,approved_local_services=True)['cases'][0]['status']=='FAILED_EXPECTED_NO_ROUTE'


def test_export_retains_original_age_partial_coverage_and_hazard_uncertainty():
    m=script('export-phase8-road-evidence')
    raw=b'<osm><node id="1" lat="53.52" lon="-1.13"><tag k="highway" v="speed_camera"/></node><node id="2" lat="53.521" lon="-1.13"/><way id="10"><nd ref="1"/><nd ref="2"/><tag k="highway" v="primary"/><tag k="oneway" v="yes"/></way></osm>'
    d=m.export(raw,[53.51,-1.14,53.53,-1.12],1800000000000,'synthetic-XML-unit-test','England',now=1800086400001)
    assert d['acquired_at_ms']==1800000000000
    assert d['coverage']=='PARTIAL' and not d['quality_control']['attribute_eligible']
    assert d['source_hazards'][0]['association_status']=='UNVERIFIED'
    assert d['source_hazards'][0]['candidate_osm_way_ids']==['10']
    assert d['quality_control']['hazard_coverage']=='UNKNOWN'


def test_export_refuses_remote_queries_entities_and_existing_output(tmp_path):
    m=script('export-phase8-road-evidence')
    for url in ('http://production.example/api/interpreter','http://user:password@127.0.0.1/api/interpreter','http://127.0.0.1/admin'):
        with pytest.raises(ValueError):m.local_overpass(url,[53.51,-1.14,53.52,-1.13],True)
    with pytest.raises(ValueError):m.export(b'<!DOCTYPE osm [<!ENTITY x "bad">]><osm/>',[53.51,-1.14,53.52,-1.13],1800000000000,'unit-test','England')
    from voyagr.utils.road_evidence import write_new_json,read_bounded
    path=tmp_path/'review.json';write_new_json(path,{'review':'original'})
    with pytest.raises(FileExistsError):write_new_json(path,{'replace':True})
    assert 'original' in path.read_text()
    with pytest.raises(ValueError):read_bounded(path,3)


def test_quality_control_rejects_unresolved_references_and_bad_direction():
    from voyagr.utils.road_evidence import validate_evidence
    d={'schema_version':1,'source':'synthetic-unit-test','revision':'v1','acquired_at_ms':1800000000000,
       'bounds':[53.51,-1.14,53.53,-1.12],'coverage':'COMPLETE','source_kind':'SYNTHETIC',
       'roads':[{'osm_way_id':'1','node_ids':['a','b'],'geometry':[[53.52,-1.13],[53.521,-1.13]],'tags':{'oneway':'invalid'}}],
       'restrictions':[{'from_way':'1','to_way':'missing','via_node':'b'}]}
    out=validate_evidence(d,now=1800000000001)
    assert not out['valid'] and not out['attribute_eligible']
    assert 'Unknown one-way encoding' in out['errors']
    assert 'Restriction has unresolved way/node references' in out['errors']


@pytest.mark.parametrize('engine,status,body,expected',[
    ('Valhalla',400,{'error_code':442},True),('Valhalla',400,{'error_code':100},False),
    ('OSRM',404,{'message':'Not found'},False),('OSRM',200,{'code':'NoRoute'},True),
    ('GraphHopper',400,{'hints':[{'details':'com.graphhopper.util.exceptions.ConnectionNotFoundException'}]},True),
    ('GraphHopper',400,{'hints':[{'message':'Unknown profile'}]},False)])
def test_no_route_requires_provider_specific_evidence(engine,status,body,expected):
    assert script('replay-routing-engines').is_no_route_response(engine,status,body)==expected


def test_replay_is_no_network_by_default_and_rejects_mutation_paths():
    import json
    m=script('replay-routing-engines');manifest=json.loads(Path('scripts/fixtures/routing-engine-replay.json').read_text())
    with patch.object(m,'bounded_request',side_effect=AssertionError('No approval')):
        result=m.run(manifest)
    assert len(result['cases'])==36 and result['execution_status']=='REAL_ENGINE_EXECUTION_NOT_TESTED'
    assert all(c['status']=='NOT_TESTED' for c in result['cases'])
    for path in ('/admin/delete','//remote/route','/route/../delete','/route?key=secret'):
        with pytest.raises(ValueError):m.provider_path('Valhalla',path)
    with pytest.raises(ValueError):m.loopback('http://127.0.0.1:8002/admin')


def test_all_alternatives_and_ordered_waypoints_are_checked():
    import polyline
    m=script('replay-routing-engines')
    a=polyline.encode([(53.52,-1.13),(53.53,-1.13)],precision=5)
    b=polyline.encode([(53.52,-1.12),(53.53,-1.12)],precision=5)
    assert len(m.geometries('OSRM',{'routes':[{'geometry':a},{'geometry':b}]},{}))==2
    coords=[[53.52,-1.13],[53.525,-1.13],[53.53,-1.13]]
    assert m.waypoint_order_matches(coords,[[53.522,-1.13],[53.528,-1.13]],5)
    assert not m.waypoint_order_matches(coords,[[53.528,-1.13],[53.522,-1.13]],5)


def test_importer_rejects_conflicting_duplicate_xml_nodes():
    m=script('acquire-phase7-osm')
    xml=b'<osm><node id="1" lat="53.52" lon="-1.13"/><node id="1" lat="53.53" lon="-1.13"/></osm>'
    with pytest.raises(ValueError,match='Conflicting source node'):m.normalize(xml,[53.51,-1.14,53.54,-1.12],1800000000000,'synthetic-unit-test')


def test_legacy_cli_cannot_retimestamp_offline_data_or_overwrite_outputs(tmp_path):
    import subprocess,sys
    source=tmp_path/'source.xml';source.write_text('<osm/>');target=tmp_path/'review.json'
    command=[sys.executable,'scripts/acquire-phase7-osm.py','--input',str(source),'--bbox=-1.14,53.51,-1.135,53.515','--output',str(target)]
    result=subprocess.run(command,capture_output=True,text=True)
    assert result.returncode!=0 and 'source-acquired-at' in result.stderr
    assert not target.exists()
    target.write_text('original')
    result=subprocess.run(command,capture_output=True,text=True)
    assert result.returncode!=0 and target.read_text()=='original'


def test_device_template_cannot_be_counted_as_physical_acceptance():
    import json
    m=script('validate-phase8-device-results')
    data=json.loads(Path('scripts/fixtures/phase8/pwa-device-results-template.json').read_text())
    result=m.validate(data)
    assert result['status']=='REAL_DEVICE_ACCEPTANCE_NOT_TESTED'
    assert result['counts']['NOT_TESTED']==20 and not result['production_release_authorized']
    data.update(execution_environment='physical-device',device_model='unit-test-not-real',os_version='test',browser_version='test',recorded_at='2026-10-27T00:00:00Z',app_commit='a'*40,observation_role='passenger')
    for c in data['cases']:c.update(status='PASS',evidence_notes='Synthetic validator test, not a physical execution')
    result=m.validate(data)
    assert result['status']=='OPERATOR_RECORDED_RESULTS_REQUIRE_INDEPENDENT_REVIEW'
    assert not result['production_release_authorized']
    data['cases'][0]['status']='FAIL'
    assert m.validate(data)['status']=='REAL_DEVICE_ACCEPTANCE_NOT_TESTED'


def test_metadata_export_retains_profiles_without_nested_secrets():
    m=script('replay-routing-engines')
    result=m.safe_metadata({'version':'test','profiles':[{'name':'car','vehicle':'car','api_key':'do-not-export'}],
                            'encoded_values':[{'name':'road_class','private_key':'do-not-export'}],'token':'do-not-export'})
    assert result=={'version':'test','profiles':[{'name':'car','vehicle':'car'}],'encoded_values':['road_class']}


def test_stale_fixture_engine_version_does_not_execute_a_routing_request():
    m=script('replay-routing-engines')
    fixture={'path':'/route','oracle':{'reviewed':True,'source_sha256':'a'*64,'engine_version':'old','graph_revision':'old-graph','profile':'car'}}
    manifest={'graph_fixture_verified':True,'providers':{'Valhalla':{'url':'http://127.0.0.1:8002','metadata_path':'/status'}},'cases':[{'name':'unit-mock','providers':{'Valhalla':fixture}}]}
    with patch.object(m,'bounded_request',return_value=(200,{'version':'new'})) as request:
        result=m.run(manifest,approved_local_services=True)
    assert request.call_count==1 and result['routing_requests_attempted']==0
    assert result['execution_status']=='REAL_ENGINE_EXECUTION_NOT_TESTED'

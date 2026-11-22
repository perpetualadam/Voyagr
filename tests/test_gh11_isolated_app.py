"""Actual isolated Flask -> local GH11 Java -> generated graph tests. No listener."""
import base64
import copy
import json
import os
from pathlib import Path
import subprocess

import pytest

from prototypes.graphhopper11.isolated_app import (
    LocalJavaBridge, Refused, build_manifest, create_app,
)

pytestmark = pytest.mark.skipif(not os.environ.get("GH11_PROTOTYPE_JAR"), reason="Pinned local GH11 JAR not supplied")
PASSWORD = "f" * 64  # Test fixture credential only; never used on a VPS.
AUTH = {"Authorization": "Basic " + base64.b64encode(("prototype:" + PASSWORD).encode()).decode()}


@pytest.fixture(scope="module")
def manifest(tmp_path_factory):
    root = tmp_path_factory.mktemp("gh11-flask-real")
    source = root / "fixture.osm"
    source.write_text('''<osm version="0.6">
      <node id="1" lat="0" lon="0"/><node id="2" lat="0" lon="0.02"/>
      <node id="3" lat="0" lon="0.01"/><node id="4" lat="0.003" lon="0.01"/>
      <node id="5" lat="0.004" lon="0.01"/>
      <way id="10"><nd ref="1"/><nd ref="3"/><nd ref="2"/><tag k="highway" v="primary"/></way>
      <way id="11"><nd ref="1"/><nd ref="4"/><nd ref="2"/><tag k="highway" v="residential"/></way>
      <way id="12"><nd ref="4"/><nd ref="5"/><tag k="highway" v="residential"/></way>
    </osm>''')
    graph = root / "graph"
    config = root / "config.yml"
    config.write_text(f'''graphhopper:
  datareader.file: {source}
  graph.location: {graph}
  graph.dataaccess.default_type: MMAP
  prepare.min_network_size: 0
  import.osm.ignored_highways: footway,construction,cycleway,path,steps
  graph.encoded_values: car_access,car_average_speed,road_access,max_speed,road_class,osm_way_id
  profiles:
    - name: car
      custom_model_files: [car.json]
      turn_costs:
        vehicle_types: [motorcar, motor_vehicle]
        u_turn_costs: 60
  profiles_ch: []
  profiles_lm: []
''')
    jar = Path(os.environ["GH11_PROTOTYPE_JAR"]).resolve()
    subprocess.run(["java", "-Xmx512m", "-jar", str(jar), "import", str(config)],
                   cwd=root, check=True, capture_output=True, timeout=90)
    associations = [
        {"id": "main", "points": [[0, 0], [0, .02]], "expected_osm_way_ids": [10], "max_snap_distance_m": 1},
        {"id": "upper", "points": [[0, 0], [.003, .01], [0, .02]], "expected_osm_way_ids": [11], "max_snap_distance_m": 1},
    ]
    plain = {"id": "detour", "points": [[0, 0], [0, .02]],
             "blocked_associations": ["main"], "block_both_directions": True, "max_snap_distance_m": 1}
    registry = root / "registry.json"
    registry.write_text(json.dumps({"associations": associations, "cases": [plain,
        dict(plain, id="alternatives", alternatives=True),
        dict(plain, id="via", points=[[0, 0], [.003, .01], [0, .02]]),
        dict(plain, id="departure", points=[[.003, .01], [0, .02]]),
        dict(plain, id="no_route", blocked_associations=["main", "upper"]),
        dict(plain, id="motorway_rule", no_motorways=True),
    ]}))
    return build_manifest(jar=jar, graph=graph, config=config, registry=registry, source=source)


@pytest.fixture
def app(manifest):
    app = create_app(manifest, password=PASSWORD)
    app.config["TESTING"] = True
    return app


def body(manifest, case="detour"):
    return {"case_id": case, "graph_version": manifest["graph_version"], "source_version": manifest["source_version"], "policy_version": manifest["policy_version"]}


@pytest.mark.parametrize("case", ["detour", "alternatives", "via", "departure"])
def test_real_flask_java_route_geometry_instructions_and_exclusions(app, manifest, case):
    before = copy.deepcopy(manifest["graph_files"])
    response = app.test_client().post("/api/prototype/route", json=body(manifest, case), headers=AUTH)
    assert response.status_code == 200, response.get_json()
    result = response.get_json()
    assert result["engine_version"] == "11.1" and result["navigation_allowed"] is False
    assert result["scope"] == "selected_fixture_graph_checks_only"
    assert result["graph_version"] == manifest["graph_version"]
    assert result["source_version"] == manifest["source_version"]
    assert result["policy_version"] == manifest["policy_version"]
    assert result["blocked_edge_keys"]
    assert 1 <= len(result["candidates"]) <= (3 if case == "alternatives" else 1)
    for row in result["candidates"]:
        assert row["navigation_allowed"] is False
        assert row["geometry"]["type"] == "LineString"
        assert len(row["geometry"]["coordinates"]) >= 2
        assert row["instruction_details"]
        assert set(row["directed_edge_keys"]).isdisjoint(result["blocked_edge_keys"])
    app.extensions["gh11_bridge"].verify()
    assert before == manifest["graph_files"]
    assert response.headers["Cache-Control"] == "private, no-store"


def test_no_route_is_refused_without_fallback(app, manifest):
    response = app.test_client().post("/api/prototype/route", json=body(manifest, "no_route"), headers=AUTH)
    assert response.status_code == 422
    assert response.get_json() == {"success": False, "reason": "engine_refused", "navigation_allowed": False}
    assert "candidates" not in response.get_json()


def test_auth_request_contract_versions_and_cross_origin_refused_before_java(app, manifest, monkeypatch):
    def forbidden(*_):
        pytest.fail("Java must not run for rejected HTTP input")
    monkeypatch.setattr(app.extensions["gh11_bridge"], "route", forbidden)
    client = app.test_client()
    assert client.get("/").status_code == 401
    bad_auth = {"Authorization": "Basic " + base64.b64encode("prototype:wrong".encode()).decode()}
    assert client.get("/", headers=bad_auth).status_code == 401
    assert client.get("/", headers=AUTH).status_code == 200
    asset = client.get("/prototype-viewer.js", headers=AUTH)
    assert asset.status_code == 200 and asset.mimetype == "application/javascript"
    assert "script-src 'self'" in asset.headers["Content-Security-Policy"]
    for name in ("strict-route-policy.js", "avoidance-integrity.js", "navigation-safety-ux.js"):
        assert client.get("/strict-assets/"+name, headers=AUTH).status_code == 200
    assert client.get("/strict-assets/not-registered.js", headers=AUTH).status_code == 404
    for extra in ({"blocked_keys": []}, {"custom_model": {}}, {"coverage": "COMPLETE"}):
        assert client.post("/api/prototype/route", json=dict(body(manifest), **extra), headers=AUTH).status_code == 400
    assert client.post("/api/prototype/route", json=body(manifest, "unknown"), headers=AUTH).status_code == 400
    assert client.post("/api/prototype/route", json=dict(body(manifest), graph_version="0"*64), headers=AUTH).status_code == 409
    assert client.post("/api/prototype/route", json=body(manifest), headers=dict(AUTH, Origin="https://elsewhere.invalid")).status_code == 403
    assert client.post("/api/prototype/route", data="x"*2048, content_type="application/json", headers=AUTH).status_code == 413
    assert client.get("/api/prototype/versions", headers=AUTH).get_json()["navigation_allowed"] is False


def test_graph_mutation_is_refused_without_execution_or_path_leak(app, manifest, monkeypatch):
    bridge = app.extensions["gh11_bridge"]
    bridge.route("detour")  # A warm cache must not bypass the graph fingerprint.
    assert bridge.cache
    def forbidden(*_):
        pytest.fail("Changed graph must be refused before execution")
    monkeypatch.setattr(bridge, "_execute", forbidden)
    name = next(iter(manifest["graph_files"]))
    path = Path(manifest["paths"]["graph"]) / name
    original = path.read_bytes()
    try:
        path.write_bytes(original + b"changed")
        response = app.test_client().post("/api/prototype/route", json=body(manifest), headers=AUTH)
        assert response.status_code == 409
        assert str(path) not in response.get_data(as_text=True)
    finally:
        path.write_bytes(original)
    bridge.verify()


def test_missing_source_or_forged_manifest_refused_at_startup(manifest):
    changed = copy.deepcopy(manifest)
    changed["source_version"] = "0"*64
    with pytest.raises(Refused, match="version_mismatch"):
        create_app(changed, password=PASSWORD)
    changed = copy.deepcopy(manifest)
    changed["paths"]["source"] = "/not/a/real/source"
    with pytest.raises(FileNotFoundError):
        create_app(changed, password=PASSWORD)


def test_real_transport_timeout_and_output_limit_kill_child_group(manifest, tmp_path):
    script = tmp_path / "runtime"
    script.write_text('#!/usr/bin/env python3\nimport time\ntime.sleep(10)\n')
    script.chmod(0o700)
    bridge = LocalJavaBridge(manifest, java=str(script), timeout=1)
    with pytest.raises(Refused, match="transport_timeout"):
        bridge.route("detour")
    script.write_text('#!/usr/bin/env python3\nprint("x"*100000)\n')
    bridge = LocalJavaBridge(manifest, java=str(script), output_limit=1024)
    with pytest.raises(Refused, match="transport_output_limit"):
        bridge.route("detour")


@pytest.mark.parametrize("fault", ["unsafe_third", "trace_gap", "missing_blocks", "instructions", "metrics", "settings", "unknown_sign", "shape_interval", "missing_waypoint"])
def test_independent_transport_validation_rejects_corrupted_result(app, fault):
    bridge = app.extensions["gh11_bridge"]
    case = dict(bridge.cases["detour"], alternatives=True)
    candidates = []
    for key in (2, 4, 6):
        candidates.append({"geometry": {"type": "LineString", "coordinates": [[0, 0], [.02, 0]]},
                           "edge_intervals": [[0, 1, key]], "directed_edge_keys": [key], "directed_edges": 1,
                           "distance_km": 1, "duration_minutes": 1, "instructions": 1, "waypoint_indices":[0,1],
                           "instruction_details": [{"name": "Road", "sign": 0, "distance_m": 1000, "time_ms": 60000,"text":"Continue", "interval":[0,1]}]})
    report = {"engine_version": "11.1", "all_available_graph_checks_passed": True,
              "associations": [{"id": name, "status": "PASS_AVAILABLE_GRAPH_CHECKS",
                                "candidates": [{"directed_edge_keys": [key]}]}
                               for name, key in (("main", 98), ("upper", 100))],
              "cases": [{"id": "detour", "status": "PASS_AVAILABLE_GRAPH_CHECKS",
                         "alternatives": True, "no_motorways": False, "requested_points":2, "blocked_edge_keys": [98, 99], "candidates": candidates}]}
    accepted = bridge.validate(report, case)
    assert len(accepted["candidates"]) == 3 and accepted["navigation_allowed"] is False
    if fault == "unsafe_third":
        candidates[2]["edge_intervals"][0][2] = 98
        candidates[2]["directed_edge_keys"] = [98]
    elif fault == "trace_gap":
        candidates[1]["edge_intervals"][0][0] = 1
    elif fault == "missing_blocks":
        report["cases"][0]["blocked_edge_keys"] = []
    elif fault == "instructions":
        candidates[0]["instruction_details"] = []
    elif fault == "metrics":
        candidates[0]["distance_km"] = float("nan")
    elif fault == "settings":
        report["cases"][0]["no_motorways"] = True
    elif fault == "unknown_sign":
        candidates[0]["instruction_details"][0]["sign"] = 999
    elif fault == "shape_interval":
        candidates[0]["instruction_details"][0]["interval"] = [0, 2]
    elif fault == "missing_waypoint":
        candidates[0]["waypoint_indices"] = [0]

    with pytest.raises(Refused):
        bridge.validate(report, case)


def test_manifest_preparation_is_private_and_refuses_overwrite(manifest, tmp_path):
    import stat
    import sys
    output = tmp_path / "manifest.json"
    command = [sys.executable, "-m", "prototypes.graphhopper11.prepare_app_manifest"]
    for name in ("jar", "graph", "config", "registry", "source"):
        command.extend(["--" + name, manifest["paths"][name]])
    command.extend(["--output", str(output)])
    completed = subprocess.run(command, capture_output=True, text=True, timeout=30)
    assert completed.returncode == 0, completed.stderr
    assert json.loads(output.read_text())["graph_version"] == manifest["graph_version"]
    assert stat.S_IMODE(output.stat().st_mode) == 0o600
    before = output.read_bytes()
    assert subprocess.run(command, capture_output=True, timeout=30).returncode != 0
    assert output.read_bytes() == before

    inside = Path(manifest["paths"]["graph"]) / "must-not-create.json"
    assert subprocess.run(command[:-1] + [str(inside)], capture_output=True, timeout=30).returncode != 0
    assert not inside.exists()


def test_browser_policy_hashes_and_old_manifest_schema_fail_closed(manifest):
    changed = copy.deepcopy(manifest)
    changed["browser_hashes"]["navigation-safety-ux.js"] = "0"*64
    with pytest.raises(Refused, match="browser_policy_changed"):
        create_app(changed, password=PASSWORD)
    changed = copy.deepcopy(manifest)
    changed["schema"] = 1
    with pytest.raises(Refused, match="manifest_contract"):
        create_app(changed, password=PASSWORD)


def test_registered_settings_rejected_before_execution(app, manifest, monkeypatch):
    bridge = app.extensions['gh11_bridge']
    client = app.test_client()
    settings = client.get('/api/prototype/cases', headers=AUTH).get_json()['case_settings']['detour']
    assert settings['mandatory_associations'] == ['main']
    def forbidden(*_):
        pytest.fail('Changed settings must not reach Java or cache')
    monkeypatch.setattr(bridge, 'route', forbidden)
    for changed in (dict(settings, mandatory_associations=[]), dict(settings, no_motorways=True),
                    dict(settings, alternatives=True), dict(settings, profile='truck'),
                    dict(settings, both_directions=1), dict(settings, extra=True)):
        response = client.post('/api/prototype/route', json=dict(body(manifest), selected_settings=changed), headers=AUTH)
        assert response.status_code == 400
        assert response.get_json()['reason'] == 'settings_not_registered'


def test_real_cached_evidence_is_revalidated_and_not_shared_with_callers(app, manifest, monkeypatch):
    bridge = app.extensions['gh11_bridge']
    execute = bridge._execute
    calls = []
    def counting(*args):
        calls.append(True)
        return execute(*args)
    monkeypatch.setattr(bridge, '_execute', counting)
    first = bridge.route('detour')
    assert len(calls) == 1
    assert first['selected_settings'] == bridge.settings('detour')
    assert first['request_binding'] == bridge.binding('detour')
    first['candidates'][0]['geometry']['coordinates'].clear()
    second = bridge.route('detour')
    assert len(calls) == 1 and second['candidates'][0]['geometry']['coordinates']
    # Corruption of any cached trace must refuse, not serve an earlier verdict.
    entry = bridge.cache[bridge.binding('detour')][1]
    entry['cases'][0]['candidates'][0]['edge_intervals'][0][2] = entry['cases'][0]['blocked_edge_keys'][0]
    with pytest.raises(Refused, match='cached_evidence_refused'):
        bridge.route('detour')
    assert not bridge.cache
    assert len(calls) == 1


def test_cache_expiry_and_ordered_case_settings_change_force_execution(app, monkeypatch):
    bridge = app.extensions['gh11_bridge']
    execute = bridge._execute
    calls = []
    def counting(*args):
        calls.append(True)
        return execute(*args)
    monkeypatch.setattr(bridge, '_execute', counting)
    bridge.route('detour')
    key = bridge.binding('detour')
    expiry, evidence = bridge.cache[key]
    bridge.cache[key] = (0, evidence)
    bridge.route('detour')
    assert len(calls) == 2
    # Every registered variant binds ordered visits and exclusions independently.
    original = copy.deepcopy(bridge.cases['detour'])
    for name, value in (('points', list(reversed(original['points']))),
                        ('blocked_associations', ['upper']), ('alternatives', True)):
        bridge.cases['detour'] = dict(original, **{name: value})
        assert bridge.binding('detour') != key
    bridge.cases['detour'] = original
    bridge.route('via')
    assert len(calls) == 3


def test_real_saved_reference_restoration_recalculates_after_cache_eviction(app, manifest, monkeypatch):
    client = app.test_client()
    first = client.post('/api/prototype/route', json=body(manifest), headers=AUTH).get_json()
    saved = first['plan_reference']
    assert set(saved) == {'schema', 'case_id', 'graph_version', 'source_version', 'policy_version',
                          'selected_settings', 'request_binding'}
    assert 'geometry' not in json.dumps(saved)
    bridge = app.extensions['gh11_bridge']
    bridge.cache.clear()
    execute, calls = bridge._execute, []
    def counting(*args):
        calls.append(True)
        return execute(*args)
    monkeypatch.setattr(bridge, '_execute', counting)
    restored = client.post('/api/prototype/restore', json=saved, headers=AUTH)
    assert restored.status_code == 200
    assert len(calls) == 1
    result = restored.get_json()
    assert result['plan_reference'] == saved
    assert result['candidates'] == first['candidates']
    assert result['navigation_allowed'] is False


def test_changed_saved_references_auth_and_origin_refuse_before_route_access(app, monkeypatch):
    bridge = app.extensions['gh11_bridge']
    saved = bridge.plan_reference('detour')
    def forbidden(*_):
        pytest.fail('Invalid reference must not reach routing or cache')
    monkeypatch.setattr(bridge, 'route', forbidden)
    client = app.test_client()
    assert client.post('/api/prototype/restore', json=saved).status_code == 401
    assert client.post('/api/prototype/restore', json=saved, headers=dict(AUTH, Origin='https://elsewhere.invalid')).status_code == 403
    for field in ('graph_version', 'source_version', 'policy_version', 'request_binding'):
        response = client.post('/api/prototype/restore', json=dict(saved, **{field:'0'*64}), headers=AUTH)
        assert response.status_code == 409
        assert response.get_json()['reason'] == 'plan_reference_changed'
    for changed in (dict(saved, selected_settings={}), dict(saved, selected_settings=dict(saved['selected_settings'], no_motorways=True))):
        assert client.post('/api/prototype/restore', json=changed, headers=AUTH).status_code == 409
    for changed in (dict(saved, schema=True), dict(saved, schema=2), dict(saved, case_id='unknown'),
                    dict(saved, geometry={}), dict(saved, navigation_allowed=True), {}, []):
        response = client.post('/api/prototype/restore', json=changed, headers=AUTH)
        assert response.status_code == 400
        assert response.get_json()['navigation_allowed'] is False
    assert client.post('/api/prototype/restore', data='x'*2048, content_type='application/json', headers=AUTH).status_code == 413


def test_warm_saved_restore_revalidates_and_never_replays_cached_verdict(app, manifest):
    client = app.test_client()
    first = client.post('/api/prototype/route', json=body(manifest), headers=AUTH).get_json()
    bridge = app.extensions['gh11_bridge']
    evidence = bridge.cache[bridge.binding('detour')][1]
    evidence['cases'][0]['candidates'][0]['edge_intervals'][0][2] = evidence['cases'][0]['blocked_edge_keys'][0]
    response = client.post('/api/prototype/restore', json=first['plan_reference'], headers=AUTH)
    assert response.status_code == 422
    assert response.get_json()['navigation_allowed'] is False
    assert 'candidates' not in response.get_json()
    assert not bridge.cache


def test_saved_reference_cannot_turn_no_route_into_navigation(app):
    bridge = app.extensions['gh11_bridge']
    response = app.test_client().post('/api/prototype/restore', json=bridge.plan_reference('no_route'), headers=AUTH)
    assert response.status_code == 422
    assert response.get_json()['reason'] == 'engine_refused'
    assert response.get_json()['navigation_allowed'] is False
    assert not bridge.cache


@pytest.mark.parametrize('case', ['detour','alternatives','via','departure'])
def test_real_app_preview_contract_passes_shared_planner_but_refuses_navigation(app, manifest, case):
    response = app.test_client().post('/api/prototype/route', json=body(manifest,case), headers=AUTH)
    assert response.status_code == 200
    result = response.get_json()
    preview = result['app_preview']
    assert preview['navigation_allowed'] is False and len(preview['routes']) == len(result['candidates'])
    ids = set()
    for raw, route in zip(result['candidates'], preview['routes']):
        assert route['id'] not in ids
        ids.add(route['id'])
        assert route['navigation_allowed'] is False and route['automatic_selection_allowed'] is False
        assert route['avoidance_assessment']['status'] == 'UNVERIFIED'
        assert route['avoidance_assessment']['requirements'] == []
        assert route['gh11_evidence'] == raw
        assert route['routing_context']['request_binding'] == result['request_binding']
        assert len(route['leg_geometry_ranges']) == (2 if case == 'via' else 1)
        for instruction, maneuver in zip(raw['instruction_details'],route['maneuvers']):
            assert instruction['text'] == maneuver['instruction']
            assert instruction['interval'] == [maneuver['begin_shape_index'],maneuver['end_shape_index']]
    script = r"""
const assert=require('node:assert/strict');
const AI=require('./static/js/modules/navigation/avoidance-integrity.js');
const Policy=require('./static/js/modules/navigation/strict-route-policy.js');
const Selection=require('./static/js/modules/navigation/route-selection.js');
const preview=JSON.parse(require('node:fs').readFileSync(0,'utf8'));
global.VOYAGR_STRICT_ROUTING=true;
global.VoyagrStrictRoutePolicy=Policy.create({navigation_authorized:false,scope:preview.scope});
for(const route of preview.routes){
 const prepared=AI.preparePlanningCandidate(route);
 assert.ok(prepared,'real shared planning validator refused the adapter');
 assert.equal(prepared.geometry_precision,6);
 assert.equal(AI.geometryBinding(prepared),route.avoidance_assessment.geometry_binding);
 assert.deepEqual(Selection.mergeNavigationRouteFromSelected({},[route],0).routing_context,route.routing_context);
 assert.equal(AI.prepareNavigationCandidate(route),null);
 assert.equal(AI.prepareGuidanceCandidate(route),null);
 assert.equal(AI.gate(route,{storage:{getItem:()=>null}}),false);
}
"""
    completed = subprocess.run(['node','-e',script], input=json.dumps(preview), text=True,
                               capture_output=True, timeout=15, cwd=Path(__file__).resolve().parents[1])
    assert completed.returncode == 0, completed.stderr


def test_preview_signs_match_existing_application_without_importing_app():
    import ast
    from prototypes.graphhopper11.isolated_app import PREVIEW_SIGN_TYPES
    source = Path(__file__).resolve().parents[1]/'voyagr/utils/graphhopper.py'
    tree = ast.parse(source.read_text())
    assignment = next(node for node in tree.body if isinstance(node,ast.Assign)
                      and any(isinstance(target,ast.Name) and target.id=='GH_SIGN_TO_VALHALLA' for target in node.targets))
    assert PREVIEW_SIGN_TYPES == ast.literal_eval(assignment.value)


def test_preview_precision_matches_real_browser_binding_for_negative_half_coordinates():
    from prototypes.graphhopper11.isolated_app import app_preview
    raw = {'geometry':{'type':'LineString','coordinates':[
        [-1.2345675,53.0000005],[-0.0000005,-0.0000005],[1.2345675,-53.0000005]]},
        'directed_edge_keys':[2], 'waypoint_indices':[0,2], 'distance_km':1,'duration_minutes':1,
        'instruction_details':[{'name':'Synthetic', 'sign':0,'text':'Continue', 'interval':[0,2],
                                'distance_m':1000,'time_ms':60000}]}
    result = {**{key:'a'*64 for key in ('graph_version','source_version','policy_version','request_binding')},
              'candidates':[raw], 'policy_report':{'selected':{'requirements':[]}}}
    preview = app_preview(result)
    script = r"""
const assert=require('node:assert/strict');
const AI=require('./static/js/modules/navigation/avoidance-integrity.js');
const route=JSON.parse(require('node:fs').readFileSync(0,'utf8')).routes[0];
assert.equal(AI.geometryBinding({geometry:route.gh11_evidence.geometry}),route.avoidance_assessment.geometry_binding);
assert.ok(AI.preparePlanningCandidate(route));
assert.equal(route.navigation_allowed,false);
"""
    completed = subprocess.run(['node','-e',script], input=json.dumps(preview), text=True,
                               capture_output=True, timeout=15, cwd=Path(__file__).resolve().parents[1])
    assert completed.returncode == 0, completed.stderr


def policy_request(category='railway_crossings', mode='mandatory', enabled=True):
    return {'profile':'car','requirements':[{'category':category,'enabled':enabled,'mode':mode}]}


@pytest.mark.parametrize('endpoint', ['route','policy'])
@pytest.mark.parametrize('category', ['speed_cameras','railway_crossings','tolls'])
def test_http_mandatory_policy_refuses_before_java_and_cache(app, manifest, monkeypatch, endpoint, category):
    bridge = app.extensions['gh11_bridge']
    def forbidden(*_):
        pytest.fail('Unproven mandatory policy must not execute Java')
    monkeypatch.setattr(bridge, '_execute', forbidden)
    bridge.cache['sentinel'] = (0, {'must_not_be_touched':True})
    before = copy.deepcopy(bridge.cache)
    response = app.test_client().post('/api/prototype/'+endpoint,
        json=dict(body(manifest),policy_request=policy_request(category)),headers=AUTH)
    assert response.status_code == 422
    data = response.get_json()
    assert data['reason'] == 'mandatory_avoidance_unavailable' and data['navigation_allowed'] is False
    assert data['policy_report']['unresolved_mandatory'][0]['category'] == category
    assert data['policy_report']['selected']['requirements'][0]['mode'] == 'mandatory'
    assert 'candidates' not in data and 'app_preview' not in data
    assert bridge.cache == before


def test_registered_motorway_policy_executes_the_existing_model_and_retains_rule(app, manifest):
    response = app.test_client().post('/api/prototype/route',
        json=dict(body(manifest,'motorway_rule'),policy_request=policy_request('motorways')),headers=AUTH)
    assert response.status_code == 200, response.get_json()
    data = response.get_json()
    assert data['selected_settings']['no_motorways'] is True
    assert data['policy_report']['rules'][0]['state'] == 'COMPILED'
    assert data['policy_report']['unresolved_mandatory'] == []
    assert data['navigation_allowed'] is False
    for route in data['app_preview']['routes']:
        assert route['avoidance_assessment']['requirements'] == [
            {'category':'motorways','enabled':True,'mode':'mandatory','scope':'route','status':'UNVERIFIED'}]
        assert route['navigation_allowed'] is False


def test_preference_policy_binds_cache_and_v2_restore_without_downgrading(app, manifest, monkeypatch):
    bridge = app.extensions['gh11_bridge']
    client = app.test_client()
    selected = policy_request('tolls','preference')
    response = client.post('/api/prototype/route',json=dict(body(manifest),policy_request=selected),headers=AUTH)
    assert response.status_code == 200
    data = response.get_json()
    assert data['policy_report']['preference_warnings'][0]['category'] == 'tolls'
    assert data['policy_report']['rules'][0]['enabled'] is True
    assert data['policy_report']['rules'][0]['mode'] == 'preference'
    assert data['request_binding'] != bridge.binding('detour')
    saved = data['plan_reference']
    assert saved['schema'] == 2 and saved['policy_request'] == data['policy_report']['selected']
    restored = client.post('/api/prototype/restore',json=saved,headers=AUTH)
    assert restored.status_code == 200
    assert restored.get_json()['policy_report'] == data['policy_report']
    assert restored.get_json()['request_binding'] == data['request_binding']
    assert bridge.binding('detour',policy_request('tolls','preference',False)) not in bridge.cache
    def forbidden(*_):
        pytest.fail('Changed mandatory rules cannot reuse cached preference evidence')
    monkeypatch.setattr(bridge,'_execute',forbidden)
    changed = copy.deepcopy(saved);changed['policy_request']['requirements'][0]['mode'] = 'mandatory'
    assert client.post('/api/prototype/restore',json=changed,headers=AUTH).status_code == 409
    rebound = bridge.plan_reference('detour',policy_request('tolls','mandatory'))
    refusal = client.post('/api/prototype/restore',json=rebound,headers=AUTH)
    assert refusal.status_code == 422
    assert refusal.get_json()['policy_report']['unresolved_mandatory'][0]['mode'] == 'mandatory'


def test_full_policy_list_survives_bounded_body_and_preflight_never_routes(app, manifest, monkeypatch):
    from prototypes.graphhopper11.policy_compiler import CATEGORIES
    bridge = app.extensions['gh11_bridge']
    def forbidden(*_):
        pytest.fail('Policy preflight must not execute Java')
    monkeypatch.setattr(bridge,'_execute',forbidden)
    selected = {'profile':'car','requirements':[
        {'category':category,'enabled':True,'mode':'preference','scope':'route'} for category in CATEGORIES]}
    payload = dict(body(manifest),policy_request=selected)
    assert 1024 < len(json.dumps(payload).encode()) < 4096
    client = app.test_client()
    assert client.post('/api/prototype/policy',json=payload).status_code == 401
    assert client.post('/api/prototype/policy',json=payload,headers=dict(AUTH,Origin='https://elsewhere.invalid')).status_code == 403
    response = client.post('/api/prototype/policy',json=payload,headers=AUTH)
    assert response.status_code == 200
    report = response.get_json()['policy_report']
    assert len(report['selected']['requirements']) == len(CATEGORIES)
    assert len(report['preference_warnings']) == len(CATEGORIES)
    assert report['navigation_allowed'] is False
    assert not bridge.cache
    assert client.post('/api/prototype/policy',data='x'*4097,content_type='application/json',headers=AUTH).status_code == 413


def test_profile_invalid_policy_and_compiler_identity_fail_closed(app, manifest, monkeypatch):
    bridge = app.extensions['gh11_bridge']
    def forbidden(*_):
        pytest.fail('Unsupported or malformed policy must not execute Java')
    monkeypatch.setattr(bridge,'_execute',forbidden)
    client = app.test_client()
    for selected in (None,{},dict(policy_request(),coverage='AVAILABLE'),policy_request('unknown')):
        assert client.post('/api/prototype/route',json=dict(body(manifest),policy_request=selected),headers=AUTH).status_code == 400
    selected = dict(policy_request(),profile='bicycle')
    response = client.post('/api/prototype/route',json=dict(body(manifest),policy_request=selected),headers=AUTH)
    assert response.status_code == 422 and response.get_json()['reason'] == 'profile_not_supported'
    changed = copy.deepcopy(manifest);changed['compiler_sha256'] = '0'*64
    with pytest.raises(Refused,match='runtime_changed'):
        create_app(changed,password=PASSWORD)

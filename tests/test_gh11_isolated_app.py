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
      <node id="6" lat="0.000002" lon="0"/><node id="7" lat="0.000002" lon="0.02"/>
      <way id="10"><nd ref="1"/><nd ref="3"/><nd ref="2"/><tag k="highway" v="primary"/></way>
      <way id="11"><nd ref="1"/><nd ref="4"/><nd ref="2"/><tag k="highway" v="residential"/></way>
      <way id="12"><nd ref="4"/><nd ref="5"/><tag k="highway" v="residential"/><tag k="oneway" v="yes"/></way>
      <way id="13"><nd ref="6"/><nd ref="7"/><tag k="highway" v="primary"/></way>
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
        # The close parallel road remains outside this registered source-road contract.
        dict(plain, id="no_route", blocked_associations=["main", "upper"], expected_osm_way_ids=[10]),
        dict(plain, id="motorway_rule", no_motorways=True),
        dict(plain, id="partial", points=[[0,.002],[0,.018]], blocked_associations=["upper"], expected_osm_way_ids=[10]),
        dict(plain, id="partial_reverse", points=[[0,.018],[0,.002]], blocked_associations=["upper"], expected_osm_way_ids=[10]),
        dict(plain, id="partial_via", points=[[0,.002],[0,.01],[0,.018]], blocked_associations=["upper"], expected_osm_way_ids=[10]),
        dict(plain, id="parallel", points=[[.000002,.002],[.000002,.018]], blocked_associations=["upper"], expected_osm_way_ids=[13]),
    ]}))
    return build_manifest(jar=jar, graph=graph, config=config, registry=registry, source=source)


@pytest.fixture
def app(manifest):
    app = create_app(manifest, password=PASSWORD)
    app.config["TESTING"] = True
    yield app
    app.extensions["gh11_private_cache"].store.clear()


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
        assert row["query_graph_intervals"][0]["first"] == 0
        assert row["query_graph_intervals"][-1]["last"] == len(row["geometry"]["coordinates"])-1
        observations = row["registered_visit_observations"]
        assert observations["status"] == "WITHIN_REGISTERED_SNAP_BOUND"
        assert observations["gps_verification"] == "UNVERIFIED"
        assert observations["navigation_allowed"] is False
        assert [v["requested"] for v in observations["visits"]] == app.extensions["gh11_bridge"].cases[case]["points"]
        assert all(v["displacement_m"] <= observations["max_snap_distance_m"] for v in observations["visits"])
        for visit in observations["visits"]:
            assert visit["resolved"] == list(reversed(row["geometry"]["coordinates"][visit["shape_index"]]))
        assert set(row["directed_edge_keys"]).isdisjoint(result["blocked_edge_keys"])
    app.extensions["gh11_bridge"].verify()
    assert before == manifest["graph_files"]
    assert response.headers["Cache-Control"] == "private, no-store"



def test_real_profile_turn_costs_are_checked_on_continuous_and_reverse_paths(manifest, tmp_path):
    # Compile the actual checker, then exercise its validation with real GH paths.
    # Inject only the weighting used by the validator: the graph/path remain real.
    harness = tmp_path / "TurnWeightAcceptance.java"
    harness.write_text(r'''import com.graphhopper.*;
import com.graphhopper.jackson.Jackson;
import com.graphhopper.routing.weighting.*;
import com.graphhopper.util.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.dataformat.yaml.YAMLFactory;
import java.io.File;
import java.net.URLClassLoader;
import java.util.*;
import java.lang.reflect.*;
public class TurnWeightAcceptance {
 public static void main(String[] args) throws Exception {
  var compiler=javax.tools.ToolProvider.getSystemJavaCompiler();
  if(compiler==null || compiler.run(null,null,null,"-classpath",args[0],"-d",args[4],args[3])!=0)
   throw new IllegalStateException("checker compilation failed");
  try(var loader=new URLClassLoader(new java.net.URL[]{new File(args[4]).toURI().toURL()},TurnWeightAcceptance.class.getClassLoader())) {
   var checker=Class.forName("ReadOnlyRouteRegression",true,loader);
   var validate=checker.getDeclaredMethod("validate",GraphHopper.class,ResponsePath.class,boolean.class,Set.class,Weighting.class);
   validate.setAccessible(true);
   var tree=new ObjectMapper(new YAMLFactory()).readTree(new File(args[1]));
   var config=Jackson.newObjectMapper().treeToValue(tree.get("graphhopper"),GraphHopperConfig.class);
   config.putObject("graph.location",args[2]).putObject("datareader.file","");
   var hopper=new GraphHopper();
   try {
    hopper.init(config).setAllowWrites(false);
    if(!hopper.load()) throw new IllegalStateException("existing fixture required");
    int checks=0, refusals=0, uturns=0;
    for(int mode=0;mode<3;mode++) {
     var request=new GHRequest().setProfile("car").setPathDetails(List.of("edge_key"))
      .putHint("ch.disable",true).putHint("lm.disable",true).putHint("way_point_max_distance",0)
      .putHint("pass_through",false);
     request.addPoint(new com.graphhopper.util.shapes.GHPoint(0,mode==1?.02:0));
     request.addPoint(new com.graphhopper.util.shapes.GHPoint(.003,.01));
     request.addPoint(new com.graphhopper.util.shapes.GHPoint(0,mode==0?.02:0));
     var response=hopper.route(request);
     if(response.hasErrors()) throw new IllegalStateException("fixture routing failed");
     var weighting=hopper.createWeighting(hopper.getProfile("car"),request.getHints());
     for(var path:response.getAll()) {
      var keys=(List<Integer>)validate.invoke(null,hopper,path,false,Set.of(),weighting);
      if(keys.size()<2) throw new IllegalStateException("turn not exercised");
      for(int i=1;i<keys.size();i++) if((keys.get(i-1)^1)==keys.get(i)) {
       var edge=hopper.getBaseGraph().getEdgeIteratorStateForKey(keys.get(i-1));
       if(weighting.calcTurnWeight(keys.get(i-1)/2,edge.getAdjNode(),keys.get(i)/2)!=60)
        throw new IllegalStateException("configured U-turn cost lost");
       uturns++;
      }
      checks++;
      for(double bad:new double[]{Double.POSITIVE_INFINITY,Double.NaN,-1}) {
       var invalid=new AbstractAdjustedWeighting(weighting) {
        @Override public double calcTurnWeight(int incoming,int via,int outgoing) { return bad; }
        @Override public String getName() { return weighting.getName(); }
       };
       try { validate.invoke(null,hopper,path,false,Set.of(),invalid); }
       catch(InvocationTargetException error) {
        if(!(error.getCause() instanceof IllegalStateException)
           || !"invalid profile turn weight".equals(error.getCause().getMessage())) throw error;
        refusals++;continue;
       }
       throw new IllegalStateException("invalid turn cost accepted");
      }
     }
    }
    if(checks!=3 || refusals!=9 || uturns<1) throw new IllegalStateException("incomplete turn coverage");
    System.out.println("PASS_PROFILE_TURNS paths=3 invalid_cost_refusals=9 configured_uturn=60 navigation=DISABLED");
   } finally { hopper.close(); }
  }
 }
}''')
    completed = subprocess.run(['java','-Xmx512m','--class-path',manifest['paths']['jar'],str(harness),
        manifest['paths']['jar'],manifest['paths']['config'],manifest['paths']['graph'],
        str(Path(__file__).resolve().parents[1]/'prototypes/graphhopper11/ReadOnlyRouteRegression.java'),str(tmp_path)],
        cwd=tmp_path,capture_output=True,text=True,timeout=60)
    assert completed.returncode == 0, (completed.stdout+completed.stderr)[-4000:]
    assert 'PASS_PROFILE_TURNS paths=3 invalid_cost_refusals=9 configured_uturn=60 navigation=DISABLED' in completed.stdout


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
    for extra in ({"blocked_keys": []}, {"custom_model": {}}, {"coverage": "COMPLETE"}, {"diagnose_origin":{"radius_m":1}}, {"audit_index_inventory":{"edge_limit":10000}}, {"audit_index_geometry":{"edge_limit":10000,"sample_limit":128}}):
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


@pytest.mark.parametrize("fault", ["unsafe_third", "trace_gap", "missing_blocks", "instructions", "metrics", "settings", "unknown_sign", "shape_interval", "missing_waypoint", "collapsed_waypoint", "displaced_origin", "displaced_third_destination", "query_missing_third"])
def test_independent_transport_validation_rejects_corrupted_result(app, fault):
    bridge = app.extensions["gh11_bridge"]
    case = dict(bridge.cases["detour"], alternatives=True)
    candidates = []
    for key in (2, 4, 6):
        candidates.append({"geometry": {"type": "LineString", "coordinates": [[0, 0], [.02, 0]]},
                           "query_graph_intervals": [{"first":0,"last":1,"traversal":{
                               "query_edge_key":key,"original_edge_key":key,"base_node":0,"adjacent_node":1,
                               "base_point":[0,0],"adjacent_point":[.02,0],"virtual":False}}],
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
    for row in accepted["candidates"]:
        observed = row["registered_visit_observations"]
        assert observed["status"] == "WITHIN_REGISTERED_SNAP_BOUND"
        assert observed["navigation_allowed"] is False and observed["gps_verification"] == "UNVERIFIED"
        assert [v["displacement_m"] for v in observed["visits"]] == [0, 0]
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
    elif fault == "collapsed_waypoint":
        report["cases"][0]["requested_points"] = 3
        for row in candidates:
            row["waypoint_indices"] = [0, 0, 1]
    elif fault == "query_missing_third":
        candidates[2].pop("query_graph_intervals")
    elif fault == "displaced_origin":
        candidates[0]["geometry"]["coordinates"][0] = [.001, 0]
        candidates[0]["query_graph_intervals"][0]["traversal"]["base_point"] = [.001, 0]
    elif fault == "displaced_third_destination":
        candidates[2]["geometry"]["coordinates"][-1] = [.021, 0]
        candidates[2]["query_graph_intervals"][-1]["traversal"]["adjacent_point"] = [.021, 0]
        # Provider claims cannot raise the operator-owned snap bound.
        report["cases"][0]["max_snap_distance_m"] = 1000
        candidates[2]["registered_visit_observations"] = {"status": "WITHIN_REGISTERED_SNAP_BOUND"}

    with pytest.raises(Refused):
        bridge.validate(report, case)


def test_registered_intermediate_visit_proximity_is_ordered_and_non_authoritative():
    from prototypes.graphhopper11.isolated_app import registered_visit_observations
    case = {"points": [[0, 0], [.003, .01], [0, .02]], "max_snap_distance_m": 1}
    geometry = [[0, 0], [.01, .003], [.02, 0]]
    observed = registered_visit_observations(case, geometry, [0, 1, 2])
    assert [v["requested"] for v in observed["visits"]] == case["points"]
    assert observed["navigation_allowed"] is False
    geometry[1] = [.01, 0]
    with pytest.raises(Refused, match="registered_visit_displaced"):
        registered_visit_observations(case, geometry, [0, 1, 2])
    with pytest.raises(Refused, match="registered_visit_contract"):
        registered_visit_observations(case, geometry, [0, 2])
    unknown = registered_visit_observations({}, geometry, [0, 2])
    assert unknown["status"] == "UNVERIFIED" and unknown["visits"] == []


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


@pytest.mark.parametrize('corruption', ['trace', 'endpoint', 'query_missing'])
def test_real_cached_evidence_is_revalidated_and_not_shared_with_callers(app, manifest, monkeypatch, corruption):
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
    if corruption == 'trace':
        entry['cases'][0]['candidates'][0]['edge_intervals'][0][2] = entry['cases'][0]['blocked_edge_keys'][0]
    elif corruption == 'query_missing':
        entry['cases'][0]['candidates'][0].pop('query_graph_intervals')
    else:
        entry['cases'][0]['candidates'][0]['geometry']['coordinates'][-1] = [.021, 0]
        entry['cases'][0]['candidates'][0]['query_graph_intervals'][-1]['traversal']['adjacent_point'] = [.021, 0]
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
const JourneyPlan=require('./static/js/modules/navigation/journey-plan.js');
const preview=JSON.parse(require('node:fs').readFileSync(0,'utf8'));
global.VOYAGR_STRICT_ROUTING=true;
global.VoyagrStrictRoutePolicy=Policy.create({navigation_authorized:false,scope:preview.scope});
for(const route of preview.routes){
 const prepared=AI.preparePlanningCandidate(route);
 assert.ok(prepared,'real shared planning validator refused the adapter');
 const inspected=JourneyPlan.inspection(prepared,AI);
 assert.deepEqual(inspected.ranges,route.leg_geometry_ranges);
 assert.equal(inspected.ranges.length,route.gh11_evidence.waypoint_indices.length-1);
 inspected.ranges.forEach((leg,i)=>{assert.equal(leg.begin_shape_index,route.gh11_evidence.waypoint_indices[i]);assert.equal(leg.end_shape_index,route.gh11_evidence.waypoint_indices[i+1]);assert.equal(leg.preview_only,true);assert.equal('start_shape_index' in leg,false);});
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


def test_policy_preflight_rejects_route_only_fields_but_preserves_mandatory_refusal(app, manifest, monkeypatch):
    bridge = app.extensions['gh11_bridge']
    def forbidden(*_):
        pytest.fail('Neither invalid preflight nor unproven mandatory policy may route')
    monkeypatch.setattr(bridge,'_execute',forbidden)
    route_body = dict(body(manifest), selected_settings=bridge.settings('detour'), policy_request=policy_request())
    client = app.test_client()
    assert client.post('/api/prototype/policy',json=route_body,headers=AUTH).status_code == 400
    preflight_body = {key:value for key,value in route_body.items() if key != 'selected_settings'}
    for endpoint,payload in (('policy',preflight_body),('route',route_body)):
        response = client.post('/api/prototype/'+endpoint,json=payload,headers=AUTH)
        assert response.status_code == 422
        assert response.get_json()['policy_report']['unresolved_mandatory'][0]['category'] == 'railway_crossings'


@pytest.mark.parametrize('name',['isolated_viewer.js','isolated_viewer.html'])
def test_rule_ui_metadata_and_manifest_binding_fail_closed(app, manifest, name):
    from prototypes.graphhopper11.policy_compiler import CATEGORIES
    registry = app.test_client().get('/api/prototype/cases',headers=AUTH).get_json()
    assert registry['policy_categories'] == list(CATEGORIES)
    assert len(set(registry['policy_categories'])) == 13
    assert set(manifest['viewer_hashes']) == {'isolated_viewer.js','isolated_viewer.html'}
    changed = copy.deepcopy(manifest);changed['viewer_hashes'][name]='0'*64
    with pytest.raises(Refused,match='browser_policy_changed'):
        create_app(changed,password=PASSWORD)


def app_policy(**settings):
    from prototypes.graphhopper11.app_settings_adapter import adapt_settings
    adapted = adapt_settings(dict(avoid_caz=False, **settings))
    return dict(adapted['policy_request'], app_settings=adapted['app_settings'])


def test_full_app_settings_survive_route_cache_and_reference_restore(app, manifest, monkeypatch):
    bridge = app.extensions['gh11_bridge']
    client = app.test_client()
    selected = app_policy(max_detour=20, prefer_scenic=True, route_optimization='scenic',
                          avoid_tolls=True, avoidance_mode='preference')
    payload = dict(body(manifest), policy_request=selected)
    preflight = client.post('/api/prototype/policy', json=payload, headers=AUTH)
    assert preflight.status_code == 200
    assert not bridge.cache
    response = client.post('/api/prototype/route', json=payload, headers=AUTH)
    assert response.status_code == 200, response.get_json()
    result = response.get_json()
    assert result['policy_report'] == preflight.get_json()['policy_report']
    assert result['policy_report']['selected']['app_settings'] == selected['app_settings']
    assert result['policy_report']['supplemental_settings']
    assert result['plan_reference']['policy_request'] == result['policy_report']['selected']
    original_execute = bridge._execute
    def forbidden(*_):
        pytest.fail('Repeat and restore must revalidate cached raw evidence without Java')
    monkeypatch.setattr(bridge, '_execute', forbidden)
    for endpoint, data in (('route', payload), ('restore', result['plan_reference'])):
        cached = client.post('/api/prototype/'+endpoint, json=data, headers=AUTH)
        assert cached.status_code == 200
        assert cached.get_json()['policy_report'] == result['policy_report']
        assert cached.get_json()['request_binding'] == result['request_binding']
        assert not cached.get_json()['navigation_allowed']
    changed = app_policy(max_detour=21, prefer_scenic=True, route_optimization='scenic',
                         avoid_tolls=True, avoidance_mode='preference')
    assert bridge.binding('detour', changed) not in bridge.cache
    tampered = copy.deepcopy(result['plan_reference']);tampered['policy_request'] = changed
    assert client.post('/api/prototype/restore', json=tampered, headers=AUTH).status_code == 409
    monkeypatch.setattr(bridge, '_execute', original_execute)
    validation = bridge.validate
    def count_validation(*args, **kwargs):
        count_validation.called += 1
        return validation(*args, **kwargs)
    count_validation.called = 0
    monkeypatch.setattr(bridge, 'validate', count_validation)
    assert client.post('/api/prototype/restore',json=result['plan_reference'],headers=AUTH).status_code == 200
    assert count_validation.called == 1


@pytest.mark.parametrize('endpoint', ['policy', 'route', 'restore'])
def test_changed_app_mandatory_policy_cannot_reuse_preference_cache(app, manifest, monkeypatch, endpoint):
    bridge = app.extensions['gh11_bridge']
    def forbidden(*_):
        pytest.fail('Unproven app mandatory policy must not execute Java')
    monkeypatch.setattr(bridge, '_execute', forbidden)
    preference = app_policy(avoid_tolls=True, avoidance_mode='preference')
    bridge.cache[bridge.binding('detour', preference)] = (float('inf'), {'untrusted': True})
    before = copy.deepcopy(bridge.cache)
    mandatory = app_policy(avoid_tolls=True, avoidance_mode='mandatory')
    payload = bridge.plan_reference('detour', mandatory) if endpoint == 'restore' else dict(body(manifest), policy_request=mandatory)
    response = app.test_client().post('/api/prototype/'+endpoint,json=payload,headers=AUTH)
    assert response.status_code == 422
    assert response.get_json()['policy_report']['selected']['app_settings']['avoidance_mode'] == 'mandatory'
    assert 'candidates' not in response.get_json()
    assert bridge.cache == before


@pytest.mark.parametrize('endpoint', ['policy', 'route', 'restore'])
def test_conflicting_app_policy_cannot_hide_selected_constraints(app, manifest, monkeypatch, endpoint):
    bridge = app.extensions['gh11_bridge']
    monkeypatch.setattr(bridge, '_execute', lambda *_: pytest.fail('Conflicting policy cannot execute'))
    selected = app_policy(avoid_tolls=True, avoidance_mode='mandatory')
    payload = bridge.plan_reference('detour', selected) if endpoint == 'restore' else dict(body(manifest),policy_request=selected)
    payload['policy_request']['requirements'] = []
    response = app.test_client().post('/api/prototype/'+endpoint,json=payload,headers=AUTH)
    assert response.status_code == 400
    assert response.get_json()['reason'] == 'app_settings_policy_mismatch'
    assert not bridge.cache


@pytest.mark.parametrize('name', ['adapter', 'contract', 'request_bridge', 'private_cache_adapter', 'private_cache_impl'])
def test_settings_source_identity_is_required_in_manifest(manifest, name):
    changed = copy.deepcopy(manifest);changed['settings_hashes'][name] = '0'*64
    with pytest.raises(Refused,match='runtime_changed'):
        LocalJavaBridge(changed)
    changed.pop('settings_hashes')
    with pytest.raises(Refused,match='runtime_changed'):
        LocalJavaBridge(changed)


def test_rich_settings_cache_hit_rejects_changed_adapter_identity(app, manifest):
    bridge = app.extensions['gh11_bridge']
    selected = app_policy(max_detour=20)
    payload = dict(body(manifest), policy_request=selected)
    client = app.test_client()
    assert client.post('/api/prototype/route',json=payload,headers=AUTH).status_code == 200
    assert bridge.binding('detour', selected) in bridge.cache
    bridge.manifest['settings_hashes']['adapter'] = '0'*64
    response = client.post('/api/prototype/route',json=payload,headers=AUTH)
    assert response.status_code == 409
    assert response.get_json()['reason'] == 'runtime_changed'
    assert 'candidates' not in response.get_json()


def test_all_explicit_app_categories_fit_bounded_restore_contract(app, manifest, monkeypatch):
    from prototypes.graphhopper11.policy_compiler import CATEGORIES
    bridge = app.extensions['gh11_bridge']
    selected = app_policy(avoidance_requirements=[dict(category=c,enabled=False,mode='mandatory') for c in CATEGORIES])
    payload = bridge.plan_reference('detour', selected)
    assert len(json.dumps(payload)) < 4096
    monkeypatch.setattr(bridge, '_execute', lambda *_: pytest.fail('Preflight must not execute Java'))
    response = app.test_client().post('/api/prototype/policy',json=dict(body(manifest),policy_request=selected),headers=AUTH)
    assert response.status_code == 200
    assert len(response.get_json()['policy_report']['rules']) == 13
    assert len(response.get_json()['policy_report']['app_settings']['avoidance_requirements']) == 13
    assert not bridge.cache


def test_raw_app_settings_preflight_derives_full_policy_without_java(app, manifest, monkeypatch):
    bridge = app.extensions['gh11_bridge']
    monkeypatch.setattr(bridge,'_execute',lambda *_: pytest.fail('Settings preflight cannot execute Java'))
    settings = dict(routing_mode='auto',vehicle_type='electric',avoid_tolls=True,max_detour=20,prefer_scenic=True)
    payload = dict(body(manifest),app_settings=settings)
    client = app.test_client()
    assert client.post('/api/prototype/policy',json=payload).status_code == 401
    assert client.post('/api/prototype/policy',json=payload,headers=dict(AUTH,Origin='https://other.invalid')).status_code == 403
    response = client.post('/api/prototype/policy',json=payload,headers=AUTH)
    assert response.status_code == 200
    report = response.get_json()['policy_report']
    from prototypes.graphhopper11.app_settings_adapter import adapt_settings
    adapted = adapt_settings(settings)
    assert report['selected'] == dict(adapted['policy_request'],app_settings=settings)
    assert report['app_settings'] == settings and len(report['rules']) == 13
    assert report['supplemental_settings'] and not report['app_integration_allowed']
    assert response.get_json()['request_binding'] == bridge.binding('detour',report['selected'])
    assert not bridge.cache
    assert client.post('/api/prototype/route',json=payload,headers=AUTH).status_code == 400
    assert client.post('/api/prototype/policy',json=dict(payload,policy_request=report['selected']),headers=AUTH).status_code == 400
    assert client.post('/api/prototype/policy',json=dict(payload,app_settings={'password':'not-allowed'}),headers=AUTH).status_code == 400
    mandatory = dict(settings,avoidance_mode='mandatory')
    refusal = client.post('/api/prototype/policy',json=dict(payload,app_settings=mandatory),headers=AUTH)
    assert refusal.status_code == 422
    assert refusal.get_json()['policy_report']['app_settings'] == mandatory
    assert not bridge.cache


def _run_real_browser(app, monkeypatch, runner_name, expected_status, expected_calls, tls_files=None):
    import signal
    import threading
    from werkzeug.serving import make_server, WSGIRequestHandler

    class QuietHandler(WSGIRequestHandler):
        def log(self, *_args, **_kwargs):
            pass  # Never emit request paths, authentication headers or bodies.

    bridge = app.extensions['gh11_bridge']
    calls = {'execute': 0, 'validate': 0}
    for name in calls:
        method = getattr(bridge, '_execute' if name == 'execute' else 'validate')
        def counted(*args, _name=name, _method=method, **kwargs):
            calls[_name] += 1
            return _method(*args, **kwargs)
        monkeypatch.setattr(bridge, '_execute' if name == 'execute' else 'validate', counted)

    server = make_server('127.0.0.1', 0, app, threaded=True, request_handler=QuietHandler, ssl_context=tls_files)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    process = None
    try:
        runner = Path(__file__).resolve().parents[1]/'prototypes/graphhopper11'/runner_name
        process = subprocess.Popen(['node', str(runner), f'{"https" if tls_files else "http"}://127.0.0.1:{server.server_port}/'],
                                   stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,start_new_session=True)
        try:
            output, errors = process.communicate(timeout=120)
        except subprocess.TimeoutExpired:
            os.killpg(process.pid, signal.SIGKILL)
            process.communicate()
            pytest.fail('Isolated browser exceeded its test budget')
        assert process.returncode == 0, errors[-2000:]
        evidence = json.loads(output)
        assert evidence['status'] == expected_status
        assert evidence['external_requests'] == 0 and not evidence['navigation_allowed']
        assert evidence['synthetic_storage_retained'] and evidence['phone_acceptance'] == 'UNVERIFIED'
        assert calls == expected_calls
        bridge.verify(check_source=True)
    finally:
        if process is not None and process.poll() is None:
            os.killpg(process.pid, signal.SIGKILL)
            process.communicate()
        server.shutdown()
        server.server_close()
        thread.join(timeout=5)
        assert not thread.is_alive()


@pytest.mark.skipif(os.environ.get('GH11_BROWSER_ACCEPTANCE') != '1', reason='Explicit isolated Chromium acceptance not requested')
def test_real_chromium_http_settings_and_restore(app, manifest, monkeypatch):
    _run_real_browser(app,monkeypatch,'browser-acceptance.cjs','PASS_ISOLATED_CHROMIUM_HTTP',{'execute':1,'validate':4})


def _run_full_uk_browser(manifest, tmp_path, runner_name, *, tls=False):
    """Full app boots in a clean copy; its ordinary Calculate reaches real Java."""
    import shutil
    import signal
    import time
    import sys
    root = Path(__file__).resolve().parents[1]
    source = tmp_path / 'source'
    source.mkdir()
    tracked = subprocess.check_output(['git','ls-files','-z'],cwd=root).decode().split('\0')
    for relative in filter(None, tracked):
        path = Path(relative)
        if not (path.parts[0] in {'static','templates'} or path.suffix == '.py'
                or path.parts[:2] == ('prototypes','graphhopper11')
                or relative in {'service-worker.js','manifest.json','camera_areas.geojson'}):
            continue
        original = root / path
        assert not original.is_symlink() and original.resolve().is_relative_to(root)
        target = source / path
        target.parent.mkdir(parents=True,exist_ok=True)
        shutil.copyfile(original,target)
    manifest_file, ready = tmp_path/'manifest.json', tmp_path/'ready.json'
    manifest_file.write_text(json.dumps(manifest))
    env = {key:os.environ[key] for key in ('PATH','JAVA_HOME') if key in os.environ}
    env.update(PYTHON_DOTENV_DISABLED='1',VOYAGR_PERSONAL_MODE='1',
               GH11_UK_TEST_ROOT=str(tmp_path),PYTHONDONTWRITEBYTECODE='1')
    if tls:
        cert,key=tmp_path/'cert.pem',tmp_path/'key.pem'
        subprocess.run(['openssl','req','-x509','-newkey','rsa:2048','-nodes','-days','1',
                        '-subj','/CN=127.0.0.1','-addext','subjectAltName=IP:127.0.0.1',
                        '-keyout',str(key),'-out',str(cert)],check=True,capture_output=True,timeout=30)
        env.update(GH11_UK_TLS_CERT=str(cert),GH11_UK_TLS_KEY=str(key))
    server_script = root/'prototypes/graphhopper11/uk_calculate_test_server.py'
    runner = root/'prototypes/graphhopper11'/runner_name
    with (tmp_path/'server.log').open('w+') as log:
        process = subprocess.Popen([sys.executable,str(server_script),str(source),str(manifest_file),str(ready)],
                                   env=env,stdout=log,stderr=log,start_new_session=True)
        try:
            deadline = time.monotonic()+30
            while not ready.exists() and process.poll() is None and time.monotonic()<deadline:
                time.sleep(.1)
            assert ready.exists(), 'Disposable UK fixture did not become ready; inspect private test log'
            origin = json.loads(ready.read_text())['origin']
            browser = subprocess.Popen(['node',str(runner),origin],stdout=subprocess.PIPE,
                                       stderr=subprocess.PIPE,text=True,start_new_session=True)
            try:
                output, errors = browser.communicate(timeout=120)
            finally:
                if browser.poll() is None:
                    os.killpg(browser.pid,signal.SIGKILL)
                    browser.communicate()
            assert browser.returncode == 0, errors[-2000:]
            evidence = json.loads(output)
            return evidence
        finally:
            if process.poll() is None:
                os.killpg(process.pid,signal.SIGTERM)
            process.wait(timeout=10)


@pytest.mark.skipif(os.environ.get('GH11_BROWSER_ACCEPTANCE') != '1', reason='Explicit isolated Chromium acceptance not requested')
def test_real_chromium_full_uk_calculate_registered_gh11(manifest, tmp_path):
    evidence = _run_full_uk_browser(manifest,tmp_path,'uk-calculate-acceptance.cjs')
    assert evidence['status'] == 'PASS_UK_CALCULATE_GH11_PREVIEW'
    assert evidence['engine'] == 2 and evidence['route'] == 3 and evidence['refused'] == 1
    assert evidence['start_refused'] and evidence['failed_replacement_retained']
    assert evidence['active_journey_retained'] and evidence['external_requests_sent'] == 0
    assert not evidence['navigation_allowed'] and evidence['phone_acceptance'] == 'UNVERIFIED'


@pytest.fixture(scope='module')
def matrix_manifest(manifest, tmp_path_factory):
    """Independent graph: a motorway and three separate car bypasses."""
    root = tmp_path_factory.mktemp('gh11-uk-matrix')
    source, graph, config, registry = (root/name for name in ('fixture.osm','graph','config.yml','registry.json'))
    points = {1:(0,0),2:(0,.02),3:(0,.01),4:(.003,.006),5:(.003,.014),6:(-.003,.01),7:(.006,.01)}
    ways = {10:([1,3,2],'motorway'),11:([1,4,5,2],'residential'),12:([1,6,2],'residential'),13:([1,7,2],'residential')}
    # Interior visits must be actual graph junctions: a graph with only the two
    # collinear endpoint towers has bounds excluding its curved pillar geometry.
    for node in (4,5,6,7):
        points[node+100] = (points[node][0]+.0001,points[node][1])
    branches = '\n'.join(f'<way id="{node+100}"><nd ref="{node}"/><nd ref="{node+100}"/><tag k="highway" v="service"/><tag k="oneway" v="yes"/></way>' for node in (4,5,6,7))
    source.write_text('<osm version="0.6">\n'+'\n'.join(f'<node id="{i}" lat="{p[0]}" lon="{p[1]}"/>' for i,p in points.items())+'\n'+
                      '\n'.join(f'<way id="{i}">\n'+'\n'.join(f'<nd ref="{n}"/>' for n in nodes)+f'\n<tag k="highway" v="{kind}"/>\n</way>' for i,(nodes,kind) in ways.items())+'\n'+branches+'\n</osm>')
    config.write_text(Path(manifest['paths']['config']).read_text().replace(manifest['paths']['source'],str(source)).replace(manifest['paths']['graph'],str(graph)))
    subprocess.run(['java','-Xmx512m','-jar',manifest['paths']['jar'],'import',str(config)],cwd=root,check=True,capture_output=True,timeout=90)
    associations = [dict(id=str(i),points=[list(points[n]) for n in nodes],expected_osm_way_ids=[i],max_snap_distance_m=1) for i,(nodes,_) in ways.items() if i!=10]
    associations.append(dict(id='spur',points=[list(points[4]),list(points[104])],expected_osm_way_ids=[104],max_snap_distance_m=1))
    common = dict(points=[[0,0],[0,.02]],no_motorways=True,block_both_directions=True,max_snap_distance_m=1)
    cases = [dict(common,id=f'matrix_{count}',alternatives=True,blocked_associations=['spur']+[str(i) for i in (13,12,11)[:3-count]]) for count in (3,2,1,0)]
    cases.append(dict(common,id='matrix_via',points=[[0,0],list(points[4]),list(points[5]),[0,.02]],blocked_associations=['spur']))
    cases.append(dict(common,id='matrix_origin',points=[list(points[4]),[0,.02]],blocked_associations=['spur']))
    registry.write_text(json.dumps(dict(associations=associations,cases=cases)))
    return build_manifest(jar=manifest['paths']['jar'],graph=graph,config=config,registry=registry,source=source)


def test_real_matrix_native_alternative_counts_and_ordered_legs(matrix_manifest):
    app = create_app(matrix_manifest,password=PASSWORD)
    client = app.test_client()
    for count in (3,2,1):
        response = client.post('/api/prototype/route',json=body(matrix_manifest,f'matrix_{count}'),headers=AUTH)
        assert response.status_code == 200, response.get_json()
        assert len(response.get_json()['candidates']) == count
    assert client.post('/api/prototype/route',json=body(matrix_manifest,'matrix_0'),headers=AUTH).status_code == 422
    via = client.post('/api/prototype/route',json=body(matrix_manifest,'matrix_via'),headers=AUTH)
    assert via.status_code == 200, via.get_json()
    assert len(via.get_json()['app_preview']['routes'][0]['leg_geometry_ranges']) == 3


@pytest.mark.skipif(os.environ.get('GH11_BROWSER_ACCEPTANCE') != '1', reason='Explicit isolated Chromium acceptance not requested')
def test_real_chromium_full_uk_alternatives_and_legs(matrix_manifest, tmp_path):
    evidence = _run_full_uk_browser(matrix_manifest,tmp_path,'uk-calculate-matrix.cjs')
    assert evidence['status'] == 'PASS_UK_ALTERNATIVES_AND_LEGS'
    assert evidence['native_counts'] == [3,2,1] and evidence['ordered_legs'] == 3
    assert evidence['engine'] == 7 and evidence['route'] == 11 and evidence['refused'] == 7
    assert evidence['external_requests_sent'] == 0 and not evidence['navigation_allowed']
    assert evidence['phone_acceptance'] == 'UNVERIFIED'


@pytest.mark.skipif(os.environ.get('GH11_BROWSER_ACCEPTANCE') != '1', reason='Explicit isolated Chromium acceptance not requested')
def test_real_chromium_full_uk_cache_selection_binding(matrix_manifest, tmp_path):
    evidence = _run_full_uk_browser(matrix_manifest,tmp_path,'uk-cache-selection.cjs',tls=True)
    assert evidence['status'] == 'PASS_UK_PRIVATE_CACHE_SELECTION'
    assert evidence['same_request_revalidated'] and evidence['changed_inputs_separated']
    assert evidence['private_browser_scopes'] and evidence['corrupt_cache_refused']
    assert evidence['external_requests_sent'] == 0 and not evidence['navigation_allowed']
    assert evidence['phone_acceptance'] == 'UNVERIFIED'


@pytest.mark.skipif(os.environ.get('GH11_BROWSER_ACCEPTANCE') != '1', reason='Explicit isolated Chromium acceptance not requested')
def test_real_chromium_full_uk_saved_outage_race_refusal(matrix_manifest, tmp_path):
    evidence = _run_full_uk_browser(matrix_manifest,tmp_path,'uk-recovery-acceptance.cjs')
    assert evidence['status'] == 'PASS_UK_SAVED_OUTAGE_RACES'
    for field in ('saved_restrictions_retained','offline_inspection','outage_refused',
                  'legacy_envelope_refused','stale_response_refused','newer_request_retained',
                  'temporary_map_wait','cancelled_map_wait','unavailable_map_retained'):
        assert evidence[field] is True
    assert evidence['saved_records'] == 1 and not evidence['navigation_allowed']
    assert evidence['external_requests_sent'] == 0 and evidence['phone_acceptance'] == 'UNVERIFIED'


@pytest.mark.skipif(os.environ.get('GH11_BROWSER_ACCEPTANCE') != '1', reason='Explicit isolated Chromium acceptance not requested')
def test_real_chromium_http_fault_recovery(app, manifest, monkeypatch):
    import threading
    from flask import request, jsonify, g

    # Fault controls exist only on this temporary test app, after its unchanged
    # Basic/Origin guards. Never register them in create_app or a deployed image.
    modes = {'none','deny_policy_401','deny_policy_403','deny_route_401','deny_route_403','hold_policy'}
    state = {'mode':'none'}
    entered, release, completed = threading.Event(), threading.Event(), threading.Event()
    release.set()

    @app.post('/__test/control')
    def fault_control():
        value = request.get_json(silent=True)
        if not isinstance(value,dict) or set(value) != {'mode'} or not isinstance(value['mode'],str) or value['mode'] not in modes:
            return jsonify(success=False),400
        state['mode'] = value['mode']
        if value['mode'] == 'hold_policy':
            entered.clear(); completed.clear(); release.clear()
        else:
            release.set()
        return jsonify(success=True)

    @app.get('/__test/state')
    def fault_state():
        return jsonify(entered=entered.is_set(),completed=completed.is_set())

    @app.before_request
    def inject_fault():
        mode = state['mode']
        if request.method != 'POST':
            return None
        for endpoint in ('policy','route'):
            if request.path == '/api/prototype/'+endpoint and mode.startswith('deny_'+endpoint+'_'):
                # Deliberate authenticated denial without a new browser password
                # challenge. This tests UI handling, not Basic expiry or Nginx.
                return jsonify(success=False,reason='synthetic_denial',navigation_allowed=False),int(mode[-3:])
        if request.path == '/api/prototype/policy' and mode == 'hold_policy':
            g.synthetic_held = True
            entered.set()
            if not release.wait(timeout=10):
                return jsonify(success=False,reason='synthetic_gate_timeout',navigation_allowed=False),503
        return None

    @app.after_request
    def finish_fault(response):
        if getattr(g,'synthetic_held',False):
            completed.set()
        return response

    try:
        _run_real_browser(app,monkeypatch,'browser-fault-acceptance.cjs','PASS_ISOLATED_CHROMIUM_FAULTS',{'execute':2,'validate':6})
    finally:
        release.set()


def test_fault_controls_are_absent_from_normal_factory(app):
    client = app.test_client()
    assert client.get('/__test/state',headers=AUTH).status_code == 404
    assert client.post('/__test/control',json={'mode':'none'},headers=AUTH).status_code == 404
    assert client.get('/__test/saved-restore-state',headers=AUTH).status_code == 404
    assert client.post('/__test/reset-saved-restore',headers=AUTH).status_code == 404


def full_app_body(case='detour'):
    result = dict(start='0,0',end='0,0.02',routing_mode='auto',vehicle_type='petrol_diesel',
                  avoid_caz=False,max_detour=20,avoidance_mode='preference',fuel_efficiency=6.5,
                  fuel_price_mode='automatic',fuel_category='',optimize_stop_order=False,round_trip=False,
                  via_points=[],stops=[],departure_time=None)
    if case == 'via':
        result['via_points'] = [dict(lat=.003,lon=.01,type='via',name='Synthetic via',provenance='coordinates',original_index=0)]
    if case == 'departure':
        result.update(start='0.003,0.01',is_reroute=True,force_refresh=True,include_tolls=True,include_caz=True)
    return result


@pytest.mark.parametrize('case',['detour','alternatives','via','departure'])
def test_full_app_request_routes_and_restores_every_registered_candidate_and_leg(app, manifest, case):
    from prototypes.graphhopper11.app_request_bridge import RegisteredAppRequestBridge
    bridge=app.extensions['gh11_bridge'];adapter=RegisteredAppRequestBridge(bridge)
    identities={k:manifest[k] for k in ('graph_version','source_version','policy_version')}
    supplied=full_app_body(case);before=copy.deepcopy(supplied)
    result=adapter.calculate(case,supplied,identities)
    assert result['app_request_context']['app_request'] == before == supplied
    assert result['app_request_context']['cost_warnings']
    assert result['gps_verification'] == 'UNVERIFIED'
    assert result['plan_reference']['schema'] == 3
    assert result['cache_policy'] == 'bypass_complete_app_request' and not bridge.cache
    assert result['navigation_allowed'] is False and not result['app_integration_allowed']
    for row in result['app_preview']['routes']:
        assert row['routing_context']['request_binding'] == result['request_binding']
        assert len(row['leg_geometry_ranges']) == (2 if case == 'via' else 1)
        assert not row['navigation_allowed'] and not row['automatic_selection_allowed']
        assert row['gh11_evidence']['forbidden_traversals'] == 0
    restored=adapter.restore(result['plan_reference'])
    assert restored['request_binding'] == result['request_binding']
    assert restored['candidates'] == result['candidates']
    assert not bridge.cache
    # No arbitrary-coordinate HTTP handler or schema downgrade was enabled.
    assert app.test_client().post('/api/prototype/restore',json=result['plan_reference'],headers=AUTH).status_code == 400


def test_complete_app_request_bypasses_existing_fixture_cache(app, manifest, monkeypatch):
    from prototypes.graphhopper11.app_request_bridge import RegisteredAppRequestBridge,adapt_app_request
    bridge=app.extensions['gh11_bridge'];adapter=RegisteredAppRequestBridge(bridge)
    identities={k:manifest[k] for k in ('graph_version','source_version','policy_version')}
    supplied=full_app_body();selected=adapt_app_request(supplied,bridge.cases['detour'])['policy_request']
    bridge.route('detour',selected)
    cached=copy.deepcopy(bridge.cache);execute=bridge._execute;calls=[]
    def fresh(*args):
        calls.append(True)
        return execute(*args)
    monkeypatch.setattr(bridge,'_execute',fresh)
    result=adapter.calculate('detour',supplied,identities)
    adapter.restore(result['plan_reference'])
    assert len(calls) == 2 and bridge.cache == cached


def test_complete_app_request_changes_and_unsupported_rules_refuse_before_engine(app, manifest, monkeypatch):
    from prototypes.graphhopper11.app_request_bridge import RegisteredAppRequestBridge
    from prototypes.graphhopper11.isolated_app import PolicyRefused
    bridge=app.extensions['gh11_bridge'];adapter=RegisteredAppRequestBridge(bridge)
    identities={k:manifest[k] for k in ('graph_version','source_version','policy_version')}
    supplied=full_app_body()
    def forbidden(*args):
        pytest.fail('Invalid journey/reference or unsupported mandatory rules cannot execute Java')
    monkeypatch.setattr(bridge,'_execute',forbidden)
    for change in ({'start':'0,0.001'},{'round_trip':True},{'stops':[dict(lat=0,lon=.01,duration=0)]}):
        with pytest.raises(Refused):
            adapter.calculate('detour',dict(supplied,**change),identities)
    with pytest.raises(PolicyRefused):
        adapter.calculate('detour',dict(supplied,avoid_tolls=True,avoidance_mode='mandatory'),identities)
    with pytest.raises(Refused,match='version_changed'):
        adapter.calculate('detour',supplied,dict(identities,graph_version='0'*64))
    _,reference=adapter._prepare('detour',supplied,identities)
    for change in ({'fuel_efficiency':7.5},{'force_refresh':True},{'is_reroute':True}):
        altered=copy.deepcopy(reference);altered['app_request'].update(change)
        with pytest.raises(Refused,match='app_reference_changed'):
            adapter.restore(altered)
    assert not bridge.cache


def test_general_normalization_cannot_bypass_registered_execution_or_restore(app, manifest, monkeypatch):
    from prototypes.graphhopper11.app_request_bridge import RegisteredAppRequestBridge, normalize_app_request
    bridge = app.extensions['gh11_bridge']
    adapter = RegisteredAppRequestBridge(bridge)
    identities = {key:manifest[key] for key in ('graph_version','source_version','policy_version')}
    supplied = full_app_body()
    _, reference = adapter._prepare('detour',supplied,identities)
    changed = dict(supplied,start='40,-75',end='41,-74')
    assert normalize_app_request(changed)['visits'] == [[40,-75],[41,-74]]
    cache_before = copy.deepcopy(bridge.cache)
    def forbidden(*args, **kwargs):
        pytest.fail('Unregistered normalized requests must not execute an engine')
    monkeypatch.setattr(bridge,'_execute',forbidden)
    for action in (adapter.preflight,adapter.calculate):
        with pytest.raises(Refused,match='journey_not_registered'):
            action('detour',changed,identities)
    reference['app_request'] = changed
    with pytest.raises(Refused,match='journey_not_registered'):
        adapter.restore(reference)
    assert bridge.cache == cache_before


def test_complete_app_request_engine_failure_never_falls_back_to_cached_route(app, manifest, monkeypatch):
    from prototypes.graphhopper11.app_request_bridge import RegisteredAppRequestBridge,adapt_app_request
    bridge=app.extensions['gh11_bridge'];adapter=RegisteredAppRequestBridge(bridge)
    identities={k:manifest[k] for k in ('graph_version','source_version','policy_version')}
    supplied=full_app_body();selected=adapt_app_request(supplied,bridge.cases['detour'])['policy_request']
    bridge.cache[bridge.binding('detour',selected)] = (float('inf'),{'untrusted_cached_evidence':True})
    before=copy.deepcopy(bridge.cache)
    def failed(*args):
        raise Refused('engine_refused')
    monkeypatch.setattr(bridge,'_execute',failed)
    with pytest.raises(Refused,match='engine_refused'):
        adapter.calculate('detour',supplied,identities)
    assert bridge.cache == before


def test_complete_request_http_guards_preflight_and_fresh_restore(app, manifest, monkeypatch):
    bridge=app.extensions['gh11_bridge'];client=app.test_client()
    identities={key:manifest[key] for key in ('graph_version','source_version','policy_version')}
    supplied=full_app_body();payload=dict(case_id='detour',app_request=supplied,**identities)
    before=bridge._execute
    def forbidden(*args):
        pytest.fail('Preflight or rejected complete request cannot execute Java')
    monkeypatch.setattr(bridge,'_execute',forbidden)
    for path in ('app-policy','app-route','app-restore'):
        assert client.post('/api/prototype/'+path,json=payload).status_code == 401
        assert client.post('/api/prototype/'+path,json=payload,headers=dict(AUTH,Origin='https://other.invalid')).status_code == 403
    response=client.post('/api/prototype/app-policy',json=payload,headers=AUTH)
    assert response.status_code == 200
    reference=response.get_json()['plan_reference']
    assert reference['schema'] == 3 and reference['app_request'] == supplied
    assert not bridge.cache
    assert client.post('/api/prototype/app-route',json=dict(payload,app_request=dict(supplied,start='1,1')),headers=AUTH).status_code == 400
    assert client.post('/api/prototype/app-policy',json=dict(payload,proof=True),headers=AUTH).status_code == 400
    assert client.post('/api/prototype/app-route',json=dict(payload,graph_version='0'*64),headers=AUTH).status_code == 409
    assert client.post('/api/prototype/app-route',json=dict(payload,app_request=dict(supplied,avoid_tolls=True,avoidance_mode='mandatory')),headers=AUTH).status_code == 422
    changed=copy.deepcopy(reference);changed['app_request']['fuel_efficiency']=7.0
    assert client.post('/api/prototype/app-restore',json=changed,headers=AUTH).status_code == 409
    assert client.post('/api/prototype/app-policy',data='x'*4097,content_type='application/json',headers=AUTH).status_code == 413
    monkeypatch.setattr(bridge,'_execute',before)
    routed=client.post('/api/prototype/app-route',json=payload,headers=AUTH)
    assert routed.status_code == 200, routed.get_json()
    restored=client.post('/api/prototype/app-restore',json=reference,headers=AUTH)
    assert restored.status_code == 200
    assert routed.get_json()['candidates'] == restored.get_json()['candidates']
    assert routed.get_json()['app_request_context']['app_request'] == supplied
    assert not bridge.cache


@pytest.mark.skipif(os.environ.get('GH11_BROWSER_ACCEPTANCE') != '1', reason='Explicit isolated Chromium acceptance not requested')
def test_real_chromium_http_complete_requests(app, manifest, monkeypatch):
    _run_real_browser(app,monkeypatch,'browser-complete-acceptance.cjs','PASS_ISOLATED_COMPLETE_HTTP',{'execute':7,'validate':7})
    assert not app.extensions['gh11_bridge'].cache


def test_anchor_only_registry_cases_keep_legacy_metadata_without_complete_template(app):
    bridge=app.extensions['gh11_bridge']
    bridge.cases['detour'].pop('points')
    response=app.test_client().get('/api/prototype/cases',headers=AUTH)
    assert response.status_code == 200
    registry=response.get_json()
    assert 'detour' in registry['cases'] and 'detour' in registry['case_settings']
    assert 'detour' not in registry['case_requests'] and 'via' in registry['case_requests']


def test_complete_private_cache_tls_ownership_revalidation_and_bypasses(app, manifest, monkeypatch):
    bridge=app.extensions['gh11_bridge'];boundary=app.extensions['gh11_private_cache']
    identities={key:manifest[key] for key in ('graph_version','source_version','policy_version')}
    body=full_app_body();payload=dict(case_id='detour',app_request=body,**identities)
    a,b=app.test_client(),app.test_client();counts={'execute':0,'validate':0}
    for name in counts:
        original=getattr(bridge,'_execute' if name=='execute' else 'validate')
        def track(*args,_name=name,_original=original,**kwargs):
            counts[_name]+=1
            return _original(*args,**kwargs)
        monkeypatch.setattr(bridge,'_execute' if name=='execute' else 'validate',track)
    def call(client,path='app-route',data=None,secure=True):
        return client.post('/api/prototype/'+path,json=payload if data is None else data,headers=AUTH,base_url='https://localhost' if secure else 'http://localhost')
    preflight=call(a,'app-policy')
    assert preflight.status_code==200 and 'Set-Cookie' not in preflight.headers and not boundary.store.cache
    first=call(a);assert first.status_code==200
    assert first.get_json()['cache_policy']=='private_complete_request'
    assert '__Host-voyagr-gh11-scope=' in first.headers['Set-Cookie']
    original_expiry=next(iter(boundary.store.cache.values()))[0]
    second=call(a);assert second.status_code==200 and counts=={'execute':1,'validate':2}
    assert 'Set-Cookie' not in second.headers and next(iter(boundary.store.cache.values()))[0]==original_expiry
    assert call(b).status_code==200 and counts['execute']==2
    changed=dict(payload,app_request=dict(body,fuel_efficiency=7.5))
    assert call(a,data=changed).status_code==200 and counts['execute']==3
    size=boundary.store.get_stats()['size']
    for flags in ({'force_refresh':True},{'is_reroute':True}):
        fresh=call(a,data=dict(payload,app_request=dict(body,**flags)))
        assert fresh.status_code==200 and fresh.get_json()['cache_policy']=='bypass_complete_app_request'
        assert boundary.store.get_stats()['size']==size
    restored=call(a,'app-restore',first.get_json()['plan_reference'])
    assert restored.status_code==200 and restored.get_json()['cache_policy']=='bypass_complete_app_request'
    http=call(a,secure=False)
    assert http.status_code==200 and http.get_json()['cache_policy']=='bypass_complete_app_request'
    assert 'Set-Cookie' not in http.headers and counts['execute']==7
    assert not bridge.cache  # Never the shared fixture dictionary or UK singleton.


@pytest.mark.parametrize('corruption', ['trace', 'endpoint', 'query_missing'])
def test_private_cache_corruption_refuses_without_engine_fallback_or_authority(app, manifest, monkeypatch, corruption):
    bridge=app.extensions['gh11_bridge'];boundary=app.extensions['gh11_private_cache'];client=app.test_client()
    payload=dict(case_id='detour',app_request=full_app_body(),**{key:manifest[key] for key in ('graph_version','source_version','policy_version')})
    first=client.post('/api/prototype/app-route',json=payload,headers=AUTH,base_url='https://localhost')
    assert first.status_code==200
    key=next(iter(boundary.store.cache));expires,raw=boundary.store.cache[key]
    corrupted=json.loads(raw)
    if corruption == 'trace':
        corrupted['cases'][0]['candidates'][0]['directed_edge_keys']=[999999]
    elif corruption == 'query_missing':
        corrupted['cases'][0]['candidates'][0].pop('query_graph_intervals')
    else:
        corrupted['cases'][0]['candidates'][0]['geometry']['coordinates'][-1]=[.021,0]
        corrupted['cases'][0]['candidates'][0]['query_graph_intervals'][-1]['traversal']['adjacent_point']=[.021,0]
    boundary.store.cache[key]=(expires,json.dumps(corrupted).encode())
    def forbidden(*args):
        pytest.fail('Corrupt private evidence must refuse rather than fallback to engine')
    monkeypatch.setattr(bridge,'_execute',forbidden)
    response=client.post('/api/prototype/app-route',json=payload,headers=AUTH,base_url='https://localhost')
    assert response.status_code==422 and response.get_json()['navigation_allowed'] is False
    assert 'candidates' not in response.get_json() and not boundary.store.cache


def test_private_cache_cannot_replay_mandatory_or_changed_version_requests(app, manifest, monkeypatch):
    bridge=app.extensions['gh11_bridge'];boundary=app.extensions['gh11_private_cache'];client=app.test_client()
    payload=dict(case_id='detour',app_request=full_app_body(),**{key:manifest[key] for key in ('graph_version','source_version','policy_version')})
    assert client.post('/api/prototype/app-route',json=payload,headers=AUTH,base_url='https://localhost').status_code==200
    def forbidden(*args):
        pytest.fail('Mandatory or stale requests cannot read private cached evidence')
    monkeypatch.setattr(boundary.store,'get',forbidden);monkeypatch.setattr(bridge,'_execute',forbidden)
    for altered,expected in ((dict(payload,app_request=dict(payload['app_request'],avoid_tolls=True,avoidance_mode='mandatory')),422),
                             (dict(payload,policy_version='0'*64),409)):
        response=client.post('/api/prototype/app-route',json=altered,headers=AUTH,base_url='https://localhost')
        assert response.status_code==expected and 'candidates' not in response.get_json()


@pytest.mark.skipif(os.environ.get('GH11_BROWSER_ACCEPTANCE') != '1', reason='Explicit isolated Chromium acceptance not requested')
def test_real_chromium_https_private_cache(app, manifest, monkeypatch, tmp_path):
    cert,key=tmp_path/'cert.pem',tmp_path/'key.pem'
    subprocess.run(['openssl','req','-x509','-newkey','rsa:2048','-nodes','-days','1',
                    '-subj','/CN=127.0.0.1','-addext','subjectAltName=IP:127.0.0.1',
                    '-keyout',str(key),'-out',str(cert)],check=True,capture_output=True,timeout=30)
    _run_real_browser(app,monkeypatch,'browser-private-cache.cjs','PASS_PRIVATE_CACHE_HTTPS',
                      {'execute':7,'validate':9},tls_files=(str(cert),str(key)))


def test_failed_private_requests_never_issue_cache_capability(app, manifest, monkeypatch):
    bridge=app.extensions['gh11_bridge'];boundary=app.extensions['gh11_private_cache'];client=app.test_client()
    payload=dict(case_id='detour',app_request=full_app_body(),**{key:manifest[key] for key in ('graph_version','source_version','policy_version')})
    for data,headers,status in ((payload,{},401),(payload,dict(AUTH,Origin='https://other.invalid'),403),
                                (dict(payload,proof=True),AUTH,400)):
        response=client.post('/api/prototype/app-route',json=data,headers=headers,base_url='https://localhost')
        assert response.status_code==status and 'Set-Cookie' not in response.headers
    def failed(*args):
        raise Refused('engine_refused')
    monkeypatch.setattr(bridge,'_execute',failed)
    response=client.post('/api/prototype/app-route',json=payload,headers=AUTH,base_url='https://localhost')
    assert response.status_code==422 and 'Set-Cookie' not in response.headers
    assert not boundary.store.cache


@pytest.mark.skipif(os.environ.get('GH11_BROWSER_ACCEPTANCE') != '1', reason='Explicit isolated Chromium acceptance not requested')
def test_real_chromium_owner_saved_plans(app, manifest, monkeypatch):
    import threading
    from flask import request,jsonify
    entered,completed=threading.Event(),threading.Event()
    @app.before_request
    def observe_saved_restore():
        if request.path=='/api/prototype/app-restore':
            entered.set()
    @app.after_request
    def saved_restore_finished(response):
        if request.path=='/api/prototype/app-restore':
            completed.set()
        return response
    @app.get('/__test/saved-restore-state')
    def saved_restore_state():
        return jsonify(entered=entered.is_set(),completed=completed.is_set())
    @app.post('/__test/reset-saved-restore')
    def reset_saved_restore():
        entered.clear();completed.clear();return jsonify(success=True)
    _run_real_browser(app,monkeypatch,'browser-saved-plans.cjs','PASS_OWNER_SAVED_PLANS',{'execute':6,'validate':6})


@pytest.mark.parametrize('indices',[[],[0],[0,0,2],[0,2,1,2],[0,3],[False,2],[0,'1',2]])
def test_preview_adapter_refuses_collapsed_or_invalid_leg_boundaries(indices):
    from prototypes.graphhopper11.isolated_app import app_preview
    row={'geometry':{'type':'LineString','coordinates':[[0,0],[.01,0],[.02,0]]},
         'directed_edge_keys':[2],'waypoint_indices':indices,'distance_km':2,'duration_minutes':2,
         'instruction_details':[{'name':'Synthetic','sign':0,'text':'Continue','interval':[0,2],
                                 'distance_m':2000,'time_ms':120000}]}
    result={**{key:'a'*64 for key in ('graph_version','source_version','policy_version','request_binding')},
            'candidates':[row],'policy_report':{'selected':{'requirements':[]}}}
    before=copy.deepcopy(result)
    with pytest.raises(Refused,match='preview_leg_contract'):
        app_preview(result)
    assert result==before


def test_real_query_graph_partial_reverse_via_and_parallel_road_evidence(app):
    bridge = app.extensions['gh11_bridge']
    results = {name:bridge.route(name) for name in ('partial','partial_reverse','partial_via','parallel')}
    for name, result in results.items():
        assert result['navigation_allowed'] is False
        row = result['candidates'][0]
        trace = row['query_graph_intervals']
        assert row['query_graph_scope'] == 'current_request_only'
        assert trace[0]['traversal']['virtual'] and trace[-1]['traversal']['virtual']
        assert trace[0]['traversal']['base_point'] == row['geometry']['coordinates'][0]
        assert trace[-1]['traversal']['adjacent_point'] == row['geometry']['coordinates'][-1]
        for before, after in zip(trace, trace[1:]):
            assert before['last'] == after['first']
            assert before['traversal']['adjacent_node'] == after['traversal']['base_node']
        assert row['registered_visit_observations']['gps_verification'] == 'UNVERIFIED'
        assert result['app_preview']['routes'][0]['gh11_evidence']['query_graph_intervals'] == trace
    forward = results['partial']['candidates'][0]['directed_edge_keys']
    reverse = results['partial_reverse']['candidates'][0]['directed_edge_keys']
    assert reverse == [key^1 for key in reversed(forward)]
    via = results['partial_via']['candidates'][0]
    assert len(via['query_graph_intervals']) == 2 and len(via['directed_edge_keys']) == 1
    assert len({entry['traversal']['query_edge_key'] for entry in via['query_graph_intervals']}) == 2
    assert {entry['traversal']['original_edge_key'] for entry in via['query_graph_intervals']} == set(forward)
    assert via['waypoint_indices'][1] in {entry['last'] for entry in via['query_graph_intervals'][:-1]}
    parallel = results['parallel']['candidates'][0]['directed_edge_keys']
    assert {key//2 for key in forward}.isdisjoint(key//2 for key in parallel)


@pytest.mark.parametrize('fault', ['missing','incomplete','gap','disconnected','wrong_original',
                                  'geometry','boolean_coordinate','raw_key','virtual_flag'])
def test_query_graph_transport_refuses_inconsistent_actual_traversal(fault):
    from prototypes.graphhopper11.isolated_app import validate_query_traversal
    coordinates = [[0,0],[.01,0],[.02,0]]
    originals = [[0,2,2]]
    rows = [{'first':i,'last':i+1,'traversal':dict(query_edge_key=100+i*2,original_edge_key=2,
        base_node=1000+i,adjacent_node=1001+i,base_point=coordinates[i][:],
        adjacent_point=coordinates[i+1][:],virtual=True)} for i in range(2)]
    validate_query_traversal(rows,coordinates,originals)
    if fault == 'missing': rows = None
    elif fault == 'incomplete': rows.pop()
    elif fault == 'gap': rows[1]['first'] = 0
    elif fault == 'disconnected': rows[1]['traversal']['base_node'] = 999  # same coordinates, different node
    elif fault == 'wrong_original': rows[1]['traversal']['original_edge_key'] = 4
    elif fault == 'geometry': rows[1]['traversal']['base_point'] = [.011,0]
    elif fault == 'boolean_coordinate': rows[0]['traversal']['base_point'][0] = False
    elif fault == 'raw_key': rows[1]['traversal']['virtual'] = False
    elif fault == 'virtual_flag': rows[1]['traversal']['virtual'] = 1
    with pytest.raises(Refused,match='query_traversal'):
        validate_query_traversal(rows,coordinates,originals)


def test_eligible_edge_resnap_to_parallel_road_requires_source_identity_guard(app, tmp_path):
    bridge = app.extensions['gh11_bridge']
    parallel = bridge.route('parallel')['candidates'][0]['directed_edge_keys']
    fixture = copy.deepcopy(bridge.registry)
    case = copy.deepcopy(bridge.cases['no_route'])
    case.pop('expected_osm_way_ids')
    case['include_path_data'] = True
    fixture['cases'] = [case]
    request = tmp_path/'unbound-public-fixture.json'
    request.write_text(json.dumps(fixture))
    report = bridge._execute(request,str(tmp_path))
    result = report['cases'][0]
    assert result['status'] == 'PASS_AVAILABLE_GRAPH_CHECKS'
    row = result['candidates'][0]
    assert {key//2 for key in row['directed_edge_keys']} == {key//2 for key in parallel}
    assert row['query_graph_intervals'][0]['traversal']['base_point'][1] == pytest.approx(.000002)
    assert case['points'][0][0] == 0  # Snap moved to another road within the one-metre bound.
    with pytest.raises(Refused,match='engine_refused'):
        bridge.route('no_route')  # The actual registered case retains its source-way guard.


def origin_diagnostic(bridge, tmp_path, *, start=(0,.005), end=(0,.018), radius=1, limit=10000, blocked=('upper',), lookup='full_scan'):
    fixture = copy.deepcopy(bridge.registry)
    case = copy.deepcopy(bridge.cases['partial'])
    case.pop('expected_osm_way_ids')
    case.update(points=[list(start),list(end)],max_snap_distance_m=75,
                include_path_data=True,blocked_associations=list(blocked),
                diagnose_origin={'radius_m':radius,'edge_limit':limit,'lookup':lookup})
    fixture['cases'] = [case]
    request = tmp_path/'public-origin-diagnostic.json'
    request.write_text(json.dumps(fixture))
    result = bridge._execute(request,str(tmp_path))['cases'][0]
    observation = result['origin_candidate_observation']
    assert observation['navigation_allowed'] is False and observation['route_absence_proven'] is False
    assert observation['heading_verification'] == observation['physical_road_verification'] == 'UNVERIFIED'
    assert observation['avoidance_filter_applied'] is False
    assert observation['key_scope'] == 'current_loaded_graph_only'
    assert observation['candidate_count'] == len(set(observation['candidate_edge_keys']))
    return observation, result


def test_real_imported_graph_keeps_parallel_and_reverse_approaches_before_avoidance(app, tmp_path):
    bridge = app.extensions['gh11_bridge']
    forward, _ = origin_diagnostic(bridge,tmp_path)
    reverse, _ = origin_diagnostic(bridge,tmp_path,end=(0,.002))
    avoided, result = origin_diagnostic(bridge,tmp_path,blocked=('main',))
    assert forward['scan_complete'] and forward['classification'] == 'MULTIPLE_OBSERVED_TRAVERSALS'
    assert forward['candidate_count'] == 4  # Two bidirectional parallel edges.
    assert forward['candidate_edge_keys'] == reverse['candidate_edge_keys'] == avoided['candidate_edge_keys']
    assert set(result['blocked_edge_keys']) <= set(avoided['candidate_edge_keys'])
    assert all(key^1 in forward['candidate_edge_keys'] for key in forward['candidate_edge_keys'])


def test_real_oneway_observation_is_not_physical_heading_authority(app, tmp_path):
    observation, result = origin_diagnostic(app.extensions['gh11_bridge'],tmp_path,
        start=(.0035,.01),end=(.0039,.01),blocked=('main',))
    assert observation['scan_complete'] and observation['classification'] == 'ONE_OBSERVED_TRAVERSAL'
    assert observation['candidate_count'] == 1
    assert observation['candidate_edge_keys'] == result['candidates'][0]['directed_edge_keys']
    assert observation['navigation_allowed'] is False


def test_real_intersection_has_multiple_imported_approaches(app, tmp_path):
    observation, _ = origin_diagnostic(app.extensions['gh11_bridge'],tmp_path,start=(0,0))
    assert observation['scan_complete'] and observation['classification'] == 'MULTIPLE_OBSERVED_TRAVERSALS'
    assert observation['candidate_count'] >= 6  # Junction plus independent nearby parallel road.


def test_empty_and_truncated_imported_observations_cannot_establish_an_approach(app, tmp_path):
    bridge = app.extensions['gh11_bridge']
    empty, _ = origin_diagnostic(bridge,tmp_path,start=(.0001,.005),end=(.0001,.018))
    assert empty['scan_complete'] and empty['classification'] == 'NO_OBSERVED_TRAVERSAL'
    assert empty['candidate_count'] == 0 and empty['navigation_allowed'] is False
    partial, _ = origin_diagnostic(bridge,tmp_path,limit=1)
    assert partial['scan_complete'] is False and partial['classification'] == 'UNVERIFIED'
    assert partial['edges_examined'] == 1 and partial['reason'] == 'edge_or_time_budget'


@pytest.mark.parametrize('options',[{'radius_m':True},{'radius_m':0},{'radius_m':151},
    {'radius_m':1,'edge_limit':0},{'radius_m':1,'edge_limit':10001},
    {'radius_m':1,'edge_limit':True},{'radius_m':1,'heading':90},
    {'radius_m':1,'lookup':True},{'radius_m':1,'lookup':'closest'}])
def test_invalid_or_unsupported_origin_diagnostic_controls_refuse(app, tmp_path, options):
    bridge = app.extensions['gh11_bridge'];fixture = copy.deepcopy(bridge.registry)
    case = copy.deepcopy(bridge.cases['partial']);case['diagnose_origin'] = options
    fixture['cases'] = [case];request = tmp_path/'invalid-origin-diagnostic.json'
    request.write_text(json.dumps(fixture))
    with pytest.raises(Refused):
        bridge._execute(request,str(tmp_path))


@pytest.fixture(scope='module')
def origin_index_probe(manifest, tmp_path_factory):
    root = tmp_path_factory.mktemp('gh11-index-differential')
    source = root/'OriginIndexProbe.java'
    source.write_text(r'''import com.graphhopper.*;
import com.graphhopper.jackson.Jackson;
import com.graphhopper.storage.index.*;
import com.graphhopper.util.shapes.BBox;
import com.fasterxml.jackson.databind.*;
import com.fasterxml.jackson.dataformat.yaml.YAMLFactory;
import java.io.File;
import java.net.URLClassLoader;
import java.util.*;
import java.lang.reflect.*;
public class OriginIndexProbe {
 static class ProbeHopper extends GraphHopper {
  LocationIndex original;
  void variant(String mode) {
   if(mode.equals("normal")){setLocationIndex(original);return;}
   setLocationIndex(new LocationIndexTree(getBaseGraph(),new com.graphhopper.storage.RAMDirectory()) {
    public int getMinResolutionInMeter(){return mode.equals("bad_grid")?0:((LocationIndexTree)original).getMinResolutionInMeter();}
    public void close(){original.close();}
    public Snap findClosest(double lat,double lon,com.graphhopper.routing.util.EdgeFilter filter){return original.findClosest(lat,lon,filter);}
    public void query(TileFilter filter,Visitor visitor){
     switch(mode){
      case "empty":return;
      case "spatial_empty":if(filter!=null)return;original.query(filter,visitor);return;
      case "cell_hole":{
       var grid=IndexStructureInfo.create(ProbeHopper.this.getBaseGraph().getBounds(),getMinResolutionInMeter());
       double x=grid.getBounds().minLon+grid.getDeltaLon()/2,y=grid.getBounds().minLat;
       if(filter!=null && filter.acceptPartially(new BBox(x-1e-8,x+1e-8,y-1e-7,y+1e-7)))return;
       original.query(filter,visitor);return;
      }
      case "throw":throw new IllegalStateException("synthetic index failure");
      case "invalid":visitor.onEdge(Integer.MAX_VALUE);return;
      case "flood":for(int i=0;i<60000;i++)visitor.onEdge(0);return;
      case "tiles":for(int i=0;i<10001;i++)visitor.onTile(new BBox(0,1,0,1),0);return;
      case "duplicate":original.query(filter,new Visitor(){
       public boolean isTileInfo(){return visitor.isTileInfo();}
       public void onTile(BBox tile,int depth){visitor.onTile(tile,depth);}
       public void onEdge(int id){visitor.onEdge(id);visitor.onEdge(id);}
      });return;
      default:throw new IllegalStateException("unknown synthetic variant");
     }
    }
   });
  }
 }
 public static void main(String[] args)throws Exception {
  var compiler=javax.tools.ToolProvider.getSystemJavaCompiler();
  if(compiler==null || compiler.run(null,null,null,"-classpath",args[0],"-d",args[4],args[3])!=0)
   throw new IllegalStateException("checker compilation failed");
  try(var loader=new URLClassLoader(new java.net.URL[]{new File(args[4]).toURI().toURL()},OriginIndexProbe.class.getClassLoader())) {
   var check=Class.forName("ReadOnlyRouteRegression",true,loader).getDeclaredMethod("observeOriginCandidates",GraphHopper.class,JsonNode.class,JsonNode.class);
   check.setAccessible(true);
   var inventory=Class.forName("ReadOnlyRouteRegression",true,loader).getDeclaredMethod("observeIndexInventory",GraphHopper.class,int.class);
   inventory.setAccessible(true);
   var geometry=Class.forName("ReadOnlyRouteRegression",true,loader).getDeclaredMethod("observeIndexGeometry",GraphHopper.class,int.class,int.class);
   geometry.setAccessible(true);
   var gridCuts=Class.forName("ReadOnlyRouteRegression",true,loader).getDeclaredMethod("addGridCuts",TreeSet.class,
    double.class,double.class,double.class,double.class,int.class,int.class,long.class);
   gridCuts.setAccessible(true);
   var mapper=Jackson.newObjectMapper();var configTree=new ObjectMapper(new YAMLFactory()).readTree(new File(args[1]));
   var config=mapper.treeToValue(configTree.get("graphhopper"),GraphHopperConfig.class);
   config.putObject("graph.location",args[2]).putObject("datareader.file","");
   var hopper=new ProbeHopper();
   try {
    hopper.init(config).setAllowWrites(false);
    if(!hopper.load())throw new IllegalStateException("existing graph required");
    hopper.original=hopper.getLocationIndex();
    boolean[] boundary={false};
    hopper.original.query(new BBox(.004,.006,-.001,.001),new LocationIndex.Visitor(){
     public boolean isTileInfo(){return true;}
     public void onEdge(int id){}
     public void onTile(BBox tile,int depth){if(Math.abs(tile.minLon-.005)<1e-8 || Math.abs(tile.maxLon-.005)<1e-8)boundary[0]=true;}
    });
    var observations=new ArrayList<Object>();
    for(var input:mapper.readTree(new File(args[5]))) {
     hopper.variant(input.path("fault").asText("normal"));
     var options=mapper.createObjectNode().put("radius_m",input.path("radius_m").asDouble(1))
      .put("edge_limit",input.path("edge_limit").asInt(10000));
     try {
      if(input.has("cuts")){
       var cuts=new TreeSet<Double>();cuts.add(0d);cuts.add(1d);
       for(var axis:input.get("cuts"))gridCuts.invoke(null,cuts,axis.get(0).asDouble(),axis.get(1).asDouble(),0d,1d,2,128,System.nanoTime()+1_000_000_000L);
       observations.add(Map.of("cuts",cuts));continue;
      }
      if(input.path("geometry").asBoolean(false)){
       observations.add(Map.of("geometry",geometry.invoke(null,hopper,input.path("edge_limit").asInt(10000),input.path("sample_limit").asInt(128))));continue;
      }
      if(input.path("inventory").asBoolean(false)){
       observations.add(Map.of("inventory",inventory.invoke(null,hopper,input.path("edge_limit").asInt(10000))));continue;
      }
      var full=check.invoke(null,hopper,input.get("point"),options);
      options.put("lookup","index");
      var indexed=check.invoke(null,hopper,input.get("point"),options);
      observations.add(Map.of("full",full,"indexed",indexed));
     }catch(InvocationTargetException error){
      if(!(error.getCause() instanceof IllegalStateException))throw error;
      observations.add(Map.of("refused",true));
     }
    }
    System.out.println("INDEX_DIFFERENTIAL "+new ObjectMapper().writeValueAsString(Map.of("midpoint_is_tile_border",boundary[0],"observations",observations)));
   }finally{hopper.close();}
  }
 }
}''')
    def run(cases, paths=None):
        paths = manifest['paths'] if paths is None else paths
        request = root/'synthetic-inputs.json';request.write_text(json.dumps(cases))
        command = ['java','-Xmx512m','--class-path',paths['jar'],str(source),
                   paths['jar'],paths['config'],paths['graph'],
                   str(Path(__file__).resolve().parents[1]/'prototypes/graphhopper11/ReadOnlyRouteRegression.java'),str(root),str(request)]
        completed = subprocess.run(command,cwd=root,capture_output=True,text=True,timeout=60)
        assert completed.returncode == 0, (completed.stdout+completed.stderr)[-4000:]
        rows = [line.removeprefix('INDEX_DIFFERENTIAL ') for line in completed.stdout.splitlines() if line.startswith('INDEX_DIFFERENTIAL ')]
        assert len(rows) == 1
        return json.loads(rows[0])
    return run


def assert_index_observation_only(observation):
    assert observation['lookup_method'] == 'index' and observation['scan_complete'] is False
    assert observation['classification'] == observation['index_coverage_verification'] == 'UNVERIFIED'
    assert observation['navigation_allowed'] is False and observation['route_absence_proven'] is False
    assert observation['physical_road_verification'] == observation['heading_verification'] == 'UNVERIFIED'
    assert observation['avoidance_filter_applied'] is False


def test_real_index_matches_full_scan_at_tile_border_and_long_edge_interiors(origin_index_probe):
    points = [[0,.005],[0,.005-1e-9],[0,.005+1e-9],[.0015,.005],[.0035,.01],[0,0],[.0001,.005]]
    cases = [dict(point=point,radius_m=radius) for point in points for radius in (.01,1,20,150)]
    result = origin_index_probe(cases)
    assert result['midpoint_is_tile_border'] is True
    observations = result['observations']
    for pair in observations:
        full,indexed = pair['full'],pair['indexed']
        assert full['scan_complete'] is True and indexed['index_query_complete'] is True
        assert full['candidate_edge_keys'] == indexed['candidate_edge_keys']
        assert indexed['edges_examined'] <= full['edges_examined']
        assert_index_observation_only(indexed)
    assert observations[1]['full']['candidate_count'] == 4  # Both parallel roads at an interior point.
    assert any(pair['indexed']['edges_examined'] < pair['full']['edges_examined'] for pair in observations)


def test_index_duplicate_callbacks_do_not_create_or_hide_candidates(origin_index_probe):
    pairs = origin_index_probe([dict(point=[0,.005],fault='normal'),dict(point=[0,.005],fault='duplicate')])['observations']
    normal,duplicate = [pair['indexed'] for pair in pairs]
    assert normal['candidate_edge_keys'] == duplicate['candidate_edge_keys']
    assert normal['edges_examined'] == duplicate['edges_examined']
    assert duplicate['edge_callbacks'] == 2*normal['edge_callbacks']
    assert duplicate['index_query_complete'] is True
    assert_index_observation_only(duplicate)


def test_empty_index_can_finish_while_missing_real_candidates_and_never_claim_completeness(origin_index_probe):
    pair = origin_index_probe([dict(point=[0,.005],fault='empty')])['observations'][0]
    assert pair['full']['scan_complete'] is True and pair['full']['candidate_count'] == 4
    indexed = pair['indexed']
    assert indexed['index_query_complete'] is True and indexed['candidate_count'] == 0
    assert indexed['reason'] == 'index_coverage_unverified'
    assert_index_observation_only(indexed)


@pytest.mark.parametrize('fault,reason',[('throw','index_query_failure'),('invalid','invalid_index_edge'),
                                       ('flood','callback_budget'),('tiles','tile_budget')])
def test_index_failure_and_query_budgets_cannot_fall_back_or_claim_a_unique_approach(origin_index_probe,fault,reason):
    indexed = origin_index_probe([dict(point=[0,.005],fault=fault)])['observations'][0]['indexed']
    assert indexed['index_query_complete'] is False
    assert indexed['reason'] in (reason,'time_budget')
    if fault == 'flood':
        assert indexed['edges_examined'] <= 1 and indexed['candidate_count'] <= 2
    else:
        assert indexed['edges_examined'] == indexed['candidate_count'] == 0
    assert_index_observation_only(indexed)


def test_index_region_and_edge_limit_refuse_without_completeness_claim(origin_index_probe):
    cases = [dict(point=point) for point in ([81,0],[0,179.999999],[0,-179.999999])]
    cases.append(dict(point=[0,.005],edge_limit=1))
    rows = origin_index_probe(cases)['observations']
    for pair in rows:
        assert_index_observation_only(pair['indexed'])
        assert pair['indexed']['index_query_complete'] is False
    assert all(pair['indexed']['reason']=='unsupported_index_envelope' for pair in rows[:3])
    assert rows[-1]['indexed']['reason']=='edge_budget' and rows[-1]['indexed']['edges_examined']==1


def test_operator_fixture_index_mode_preserves_candidates_but_never_grants_scan_completeness(app,tmp_path):
    bridge = app.extensions['gh11_bridge']
    full,_ = origin_diagnostic(bridge,tmp_path)
    indexed,result = origin_diagnostic(bridge,tmp_path,lookup='index',blocked=('main',))
    assert indexed['index_query_complete'] is True
    assert indexed['candidate_edge_keys'] == full['candidate_edge_keys']
    assert set(result['blocked_edge_keys']) <= set(indexed['candidate_edge_keys'])
    assert_index_observation_only(indexed)


def test_index_probe_rejects_invalid_origin_types_instead_of_numeric_coercion(origin_index_probe):
    cases = [dict(point=point) for point in (None,[],[True,0],['0',0],[91,0],[0,181])]
    assert origin_index_probe(cases)['observations'] == [{'refused':True}]*len(cases)


@pytest.mark.parametrize('latitude,longitude',[(53,-1),(40,-105)])
def test_real_index_differential_on_translated_synthetic_graphs(manifest,origin_index_probe,tmp_path,latitude,longitude):
    import xml.etree.ElementTree as ET
    tree = ET.parse(manifest['paths']['source'])
    for node in tree.getroot().findall('node'):
        node.set('lat',str(float(node.get('lat'))+latitude))
        node.set('lon',str(float(node.get('lon'))+longitude))
    source = tmp_path/'translated-synthetic.osm';tree.write(source,encoding='unicode')
    graph = tmp_path/'graph';config = tmp_path/'config.yml'
    config.write_text(Path(manifest['paths']['config']).read_text()
        .replace(manifest['paths']['source'],str(source)).replace(manifest['paths']['graph'],str(graph)))
    subprocess.run(['java','-Xmx512m','-jar',manifest['paths']['jar'],'import',str(config)],
        cwd=tmp_path,capture_output=True,check=True,timeout=90)
    points = [(0,.005),(.0015,.005),(.0035,.01),(0,0),(.0001,.005)]
    cases = [dict(point=[latitude+lat,longitude+lon],radius_m=radius)
             for lat,lon in points for radius in (.01,1,20,150)]
    result = origin_index_probe(cases,paths=dict(manifest['paths'],source=str(source),config=str(config),graph=str(graph)))
    for pair in result['observations']:
        assert pair['full']['scan_complete'] is True and pair['indexed']['index_query_complete'] is True
        assert pair['full']['candidate_edge_keys'] == pair['indexed']['candidate_edge_keys']
        assert_index_observation_only(pair['indexed'])
    segmented=origin_index_probe([dict(geometry=True)],paths=dict(manifest['paths'],source=str(source),config=str(config),graph=str(graph)))['observations'][0]['geometry']
    assert segmented['probe_strategy']=='segment_tile_intersections_v1'
    assert segmented['status']=='MATCHED_FINITE_PROBES' and segmented['grid_crossing_probes']>0
    assert segmented['index_geometry_coverage']=='UNVERIFIED' and segmented['navigation_allowed'] is False


def test_native_inventory_matches_ids_but_does_not_prove_spatial_coverage(origin_index_probe):
    from prototypes.graphhopper11.index_inventory_audit import validate_inventory
    cases = [dict(inventory=True,fault=fault) for fault in ('normal','duplicate','empty','spatial_empty')]
    observations = origin_index_probe(cases)['observations']
    normal,duplicate,empty,misplaced = [row['inventory'] for row in observations]
    for row in (normal,duplicate,empty,misplaced):
        assert validate_inventory(row,10000) == row
    for row in (normal,duplicate,misplaced):
        assert row['inventory_status'] == 'MATCHED_EDGE_INVENTORY' and row['inventory_match'] is True
        assert row['inventory_complete'] is True
        assert row['graph_edge_count'] == row['indexed_edge_count'] > 0
        assert row['graph_inventory_sha256'] == row['index_inventory_sha256']
        assert row['index_geometry_coverage'] == row['physical_road_verification'] == row['heading_verification'] == 'UNVERIFIED'
        assert row['navigation_allowed'] is row['route_absence_proven'] is False
    assert duplicate['index_callbacks'] == 2*normal['index_callbacks']
    assert empty['inventory_status'] == 'MISMATCHED_EDGE_INVENTORY' and empty['inventory_match'] is False
    assert empty['missing_edge_count'] == normal['graph_edge_count'] and empty['indexed_edge_count'] == 0
    spatial = origin_index_probe([dict(point=[0,.005],fault='spatial_empty')])['observations'][0]
    assert spatial['full']['candidate_count'] == 4 and spatial['indexed']['candidate_count'] == 0
    assert_index_observation_only(spatial['indexed'])


@pytest.mark.parametrize('fault,reason',[('throw','index_inventory_failure'),('invalid','invalid_index_edge'),
                                       ('flood','callback_budget'),('tiles','tile_budget')])
def test_native_inventory_failures_keep_partial_counts_unverified(origin_index_probe,fault,reason):
    from prototypes.graphhopper11.index_inventory_audit import validate_inventory
    row = origin_index_probe([dict(inventory=True,fault=fault,edge_limit=5)])['observations'][0]['inventory']
    assert row['inventory_status'] == 'UNVERIFIED' and row['inventory_complete'] is False
    assert row['graph_enumeration_complete'] is True and row['index_query_complete'] is False
    assert row['inventory_match'] is row['missing_edge_count'] is row['unexpected_edge_count'] is None
    assert row['graph_inventory_sha256'] is row['index_inventory_sha256'] is None
    assert row['reason'] == reason and row['navigation_allowed'] is False
    assert validate_inventory(row,5) == row


@pytest.fixture(scope='module')
def inventory_evidence(manifest):
    from prototypes.graphhopper11.index_inventory_audit import audit_index_inventory
    return audit_index_inventory(manifest)


def test_manifest_bound_inventory_audit_records_only_narrow_stable_evidence(manifest,inventory_evidence):
    from prototypes.graphhopper11.isolated_app import version
    row = inventory_evidence['observation']
    assert row['inventory_status'] == 'MATCHED_EDGE_INVENTORY' and row['inventory_match'] is True
    assert inventory_evidence['artifact_check'] == 'matched_manifest_before_and_after'
    for key,value in inventory_evidence['bindings'].items():
        assert value == (manifest['hashes']['config'] if key=='config_sha256' else manifest[key])
    assert inventory_evidence['manifest_identity'] == version(manifest)
    unsigned = dict(inventory_evidence);identity=unsigned.pop('evidence_identity')
    assert version(unsigned) == identity
    assert inventory_evidence['scope'] == 'manifest_bound_edge_id_inventory_only'
    assert inventory_evidence['navigation_allowed'] is False and inventory_evidence['production_migration'] == 'NO_GO'
    text = json.dumps(inventory_evidence)
    for path in manifest['paths'].values():
        assert str(path) not in text
    assert row['index_geometry_coverage'] == 'UNVERIFIED'


@pytest.mark.parametrize('change',[
    {'navigation_allowed':True},{'index_geometry_coverage':'VERIFIED'},{'missing_edge_count':1},
    {'inventory_complete':False},{'indexed_edge_count':True},{'graph_inventory_sha256':'bad'},
    {'scope':'complete_physical_coverage'},{'extra':True},{'index_callbacks':0},{'reason':[]},
])
def test_inventory_contract_cannot_promote_or_contradict_native_evidence(inventory_evidence,change):
    from prototypes.graphhopper11.index_inventory_audit import validate_inventory
    row = dict(inventory_evidence['observation'],**change)
    with pytest.raises(Refused,match='index_inventory_contract'):
        validate_inventory(row,10000)


def test_inventory_graph_budget_is_unknown_and_never_runs_a_partial_id_comparison(manifest):
    from prototypes.graphhopper11.index_inventory_audit import audit_index_inventory
    report = audit_index_inventory(manifest,edge_limit=1)
    row = report['observation']
    assert row['inventory_status'] == 'UNVERIFIED' and row['reason'] == 'graph_edge_budget'
    assert row['graph_edge_count'] == 1 and row['index_callbacks'] == 0
    assert row['inventory_match'] is row['graph_inventory_sha256'] is None
    assert row['navigation_allowed'] is False


def test_inventory_mutated_artifact_is_refused_after_native_work(manifest,inventory_evidence,monkeypatch):
    from prototypes.graphhopper11.index_inventory_audit import audit_index_inventory
    path = Path(manifest['paths']['config']);original=path.read_bytes()
    def changed(*args):
        path.write_bytes(original+b'\n# synthetic mutation\n')
        return {'engine_version':'11.1','java_runtime':inventory_evidence['java_runtime'],'audit_only':True,'index_inventory_observation':copy.deepcopy(inventory_evidence['observation']),
                'navigation_allowed':False,'production_migration':'NO_GO'}
    monkeypatch.setattr(LocalJavaBridge,'_execute',changed)
    try:
        with pytest.raises(Refused,match='input_changed'):
            audit_index_inventory(manifest)
    finally:
        path.write_bytes(original)


def test_inventory_audit_cli_is_explicit_and_has_no_guidance_or_path_disclosure(manifest,tmp_path):
    import sys
    path = tmp_path/'manifest.json';path.write_text(json.dumps(manifest))
    command = [sys.executable,'-m','prototypes.graphhopper11.index_inventory_audit','--manifest',str(path)]
    result = subprocess.run(command,capture_output=True,text=True,timeout=60)
    assert result.returncode == 0, result.stderr[-2000:]
    report = json.loads(result.stdout)
    assert report['observation']['inventory_status'] == 'MATCHED_EDGE_INVENTORY'
    assert report['observation']['index_geometry_coverage'] == 'UNVERIFIED' and report['navigation_allowed'] is False
    assert str(tmp_path) not in result.stdout
    limited = subprocess.run(command+['--edge-limit','1'],capture_output=True,text=True,timeout=60)
    assert limited.returncode == 2 and json.loads(limited.stdout)['observation']['inventory_status'] == 'UNVERIFIED'


@pytest.mark.parametrize('edge_limit',[True,0,-1,50_000_001,1.0])
def test_inventory_invalid_budgets_refuse_before_inspecting_a_manifest(monkeypatch,edge_limit):
    from prototypes.graphhopper11 import index_inventory_audit as audit
    def forbidden(*args,**kwargs):
        pytest.fail('Invalid budget must not inspect files or execute Java')
    monkeypatch.setattr(audit,'LocalJavaBridge',forbidden)
    with pytest.raises(Refused,match='index_inventory_limit'):
        audit.audit_index_inventory({},edge_limit=edge_limit)


def test_inventory_evidence_refuses_changed_auditor_code(manifest,inventory_evidence,monkeypatch):
    from prototypes.graphhopper11 import index_inventory_audit as audit
    actual_digest = audit.digest;calls=[]
    def changed(path):
        calls.append(True)
        return actual_digest(path) if len(calls)==1 else '0'*64
    monkeypatch.setattr(audit,'digest',changed)
    monkeypatch.setattr(LocalJavaBridge,'_execute',lambda *args:{'engine_version':'11.1','java_runtime':inventory_evidence['java_runtime'],
        'audit_only':True,'index_inventory_observation':copy.deepcopy(inventory_evidence['observation']),
        'navigation_allowed':False,'production_migration':'NO_GO'})
    with pytest.raises(Refused,match='index_inventory_binding_changed'):
        audit.audit_index_inventory(manifest)


def test_inventory_changed_manifest_is_refused_before_native_execution(manifest,monkeypatch):
    from prototypes.graphhopper11.index_inventory_audit import audit_index_inventory
    changed = copy.deepcopy(manifest);changed['graph_version'] = '0'*64
    monkeypatch.setattr(LocalJavaBridge,'_execute',lambda *args:pytest.fail('Stale manifest must not execute Java'))
    with pytest.raises(Refused,match='graph_changed'):
        audit_index_inventory(changed)


def test_inventory_cannot_mislabel_a_normal_route_report_as_audit_evidence(manifest,monkeypatch):
    from prototypes.graphhopper11.index_inventory_audit import audit_index_inventory
    monkeypatch.setattr(LocalJavaBridge,'_execute',lambda *args:{'engine_version':'11.1',
        'all_available_graph_checks_passed':True,'cases':[{'status':'PASS_AVAILABLE_GRAPH_CHECKS'}]})
    with pytest.raises(Refused,match='index_inventory_envelope'):
        audit_index_inventory(manifest)


@pytest.mark.parametrize('fault,status',[
    ('normal','MATCHED_FINITE_PROBES'),('duplicate','MATCHED_FINITE_PROBES'),
    ('spatial_empty','MISMATCH_OBSERVED'),('empty','MISMATCH_OBSERVED'),
    ('throw','UNVERIFIED'),('invalid','UNVERIFIED'),('flood','UNVERIFIED'),('tiles','UNVERIFIED'),
])
def test_geometry_probes_detect_spatial_misses_without_granting_coverage(origin_index_probe,fault,status):
    from prototypes.graphhopper11.index_geometry_audit import validate_geometry
    row=origin_index_probe([dict(geometry=True,fault=fault)])['observations'][0]['geometry']
    assert validate_geometry(row,10000,128) == row
    assert row['status'] == status
    assert row['index_geometry_coverage'] == row['construction_lineage'] == 'UNVERIFIED'
    assert row['physical_road_verification'] == row['heading_verification'] == 'UNVERIFIED'
    assert row['navigation_allowed'] is row['route_absence_proven'] is False
    assert row['samples_selected'] > 0
    if status=='MISMATCH_OBSERVED':
        assert any(sample['missing_count'] > 0 for sample in row['samples'])
    if status=='UNVERIFIED':
        assert all(sample['match'] is sample['missing_count'] is None for sample in row['samples'])


@pytest.mark.parametrize('limits,reason',[
    ({'sample_limit':1},'sample_budget'),({'edge_limit':1},'edge_budget'),
])
def test_geometry_probe_selection_limits_never_claim_complete_comparison(origin_index_probe,limits,reason):
    from prototypes.graphhopper11.index_geometry_audit import validate_geometry
    row=origin_index_probe([dict(geometry=True,**limits)])['observations'][0]['geometry']
    assert validate_geometry(row,limits.get('edge_limit',10000),limits.get('sample_limit',128)) == row
    assert row['reason']==reason and row['status']=='UNVERIFIED'
    assert row['selection_complete'] is row['comparisons_complete'] is False


@pytest.fixture(scope='module')
def geometry_evidence(manifest):
    from prototypes.graphhopper11.index_geometry_audit import audit_index_geometry
    return audit_index_geometry(manifest)


def test_geometry_audit_binds_finite_observations_without_exposing_points(manifest,geometry_evidence):
    from prototypes.graphhopper11.isolated_app import version
    report=geometry_evidence
    assert report['observation']['status']=='MATCHED_FINITE_PROBES'
    assert report['artifact_check']=='matched_manifest_before_and_after'
    assert report['manifest_identity']==version(manifest)
    assert report['bindings']['graph_version']==manifest['graph_version']
    assert report['bindings']['source_version']==manifest['source_version']
    assert report['bindings']['config_sha256']==manifest['hashes']['config']
    unsigned=dict(report);identity=unsigned.pop('evidence_identity')
    assert version(unsigned)==identity
    text=json.dumps(report)
    for path in manifest['paths'].values():
        assert str(path) not in text
    for sample in report['observation']['samples']:
        assert not {'point','lat','lon','candidate_edge_keys'} & set(sample)
    assert report['navigation_allowed'] is False and report['production_migration']=='NO_GO'


@pytest.mark.parametrize('change',[
    {'index_geometry_coverage':'VERIFIED'},{'construction_lineage':'VERIFIED'},{'navigation_allowed':True},
    {'samples_selected':False},{'comparisons_complete':False},{'reason':[]},{'extra':0},
])
def test_geometry_audit_rejects_promoted_or_inconsistent_reports(geometry_evidence,change):
    from prototypes.graphhopper11.index_geometry_audit import validate_geometry
    with pytest.raises(Refused,match='index_geometry_contract'):
        validate_geometry(dict(geometry_evidence['observation'],**change),10000,128)


@pytest.mark.parametrize('change',[
    {'missing_count':1},{'match':False},{'ordinal':True},{'comparison_complete':False},
    {'full_candidate_count':True},{'index_candidate_count':257},{'extra':0},
    {'full_scan_reason':'time_budget'},{'index_query_reason':'index_query_failure'},{'full_scan_complete':False},
])
def test_geometry_audit_rejects_inconsistent_sample_rows(geometry_evidence,change):
    from prototypes.graphhopper11.index_geometry_audit import validate_geometry
    row=copy.deepcopy(geometry_evidence['observation']);row['samples'][0].update(change)
    with pytest.raises(Refused,match='index_geometry_contract'):
        validate_geometry(row,10000,128)


@pytest.mark.parametrize('limits',[
    {'edge_limit':True},{'edge_limit':0},{'edge_limit':10001},
    {'sample_limit':False},{'sample_limit':0},{'sample_limit':129},{'sample_limit':1.5},
])
def test_geometry_invalid_limits_refuse_before_manifest_access(monkeypatch,limits):
    from prototypes.graphhopper11 import index_geometry_audit as audit
    monkeypatch.setattr(audit,'LocalJavaBridge',lambda *args,**kwargs:pytest.fail('Must refuse before file access'))
    with pytest.raises(Refused,match='index_geometry_limit'):
        audit.audit_index_geometry({},**limits)


def test_geometry_audit_cli_has_narrow_success_unknown_and_redacted_refusal(manifest,tmp_path):
    import sys
    path=tmp_path/'manifest.json';path.write_text(json.dumps(manifest))
    cmd=[sys.executable,'-m','prototypes.graphhopper11.index_geometry_audit','--manifest',str(path)]
    matched=subprocess.run(cmd,capture_output=True,text=True,timeout=60)
    assert matched.returncode==0, matched.stderr[-2000:]
    assert json.loads(matched.stdout)['observation']['status']=='MATCHED_FINITE_PROBES'
    partial=subprocess.run(cmd+['--sample-limit','1'],capture_output=True,text=True,timeout=60)
    assert partial.returncode==2 and json.loads(partial.stdout)['observation']['status']=='UNVERIFIED'
    path.write_text('{}')
    refused=subprocess.run(cmd,capture_output=True,text=True,timeout=60)
    assert refused.returncode==1 and json.loads(refused.stdout)['reason']=='index_geometry_audit_refused'
    assert str(tmp_path) not in matched.stdout+partial.stdout+refused.stdout


def test_geometry_audit_refuses_changed_input_after_native_work(manifest,geometry_evidence,monkeypatch):
    from prototypes.graphhopper11.index_geometry_audit import audit_index_geometry
    path=Path(manifest['paths']['config']);original=path.read_bytes()
    def changed(*args):
        path.write_bytes(original+b'\n# synthetic mutation\n')
        return {'engine_version':'11.1','java_runtime':geometry_evidence['java_runtime'],'audit_only':True,
                'index_geometry_observation':geometry_evidence['observation'],'navigation_allowed':False,'production_migration':'NO_GO'}
    monkeypatch.setattr(LocalJavaBridge,'_execute',changed)
    try:
        with pytest.raises(Refused,match='input_changed'):
            audit_index_geometry(manifest)
    finally:
        path.write_bytes(original)


def test_geometry_audit_rejects_inventory_report_instead_of_geometry(manifest,monkeypatch):
    from prototypes.graphhopper11.index_geometry_audit import audit_index_geometry
    monkeypatch.setattr(LocalJavaBridge,'_execute',lambda *args:{'audit_only':True,'index_inventory_observation':{}})
    with pytest.raises(Refused,match='index_geometry_envelope'):
        audit_index_geometry(manifest)


@pytest.mark.parametrize('extra',[
    {'associations':[]},{'audit_index_inventory':{'edge_limit':10000}},
    {'cases':[{'id':'unregistered','points':[[0,0],[0,.02]]}]},
    {'audit_index_geometry':{'edge_limit':10000,'sample_limit':128,'coverage':'complete'}},
])
def test_native_geometry_audit_cannot_mix_with_routing_or_inventory(manifest,tmp_path,extra):
    bridge=LocalJavaBridge(manifest)
    request=tmp_path/'audit.json'
    request.write_text(json.dumps(dict({'cases':[],'audit_index_geometry':{'edge_limit':10000,'sample_limit':128}},**extra)))
    with pytest.raises(Refused):
        bridge._execute(request,str(tmp_path))


def test_geometry_auditor_source_change_refuses_evidence(manifest,geometry_evidence,monkeypatch):
    from prototypes.graphhopper11 import index_geometry_audit as audit
    actual_digest=audit.digest;calls=[]
    def changed(path):
        calls.append(True)
        return actual_digest(path) if len(calls)==1 else '0'*64
    monkeypatch.setattr(audit,'digest',changed)
    monkeypatch.setattr(LocalJavaBridge,'_execute',lambda *args:{'engine_version':'11.1','java_runtime':geometry_evidence['java_runtime'],
        'audit_only':True,'index_geometry_observation':geometry_evidence['observation'],'navigation_allowed':False,'production_migration':'NO_GO'})
    with pytest.raises(Refused,match='index_geometry_binding_changed'):
        audit.audit_index_geometry(manifest)


def test_geometry_stale_graph_manifest_refuses_before_java(manifest,monkeypatch):
    from prototypes.graphhopper11.index_geometry_audit import audit_index_geometry
    changed=copy.deepcopy(manifest);changed['graph_version']='0'*64
    monkeypatch.setattr(LocalJavaBridge,'_execute',lambda *args:pytest.fail('Stale manifest must refuse before native work'))
    with pytest.raises(Refused,match='graph_changed'):
        audit_index_geometry(changed)


def test_segment_grid_strategy_covers_crossings_and_cell_intervals_with_bounded_metadata(origin_index_probe):
    from prototypes.graphhopper11.index_geometry_audit import validate_geometry
    rows=origin_index_probe([dict(geometry=True,fault=fault) for fault in ('normal','duplicate')])['observations']
    normal,duplicate=[row['geometry'] for row in rows]
    assert validate_geometry(normal,10000,128)==normal
    assert normal==duplicate
    assert normal['status']=='MATCHED_FINITE_PROBES' and normal['selection_complete'] is True
    assert normal['probe_strategy']=='segment_tile_intersections_v1'
    assert normal['grid_parts']>=2 and normal['grid_resolution_m']==300
    assert normal['segments_seen']>0 and normal['grid_crossing_probes']>0
    assert normal['endpoint_probes']==2*normal['segments_seen']
    assert normal['original_midpoint_probes']==normal['segments_seen']
    assert normal['cell_interval_probes']==normal['grid_crossing_probes']+normal['segments_seen']
    assert sum(normal[k] for k in ('endpoint_probes','original_midpoint_probes','grid_crossing_probes','cell_interval_probes'))==normal['samples_selected']<=128
    assert normal['index_geometry_coverage']=='UNVERIFIED' and normal['navigation_allowed'] is False


def test_segment_cell_hole_evades_inventory_and_old_probes_but_is_observed_by_new_strategy(origin_index_probe):
    from prototypes.graphhopper11.index_geometry_audit import validate_geometry
    # Main road vertices and the former adjacent-vertex midpoints all look healthy.
    legacy=origin_index_probe([dict(point=[0,lon],fault='cell_hole') for lon in (0,.005,.01,.015,.02)])['observations']
    assert all(row['full']['scan_complete'] and row['indexed']['index_query_complete'] for row in legacy)
    assert all(row['full']['candidate_edge_keys']==row['indexed']['candidate_edge_keys'] for row in legacy)
    inventory,geometry=origin_index_probe([dict(inventory=True,fault='cell_hole'),dict(geometry=True,fault='cell_hole')])['observations']
    assert inventory['inventory']['inventory_status']=='MATCHED_EDGE_INVENTORY'
    row=geometry['geometry']
    assert validate_geometry(row,10000,128)==row
    assert row['status']=='MISMATCH_OBSERVED' and row['comparisons_complete'] is True
    assert any(sample['missing_count']>0 for sample in row['samples'])
    assert row['cell_interval_probes']>0 and row['index_geometry_coverage']=='UNVERIFIED'
    assert row['navigation_allowed'] is row['route_absence_proven'] is False


def test_invalid_loaded_grid_metadata_remains_unknown_without_spatial_queries(origin_index_probe):
    from prototypes.graphhopper11.index_geometry_audit import validate_geometry
    row=origin_index_probe([dict(geometry=True,fault='bad_grid')])['observations'][0]['geometry']
    assert validate_geometry(row,10000,128)==row
    assert row['reason']=='unsupported_index_grid' and row['status']=='UNVERIFIED'
    assert row['samples_selected']==len(row['samples'])==0
    assert row['selection_complete'] is row['comparisons_complete'] is False
    assert row['navigation_allowed'] is False


@pytest.mark.parametrize('change',[
    {'probe_strategy':'complete_coverage'},{'grid_parts':True},{'grid_parts':2**30},
    {'grid_resolution_m':0},{'segments_seen':0},{'grid_crossing_probes':128},
    {'cell_interval_probes':0},{'endpoint_probes':False},
])
def test_segment_grid_metadata_cannot_be_promoted_or_contradict_probe_counts(geometry_evidence,change):
    from prototypes.graphhopper11.index_geometry_audit import validate_geometry
    with pytest.raises(Refused,match='index_geometry_contract'):
        validate_geometry(dict(geometry_evidence['observation'],**change),10000,128)


def test_segment_grid_cut_math_keeps_corner_reverse_aligned_and_near_corner_intervals(origin_index_probe):
    cases=[{'cuts':axes} for axes in (
        [[0,2],[0,2]],  # Same exact corner from both axes.
        [[2,0],[2,0]],  # Reverse traversal visits the same cut.
        [[1,1],[0,2]],  # Segment aligned with a grid line.
        [[0,2],[0,1.9999999999999996]],  # Two distinct cuts extremely near a corner.
        [[0,0],[0,0]],  # Zero-length segment has no internal crossing.
    )]
    rows=origin_index_probe(cases)['observations']
    assert [row['cuts'] for row in rows[:3]]==[[0,.5,1]]*3
    assert rows[3]['cuts']==[0,.5,.5000000000000001,1]
    assert rows[4]['cuts']==[0,1]

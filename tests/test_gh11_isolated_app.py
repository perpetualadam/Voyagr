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


@pytest.mark.parametrize("fault", ["unsafe_third", "trace_gap", "missing_blocks", "instructions", "metrics"])
def test_independent_transport_validation_rejects_corrupted_result(app, fault):
    bridge = app.extensions["gh11_bridge"]
    case = dict(bridge.cases["detour"], alternatives=True)
    candidates = []
    for key in (2, 4, 6):
        candidates.append({"geometry": {"type": "LineString", "coordinates": [[0, 0], [.02, 0]]},
                           "edge_intervals": [[0, 1, key]], "directed_edge_keys": [key], "directed_edges": 1,
                           "distance_km": 1, "duration_minutes": 1, "instructions": 1,
                           "instruction_details": [{"name": "Road", "sign": 0, "distance_m": 1000, "time_ms": 60000}]})
    report = {"engine_version": "11.1", "all_available_graph_checks_passed": True,
              "associations": [{"id": name, "status": "PASS_AVAILABLE_GRAPH_CHECKS",
                                "candidates": [{"directed_edge_keys": [key]}]}
                               for name, key in (("main", 98), ("upper", 100))],
              "cases": [{"id": "detour", "status": "PASS_AVAILABLE_GRAPH_CHECKS",
                         "blocked_edge_keys": [98, 99], "candidates": candidates}]}
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

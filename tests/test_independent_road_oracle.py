"""Synthetic topology only. No real-road, graph or recorded GH acceptance."""

import copy
import json
import subprocess
import sys

import pytest
from voyagr.utils.road_oracle import (
    RoadOracle,
    canonical,
    decode,
    diagnostic,
    digest,
    bind_capture,
)
from tests.test_phase12fb_acceptance import bundle


def export(way_tags=None, node_tags=None, relations=()):
    return {
        "elements": [
            {
                "type": "node",
                "id": i,
                "lat": 0.0,
                "lon": (i - 1) * 0.001,
                "tags": (node_tags or {}).get(i, {}),
            }
            for i in range(1, 5)
        ]
        + [
            {
                "type": "way",
                "id": 10,
                "nodes": [1, 2, 3],
                "tags": {"highway": "residential", **(way_tags or {})},
            },
            {
                "type": "way",
                "id": 20,
                "nodes": [3, 4],
                "tags": {"highway": "residential"},
            },
        ]
        + list(relations)
    }


def endpoint(way=10, segment=0, fraction=0.5):
    nodes = [1 + segment, 2 + segment] if way == 10 else [3, 4]
    return {
        "way": way,
        "segment": segment,
        "nodes": nodes,
        "coordinate": [0.0, (nodes[0] - 1 + fraction) * 0.001],
    }


def analyse(data=None, origin=None, target=None, candidate=None, **kw):
    return RoadOracle(canonical(data or export())).analyse(
        origin or endpoint(), target or endpoint(20), candidate, **kw
    )


def relation(kind="no_right_turn", via=3, from_way=10, to_way=20, **tag):
    return {
        "type": "relation",
        "id": 100,
        "tags": {"type": "restriction", "restriction": kind, **tag},
        "members": [
            {"type": "way", "ref": from_way, "role": "from"},
            {"type": "node", "ref": via, "role": "via"},
            {"type": "way", "ref": to_way, "role": "to"},
        ],
    }


def test_projected_start_and_exact_candidate():
    out = analyse(candidate=[[10, 0, 1], [10, 1, 1], [20, 0, 1]])
    assert out["candidate"] == out["connectivity"] == "KNOWN_PATH_IN_EXPORT"
    assert out["navigation_authorized"] is False
    assert out["reviewed"] is False
    assert out["acceptance"] == "UNVERIFIED"
    assert out["production"] == "PRODUCTION_NO_GO"


@pytest.mark.parametrize(
    "candidate",
    [[], [[10, 1, 1], [20, 0, 1]], [[20, 0, 1]], [[10, 0, -1]], [[10, 0, 1]]],
)
def test_downstream_or_disconnected_or_truncated_candidate_invalid(candidate):
    assert analyse(candidate=candidate)["candidate"] == "INVALID"


@pytest.mark.parametrize(
    "tags,reverse",
    [
        ({"oneway": "yes"}, False),
        ({"oneway": "-1"}, True),
        ({"highway": "motorway"}, False),
        ({"junction": "roundabout"}, False),
    ],
)
def test_direction(tags, reverse):
    o, t = endpoint(fraction=0.2), endpoint(fraction=0.8)
    if reverse:
        o, t = t, o
    data = export(tags)
    assert analyse(data, o, t)["connectivity"] == "KNOWN_PATH_IN_EXPORT"
    assert analyse(data, t, o)["connectivity"] == "UNVERIFIED"


@pytest.mark.parametrize(
    "tags",
    [
        {"oneway": "reversible"},
        {"highway": "motorway_link"},
        {"access": "destination"},
        {"access:conditional": "no @ (Mo-Fr)"},
        {"motorcar": "no", "motorcar:conditional": "yes @ (Su)"},
        {"highway": "construction"},
    ],
)
def test_uncertain_access(tags):
    out = analyse(export(tags))
    assert out["connectivity"] == "UNVERIFIED"
    assert out["potential_path"] is True


@pytest.mark.parametrize(
    "tags", [{"access": "no"}, {"motorcar": "private"}, {"motorcar:forward": "no"}]
)
def test_prohibited_access(tags):
    out = analyse(export(tags))
    assert out["potential_path"] is False
    assert out["closed_component"] == "UNVERIFIED"


def test_access_precedence():
    assert (
        analyse(export({"access": "no", "motorcar": "yes"}))["connectivity"]
        == "KNOWN_PATH_IN_EXPORT"
    )


@pytest.mark.parametrize(
    "tag",
    [
        {"barrier": "gate"},
        {"barrier": "bollard", "motorcar": "yes"},
        {"access:conditional": "no @ (Mo-Fr)"},
    ],
)
def test_barriers_and_conditionals(tag):
    out = analyse(export(node_tags={3: tag}))
    assert out["connectivity"] == "UNVERIFIED"
    assert out["potential_path"] is True


def test_node_access_no_blocks():
    assert analyse(export(node_tags={3: {"motorcar": "no"}}))["potential_path"] is False


def test_via_node_restriction_at_target_junction():
    data = export(relations=[relation()])
    assert analyse(data)["potential_path"] is False
    assert (
        analyse(data, target=endpoint(20, fraction=0))["connectivity"]
        == "KNOWN_PATH_IN_EXPORT"
    )
    assert (
        analyse(data, origin=endpoint(segment=1, fraction=1))["connectivity"]
        == "KNOWN_PATH_IN_EXPORT"
    )


def test_only_turn_and_conflicting_no_turn():
    data = export(relations=[relation("only_right_turn")])
    assert analyse(data)["connectivity"] == "KNOWN_PATH_IN_EXPORT"
    r = relation()
    r["id"] = 101
    data["elements"].append(r)
    assert analyse(data)["potential_path"] is False


@pytest.mark.parametrize("change", ["via_way", "missing_way", "conditional", "except"])
def test_unresolved_restriction(change):
    r = relation()
    if change == "via_way":
        r["members"][1]["type"] = "way"
    if change == "missing_way":
        r["members"][2]["ref"] = 999
    if change == "conditional":
        r["tags"]["restriction:conditional"] = "no_right_turn @ (Mo-Fr)"
    if change == "except":
        r["tags"]["except"] = "bus"
    out = analyse(export(relations=[r]))
    assert out["unresolved_restrictions"] is True
    assert out["connectivity"] == "UNVERIFIED"


def test_coverage_gap_and_bounded_search():
    data = export()
    data["elements"][4]["nodes"].append(999)
    assert analyse(data)["coverage_gap"] is True
    assert analyse(max_states=1)["search_exhausted"] is True


@pytest.mark.parametrize("fraction", [0, 1, 0.5])
def test_identical_endpoints(fraction):
    assert (
        analyse(
            origin=endpoint(fraction=fraction),
            target=endpoint(fraction=fraction),
            candidate=[],
        )["candidate"]
        == "KNOWN_PATH_IN_EXPORT"
    )


def test_metric_projection_and_order():
    oracle = RoadOracle(canonical(export()))
    p, distance = oracle.project(endpoint())
    assert p[2] == pytest.approx(0.5, abs=1e-7)
    assert distance < 0.001
    wrong = endpoint()
    wrong["nodes"].reverse()
    with pytest.raises(ValueError):
        oracle.project(wrong)
    wrong = endpoint()
    wrong["coordinate"] = [1, 1]
    with pytest.raises(ValueError):
        oracle.project(wrong)


@pytest.mark.parametrize(
    "raw",
    [
        b'{"elements":[],"elements":[]}',
        b'{"x":NaN}',
        b"{}",
        b"[]",
        b"{",
        b'{"elements":[null]}',
    ],
)
def test_malformed(raw):
    with pytest.raises((ValueError, TypeError)):
        RoadOracle(raw)


@pytest.mark.parametrize(
    "change", ["duplicate", "bool_id", "missing_coord", "bad_tags", "short_way"]
)
def test_malformed_elements(change):
    data = export()
    if change == "duplicate":
        data["elements"].append(data["elements"][0])
    if change == "bool_id":
        data["elements"][0]["id"] = True
    if change == "missing_coord":
        del data["elements"][0]["lat"]
    if change == "bad_tags":
        data["elements"][0]["tags"] = {"barrier": 3}
    if change == "short_way":
        data["elements"][4]["nodes"] = [1]
    with pytest.raises(ValueError):
        RoadOracle(canonical(data))


def bound_inputs():
    value = bundle()
    raw = canonical(value)
    osm = canonical(export())
    f = value["fixtures"][0]
    receipt = {
        "schema_version": 1,
        "reviewed": True,
        "fixture_id": 0,
        "export_sha256": digest(osm),
        "capture_sha256": digest(raw),
        **{
            k: value["engine"][k]
            for k in (
                "road_source_sha256",
                "graph_sha256",
                "import_receipt_sha256",
                "engine_build_sha256",
                "dataset_sha256",
            )
        },
        **{k: f[k] for k in ("request_sha256", "response_sha256")},
    }
    return osm, raw, receipt


@pytest.mark.parametrize(
    "key",
    [
        "export_sha256",
        "capture_sha256",
        "road_source_sha256",
        "graph_sha256",
        "import_receipt_sha256",
        "engine_build_sha256",
        "dataset_sha256",
        "request_sha256",
        "response_sha256",
    ],
)
def test_conflicting_provenance(key):
    osm, raw, receipt = bound_inputs()
    receipt[key] = "f" * 64
    with pytest.raises(ValueError, match="conflicting_provenance"):
        bind_capture(osm, raw, canonical(receipt), 0)


def test_binding_does_not_require_or_create_accepted_oracle():
    osm, raw, receipt = bound_inputs()
    value = decode(raw)
    del value["engine"]["oracle_sha256"]
    raw = canonical(value)
    receipt["capture_sha256"] = digest(raw)
    before = copy.deepcopy(value)
    origin, target, binding = bind_capture(osm, raw, canonical(receipt), 0)
    assert len(origin) == len(target) == 2
    assert "oracle_sha256" not in binding
    assert decode(raw) == before
    from voyagr.utils.origin_replay import validate_bundle

    with pytest.raises(ValueError, match="provenance_required"):
        validate_bundle(value)


def test_capture_endpoint_cannot_be_substituted():
    osm, raw, receipt = bound_inputs()
    with pytest.raises(ValueError, match="capture_endpoint_binding"):
        diagnostic(
            osm,
            raw,
            canonical(receipt),
            canonical({"fixture_id": 0, "origin": endpoint(), "target": endpoint(20)}),
        )


def test_cli_failure_sanitized(tmp_path):
    path = tmp_path / "private-coordinate-SECRET.json"
    path.write_text("{SECRET")
    result = subprocess.run(
        [
            sys.executable,
            "scripts/diagnose-phase12fb-road-oracle.py",
            *[
                arg
                for flag in ("export", "capture", "receipt", "specification")
                for arg in ("--" + flag, str(path))
            ],
        ],
        capture_output=True,
        text=True,
    )
    assert result.returncode == 2
    assert "SECRET" not in result.stdout + result.stderr
    assert json.loads(result.stdout)["navigation_authorized"] is False


def matching_inputs():
    osm, raw, receipt = bound_inputs()
    value = decode(raw)
    f = value["fixtures"][0]
    f["request"]["points"] = [[0.0005, 0], [0.003, 0]]
    f["response"]["paths"][0]["snapped_waypoints"] = {
        "type": "LineString",
        "coordinates": [[0.0025, 0], [0.003, 0]],
    }
    for key in ("request", "response"):
        f[key + "_sha256"] = digest(canonical(f[key]))
        f["transport"][key + "_sha256"] = f[key + "_sha256"]
        receipt[key + "_sha256"] = f[key + "_sha256"]
    f["transport_sha256"] = digest(canonical(f["transport"]))
    raw = canonical(value)
    receipt["capture_sha256"] = digest(raw)
    spec = {
        "fixture_id": 0,
        "origin": endpoint(),
        "target": endpoint(20),
        "candidate": [[10, 0, 1], [10, 1, 1], [20, 0, 1]],
    }
    return osm, raw, canonical(receipt), canonical(spec)


def test_diagnostic_success_is_sanitized_and_never_acceptance(tmp_path):
    inputs = matching_inputs()
    report = diagnostic(*inputs)
    assert report["candidate"] == "KNOWN_PATH_IN_EXPORT"
    assert report["acceptance"] == "UNVERIFIED"
    assert "oracle_sha256" not in report["provenance"]
    args = []
    for flag, raw in zip(("export", "capture", "receipt", "specification"), inputs):
        path = tmp_path / (flag + ".json")
        path.write_bytes(raw)
        args.extend(["--" + flag, str(path)])
    result = subprocess.run(
        [sys.executable, "scripts/diagnose-phase12fb-road-oracle.py", *args],
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0
    assert json.loads(result.stdout) == report
    assert "PRODUCTION_NO_GO" in result.stderr
    assert "coordinate" not in result.stdout
    assert "LineString" not in result.stdout
    assert str(tmp_path) not in result.stdout + result.stderr


def test_conditional_oneway_opposite_is_only_possible():
    out = analyse(
        export({"oneway": "yes", "oneway:conditional": "no @ (Su)"}),
        endpoint(fraction=0.8),
        endpoint(fraction=0.2),
    )
    assert out["connectivity"] == "UNVERIFIED"
    assert out["potential_path"] is True


def test_unknown_restriction_is_unresolved():
    out = analyse(export(relations=[relation("no_magic_turn")]))
    assert out["unresolved_restrictions"] is True
    assert out["connectivity"] == "UNVERIFIED"


@pytest.mark.parametrize("field", ["motorcar:forward", "maxheight"])
def test_ambiguous_node_rules(field):
    assert (
        analyse(export(node_tags={3: {field: "unknown"}}))["connectivity"]
        == "UNVERIFIED"
    )


def test_missing_endpoint_segment_refused():
    data = export()
    data["elements"][4]["nodes"][0] = 999
    with pytest.raises(ValueError, match="ordered_segment_binding"):
        analyse(data)


def test_duplicate_fixture_refused():
    osm, raw, receipt = bound_inputs()
    value = decode(raw)
    value["fixtures"].append(copy.deepcopy(value["fixtures"][0]))
    raw = canonical(value)
    receipt["capture_sha256"] = digest(raw)
    with pytest.raises(ValueError, match="unique_fixture_required"):
        bind_capture(osm, raw, canonical(receipt), 0)


def test_diagnostic_receipt_must_be_reviewed():
    osm, raw, receipt = bound_inputs()
    receipt["reviewed"] = False
    with pytest.raises(ValueError, match="reviewed_binding_required"):
        bind_capture(osm, raw, canonical(receipt), 0)


def test_replay_cli_cannot_use_diagnostic_to_replace_accepted_oracle(tmp_path):
    osm, raw, receipt, spec = matching_inputs()
    value = decode(raw)
    del value["engine"]["oracle_sha256"]
    path = tmp_path / "bundle.json"
    path.write_bytes(canonical(value))
    result = subprocess.run(
        [
            sys.executable,
            "scripts/replay-phase12fb-origin.py",
            "--bundle",
            str(path),
            "--oracle-export",
            str(path),
            "--oracle-receipt",
            str(path),
            "--oracle-specification",
            str(path),
        ],
        capture_output=True,
        text=True,
    )
    assert result.returncode == 2
    assert json.loads(result.stdout)["status"] == "REFUSED_OR_UNAVAILABLE"
    assert "independent_road_diagnostic" not in result.stdout


def test_same_way_uturn_retains_incoming_segment():
    data = export(relations=[relation("no_u_turn", via=2, to_way=10)])
    out = analyse(
        data,
        endpoint(fraction=0.5),
        endpoint(fraction=0.25),
        [[10, 0, 1], [10, 0, -1], [10, 0, -1]],
    )
    assert out["candidate"] == "INVALID"
    out = analyse(
        export(),
        endpoint(fraction=0.5),
        endpoint(fraction=0.25),
        [[10, 0, 1], [10, 0, -1], [10, 0, -1]],
    )
    assert out["candidate"] == "KNOWN_PATH_IN_EXPORT"


def test_only_uturn_does_not_allow_forward_continuation():
    data = export(relations=[relation("only_u_turn", via=2, to_way=10)])
    assert (
        analyse(data, candidate=[[10, 0, 1], [10, 1, 1], [20, 0, 1]])["candidate"]
        == "INVALID"
    )


def test_diagnostic_works_with_network_and_database_blocked():
    from voyagr.utils.origin_replay import offline_guard

    with offline_guard():
        out = diagnostic(*matching_inputs())
    assert out["connectivity"] == "KNOWN_PATH_IN_EXPORT"


@pytest.mark.parametrize(
    "key", ["oneway:vehicle", "oneway:motor_vehicle", "oneway:motorcar"]
)
def test_vehicle_specific_direction_and_car_override(key):
    data = export({key: "yes"})
    assert (
        analyse(data, endpoint(fraction=0.8), endpoint(fraction=0.2))["potential_path"]
        is False
    )
    data = export({key: "yes", "oneway:motorcar": "no"})
    assert (
        analyse(data, endpoint(fraction=0.8), endpoint(fraction=0.2))["connectivity"]
        == "KNOWN_PATH_IN_EXPORT"
    )


@pytest.mark.parametrize(
    "tag", [{"barrier": "gate"}, {"highway": "construction", "motorcar": "yes"}]
)
def test_way_physical_evidence_stays_uncertain(tag):
    out = analyse(export(tag))
    assert out["connectivity"] == "UNVERIFIED"
    assert out["potential_path"] is True

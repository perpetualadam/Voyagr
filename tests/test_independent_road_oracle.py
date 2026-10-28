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


@pytest.mark.parametrize(
    "tag,category",
    [
        ({"motorcar": "destination"}, "uncertain_access"),
        ({"barrier": "gate"}, "barrier"),
        ({"oneway": "reversible"}, "direction"),
        ({"access:conditional": "yes @ (Su)"}, "conditional_rules"),
        ({"maxheight": "2"}, "physical_rules"),
    ],
)
def test_representative_path_uncertainty_categories(tag, category):
    out = analyse(export(tag))
    d = out["uncertainty_diagnostics"]
    assert out["connectivity"] == "UNVERIFIED"
    assert out["potential_path"] is True
    path = d["representative_potential_path"]
    assert path["available"] is True
    assert path["uncertainty"][category] > 0
    assert d["searches"]["potential"]["uncertainty"][category] > 0
    assert path["global_unresolved_restriction_guard"] is False


def test_unrelated_uncertainty_is_separate_from_representative_path():
    data = export()
    data["elements"].extend(
        [
            {
                "type": "node",
                "id": 800001,
                "lat": 1.0,
                "lon": 1.0,
                "tags": {"barrier": "PRIVATE_SENTINEL"},
            },
            {"type": "node", "id": 800002, "lat": 1.0, "lon": 1.001},
            {
                "type": "way",
                "id": 800003,
                "nodes": [800001, 800002],
                "tags": {"highway": "residential", "oneway": "PRIVATE_SENTINEL"},
            },
        ]
    )
    out = analyse(data)
    d = out["uncertainty_diagnostics"]
    assert out["connectivity"] == "KNOWN_PATH_IN_EXPORT"
    assert d["export"]["directed_edges"]["direction"] == 2
    assert d["outside_representative_path"]["directed_edges"]["direction"] == 2
    assert d["outside_representative_path"]["departure_nodes"]["barrier"] == 1
    assert all(
        v == 0 for v in d["representative_potential_path"]["uncertainty"].values()
    )
    encoded = json.dumps(d)
    assert all(
        secret not in encoded
        for secret in (
            "800001",
            "800002",
            "800003",
            "PRIVATE_SENTINEL",
            "coordinate",
            "geometry",
        )
    )
    assert len(encoded) < 5000


def test_global_restriction_guard_is_not_reported_as_local_turn_evidence():
    r = relation(**{"except": "bus"})
    r["members"][1]["ref"] = 4
    out = analyse(export(relations=[r]))
    d = out["uncertainty_diagnostics"]
    path = d["representative_potential_path"]
    assert out["connectivity"] == "UNVERIFIED"
    assert out["potential_path"] is True
    assert path["global_unresolved_restriction_guard"] is True
    assert path["restrictions_at_path_via_nodes"] == 0
    assert path["restrictions_not_at_path_via_nodes"] == 1
    assert path["locality_is_relevance_proof"] is False
    assert d["export"]["vehicle_exceptions"] == 1
    assert d["searches"]["known"]["global_restriction_guard_transitions"] > 0


def test_incomplete_unknown_and_conditional_restriction_counts():
    r = relation()
    r["members"][1]["ref"] = 999999
    conditional = relation(**{"restriction:conditional": "no_right_turn @ (Su)"})
    conditional["id"] = 101
    out = analyse(export(relations=[r, conditional]))
    d = out["uncertainty_diagnostics"]
    path = d["representative_potential_path"]
    assert d["export"]["unresolved_restrictions"] == 2
    assert d["export"]["incomplete_member_evidence"] == 1
    assert d["export"]["conditional_restrictions"] == 1
    assert path["restrictions_at_path_via_nodes"] == 1
    assert path["restrictions_with_unknown_via_locality"] == 1


def test_representative_path_absent_and_search_limit_explained():
    out = analyse(max_states=1)
    d = out["uncertainty_diagnostics"]
    assert out["potential_path"] is None
    assert d["searches"]["potential"]["limit"] == "STATES"
    assert d["searches"]["potential"]["states_discovered"] == 1
    assert d["representative_potential_path"]["available"] is False
    assert d["representative_potential_path"]["uncertainty"] is None
    assert d["outside_representative_path"]["directed_edges"] is None
    blocked = analyse(export({"motorcar": "no"}))
    assert blocked["potential_path"] is False
    assert (
        blocked["uncertainty_diagnostics"]["searches"]["potential"]["limit"] == "NONE"
    )


def test_zero_transition_path_is_reconstructed_without_invented_uncertainty():
    out = analyse(origin=endpoint(), target=endpoint())
    path = out["uncertainty_diagnostics"]["representative_potential_path"]
    assert path["available"] is True
    assert path["transitions"] == 0
    assert all(value == 0 for value in path["uncertainty"].values())
    assert out["navigation_authorized"] is False


@pytest.mark.parametrize(
    "tag",
    [
        {},
        {"oneway": "yes"},
        {"motorcar": "no"},
        {"barrier": "gate"},
        {"oneway": "reversible"},
    ],
)
def test_reporting_metadata_cannot_change_any_existing_decision(tag):
    oracle = RoadOracle(canonical(export(tag)))
    args = (endpoint(), endpoint(20), [[10, 0, 1], [10, 1, 1], [20, 0, 1]])
    before = oracle.analyse(*args)
    # Deliberately corrupt reporting-only labels: never feed them into decisions.
    oracle.edge_reasons = {
        key: frozenset({"barrier", "direction"}) for key in oracle.edge_reasons
    }
    after = oracle.analyse(*args)
    assert {k: v for k, v in before.items() if k != "uncertainty_diagnostics"} == {
        k: v for k, v in after.items() if k != "uncertainty_diagnostics"
    }
    assert after["reviewed"] is False
    assert after["navigation_authorized"] is False
    assert after["production"] == "PRODUCTION_NO_GO"
    assert after["acceptance"] == "UNVERIFIED"


def test_representative_node_barrier_and_conditional_are_reported():
    out = analyse(
        export(node_tags={3: {"barrier": "gate", "access:conditional": "no @ (Su)"}})
    )
    reasons = out["uncertainty_diagnostics"]["representative_potential_path"][
        "uncertainty"
    ]
    assert reasons["barrier"] == reasons["conditional_rules"] == 1


def test_dense_search_examination_limit_is_reported_without_no_path_claim():
    data = export()
    data["elements"] = [e for e in data["elements"] if e["id"] != 20]
    data["elements"].extend(
        {"type": "node", "id": i, "lat": 0.0, "lon": (i - 1) * 0.001}
        for i in range(5, 13)
    )
    data["elements"].extend(
        [
            {"type": "node", "id": 100, "lat": 0.0, "lon": 0.02},
            {"type": "node", "id": 101, "lat": 0.0, "lon": 0.021},
            {
                "type": "way",
                "id": 20,
                "nodes": [100, 101],
                "tags": {"highway": "residential"},
            },
        ]
    )
    pairs = [(a, b) for a in range(1, 13) for b in range(a + 1, 13)]
    data["elements"].extend(
        {
            "type": "way",
            "id": 1000 + i,
            "nodes": [a, b],
            "tags": {"highway": "residential"},
        }
        for i, (a, b) in enumerate(pairs)
    )
    target = {"way": 20, "segment": 0, "nodes": [100, 101], "coordinate": [0.0, 0.0205]}
    out = analyse(data, target=target, max_states=180)
    assert (
        out["uncertainty_diagnostics"]["searches"]["potential"]["limit"]
        == "EDGE_EXAMINATIONS"
    )
    assert out["search_exhausted"] is True
    assert out["connectivity"] == "UNVERIFIED"
    assert out["closed_component"] == "UNVERIFIED"


def test_ambiguous_same_way_turn_and_rule_complexity_reported():
    data = export(relations=[relation("no_right_turn", via=2, to_way=10)])
    data["elements"].append(
        {"type": "way", "id": 30, "nodes": [2, 3], "tags": {"highway": "residential"}}
    )
    out = analyse(data)
    assert (
        out["uncertainty_diagnostics"]["representative_potential_path"]["uncertainty"][
            "ambiguous_turn"
        ]
        > 0
    )
    restrictions = []
    for i in range(65):
        r = relation("only_right_turn")
        r["id"] = 100 + i
        restrictions.append(r)
    out = analyse(export(relations=restrictions))
    assert out["connectivity"] == "UNVERIFIED"
    assert (
        out["uncertainty_diagnostics"]["representative_potential_path"]["uncertainty"][
            "restriction_complexity"
        ]
        == 1
    )


def test_representative_path_uses_first_search_result_not_unexamined_alternative():
    # Direct branch is enqueued first; an uncertain detour exists but is not selected.
    data = export()
    data["elements"].append(
        {
            "type": "way",
            "id": 30,
            "nodes": [1, 4],
            "tags": {"highway": "residential", "oneway": "reversible"},
        }
    )
    out = analyse(data)
    d = out["uncertainty_diagnostics"]
    assert out["connectivity"] == "KNOWN_PATH_IN_EXPORT"
    assert d["representative_potential_path"]["available"] is True
    # A potential BFS may select an uncertain shorter alternative even when a known
    # path exists. That is diagnostic evidence only, never a connectivity downgrade.
    assert d["export"]["directed_edges"]["direction"] == 2
    assert out["navigation_authorized"] is False


@pytest.mark.parametrize("tag", [{}, {"oneway": "reversible"}, {"barrier": "gate"}])
def test_diagnostic_path_never_authorizes_displaced_origin_or_changes_ranking(tag):
    from tests.test_phase12f_origin import app_response, r

    diagnostic_report = analyse(export(tag))
    unsafe = r(46.31)
    unsafe["independent_road_diagnostic"] = diagnostic_report
    out = app_response([unsafe, r(0, "Valhalla")]).get_json()
    assert out["routes"][0]["source"] == "Valhalla"
    gh = next(route for route in out["routes"] if route["source"] == "GraphHopper")
    assert gh["avoidance_assessment"]["automatic_selection_allowed"] is False
    assert gh["avoidance_assessment"]["origin_integrity"]["navigation_allowed"] is False
    # Reports likewise cannot demote a genuinely eligible GraphHopper route.
    safe = r(0)
    safe["independent_road_diagnostic"] = diagnostic_report
    out = app_response([r(0, "Valhalla"), safe]).get_json()
    assert out["routes"][0]["source"] == "GraphHopper"

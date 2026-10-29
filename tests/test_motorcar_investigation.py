"""Synthetic policy investigation; never real-road or navigation acceptance."""

import copy
import json
from pathlib import Path
import subprocess
import sys

import pytest
from voyagr.utils.motorcar_investigation import investigate, inspect_alternative
from voyagr.utils.road_oracle import RoadOracle, canonical
from voyagr.utils.road_oracle_private import inspect, write_report
from tests.test_independent_road_oracle import export, endpoint, relation

FOUND = "POTENTIAL_MOTORCAR_PATH_IN_EXPORT"
NONE = "NO_MOTORCAR_PATH_FOUND_IN_EXPORT"


def run(data=None, origin=None, target=None, *, private=False, **kw):
    raw = canonical(data or export())
    spec = canonical({"origin": origin or endpoint(), "target": target or endpoint(20)})
    return (inspect_alternative if private else investigate)(raw, spec, **kw)


def car_detour():
    data = export()
    data["elements"][4]["nodes"] = [1, 2]
    data["elements"].extend(
        [
            {"type": "node", "id": 5, "lat": 0.001, "lon": 0.001},
            {"type": "node", "id": 6, "lat": 0.001, "lon": 0.002},
            {"type": "way", "id": 30, "nodes": [2, 3], "tags": {"highway": "footway"}},
            {
                "type": "way",
                "id": 40,
                "nodes": [2, 5],
                "tags": {"highway": "residential"},
            },
            {
                "type": "way",
                "id": 50,
                "nodes": [5, 6],
                "tags": {"highway": "residential"},
            },
            {
                "type": "way",
                "id": 60,
                "nodes": [6, 3],
                "tags": {"highway": "residential"},
            },
        ]
    )
    return data


def test_real_alternative_uses_same_search_without_pedestrian_shortcut():
    raw = canonical(car_detour())
    spec = canonical({"origin": endpoint(), "target": endpoint(20)})
    original = inspect(raw, spec)
    assert any(
        r.get("way") == 30
        for r in original["records"]
        if r["record_type"] == "PATH_TRANSITION"
    )
    out = inspect_alternative(raw, spec)
    path = [r for r in out["records"] if r["record_type"] == "PATH_TRANSITION"]
    assert [r["way"] for r in path] == [10, 40, 50, 60, 20]
    assert path[0]["departure"] == {"virtual": "EXACT_PROJECTED_SEGMENT_POSITION"}
    assert path[-1]["arrival"] == {"virtual": "EXACT_PROJECTED_SEGMENT_POSITION"}
    assert out["motorcar_investigation"]["classification"] == FOUND
    assert (
        out["motorcar_investigation"]["policy_excluded_directed_edges"][
            "NON_MOTORCAR_INFRASTRUCTURE"
        ]
        == 2
    )
    assert inspect(raw, spec) == original


@pytest.mark.parametrize(
    "highway",
    [
        "footway",
        "pedestrian",
        "steps",
        "path",
        "cycleway",
        "bridleway",
        "track",
        "road",
    ],
)
def test_normally_non_motorcar_roads_require_explicit_car_permission(highway):
    data = export({"highway": highway})
    assert run(data)["classification"] == NONE
    assert (
        run(export({"highway": highway, "motorcar": "yes"}))["classification"] == FOUND
    )
    # Generic motor_vehicle permission is deliberately insufficient for this
    # conservative non-motorcar-infrastructure exception policy.
    assert (
        run(export({"highway": highway, "motor_vehicle": "yes"}))["classification"]
        == NONE
    )


@pytest.mark.parametrize(
    "access", ["private", "no", "destination", "delivery", "customers", "unknown"]
)
def test_restricted_or_unsupported_access_is_excluded(access):
    assert run(export({"motorcar": access}))["classification"] == NONE


def test_car_access_precedence_and_directional_exception():
    assert run(export({"access": "no", "motorcar": "yes"}))["classification"] == FOUND
    data = export({"highway": "footway", "motorcar:forward": "yes"})
    a, b = endpoint(fraction=0.2), endpoint(fraction=0.8)
    assert run(data, a, b)["classification"] == FOUND
    assert run(data, b, a)["classification"] == NONE


@pytest.mark.parametrize(
    "highway", ["residential", "service", "motorway", "trunk", "primary"]
)
def test_missing_access_is_only_a_narrow_road_class_plausibility_default(highway):
    out = run(export({"highway": highway}))
    assert out["classification"] == FOUND
    assert out["acceptance"] == "UNVERIFIED"
    assert (
        run(export({"highway": "construction", "motorcar": "yes"}))["classification"]
        == NONE
    )
    assert run(export({"highway": "unrecognised"}))["classification"] == NONE


@pytest.mark.parametrize("barrier", ["gate", "bollard", "kerb"])
def test_barrier_is_not_assumed_traversable_even_with_car_permission(barrier):
    out = run(export(node_tags={3: {"barrier": barrier, "motorcar": "yes"}}))
    assert out["classification"] == NONE
    assert out["policy_excluded_examined_transitions"]["BARRIER"] > 0
    assert (
        run(export({"barrier": barrier, "motorcar": "yes"}))["classification"] == NONE
    )


@pytest.mark.parametrize(
    "tag",
    [
        {"motorcar:conditional": "yes @ (Su)"},
        {"access:conditional": "no @ (Mo-Fr)"},
        {"access:lanes": "yes|yes"},
        {"oneway:conditional": "no @ (Su)"},
    ],
)
def test_unknown_and_conditional_permissions_are_not_universal_access(tag):
    out = run(export(tag))
    assert out["classification"] == NONE


@pytest.mark.parametrize(
    "tag",
    [
        {"maxheight": "default"},
        {"maxwidth": "2"},
        {"maxweight:conditional": "3.5 @ (Su)"},
    ],
)
def test_dimensions_can_remain_only_as_explicitly_unsupported_conditions(tag):
    out = run(export(tag))
    assert out["classification"] == FOUND
    assert out["remaining_conditions"]["dimensional_or_physical"] is True
    assert out["representative_uncertainty"]["physical_rules"] > 0
    assert out["navigation_authorized"] is False


@pytest.mark.parametrize(
    "oneway,direction", [("yes", 1), ("-1", -1), ("no", 1), ("no", -1)]
)
def test_oneway_order_and_reverse_travel_preserved(oneway, direction):
    a, b = endpoint(fraction=0.2), endpoint(fraction=0.8)
    if direction == -1:
        a, b = b, a
    out = run(export({"oneway": oneway}), a, b, private=True)
    assert out["motorcar_investigation"]["classification"] == FOUND
    path = [r for r in out["records"] if r["record_type"] == "PATH_TRANSITION"]
    assert path[0]["direction"] == direction
    if oneway != "no":
        assert run(export({"oneway": oneway}), b, a)["classification"] == NONE


def test_directionally_unknown_slip_roads_are_not_inferred():
    assert run(export({"highway": "trunk_link"}))["classification"] == NONE
    out = run(
        export({"highway": "trunk_link", "oneway": "yes", "maxheight": "default"})
    )
    assert out["classification"] == FOUND
    assert out["remaining_conditions"]["dimensional_or_physical"] is True


def test_supported_turns_remain_enforced_and_unknown_relations_guarded():
    assert run(export(relations=[relation()]))["classification"] == NONE
    assert (
        run(export(relations=[relation("only_right_turn")]))["classification"] == FOUND
    )
    data = export(relations=[relation(**{"except": "bus"})])
    raw = canonical(data)
    before = RoadOracle(raw).analyse(endpoint(), endpoint(20))
    out = run(data)
    assert out["classification"] == FOUND
    assert out["global_unresolved_restriction_guard"] is True
    assert out["remaining_conditions"]["turn_or_unresolved_restriction"] is True
    assert RoadOracle(raw).analyse(endpoint(), endpoint(20)) == before
    assert before["connectivity"] == "UNVERIFIED"


def test_no_route_with_export_gap_is_insufficient_not_disconnection():
    data = export()
    data["elements"][4]["nodes"] = [1, 2, 999]
    out = run(data)
    assert out["classification"] == "EVIDENCE_INSUFFICIENT"
    assert out["coverage_gap"] is True
    assert out["real_world_disconnection_proven"] is False


def test_search_limit_and_absent_path_are_distinct():
    out = run(max_states=1)
    assert out["classification"] == "SEARCH_INCOMPLETE"
    assert out["search"]["limit"] == "STATES"
    assert out["representative_uncertainty"] is None
    assert out["real_world_disconnection_proven"] is False
    absent = run(export({"motorcar": "no"}))
    assert absent["classification"] == NONE
    assert absent["search"]["limit"] == "NONE"
    assert absent["closed_component"] == "UNVERIFIED"


@pytest.mark.parametrize(
    "spec",
    [
        {},
        {"origin": endpoint(), "target": endpoint(20), "export_sha256": "f" * 64},
        {"origin": {**endpoint(), "nodes": [2, 1]}, "target": endpoint(20)},
    ],
)
def test_missing_and_conflicting_exact_source_evidence(spec):
    assert (
        investigate(canonical(export()), canonical(spec))["classification"]
        == "EVIDENCE_INSUFFICIENT"
    )


def test_zero_transition_position_does_not_prove_motorcar_traversal():
    out = run(origin=endpoint(), target=endpoint())
    assert out["classification"] == "EVIDENCE_INSUFFICIENT"
    assert out["representative_transitions"] == 0


def test_provided_candidate_is_not_reinterpreted_or_used_as_downstream_start():
    data = car_detour()
    raw = canonical(data)
    spec = {"origin": endpoint(), "target": endpoint(20), "candidate": [[20, 0, 1]]}
    before = copy.deepcopy(spec)
    assert (
        RoadOracle(raw).analyse(spec["origin"], spec["target"], spec["candidate"])[
            "candidate"
        ]
        == "INVALID"
    )
    out = investigate(raw, canonical(spec))
    assert out["candidate_validation"] == "NOT_PERFORMED_BY_THIS_DIAGNOSTIC"
    assert out["representative_transitions"] == 5
    assert spec == before


def test_public_aggregate_output_and_private_output_isolation(tmp_path):
    data = export({"maxheight": "default", "name": "PRIVATE_SENTINEL"})
    data["elements"][4]["id"] = 987654321
    a = {**endpoint(), "way": 987654321}
    raw = canonical(data)
    spec = canonical({"origin": a, "target": endpoint(20)})
    public = investigate(raw, spec)
    text = json.dumps(public)
    assert all(
        value not in text
        for value in (
            "987654321",
            "PRIVATE_SENTINEL",
            "coordinates",
            "geometry",
            "routing_tags",
            "sha256",
        )
    )
    private = inspect_alternative(raw, spec)
    assert private["scope"] == "PRIVATE_PROVISIONAL_TOPOLOGY_ONLY"
    assert private["motorcar_investigation"] == public
    assert "987654321" in json.dumps(private)
    assert "public_diagnostic" not in private
    assert "PRIVATE_SENTINEL" not in json.dumps(private)
    target = tmp_path / "new-private.json"
    write_report(target, private)
    with pytest.raises(ValueError):
        write_report(target, private)
    with pytest.raises(ValueError):
        write_report(Path.cwd() / "do-not-create.json", private)


def test_cli_default_public_and_explicit_private_report(tmp_path):
    osm = tmp_path / "osm.json"
    spec = tmp_path / "spec.json"
    output = tmp_path / "private.json"
    osm.write_bytes(canonical(export()))
    spec.write_bytes(canonical({"origin": endpoint(), "target": endpoint(20)}))
    before = osm.read_bytes(), spec.read_bytes()
    args = [
        sys.executable,
        "scripts/investigate-phase12fb-motorcar.py",
        "--export",
        str(osm),
        "--specification",
        str(spec),
    ]
    public = subprocess.run(args, capture_output=True, text=True)
    assert public.returncode == 0
    assert public.stderr == ""
    assert json.loads(public.stdout)["classification"] == FOUND
    assert not output.exists()
    private = subprocess.run(
        [*args, "--private-output", str(output)], capture_output=True, text=True
    )
    assert private.returncode == 0
    assert private.stdout == public.stdout
    assert private.stderr == ""
    assert output.exists()
    refused = subprocess.run(
        [*args, "--private-output", str(output)], capture_output=True, text=True
    )
    assert refused.returncode == 2
    assert json.loads(refused.stdout)["classification"] == "EVIDENCE_INSUFFICIENT"
    assert str(tmp_path) not in refused.stdout + refused.stderr
    assert before == (osm.read_bytes(), spec.read_bytes())


def test_no_network_provenance_acceptance_or_navigation_authority():
    from voyagr.utils.origin_replay import offline_guard, validate_bundle
    from tests.test_phase12fb_acceptance import bundle
    from tests.test_phase12f_origin import app_response, r

    with offline_guard():
        out = run()
    assert out["reviewed"] is False
    assert out["navigation_authorized"] is False
    assert out["acceptance"] == "UNVERIFIED"
    assert out["production"] == "PRODUCTION_NO_GO"
    assert "oracle_sha256" not in out
    value = bundle()
    del value["engine"]["oracle_sha256"]
    with pytest.raises(ValueError, match="provenance_required"):
        validate_bundle(value)
    route = r(46.31)
    route["motorcar_investigation"] = out
    result = app_response([route, r(0, "Valhalla")]).get_json()
    assert result["routes"][0]["source"] == "Valhalla"
    gh = next(x for x in result["routes"] if x["source"] == "GraphHopper")
    assert gh["avoidance_assessment"]["origin_integrity"]["navigation_allowed"] is False


def test_global_off_path_restriction_and_explicit_exception_stay_unverified():
    r = relation(**{"except": "bus"})
    r["members"][1]["ref"] = 4
    out = run(export(relations=[r]))
    assert out["classification"] == FOUND
    assert out["global_unresolved_restriction_guard"] is True
    explicit = run(export({"highway": "footway", "motorcar": "yes"}))
    assert explicit["explicit_motorcar_exception_transitions"] > 0
    assert (
        explicit["remaining_conditions"][
            "explicit_exception_infrastructure_suitability_unverified"
        ]
        is True
    )


def test_excluded_origin_cannot_be_replaced_by_downstream_candidate():
    data = car_detour()
    data["elements"][4]["tags"]["highway"] = "footway"
    spec = {
        "origin": endpoint(),
        "target": endpoint(20),
        "candidate": [[40, 0, 1], [50, 0, 1], [60, 0, 1], [20, 0, 1]],
    }
    out = investigate(canonical(data), canonical(spec))
    assert out["classification"] == NONE
    assert out["representative_transitions"] is None


def test_found_path_with_unrelated_extract_gap_is_still_only_provisional():
    data = export()
    data["elements"].append(
        {
            "type": "way",
            "id": 300,
            "nodes": [1, 999],
            "tags": {"highway": "residential"},
        }
    )
    out = run(data)
    assert out["classification"] == FOUND
    assert out["coverage_gap"] is True
    assert out["closed_component"] == "UNVERIFIED"
    assert out["real_world_disconnection_proven"] is False


def test_dense_search_examination_exhaustion_is_not_absence():
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
    out = run(data, target=target, max_states=180)
    assert out["classification"] == "SEARCH_INCOMPLETE"
    assert out["search"]["limit"] == "EDGE_EXAMINATIONS"
    assert out["real_world_disconnection_proven"] is False


def test_unsupported_turn_complexity_is_not_relaxed():
    rs = []
    for i in range(65):
        r = relation("only_right_turn")
        r["id"] = 100 + i
        rs.append(r)
    out = run(export(relations=rs))
    assert out["classification"] == NONE
    assert out["policy_excluded_examined_transitions"]["TURN_UNCERTAIN"] > 0


def test_cli_malformed_source_and_private_repo_destination_are_sanitized(tmp_path):
    osm = tmp_path / "private-SENTINEL.json"
    osm.write_text("{PRIVATE_SECRET")
    spec = tmp_path / "spec.json"
    spec.write_bytes(canonical({"origin": endpoint(), "target": endpoint(20)}))
    args = [
        sys.executable,
        "scripts/investigate-phase12fb-motorcar.py",
        "--export",
        str(osm),
        "--specification",
        str(spec),
    ]
    result = subprocess.run(args, capture_output=True, text=True)
    assert result.returncode == 2
    assert json.loads(result.stdout)["classification"] == "EVIDENCE_INSUFFICIENT"
    assert all(
        x not in result.stdout + result.stderr
        for x in ("PRIVATE_SECRET", "SENTINEL", str(tmp_path))
    )
    osm.write_bytes(canonical(export()))
    forbidden = Path.cwd() / "MUST_NOT_EXIST_PRIVATE_REPORT.json"
    result = subprocess.run(
        [*args, "--private-output", str(forbidden)], capture_output=True, text=True
    )
    assert result.returncode == 2
    assert not forbidden.exists()

"""Synthetic private inspector tests. Never read operator files or log evidence."""

import json
import os
from pathlib import Path
import subprocess
import sys

import pytest
from voyagr.utils import road_oracle_private as private
from voyagr.utils.road_oracle import RoadOracle, canonical, digest
from tests.test_independent_road_oracle import export, endpoint, relation


def run(data=None, origin=None, target=None, **kwargs):
    raw = canonical(data or export())
    spec = canonical({"origin": origin or endpoint(), "target": target or endpoint(20)})
    return private.inspect(raw, spec, **kwargs)


def transitions(report):
    return [r for r in report["records"] if r["record_type"] == "PATH_TRANSITION"]


def test_known_path_exact_partial_segments_and_public_compatibility():
    raw = canonical(export())
    spec = canonical({"origin": endpoint(), "target": endpoint(20)})
    before = raw, spec
    out = private.inspect(raw, spec)
    assert out["public_diagnostic"] == RoadOracle(raw).analyse(endpoint(), endpoint(20))
    path = transitions(out)
    assert [(e["way"], e["segment"], e["direction"]) for e in path] == [
        (10, 0, 1),
        (10, 1, 1),
        (20, 0, 1),
    ]
    assert path[0]["departure"] == {"virtual": "EXACT_PROJECTED_SEGMENT_POSITION"}
    assert path[-1]["arrival"] == {"virtual": "EXACT_PROJECTED_SEGMENT_POSITION"}
    assert path[0]["ordered_segment_nodes"] == [1, 2]
    assert path[0]["condition_status"] == "SUPPORTED_BY_EXPORT_ONLY"
    assert (raw, spec) == before
    assert out["scope"] == "PRIVATE_PROVISIONAL_TOPOLOGY_ONLY"
    for r in (out, out["public_diagnostic"]):
        assert r["reviewed"] is False
        assert r["navigation_authorized"] is False
        assert r["acceptance"] == "UNVERIFIED"
        assert r["production"] == "PRODUCTION_NO_GO"
    assert "oracle_sha256" not in out


@pytest.mark.parametrize(
    "tag,reason",
    [
        ({"motorcar": "destination"}, "uncertain_access"),
        ({"barrier": "gate"}, "barrier"),
        ({"maxheight": "2.5"}, "physical_rules"),
        ({"access:conditional": "no @ (Mo-Fr 08:00-18:00)"}, "conditional_rules"),
        ({"oneway": "reversible"}, "direction"),
    ],
)
def test_edge_source_tags_and_uncertainty(tag, reason):
    out = run(export(tag))
    edge = transitions(out)[0]
    assert reason in edge["classification"]
    assert edge["edge"]["routing_tags"].items() >= tag.items()
    assert "EDGE" in edge["uncertainty_sources"]
    assert out["public_diagnostic"]["connectivity"] == "UNVERIFIED"
    assert out["public_diagnostic"]["potential_path"] is True
    assert edge["edge"]["object_sha256"] == digest(
        canonical(export(tag)["elements"][4])
    )


@pytest.mark.parametrize("barrier", ["gate", "bollard", "block"])
def test_departure_barrier_identifies_node(barrier):
    out = run(export(node_tags={3: {"barrier": barrier}}))
    edge = transitions(out)[-1]
    assert edge["departure_node"]["id"] == 3
    assert edge["departure_node"]["routing_tags"]["barrier"] == barrier
    assert "DEPARTURE_NODE" in edge["uncertainty_sources"]
    assert "barrier" in edge["departure_node"]["classification"]


@pytest.mark.parametrize("tags", [{"motorcar": "private"}, {"access": "no"}])
def test_prohibited_access_is_not_an_invented_path(tags):
    out = run(export(tags))
    assert out["public_diagnostic"]["potential_path"] is False
    assert out["representative_path_available"] is False
    assert transitions(out) == []


@pytest.mark.parametrize(
    "tags,reverse",
    [
        ({"oneway": "yes"}, False),
        ({"oneway": "-1"}, True),
        ({"oneway": "no"}, True),
        ({"highway": "motorway"}, False),
    ],
)
def test_forward_reverse_bidirectional_and_motorway(tags, reverse):
    a, b = endpoint(fraction=0.2), endpoint(fraction=0.8)
    if reverse:
        a, b = b, a
    out = run(export(tags), a, b)
    assert transitions(out)[0]["direction"] == (-1 if reverse else 1)
    assert out["public_diagnostic"]["connectivity"] == "KNOWN_PATH_IN_EXPORT"


def test_slip_road_uses_existing_direction_uncertainty():
    out = run(export({"highway": "motorway_link"}))
    assert "direction" in transitions(out)[0]["classification"]
    assert out["public_diagnostic"]["connectivity"] == "UNVERIFIED"


def test_supported_and_global_unresolved_relations_are_not_waived():
    exception = relation(**{"except": "bus"})
    exception["id"] = 101
    incomplete = relation()
    incomplete["id"] = 102
    incomplete["members"][2]["ref"] = 999
    supported = relation("only_right_turn")
    out = run(export(relations=[supported, exception, incomplete]))
    rs = {
        r["id"]: r for r in out["records"] if r["record_type"] == "RESTRICTION_RELATION"
    }
    assert rs[100]["condition_status"] == "SUPPORTED_RULE"
    assert rs[100]["applicable_supported_turn_on_path"] is True
    assert rs[101]["routing_tags"]["except"] == "bus"
    assert "VEHICLE_EXCEPTION_NOT_RESOLVED" in rs[101]["classification"]
    assert "INCOMPLETE_MEMBER_EVIDENCE" in rs[102]["classification"]
    assert rs[102]["members"][2]["ref"] == 999
    assert rs[102]["missing_member_reference_count"] == 1
    assert all(
        "GLOBAL_UNRESOLVED_RESTRICTION_GUARD" in t["uncertainty_sources"]
        for t in transitions(out)
    )
    assert out["public_diagnostic"]["connectivity"] == "UNVERIFIED"
    assert all(r["locality_is_relevance_proof"] is False for r in rs.values())


def test_off_path_and_unknown_locality_do_not_waive_global_guard():
    r = relation(**{"except": "bus"})
    r["members"][1]["ref"] = 4
    unknown = relation(**{"restriction:conditional": "no_right_turn @ (Su)"})
    unknown["id"] = 101
    unknown["members"][1]["type"] = "way"
    out = run(export(relations=[r, unknown]))
    rs = {
        r["id"]: r for r in out["records"] if r["record_type"] == "RESTRICTION_RELATION"
    }
    assert rs[100]["via_locality"] == "OUTSIDE_PATH_NODES"
    assert rs[101]["via_locality"] == "UNKNOWN"
    assert rs[100]["global_guard"] is rs[101]["global_guard"] is True
    assert "CONDITIONAL_NOT_EVALUATED" in rs[101]["classification"]


def test_missing_or_conflicting_endpoint_evidence_refused():
    raw = canonical(export())
    for spec in (
        {},
        {"origin": endpoint(), "target": endpoint(20), "export_sha256": "f" * 64},
    ):
        with pytest.raises(ValueError):
            private.inspect(raw, canonical(spec))
    spec = {"origin": endpoint(), "target": endpoint(20)}
    spec["origin"]["nodes"] = [2, 1]
    with pytest.raises(ValueError):
        private.inspect(raw, canonical(spec))


def test_source_metadata_is_allowlisted_and_sensitive_values_withheld():
    data = export(
        {
            "name": "PRIVATE_NAME_SENTINEL",
            "note": "password=PRIVATE_CREDENTIAL",
            "motorcar": "Bearer PRIVATE_CREDENTIAL",
            "access:conditional": "yes @ (53.12345,-1.23456)",
        }
    )
    data["elements"][0]["metadata"] = {"request": "PRIVATE_HTTP_BODY"}
    out = run(data)
    encoded = json.dumps(out)
    assert all(
        x not in encoded
        for x in (
            "PRIVATE_NAME_SENTINEL",
            "PRIVATE_CREDENTIAL",
            "53.12345",
            "-1.23456",
            "PRIVATE_HTTP_BODY",
        )
    )
    tags = transitions(out)[0]["edge"]["routing_tags"]
    assert tags["motorcar"]["withheld"] is True
    assert tags["access:conditional"]["withheld"] is True
    assert "name" not in tags
    assert "coordinate" not in encoded


def test_public_output_stays_sanitized_after_private_inspection():
    data = export({"access": "destination"})
    data["elements"][4]["id"] = 987654321
    a = endpoint()
    a["way"] = 987654321
    raw = canonical(data)
    oracle = RoadOracle(raw)
    before = oracle.analyse(a, endpoint(20))
    out = private.inspect(raw, canonical({"origin": a, "target": endpoint(20)}))
    assert out["public_diagnostic"] == before == oracle.analyse(a, endpoint(20))
    assert "987654321" not in json.dumps(before)
    assert "987654321" in json.dumps(out)


def test_search_exhaustion_returns_no_fabricated_path():
    out = run(max_states=1)
    assert out["public_diagnostic"]["search_exhausted"] is True
    assert out["representative_path_available"] is False
    assert transitions(out) == []


def test_report_bounds_explicitly_mark_omissions(monkeypatch):
    monkeypatch.setattr(private, "MAX_RECORDS", 1)
    out = run()
    assert len(out["records"]) == 1
    assert out["truncated"] is True
    assert out["omitted_records"] == 2
    assert out["public_diagnostic"]["potential_path"] is True


def test_secure_output_no_overwrite_and_posix_permissions(tmp_path):
    target = tmp_path / "private.json"
    report = run()
    private.write_report(target, report)
    assert json.loads(target.read_bytes()) == report
    if os.name == "posix":
        assert target.stat().st_mode & 0o777 == 0o600
    before = target.read_bytes()
    with pytest.raises(ValueError):
        private.write_report(target, report)
    assert target.read_bytes() == before


def test_output_refuses_git_relative_and_symlink_paths(tmp_path):
    repo = tmp_path / "repo"
    repo.mkdir()
    (repo / ".git").mkdir()
    (repo / ".git" / "HEAD").write_text("ref: refs/heads/test")
    with pytest.raises(ValueError):
        private.write_report(repo / "private.json", {})
    with pytest.raises(ValueError):
        private.write_report(Path("relative.json"), {})
    with pytest.raises(ValueError):
        private.write_report(private.REPOSITORY / "private.json", {})
    if os.name == "posix":
        alias = tmp_path / "repo-alias"
        alias.symlink_to(repo, target_is_directory=True)
        with pytest.raises(ValueError):
            private.write_report(alias / "private.json", {})
        original = tmp_path / "original"
        original.write_text("UNCHANGED")
        link = tmp_path / "link.json"
        link.symlink_to(original)
        with pytest.raises(ValueError):
            private.write_report(link, {})
        assert original.read_text() == "UNCHANGED"


def cli(tmp_path, *extra):
    osm = tmp_path / "export.json"
    spec = tmp_path / "spec.json"
    osm.write_bytes(canonical(export()))
    spec.write_bytes(canonical({"origin": endpoint(), "target": endpoint(20)}))
    before = osm.read_bytes(), spec.read_bytes()
    result = subprocess.run(
        [
            sys.executable,
            "scripts/inspect-phase12fb-road-oracle-private.py",
            "--export",
            str(osm),
            "--specification",
            str(spec),
            *extra,
        ],
        capture_output=True,
        text=True,
    )
    assert before == (osm.read_bytes(), spec.read_bytes())
    return result


def test_cli_requires_private_output_and_prints_no_private_evidence(tmp_path):
    missing = cli(tmp_path)
    assert missing.returncode == 2
    output = tmp_path / "private.json"
    result = cli(tmp_path, "--output", str(output))
    assert result.returncode == 0
    assert result.stdout.strip() == "PRIVATE_PROVISIONAL_TOPOLOGY_ONLY_REPORT_CREATED"
    assert result.stderr == ""
    repeated = cli(tmp_path, "--output", str(output))
    assert repeated.returncode == 2
    assert repeated.stderr.strip() == "PRIVATE_INSPECTION_REFUSED"
    bad = cli(tmp_path, "--SECRET_COORDINATES", "PRIVATE_SENTINEL")
    assert bad.returncode == 2
    assert all(
        x
        not in missing.stdout
        + missing.stderr
        + result.stdout
        + result.stderr
        + repeated.stderr
        + bad.stderr
        for x in (str(tmp_path), "PRIVATE_SENTINEL", "SECRET_COORDINATES")
    )


def test_no_network_or_database_needed_for_unreviewed_inspection():
    from voyagr.utils.origin_replay import offline_guard

    with offline_guard():
        out = run()
    assert out["capture_binding"] == "NOT_CHECKED"
    assert out["independent_approval"] is False


def test_conditional_status_unsupported_and_missing_path_keeps_prohibition_source():
    out = run(export({"access:conditional": "no @ (Su)"}))
    conditions = transitions(out)[0]["edge"]["conditions"]
    assert {
        "classification": "conditional_rules",
        "status": "UNSUPPORTED",
    } in conditions
    blocked = run(export({"motorcar": "private"}))
    evidence = next(
        r
        for r in blocked["records"]
        if r["record_type"] == "ENDPOINT_SEGMENT_EVIDENCE" and r["endpoint"] == "origin"
    )
    assert evidence["source"]["routing_tags"]["motorcar"] == "private"
    assert not any(
        d["potentially_allowed"]
        for d in evidence["access_only_not_direction_or_turn_permission"]
    )


def test_supported_relation_identity_does_not_confuse_conflicting_unsupported_relation():
    supported = relation("only_right_turn")
    bad = relation("only_right_turn")
    bad["id"] = 101
    bad["members"][0]["type"] = "node"
    out = run(export(relations=[supported, bad]))
    rs = {
        r["id"]: r for r in out["records"] if r["record_type"] == "RESTRICTION_RELATION"
    }
    assert rs[100]["condition_status"] == "SUPPORTED_RULE"
    assert rs[101]["condition_status"] == "UNRESOLVED"
    assert rs[101]["global_guard"] is True


def test_output_rejects_worktree_marker_and_bare_repository(tmp_path):
    worktree = tmp_path / "worktree"
    worktree.mkdir()
    (worktree / ".git").write_text("gitdir: private")
    with pytest.raises(ValueError):
        private.output_target(worktree / "result.json")
    bare = tmp_path / "bare"
    bare.mkdir()
    (bare / "HEAD").write_text("ref: refs/heads/test")
    (bare / "objects").mkdir()
    (bare / "refs").mkdir()
    with pytest.raises(ValueError):
        private.output_target(bare / "result.json")


def test_exclusive_creation_catches_file_created_after_path_validation(
    tmp_path, monkeypatch
):
    target = tmp_path / "result.json"
    check = private.output_target

    def raced(path):
        result = check(path)
        result.write_text("DO_NOT_REPLACE")
        return result

    monkeypatch.setattr(private, "output_target", raced)
    with pytest.raises(FileExistsError):
        private.write_report(target, {})
    assert target.read_text() == "DO_NOT_REPLACE"


def test_candidate_validation_and_production_gate_unchanged():
    from tests.test_phase12f_origin import app_response, r

    spec = {"origin": endpoint(), "target": endpoint(20), "candidate": [[20, 0, 1]]}
    out = private.inspect(canonical(export()), canonical(spec))
    assert out["public_diagnostic"]["candidate"] == "INVALID"
    unsafe = r(46.31)
    unsafe["independent_road_diagnostic"] = out
    result = app_response([unsafe, r(0, "Valhalla")]).get_json()
    assert result["routes"][0]["source"] == "Valhalla"
    gh = next(route for route in result["routes"] if route["source"] == "GraphHopper")
    assert gh["avoidance_assessment"]["origin_integrity"]["navigation_allowed"] is False


def test_zero_transition_path_and_byte_budget_are_explicit(monkeypatch):
    out = run(origin=endpoint(), target=endpoint())
    assert out["representative_path_available"] is True
    assert transitions(out) == []
    monkeypatch.setattr(private, "MAX_EVIDENCE_BYTES", 1)
    out = run()
    assert out["records"] == []
    assert out["truncated"] is True
    assert out["omitted_records"] == 3


@pytest.mark.parametrize(
    "case", ["known", "barrier", "direction", "global", "exhausted"]
)
def test_full_public_report_matches_pr361_baseline(case):
    # Golden hashes of synthetic PUBLIC reports from 36f170f3; not accepted road oracles.
    expected = {
        "known": "9d6c2c0550699973e402c1ac2a5e02fcaeff9c6e237f3c707c9315fb2454121c",
        "barrier": "78c8e2f4a8812c32fcf7aed954135e03b44bc6898816110264791bccf30f298e",
        "direction": "c4c6826ab824e754e430f59f28b0071566adf4164640c515cd8e8602293b5b5d",
        "global": "163fbfbc0eea5a34ba009e1dc643d08cfb9f63568d1c3be88482205ae1618db7",
        "exhausted": "bc0d8cf8cb8d85e64e833cb1ea47dc360ae331d12661ca808aeff9bd221f297a",
    }
    data = {
        "known": export(),
        "barrier": export(node_tags={3: {"barrier": "gate"}}),
        "direction": export({"oneway": "reversible"}),
        "global": export(relations=[relation(**{"except": "bus"})]),
        "exhausted": export(),
    }[case]
    report = run(data, max_states=1 if case == "exhausted" else 100000)
    assert digest(canonical(report["public_diagnostic"])) == expected[case]


@pytest.mark.parametrize(
    "value",
    [
        "53.12345,-1.23456",
        "53.12345 / -1.23456",
        "53.12345 -1.23456",
        "53,-1",
        "53.12345",
    ],
)
def test_coordinate_like_routing_metadata_is_withheld(value):
    tags = private.safe_tags({"highway": value})
    assert tags["routing_tags"]["highway"]["withheld"] is True
    assert value not in json.dumps(tags)

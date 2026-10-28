"""Synthetic transport/provenance regression cases; not real capture acceptance."""

import copy
import hashlib
import json
import pytest
from tests.test_phase12fb_acceptance import bundle, tiny_area
from voyagr.utils import origin_replay as replay


def digest(value):
    return hashlib.sha256(
        json.dumps(value, sort_keys=True, separators=(",", ":")).encode()
    ).hexdigest()


def sidecar(value, fixture, target="/route"):
    evidence = {
        "schema_version": 1,
        "reviewed": True,
        "method": "POST",
        "request_target": target,
        "request_sha256": fixture["request_sha256"],
        "response_sha256": fixture["response_sha256"],
        "http_status": fixture["http_status"],
        "evidence_sha256": "b" * 64,
        "engine_build_sha256": value["engine"]["engine_build_sha256"],
        "graph_sha256": value["engine"]["graph_sha256"],
    }
    fixture["transport"] = evidence
    fixture["transport_sha256"] = digest(evidence)


def query_bundle(mode="NO_CH_GRAPHS_LOADED"):
    value = bundle()
    for fixture in value["fixtures"]:
        del fixture["request"]["ch.disable"]
        fixture["request_sha256"] = digest(fixture["request"])
        sidecar(value, fixture, "/route?ch.disable=true")
        evidence = fixture["transport"]
        evidence["routing_evidence"] = {
            "reviewed": True,
            "mode": mode,
            "evidence_sha256": "c" * 64,
            "engine_build_sha256": value["engine"]["engine_build_sha256"],
            "graph_sha256": value["engine"]["graph_sha256"],
            "profile": "car",
        }
        evidence["routing_evidence"].update(
            ch_graphs_loaded=0, effective_ch_disable=True, adapter_sha256="d" * 64
        )
        fixture["transport_sha256"] = digest(evidence)
    return value


def test_query_capture_can_use_independent_build_bound_routing_evidence_without_editing_objects():
    value = query_bundle()
    before = copy.deepcopy(value)
    replay.validate_bundle(value)
    assert value == before
    out = replay.replay(value, tiny_area())
    assert {f["status"] for f in out["fixtures"]} == {"PASS_SYNTHETIC_PROTOCOL"}
    assert value == before


def test_unreviewed_query_transport_or_missing_routing_evidence_never_infers_success():
    value = query_bundle()
    del value["fixtures"][0]["transport"]["routing_evidence"]
    f = value["fixtures"][0]
    f["transport_sha256"] = digest(f["transport"])
    with pytest.raises(ValueError):
        replay.validate_bundle(value)


@pytest.mark.parametrize(
    "body,target,valid",
    [
        (True, "/route", True),
        (True, "/route?ch.disable=true", True),
        (False, "/route?ch.disable=true", False),
        (True, "/route?ch.disable=false", False),
        (False, "/route?ch.disable=false", False),
        (None, "/route", False),
        ("true", "/route", False),
        (1, "/route", False),
        (True, "/route?ch.disable=true&ch.disable=true", False),
        (True, "/route?ch.disable=true&ch%2edisable=false", False),
        (True, "/route?ch.disable=TRUE", False),
        (True, "/route?ch.disable=", False),
        (True, "/route?CH.DISABLE=true", False),
        (True, "/route?%20ch.disable=true", False),
        (True, "/route?ch.disable=true#fragment", False),
        (True, "https://example.com/route?ch.disable=true", False),
        (True, "/route?ch.disable=%ZZ", False),
        (True, "/route?ch.disable", False),
    ],
)
def test_body_query_conflicting_missing_and_ambiguous_flags(body, target, valid):
    value = bundle()
    fixture = value["fixtures"][0]
    if body is None:
        fixture["request"].pop("ch.disable")
    else:
        fixture["request"]["ch.disable"] = body
    fixture["request_sha256"] = digest(fixture["request"])
    sidecar(value, fixture, target)
    before = copy.deepcopy(fixture)
    if valid:
        assert replay.transport_mode(fixture, value["engine"]).startswith("BODY")
    else:
        with pytest.raises(ValueError):
            replay.transport_mode(fixture, value["engine"])
    assert fixture == before


@pytest.mark.parametrize("mode", ["POST_QUERY_HINT_APPLIED", "NO_CH_GRAPHS_LOADED"])
def test_independent_query_proof_modes(mode):
    value = query_bundle(mode)
    assert all(
        replay.transport_mode(f, value["engine"]) == "QUERY_RECORDED_" + mode
        for f in value["fixtures"]
    )


@pytest.mark.parametrize(
    "failure",
    [
        "unreviewed_bundle",
        "unreviewed_transport",
        "missing_transport",
        "changed_target",
        "method",
        "response_binding",
        "request_binding",
        "engine_binding",
        "graph_proof",
        "unreviewed_proof",
        "missing_receipt",
        "no_ch_not_zero",
        "effective_flag_false",
    ],
)
def test_transport_and_provenance_bindings_remain_mandatory(failure):
    value = query_bundle()
    f = value["fixtures"][0]
    t = f["transport"]
    if failure == "unreviewed_bundle":
        value["reviewed"] = False
    elif failure == "unreviewed_transport":
        t["reviewed"] = False
    elif failure == "missing_transport":
        del f["transport"]
    elif failure == "changed_target":
        t["request_target"] = "/route?ch.disable=false"
    elif failure == "method":
        t["method"] = "GET"
    elif failure == "response_binding":
        t["response_sha256"] = "d" * 64
    elif failure == "request_binding":
        t["request_sha256"] = "d" * 64
    elif failure == "engine_binding":
        t["engine_build_sha256"] = "d" * 64
    elif failure == "graph_proof":
        t["routing_evidence"]["graph_sha256"] = "d" * 64
    elif failure == "unreviewed_proof":
        t["routing_evidence"]["reviewed"] = False
    elif failure == "missing_receipt":
        del t["evidence_sha256"]
    elif failure == "no_ch_not_zero":
        t["routing_evidence"]["ch_graphs_loaded"] = 1
    elif failure == "effective_flag_false":
        t["routing_evidence"].update(
            mode="POST_QUERY_HINT_APPLIED", effective_ch_disable=False
        )
    # changed_target deliberately leaves sidecar hash stale; other cases test independent binding too.
    if failure != "changed_target":
        f["transport_sha256"] = digest(t)
    with pytest.raises(ValueError):
        replay.validate_bundle(value)


def test_offline_replay_does_not_import_full_app_or_open_network_or_database_in_clean_process():
    import subprocess, sys

    code = """import json,sys,socket,sqlite3
from unittest.mock import patch
payload=json.load(sys.stdin)
with patch('sqlite3.connect',side_effect=AssertionError('database forbidden')), patch('socket.socket.connect',side_effect=AssertionError('network forbidden')):
 from voyagr.utils.origin_replay import replay
 result=replay(payload['bundle'],payload['areas'])
 assert 'voyagr_web' not in sys.modules
 assert all(f['status']=='PASS_SYNTHETIC_PROTOCOL' for f in result['fixtures'])
print('OFFLINE_NO_DATABASE_PASS')"""
    result = subprocess.run(
        [sys.executable, "-c", code],
        input=json.dumps({"bundle": bundle(), "areas": tiny_area()}),
        text=True,
        capture_output=True,
        timeout=20,
    )
    assert result.returncode == 0, result.stderr
    assert result.stdout.strip() == "OFFLINE_NO_DATABASE_PASS"


def test_offline_guard_rejects_io_including_preexisting_application_db_helpers():
    import socket, sqlite3
    from voyagr.services import hazards
    from voyagr import models

    with replay.offline_guard():
        for call in (
            lambda: sqlite3.connect(":memory:"),
            lambda: socket.create_connection(("127.0.0.1", 1)),
            lambda: hazards.db_connection(),
            lambda: models.get_db_connection(),
            lambda: models.get_pool(),
            lambda: models.init_db(),
        ):
            with pytest.raises(RuntimeError, match="offline_replay_io_forbidden"):
                call()


def test_duplicate_json_flags_are_refused_without_normalizing_capture_file(tmp_path):
    path = tmp_path / "bundle.json"
    raw = json.dumps(bundle(), separators=(",", ":")).replace(
        '"ch.disable":true', '"ch.disable":true,"ch.disable":false', 1
    )
    path.write_text(raw)
    before = path.read_bytes()
    with pytest.raises(ValueError, match="duplicate_capture_json_key"):
        replay.load_bundle(path, tmp_path / "not-read.geojson")
    assert path.read_bytes() == before

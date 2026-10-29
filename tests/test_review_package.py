"""Synthetic, local package metadata only. Never load operator evidence."""

import base64
import copy
import hashlib
import json
import os
from pathlib import Path
import stat
import struct
import subprocess
import sys

import pytest
from voyagr.utils import review_package as package
from voyagr.utils import review_package_io as io
from voyagr.utils.road_oracle import canonical
from voyagr.utils.road_oracle_private import inspect
from voyagr.utils.motorcar_investigation import inspect_alternative
from tests.test_independent_road_oracle import export, endpoint


def put(root, path, value):
    file = root / path
    file.parent.mkdir(parents=True, exist_ok=True)
    raw = value if isinstance(value, bytes) else canonical(value)
    file.write_bytes(raw)
    return raw


def seed(root):
    root.mkdir()
    raw = put(root, "fixture-0-oracle-export.json", export())
    spec = put(
        root,
        "fixture-0-oracle-spec-unreviewed.json",
        {"origin": endpoint(), "target": endpoint(20)},
    )
    put(
        root,
        "fixture-0-private-topology-inspection-unreviewed-01.json",
        inspect(raw, spec),
    )
    put(
        root,
        "fixture-0-motorcar-investigation-unreviewed-01.json",
        inspect_alternative(raw, spec),
    )
    hashes = {k: "a" * 64 for k in package.CLAIMS}
    put(
        root,
        "phase12fb-provenance-bound-unreviewed.json",
        {"reviewed": False, "engine": hashes},
    )
    put(root, "phase12fb-graph-receipt-unreviewed.json", {"reviewed": False, **hashes})
    put(
        root, "phase12fb-transport-review-manifest-unreviewed.json", {"reviewed": False}
    )
    for name in (
        "graph-cache-manifest",
        "import-receipt",
        "engine-provenance",
        "profile-config",
        "road-source",
        "camera-dataset",
    ):
        put(root, name + ".json", {"reviewed": False, **hashes})
    for i in range(5):
        request = {
            "profile": "car",
            "ch.disable": True,
            "points": [[i * 0.001, 0], [0.01, 0]],
            "custom_model": {
                "priority": [{"if": "in_camera_area_75", "multiply_by": 0}]
            },
        }
        response = {
            "paths": [
                {
                    "points": {
                        "type": "LineString",
                        "coordinates": [[i * 0.001, 0], [0.01, 0]],
                    }
                }
            ]
        }
        cap = {
            "reviewed": False,
            "request": request,
            "response": response,
            "method": "POST",
            "request_target": "/route?ch.disable=true",
            "http_status": 200,
            "recording_point": "CLIENT_BEFORE_FORWARDING_UNATTESTED",
        }
        for kind, value in (("request", request), ("response", response)):
            body = canonical(value)
            cap[kind + "_sha256"] = hashlib.sha256(body).hexdigest()
            cap[kind + "_body_base64"] = base64.b64encode(body).decode()
            cap["wire_" + kind + "_body_sha256"] = hashlib.sha256(body).hexdigest()
        put(root, f"phase12fb-body-hint/capture-{i}.json", cap)
    return root


def docs(root):
    files, blobs = io.inventory(root)
    return package.build(files, blobs)


def checks(output):
    return json.loads(output["verification-results.json"])["checks"]


def test_inventory_fingerprints_and_deterministic_five_outputs(tmp_path):
    root = seed(tmp_path / "evidence")
    first = docs(root)
    second = docs(root)
    assert first == second
    assert set(first) == {
        "evidence-manifest.json",
        "verification-results.json",
        "reviewer-checklist.md",
        "unresolved-findings.json",
        "package-summary.md",
    }
    manifest = json.loads(first["evidence-manifest.json"])
    assert len(manifest["files"]) == 18
    for f in manifest["files"]:
        assert not Path(f["path"]).is_absolute()
        assert (
            f["sha256"] == hashlib.sha256((root / f["path"]).read_bytes()).hexdigest()
        )
        assert f["fingerprint"] == "BYTES_RECOMPUTED"
    assert manifest["availability"]["capture_record"]["present_count"] == 5
    assert any(
        c["check"] == "DOCUMENT_BYTE_BINDING" and c["status"] == "MATCH"
        for c in checks(first)
    )
    assert any(
        c["check"] == "ORDERED_ENDPOINT_SEGMENTS" and c["status"] == "STRUCTURE_VALID"
        for c in checks(first)
    )
    assert any(
        c["check"] == "WIRE_JSON_OBJECT_BINDING" and c["status"] == "MATCH"
        for c in checks(first)
    )
    assert manifest["reviewed"] is False
    assert manifest["navigation_authorized"] is False
    assert "PASS" not in first["package-summary.md"].decode()


@pytest.mark.skipif(os.name != "posix", reason="POSIX no-atime syscall guarantee")
def test_file_and_directory_timestamps_permissions_and_contents_unchanged(tmp_path):
    root = seed(tmp_path / "evidence")
    paths = [root, *root.rglob("*")]
    # Force access times old enough that an ordinary read would update them.
    for path in paths:
        st = path.stat()
        os.utime(path, ns=(1_000_000_000, st.st_mtime_ns))
    before = {path: io.stamp(path.lstat()) for path in paths}
    output = tmp_path / "package"
    package.prepare(root, output)
    assert {path: io.stamp(path.lstat()) for path in paths} == before
    assert stat.S_IMODE(output.stat().st_mode) == 0o700
    assert all(stat.S_IMODE(p.stat().st_mode) == 0o600 for p in output.iterdir())


def test_missing_and_corrupt_artifacts_are_not_fabricated(tmp_path):
    root = tmp_path / "evidence"
    root.mkdir()
    put(root, "phase12fb-provenance-bound-unreviewed.json", b"{BROKEN")
    out = docs(root)
    manifest = json.loads(out["evidence-manifest.json"])
    assert manifest["files"][0]["json_status"] == "INVALID"
    assert manifest["files"][0]["sha256"] == hashlib.sha256(b"{BROKEN").hexdigest()
    assert any(c["status"] == "MISSING" for c in checks(out))
    assert "MISSING_OR_UNIDENTIFIED" in out["reviewer-checklist.md"].decode()
    assert "BROKEN" not in b"".join(out.values()).decode()


@pytest.mark.parametrize(
    "raw",
    [b'{"reviewed":false,"reviewed":true}', b'{"x":NaN}', b'{"x":1e999}', b"null"],
)
def test_strict_json_failure_is_recorded_without_echoing_values(tmp_path, raw):
    root = tmp_path / "evidence"
    root.mkdir()
    put(root, "receipt.json", raw)
    out = docs(root)
    assert any(
        c["check"] == "STRICT_JSON" and c["status"] == "INVALID" for c in checks(out)
    )


def test_report_hash_mismatch_truncation_and_unreviewed_receipt(tmp_path):
    root = seed(tmp_path / "evidence")
    path = root / "fixture-0-motorcar-investigation-unreviewed-01.json"
    value = json.loads(path.read_bytes())
    value["export_sha256"] = "f" * 64
    value["truncated"] = True
    value["omitted_records"] = 3
    put(root, path.name, value)
    out = docs(root)
    assert any(
        c["check"] == "DOCUMENT_BYTE_BINDING" and c["status"] == "MISMATCH"
        for c in checks(out)
    )
    assert any(c["status"] == "TRUNCATED_OR_UNKNOWN" for c in checks(out))
    assert any(c["status"] == "UNREVIEWED" for c in checks(out))
    assert json.loads(out["unresolved-findings.json"])["reviewed"] is False
    assert json.loads(path.read_bytes()) == value


def test_conflicting_identity_claims_and_duplicate_bytes(tmp_path):
    root = seed(tmp_path / "evidence")
    put(root, "other.json", {"engine": {"graph_sha256": "b" * 64}})
    raw = b"PRIVATE_CONTENT_DO_NOT_COPY"
    put(root, "support-a.txt", raw)
    put(root, "support-b.txt", raw)
    out = docs(root)
    assert any(c["status"] == "CONFLICTING_CLAIMS" for c in checks(out))
    assert any(c["status"] == "DUPLICATE_ARTIFACT" for c in checks(out))
    assert raw not in b"".join(out.values())


def test_explicit_index_bindings_conflicts_and_missing_references(tmp_path):
    root = seed(tmp_path / "evidence")
    target = "engine-provenance.json"
    h = hashlib.sha256((root / target).read_bytes()).hexdigest()
    put(
        root,
        "index.json",
        {
            "kind": "PHASE12FB_EVIDENCE_INDEX",
            "schema_version": 1,
            "artifacts": [
                {"role": "engine_provenance", "path": target, "sha256": h},
                {"role": "engine_provenance", "path": target, "sha256": h},
                {"role": "engine_provenance", "path": target, "sha256": "f" * 64},
                {
                    "role": "import_receipt",
                    "path": "missing-receipt.json",
                    "sha256": "a" * 64,
                },
            ],
        },
    )
    out = docs(root)
    statuses = {c["status"] for c in checks(out)}
    assert {
        "MATCH",
        "MISMATCH",
        "DUPLICATE_REFERENCE",
        "CONFLICTING_REFERENCE",
        "MISSING",
    } <= statuses


@pytest.mark.parametrize(
    "reference",
    [
        "../outside.json",
        "/etc/passwd",
        r"C:\Users\Private\file.json",
        r"\\server\share\file",
        "https://example.com/private",
        "file:///etc/passwd",
        "a/../../x",
    ],
)
def test_unsafe_reference_is_rejected_not_dereferenced(tmp_path, reference):
    root = tmp_path / "evidence"
    root.mkdir()
    put(
        root,
        "index.json",
        {
            "kind": "PHASE12FB_EVIDENCE_INDEX",
            "schema_version": 1,
            "artifacts": [
                {"role": "engine_provenance", "path": reference, "sha256": "a" * 64}
            ],
        },
    )
    out = docs(root)
    assert any(c["status"] == "REFERENCE_REJECTED" for c in checks(out))
    assert reference not in b"".join(out.values()).decode()


@pytest.mark.skipif(os.name != "posix", reason="POSIX link fixtures")
@pytest.mark.parametrize("kind", ["file_symlink", "dir_symlink", "hardlink", "fifo"])
def test_links_and_special_files_refused_without_creating_package(tmp_path, kind):
    root = tmp_path / "evidence"
    root.mkdir()
    external = tmp_path / "external"
    external.write_text("NOT_FOLLOWED")
    if kind == "file_symlink":
        (root / "link").symlink_to(external)
    if kind == "dir_symlink":
        (root / "link").symlink_to(tmp_path, target_is_directory=True)
    if kind == "hardlink":
        os.link(external, root / "hardlink")
    if kind == "fifo":
        os.mkfifo(root / "fifo")
    with pytest.raises(ValueError):
        package.prepare(root, tmp_path / "package")
    assert not (tmp_path / "package").exists()


def test_output_collisions_nested_output_and_git_are_refused(tmp_path):
    root = seed(tmp_path / "evidence")
    out = tmp_path / "package"
    package.prepare(root, out)
    before = {p.name: p.read_bytes() for p in out.iterdir()}
    with pytest.raises(ValueError):
        package.prepare(root, out)
    assert before == {p.name: p.read_bytes() for p in out.iterdir()}
    with pytest.raises(ValueError):
        package.prepare(root, root / "own-output")
    with pytest.raises(ValueError):
        package.prepare(root, Path.cwd() / "private-package")
    git = tmp_path / "repo"
    git.mkdir()
    (git / ".git").write_text("gitdir: elsewhere")
    with pytest.raises(ValueError):
        package.prepare(root, git / "private-package")


@pytest.mark.skipif(os.name != "posix", reason="POSIX directory no-atime capability")
def test_no_atime_capability_absence_fails_closed(tmp_path, monkeypatch):
    root = seed(tmp_path / "evidence")
    monkeypatch.delattr(os, "O_NOATIME")
    with pytest.raises(OSError):
        package.prepare(root, tmp_path / "package")
    assert not (tmp_path / "package").exists()


def test_hash_and_json_budgets_mark_missing_checks_not_fake_hashes(
    tmp_path, monkeypatch
):
    root = tmp_path / "evidence"
    root.mkdir()
    put(root, "large.json", b'{"x":1}')
    monkeypatch.setattr(io, "MAX_FILE_BYTES", 1)
    out = docs(root)
    manifest = json.loads(out["evidence-manifest.json"])
    assert manifest["files"][0]["sha256"] is None
    assert manifest["files"][0]["fingerprint"] == "NOT_READ_LIMIT"
    assert manifest["files"][0]["json_status"] == "NOT_PARSED_LIMIT"


def test_directory_traversal_budget_refuses_not_unbounded_scan(tmp_path, monkeypatch):
    root = tmp_path / "evidence"
    root.mkdir()
    put(root, "a.json", {})
    put(root, "b.json", {})
    monkeypatch.setattr(io, "MAX_ENTRIES", 1)
    with pytest.raises(ValueError):
        package.prepare(root, tmp_path / "package")
    assert not (tmp_path / "package").exists()


@pytest.mark.parametrize(
    "path",
    [
        "x/../a",
        "a\\b",
        "C:/private.json",
        "//server/share",
        "CON.txt",
        "a.",
        "a ",
        "%2e%2e/x",
    ],
)
def test_cross_platform_reference_validation(path):
    with pytest.raises(ValueError):
        io.relative_path(path)


def test_windows_directory_record_decoder_and_corruption():
    name = "capture-0.json".encode("utf-16-le")
    raw = bytearray(104 + len(name))
    struct.pack_into("<I", raw, 60, len(name))
    raw[104:] = name
    assert list(io.windows_names(bytes(raw))) == ["capture-0.json"]
    struct.pack_into("<I", raw, 60, 1000000)
    with pytest.raises(ValueError):
        list(io.windows_names(bytes(raw)))


def test_cli_sanitizes_errors_and_never_exposes_file_names(tmp_path):
    root = seed(tmp_path / "PRIVATE_SENTINEL")
    out = tmp_path / "package"
    args = [
        sys.executable,
        "scripts/prepare-phase12fb-review-package.py",
        "--evidence-directory",
        str(root),
        "--output-directory",
        str(out),
    ]
    success = subprocess.run(args, capture_output=True, text=True)
    assert success.returncode == 0
    assert (
        success.stdout.strip()
        == "PRIVATE_REVIEW_PACKAGE_CREATED_UNREVIEWED_PRODUCTION_NO_GO"
    )
    assert success.stderr == ""
    failed = subprocess.run(args, capture_output=True, text=True)
    assert failed.returncode == 2
    assert failed.stderr.strip() == "PRIVATE_REVIEW_PACKAGE_REFUSED"
    invalid = subprocess.run(
        [
            sys.executable,
            "scripts/prepare-phase12fb-review-package.py",
            "--PRIVATE_SECRET",
        ],
        capture_output=True,
        text=True,
    )
    assert invalid.returncode == 2
    assert all(
        s not in success.stdout + failed.stderr + invalid.stderr
        for s in ("PRIVATE_SENTINEL", "PRIVATE_SECRET", str(tmp_path))
    )


def test_package_contains_no_original_bodies_or_approval_mechanism(tmp_path):
    from voyagr.utils.origin_replay import offline_guard, validate_bundle
    from tests.test_phase12fb_acceptance import bundle

    root = seed(tmp_path / "evidence")
    put(root, "secret-support.txt", b"RAW_PRIVATE_CREDENTIAL_NEVER_COPY")
    with offline_guard():
        out = docs(root)
    text = b"".join(out.values()).decode()
    assert all(
        value not in text
        for value in (
            "RAW_PRIVATE_CREDENTIAL_NEVER_COPY",
            "coordinates",
            "body_base64",
            "CLIENT_BEFORE_FORWARDING_UNATTESTED",
        )
    )
    assert "INDEPENDENT_REVIEW_REQUIRED" in text
    value = bundle()
    del value["engine"]["oracle_sha256"]
    with pytest.raises(ValueError, match="provenance_required"):
        validate_bundle(value)
    assert (
        json.loads(out["verification-results.json"])["independent_approval"]
        == "NOT_PERFORMED"
    )


def test_capture_wire_mismatch_conflicting_hint_and_missing_hop(tmp_path):
    root = seed(tmp_path / "evidence")
    path = "phase12fb-body-hint/capture-0.json"
    value = json.loads((root / path).read_bytes())
    value["wire_request_body_sha256"] = "f" * 64
    value["request_target"] = "/route?ch.disable=false"
    del value["recording_point"]
    put(root, path, value)
    out = docs(root)
    observed = checks(out)
    assert any(
        c["check"] == "WIRE_CAPTURE_BINDING" and c["status"] == "MISMATCH"
        for c in observed
    )
    assert any(
        c["check"] == "TRANSPORT_DECLARATION"
        and c["status"] == "UNVERIFIED_OR_CONFLICTING"
        for c in observed
    )
    assert any(
        c["check"] == "RECORDING_HOP" and c["status"] == "MISSING" for c in observed
    )


def test_invalid_capture_encoding_and_incomplete_receipt_remain_findings(tmp_path):
    root = seed(tmp_path / "evidence")
    path = "phase12fb-body-hint/capture-0.json"
    value = json.loads((root / path).read_bytes())
    value["response_content_encoding"] = 7
    put(root, path, value)
    put(root, "phase12fb-provenance-bound-unreviewed.json", {"reviewed": False})
    observed = checks(docs(root))
    assert any(
        c["check"] == "WIRE_CAPTURE_BINDING" and c["status"] == "INVALID"
        for c in observed
    )
    assert any(
        c["check"] == "RECEIPT_CLAIM_FIELD"
        and c["status"] == "MISSING_OR_UNSUPPORTED_SCHEMA"
        for c in observed
    )


def test_json_parse_budget_marks_checks_unavailable_without_losing_byte_hash(
    tmp_path, monkeypatch
):
    root = tmp_path / "evidence"
    root.mkdir()
    raw = put(root, "valid.json", {"reviewed": False})
    monkeypatch.setattr(io, "MAX_TOTAL_JSON", 1)
    manifest = json.loads(docs(root)["evidence-manifest.json"])
    assert manifest["files"][0]["sha256"] == hashlib.sha256(raw).hexdigest()
    assert manifest["files"][0]["json_status"] == "NOT_PARSED_LIMIT"


@pytest.mark.skipif(os.name != "posix", reason="POSIX case-sensitive path test")
def test_case_conflicting_inventory_and_root_symlink_refused(tmp_path):
    root = tmp_path / "evidence"
    root.mkdir()
    put(root, "A.json", {})
    put(root, "a.json", {})
    with pytest.raises(ValueError):
        io.inventory(root)
    alias = tmp_path / "alias"
    alias.symlink_to(root, target_is_directory=True)
    with pytest.raises(ValueError):
        io.inventory(alias)


def test_safety_flags_in_source_are_not_adopted_as_approval(tmp_path):
    root = seed(tmp_path / "evidence")
    path = "fixture-0-motorcar-investigation-unreviewed-01.json"
    value = json.loads((root / path).read_bytes())
    value["reviewed"] = True
    value["navigation_authorized"] = True
    put(root, path, value)
    out = docs(root)
    assert any(
        c["check"] == "DIAGNOSTIC_REPORT_STRUCTURE" and c["status"] == "INVALID"
        for c in checks(out)
    )
    assert json.loads(out["evidence-manifest.json"])["reviewed"] is False
    assert (
        json.loads(out["verification-results.json"])["navigation_authorized"] is False
    )
    assert json.loads((root / path).read_bytes())["reviewed"] is True


def test_documented_capture_pair_and_exact_endpoint_bindings(tmp_path):
    root = seed(tmp_path / "evidence")
    source = "phase12fb-body-hint/capture-0.json"
    capture = json.loads((root / source).read_bytes())
    capture["request"]["points"][0] = [0.0005, 0.0]
    capture["response"]["paths"][0]["snapped_waypoints"] = {
        "type": "LineString",
        "coordinates": [[0.0025, 0.0], [0.01, 0.0]],
    }
    for kind in ("request", "response"):
        raw = canonical(capture[kind])
        h = hashlib.sha256(raw).hexdigest()
        capture[kind + "_sha256"] = h
        capture["wire_" + kind + "_body_sha256"] = h
        capture[kind + "_body_base64"] = base64.b64encode(raw).decode()
    put(root, source, capture)
    put(
        root,
        "fixture-0-oracle-spec-unreviewed.json",
        {"fixture_id": 0, "origin": endpoint(), "target": endpoint(20)},
    )
    put(
        root,
        "phase12fb-provenance-bound-unreviewed.json",
        {
            "reviewed": False,
            "fixture_id": 0,
            "request_sha256": capture["request_sha256"],
            "response_sha256": capture["response_sha256"],
        },
    )
    observed = checks(docs(root))
    assert any(
        c["check"] == "RECEIPT_CAPTURE_PAIR" and c["status"] == "MATCH"
        for c in observed
    )
    assert any(
        c["check"] == "CAPTURE_ENDPOINT_BINDING" and c["status"] == "MATCH"
        for c in observed
    )
    # Matching coordinates are byte/object evidence, never provenance acceptance.
    assert any(
        c["check"] == "PROVENANCE_AUTHENTICITY"
        and c["status"] == "INDEPENDENT_REVIEW_REQUIRED"
        for c in observed
    )


def test_binary_artifact_role_is_not_a_decoded_capture(tmp_path):
    root = tmp_path / "evidence"
    root.mkdir()
    refs = []
    for i in range(5):
        raw = put(root, f"blob{i}.bin", b"not a JSON capture")
        refs.append(
            {
                "role": "capture_record",
                "path": f"blob{i}.bin",
                "sha256": hashlib.sha256(raw).hexdigest(),
            }
        )
    put(
        root,
        "index.json",
        {"kind": "PHASE12FB_EVIDENCE_INDEX", "schema_version": 1, "artifacts": refs},
    )
    out = docs(root)
    assert any(
        c["check"] == "FIVE_CAPTURE_RECORDS" and c["status"] == "MISSING_OR_AMBIGUOUS"
        for c in checks(out)
    )
    assert (
        json.loads(out["evidence-manifest.json"])["availability"]["capture_record"][
            "decoded_or_fingerprinted_count"
        ]
        == 0
    )


@pytest.mark.skipif(
    not sys.platform.startswith("linux"), reason="Linux mount-type check"
)
@pytest.mark.parametrize("kind", ["nfs", "cifs", "fuse.sshfs", "unrecognised"])
def test_remote_or_unknown_storage_is_refused_before_inventory(
    tmp_path, monkeypatch, kind
):
    root = seed(tmp_path / "evidence")
    monkeypatch.setattr(io, "_filesystem_type", lambda path: kind)
    with pytest.raises(OSError):
        package.prepare(root, tmp_path / "package")
    assert not (tmp_path / "package").exists()


def test_known_report_array_is_not_treated_as_valid_report_schema(tmp_path):
    root = seed(tmp_path / "evidence")
    put(root, "fixture-0-motorcar-investigation-unreviewed-01.json", [])
    out = docs(root)
    assert any(
        c["check"] == "KNOWN_JSON_OBJECT_SCHEMA"
        and c["status"] == "INVALID_OR_UNAVAILABLE"
        for c in checks(out)
    )
    assert (
        json.loads(out["evidence-manifest.json"])["availability"]["motorcar_report"][
            "decoded_or_fingerprinted_count"
        ]
        == 0
    )


def test_malformed_index_role_is_a_finding_not_an_approval_or_exception(tmp_path):
    root = tmp_path / "evidence"
    root.mkdir()
    put(
        root,
        "index.json",
        {
            "kind": "PHASE12FB_EVIDENCE_INDEX",
            "schema_version": 1,
            "artifacts": [
                {"role": {"invalid": "role"}, "path": "x", "sha256": "a" * 64}
            ],
        },
    )
    assert any(
        c["check"] == "ARTIFACT_REFERENCE" and c["status"] == "INVALID"
        for c in checks(docs(root))
    )


def test_invalid_deep_export_is_not_reparsed_after_strict_json_refusal(tmp_path):
    root = tmp_path / "evidence"
    root.mkdir()
    raw = b'{"elements":' + b"[" * 2000 + b"0" + b"]" * 2000 + b"}"
    put(root, "fixture-0-oracle-export.json", raw)
    out = docs(root)
    manifest = json.loads(out["evidence-manifest.json"])
    assert manifest["files"][0]["json_status"] == "INVALID"
    assert manifest["files"][0]["sha256"] == hashlib.sha256(raw).hexdigest()
    assert any(
        c["check"] == "STRICT_JSON" and c["status"] == "INVALID" for c in checks(out)
    )

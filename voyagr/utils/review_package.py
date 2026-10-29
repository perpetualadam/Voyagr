"""Read-only Phase12FB evidence inventory; integrity observations, never approval."""

import base64
from collections import defaultdict
import hashlib
import json
import math
import re
from urllib.parse import urlsplit, parse_qsl

from voyagr.utils import review_package_io as io

HASH = re.compile(r"[0-9a-f]{64}\Z")
SAFETY = {
    "reviewed": False,
    "navigation_authorized": False,
    "acceptance": "UNVERIFIED",
    "production": "PRODUCTION_NO_GO",
}
REQUIRED = {
    "osm_export": 1,
    "endpoint_specification": 1,
    "topology_report": 1,
    "motorcar_report": 1,
    "provenance_receipt": 1,
    "graph_receipt": 1,
    "transport_manifest": 1,
    "capture_record": 5,
    "capture_bundle": 1,
    "graph_manifest": 1,
    "import_receipt": 1,
    "engine_provenance": 1,
    "profile_configuration": 1,
    "road_source_receipt": 1,
    "camera_dataset_receipt": 1,
    "offline_replay_report": 1,
    "application_acceptance": 1,
    "device_acceptance": 1,
}
BINDINGS = {
    "export_sha256": "osm_export",
    "specification_sha256": "endpoint_specification",
    "capture_sha256": "capture_bundle",
}
CLAIMS = (
    "road_source_sha256",
    "graph_sha256",
    "engine_build_sha256",
    "dataset_sha256",
    "import_receipt_sha256",
)
STRUCTURED_ROLES = frozenset(
    (
        "osm_export",
        "endpoint_specification",
        "topology_report",
        "motorcar_report",
        "capture_record",
        "capture_bundle",
    )
)
MAX_CHECKS = 8192
MAX_JSON_DEPTH = 64


def encode(value):
    return json.dumps(
        value, sort_keys=True, separators=(",", ":"), allow_nan=False
    ).encode()


def strict_json(raw):
    def unique(pairs):
        out = {}
        for key, value in pairs:
            if key in out:
                raise ValueError("duplicate_json_key")
            out[key] = value
        return out

    def constant(_):
        raise ValueError("nonfinite_json")

    def number(text):
        value = float(text)
        if not math.isfinite(value):
            raise ValueError("nonfinite_json")
        return value

    decoded = json.loads(
        raw, object_pairs_hook=unique, parse_constant=constant, parse_float=number
    )
    stack = [(decoded, 0)]
    visits = 0
    while stack:
        value, depth = stack.pop()
        if depth > MAX_JSON_DEPTH:
            raise ValueError("json_nesting_limit")
        if isinstance(value, (dict, list)):
            visits += 1
            if visits > 200000:
                raise ValueError("json_container_limit")
            children = value.values() if isinstance(value, dict) else value
            stack.extend(
                (child, depth + 1)
                for child in children
                if isinstance(child, (dict, list))
            )
    return decoded


def categories(path):
    name = path.rsplit("/", 1)[-1].lower()
    roles = []
    exact = {
        "fixture-0-oracle-export.json": "osm_export",
        "fixture-0-oracle-spec-unreviewed.json": "endpoint_specification",
        "phase12fb-provenance-bound-unreviewed.json": "provenance_receipt",
        "phase12fb-graph-receipt-unreviewed.json": "graph_receipt",
        "phase12fb-transport-review-manifest-unreviewed.json": "transport_manifest",
    }
    if name in exact:
        roles.append(exact[name])
    if name.startswith("fixture-0-private-topology-inspection-"):
        roles.append("topology_report")
    if name.startswith("fixture-0-motorcar-investigation-"):
        roles.append("motorcar_report")
    if path.lower().startswith("phase12fb-body-hint/") and name.endswith(".json"):
        roles.append("capture_record")
    for fragment, role in (
        ("graph-manifest", "graph_manifest"),
        ("graph-cache-manifest", "graph_manifest"),
        ("import-receipt", "import_receipt"),
        ("engine-provenance", "engine_provenance"),
        ("profile-config", "profile_configuration"),
        ("road-source", "road_source_receipt"),
        ("camera-dataset", "camera_dataset_receipt"),
        ("offline-replay", "offline_replay_report"),
        ("application-acceptance", "application_acceptance"),
        ("device-acceptance", "device_acceptance"),
    ):
        if fragment in name:
            roles.append(role)
    return sorted(set(roles)) or ["supporting_unclassified"]


def build(files, blobs):
    files = [
        dict(f, categories=categories(f["path"]), json_status="NOT_JSON_OR_NOT_PARSED")
        for f in files
    ]
    by_path = {f["path"]: f for f in files}
    docs, checks, findings = {}, [], []

    def check(code, status, artifact=None, field=None):
        if len(checks) >= MAX_CHECKS:
            raise ValueError("verification_limit")
        record = {"check": code, "status": status}
        if artifact is not None:
            record["artifact"] = artifact
        if field is not None:
            record["field"] = field  # Only caller-supplied fixed schema labels.
        checks.append(record)
        if status not in (
            "MATCH",
            "STRUCTURE_VALID",
            "BYTES_RECOMPUTED",
            "CLAIM_PRESENT_UNAUTHENTICATED",
        ):
            findings.append(record.copy())

    for f in files:
        path = f["path"]
        check("FILE_FINGERPRINT", f["fingerprint"], path)
        if path.lower().endswith(".json"):
            if path not in blobs:
                f["json_status"] = "NOT_PARSED_LIMIT"
                check("STRICT_JSON", "NOT_PARSED_LIMIT", path)
                continue
            try:
                value = strict_json(blobs[path])
                if not isinstance(value, (dict, list)):
                    raise ValueError("json_container_required")
            except (ValueError, UnicodeError, RecursionError):
                f["json_status"] = "INVALID"
                check("STRICT_JSON", "INVALID", path)
                continue
            f["json_status"] = "STRICTLY_DECODED"
            docs[path] = value
            check("STRICT_JSON", "STRUCTURE_VALID", path)
            if isinstance(value, dict):
                marker = value.get("reviewed")
                f["source_review_claim"] = (
                    "UNREVIEWED"
                    if marker is False
                    else "TRUE_CLAIM_UNAUTHENTICATED" if marker is True else "ABSENT"
                )
                if marker is False:
                    check("SOURCE_REVIEW", "UNREVIEWED", path)
                elif marker is True:
                    check("SOURCE_REVIEW", "CLAIM_PRESENT_UNAUTHENTICATED", path)
                if value.get("kind") == "RECORDED_GRAPH_HOPPER8_CAPTURE":
                    f["categories"] = sorted(set(f["categories"]) | {"capture_bundle"})
                if value.get("kind") == "PHASE12FB_EVIDENCE_INDEX":
                    f["categories"] = sorted(set(f["categories"]) | {"evidence_index"})

    # Optional explicit local index: roles and raw-byte references, never approvals.
    references = []
    for path, doc in docs.items():
        if not isinstance(doc, dict) or doc.get("kind") != "PHASE12FB_EVIDENCE_INDEX":
            continue
        artifacts = doc.get("artifacts")
        if (
            doc.get("schema_version") != 1
            or not isinstance(artifacts, list)
            or len(artifacts) > 512
        ):
            check("EVIDENCE_INDEX", "INVALID", path)
            continue
        claimed = {}
        for ref in artifacts:
            if (
                not isinstance(ref, dict)
                or not isinstance(ref.get("role"), str)
                or ref.get("role")
                not in {
                    *REQUIRED,
                    "capture_bundle",
                    "supporting_unclassified",
                }
            ):
                check("ARTIFACT_REFERENCE", "INVALID", path)
                continue
            try:
                target = io.relative_path(ref.get("path"))
            except ValueError:
                check("ARTIFACT_REFERENCE", "REFERENCE_REJECTED", path)
                continue
            expected = ref.get("sha256")
            if not isinstance(expected, str) or not HASH.fullmatch(expected):
                check("ARTIFACT_REFERENCE", "INVALID_HASH", path)
                continue
            key = (ref["role"], target)
            if key in claimed:
                check(
                    "ARTIFACT_REFERENCE",
                    (
                        "DUPLICATE_REFERENCE"
                        if claimed[key] == expected
                        else "CONFLICTING_REFERENCE"
                    ),
                    path,
                )
            claimed[key] = expected
            references.append((path, target, expected, ref["role"]))
            if target in by_path:
                by_path[target]["categories"] = sorted(
                    set(by_path[target]["categories"]) | {ref["role"]}
                )

    groups = defaultdict(list)
    for f in files:
        for role in f["categories"]:
            groups[role].append(f)

    def available_file(f, role):
        if not f["sha256"]:
            return False
        if role in STRUCTURED_ROLES:
            return isinstance(docs.get(f["path"]), dict)
        return (
            not f["path"].lower().endswith(".json")
            or f["json_status"] == "STRICTLY_DECODED"
        )

    for role, count in REQUIRED.items():
        available = groups[role]
        for artifact in available:
            if role in STRUCTURED_ROLES and not isinstance(
                docs.get(artifact["path"]), dict
            ):
                check(
                    "KNOWN_JSON_OBJECT_SCHEMA",
                    "INVALID_OR_UNAVAILABLE",
                    artifact["path"],
                )
        valid = [f for f in available if available_file(f, role)]
        status = (
            "STRUCTURE_VALID"
            if len(valid) == count
            else "MISSING" if len(available) < count else "INVALID_OR_AMBIGUOUS"
        )
        check("REQUIRED_" + role.upper(), status)
        if count == 1 and len(available) > 1:
            check(
                "ARTIFACT_ROLE",
                (
                    "DUPLICATE_ARTIFACT"
                    if len({f["sha256"] for f in available}) == 1
                    else "CONFLICTING_ARTIFACT"
                ),
            )
    duplicate = defaultdict(list)
    for f in files:
        if f["sha256"]:
            duplicate[f["sha256"]].append(f["path"])
    duplicates = [
        {"paths": paths, "sha256": h}
        for h, paths in sorted(duplicate.items())
        if len(paths) > 1
    ]
    for d in duplicates:
        check("DUPLICATE_BYTES", "DUPLICATE_ARTIFACT", d["paths"][0])

    for origin, target, expected, role in references:
        check(
            "INDEX_BYTE_BINDING",
            (
                "MATCH"
                if target in by_path and by_path[target]["sha256"] == expected
                else "MISSING" if target not in by_path else "MISMATCH"
            ),
            origin,
        )

    # Never dereference local/remote references in unknown schemas. Detect risky
    # path-like fields without copying their values or arbitrary JSON key names.
    for path, doc in docs.items():
        stack = [doc]
        visits = 0
        while stack:
            obj = stack.pop()
            visits += 1
            if visits > 200000:
                raise ValueError("json_structure_limit")
            if isinstance(obj, dict):
                for key, value in obj.items():
                    if isinstance(value, str) and (
                        key in ("path", "file", "filename", "$ref")
                        or key.endswith(("_path", "_file", "_url", "_uri"))
                    ):
                        try:
                            io.relative_path(value)
                        except ValueError:
                            check("DOCUMENT_REFERENCE", "REFERENCE_REJECTED", path)
                        else:
                            check("DOCUMENT_REFERENCE", "NOT_DEREFERENCED", path)
                    elif isinstance(value, (dict, list)):
                        stack.append(value)
            elif isinstance(obj, list):
                stack.extend(obj)

    def unique(role):
        fs = groups[role]
        return fs[0] if len(fs) == 1 else None

    for path, doc in docs.items():
        if not isinstance(doc, dict):
            continue
        for field, role in BINDINGS.items():
            if field not in doc:
                continue
            target = unique(role)
            expected = doc[field]
            status = (
                "INVALID_HASH"
                if not isinstance(expected, str) or not HASH.fullmatch(expected)
                else (
                    "UNAVAILABLE_OR_AMBIGUOUS"
                    if target is None or target["sha256"] is None
                    else "MATCH" if expected == target["sha256"] else "MISMATCH"
                )
            )
            check("DOCUMENT_BYTE_BINDING", status, path, field)
        if any(
            role in by_path[path]["categories"]
            for role in ("topology_report", "motorcar_report")
        ):
            good = all(
                doc.get(k) == v and type(doc.get(k)) is type(v)
                for k, v in SAFETY.items()
            )
            good &= (
                isinstance(doc.get("records"), list)
                and all(isinstance(record, dict) for record in doc["records"])
                and type(doc.get("truncated")) is bool
                and type(doc.get("omitted_records")) is int
                and doc["omitted_records"] >= 0
                and len(doc["records"]) <= 5000
                and doc.get("scope") == "PRIVATE_PROVISIONAL_TOPOLOGY_ONLY"
                and doc["truncated"] == (doc["omitted_records"] > 0)
            )
            check(
                "DIAGNOSTIC_REPORT_STRUCTURE",
                "STRUCTURE_VALID" if good else "INVALID",
                path,
            )
            if isinstance(doc.get("records"), list):
                checks[-1]["observed_record_count"] = len(doc["records"])
            if doc.get("truncated") is not False or doc.get("omitted_records") != 0:
                check("DIAGNOSTIC_REPORT_SCOPE", "TRUNCATED_OR_UNKNOWN", path)
            for field in ("export_sha256", "specification_sha256"):
                if field not in doc:
                    check("DIAGNOSTIC_BINDING", "MISSING", path, field)
            check("GLOBAL_RESTRICTIONS", "INDEPENDENT_REVIEW_REQUIRED", path)
        if "endpoint_specification" in by_path[path]["categories"]:
            from voyagr.services.routing.origin_integrity import coordinate

            good = True
            for label in ("origin", "target"):
                e = doc.get(label)
                good &= (
                    isinstance(e, dict)
                    and type(e.get("way")) is int
                    and e["way"] > 0
                    and type(e.get("segment")) is int
                    and e["segment"] >= 0
                    and isinstance(e.get("nodes"), list)
                    and len(e["nodes"]) == 2
                    and all(type(n) is int and n > 0 for n in e["nodes"])
                    and coordinate(e.get("coordinate")) is not None
                )
            check(
                "EXACT_ENDPOINT_STRUCTURE",
                "STRUCTURE_VALID" if good else "INVALID",
                path,
            )

    export_file, endpoint_file = unique("osm_export"), unique("endpoint_specification")
    if (
        export_file
        and export_file["path"] in blobs
        and export_file["json_status"] == "STRICTLY_DECODED"
    ):
        try:
            from voyagr.utils.road_oracle import RoadOracle

            parsed = RoadOracle(blobs[export_file["path"]])
            check("OSM_EXPORT_STRUCTURE", "STRUCTURE_VALID", export_file["path"])
            checks[-1]["observed_counts"] = {
                "nodes": len(parsed.nodes),
                "ways": len(parsed.ways),
                "relations": len(parsed.relations),
                "supported_restrictions": len(parsed.rules),
                "unresolved_restrictions": len(parsed.restriction_issues),
            }
            if parsed.unresolved:
                check(
                    "OSM_RESTRICTIONS",
                    "UNRESOLVED_RESTRICTIONS_REQUIRE_REVIEW",
                    export_file["path"],
                )
            if parsed.gaps:
                check("OSM_COVERAGE", "INCOMPLETE_EXTRACT", export_file["path"])
            if endpoint_file and isinstance(docs.get(endpoint_file["path"]), dict):
                try:
                    for label in ("origin", "target"):
                        parsed.project(docs[endpoint_file["path"]][label])
                    check(
                        "ORDERED_ENDPOINT_SEGMENTS",
                        "STRUCTURE_VALID",
                        endpoint_file["path"],
                    )
                except (ValueError, TypeError, KeyError, IndexError):
                    check("ORDERED_ENDPOINT_SEGMENTS", "INVALID", endpoint_file["path"])
        except (ValueError, TypeError, KeyError, IndexError):
            check("OSM_EXPORT_STRUCTURE", "INVALID", export_file["path"])
    receipt_requirements = {
        "provenance_receipt": CLAIMS,
        "graph_receipt": (
            "graph_sha256",
            "road_source_sha256",
            "dataset_sha256",
            "import_receipt_sha256",
        ),
        "engine_provenance": ("engine_build_sha256",),
        "import_receipt": ("graph_sha256", "road_source_sha256", "dataset_sha256"),
    }
    for role, fields in receipt_requirements.items():
        for artifact in groups[role]:
            doc = docs.get(artifact["path"])
            obj = doc.get("engine", doc) if isinstance(doc, dict) else None
            for field in fields:
                present = (
                    isinstance(obj, dict)
                    and isinstance(obj.get(field), str)
                    and HASH.fullmatch(obj[field])
                )
                check(
                    "RECEIPT_CLAIM_FIELD",
                    (
                        "CLAIM_PRESENT_UNAUTHENTICATED"
                        if present
                        else "MISSING_OR_UNSUPPORTED_SCHEMA"
                    ),
                    artifact["path"],
                    field,
                )

    for role in ("engine_provenance", "provenance_receipt"):
        for artifact in groups[role]:
            doc = docs.get(artifact["path"])
            obj = doc.get("engine", doc) if isinstance(doc, dict) else None
            good = (
                isinstance(obj, dict)
                and obj.get("version") == "8.0"
                and obj.get("profile") == "car"
            )
            check(
                "ENGINE_VERSION_PROFILE_DECLARATION",
                (
                    "CLAIM_PRESENT_UNAUTHENTICATED"
                    if good
                    else "MISSING_OR_UNSUPPORTED_SCHEMA"
                ),
                artifact["path"],
            )

    # Compare identity claims, not their authenticity, using supported top-level
    # receipt/engine fields only. Never assign meaning to an unknown graph digest.
    for field in CLAIMS:
        values = []
        for path, doc in docs.items():
            if not isinstance(doc, dict):
                continue
            for obj in (doc, doc.get("engine", {})):
                if isinstance(obj, dict) and field in obj:
                    val = obj[field]
                    if not isinstance(val, str) or not HASH.fullmatch(val):
                        check("IDENTITY_CLAIM", "INVALID_HASH", path, field)
                    else:
                        values.append((path, val))
        check(
            "IDENTITY_CLAIM_CONSISTENCY",
            (
                "MISSING"
                if not values
                else (
                    "CONFLICTING_CLAIMS"
                    if len({v for _, v in values}) > 1
                    else "CLAIMS_CONSISTENT_UNAUTHENTICATED"
                )
            ),
            field=field,
        )

    capture_pairs = []
    capture_objects = {}
    valid_capture_paths = set()
    for path, doc in docs.items():
        if not isinstance(doc, dict):
            continue
        captures = (
            doc.get("fixtures")
            if "capture_bundle" in by_path[path]["categories"]
            else [doc] if "capture_record" in by_path[path]["categories"] else []
        )
        if not isinstance(captures, list) or len(captures) > 100:
            check("CAPTURE_STRUCTURE", "INVALID", path)
            continue
        for capture in captures:
            if (
                not isinstance(capture, dict)
                or not isinstance(capture.get("request"), dict)
                or not isinstance(capture.get("response"), dict)
            ):
                check("CAPTURE_STRUCTURE", "INVALID", path)
                continue
            if capture is doc and "capture_record" in by_path[path]["categories"]:
                valid_capture_paths.add(path)
            try:
                from voyagr.utils.graphhopper_acceptance import checked_request

                checked_request({"points": capture["request"].get("points")})
                check("CAPTURE_REQUEST_POINTS", "STRUCTURE_VALID", path)
            except (ValueError, TypeError, KeyError, IndexError):
                check("CAPTURE_REQUEST_POINTS", "INVALID_OR_UNSUPPORTED", path)
            model = capture["request"].get("custom_model")
            rules = model.get("priority", []) if isinstance(model, dict) else []
            hard = isinstance(rules, list) and any(
                isinstance(r, dict)
                and str(r.get("multiply_by")) == "0"
                and re.search(r"\bin_camera_area_75\b", str(r.get("if", "")))
                for r in rules
            )
            check(
                "CAMERA_HARD_RULE_DECLARATION",
                "STRUCTURE_VALID" if hard else "MISSING_OR_UNSUPPORTED",
                path,
            )
            pair = []
            for kind in ("request", "response"):
                calculated = hashlib.sha256(encode(capture[kind])).hexdigest()
                pair.append(calculated)
                field = kind + "_sha256"
                check(
                    "CANONICAL_CAPTURE_BINDING",
                    (
                        "MISSING"
                        if field not in capture
                        else "MATCH" if capture[field] == calculated else "MISMATCH"
                    ),
                    path,
                    field,
                )
                encoded = capture.get(kind + "_body_base64")
                expected = capture.get("wire_" + kind + "_body_sha256")
                if encoded is None or expected is None:
                    check("WIRE_CAPTURE_BINDING", "MISSING", path, kind)
                    continue
                try:
                    raw = base64.b64decode(encoded, validate=True)
                    if len(raw) > 2 * 1024 * 1024:
                        raise ValueError("wire_limit")
                    check(
                        "WIRE_CAPTURE_BINDING",
                        (
                            "MATCH"
                            if hashlib.sha256(raw).hexdigest() == expected
                            else "MISMATCH"
                        ),
                        path,
                        kind,
                    )
                    encoding = capture.get("response_content_encoding", "identity")
                    if not isinstance(encoding, str):
                        raise ValueError("encoding_type")
                    if kind == "response" and encoding.strip().lower() not in (
                        "",
                        "identity",
                    ):
                        check(
                            "WIRE_JSON_OBJECT_BINDING",
                            "UNSUPPORTED_ENCODING",
                            path,
                            kind,
                        )
                    else:
                        check(
                            "WIRE_JSON_OBJECT_BINDING",
                            (
                                "MATCH"
                                if strict_json(raw) == capture[kind]
                                else "MISMATCH"
                            ),
                            path,
                            kind,
                        )
                except (ValueError, TypeError, UnicodeError, RecursionError):
                    check("WIRE_CAPTURE_BINDING", "INVALID", path, kind)
            capture_pairs.append(tuple(pair))
            capture_objects.setdefault(tuple(pair), (path, capture))
            if "transport" in capture:
                sidecar = capture["transport"]
                if isinstance(sidecar, dict):
                    calculated = hashlib.sha256(encode(sidecar)).hexdigest()
                    check(
                        "TRANSPORT_SIDECAR_BINDING",
                        (
                            "MATCH"
                            if capture.get("transport_sha256") == calculated
                            else "MISSING_OR_MISMATCH"
                        ),
                        path,
                    )
                    for field in ("request_sha256", "response_sha256"):
                        check(
                            "TRANSPORT_CAPTURE_BINDING",
                            (
                                "MATCH"
                                if sidecar.get(field) == capture.get(field)
                                and field in capture
                                else "MISSING_OR_MISMATCH"
                            ),
                            path,
                            field,
                        )
                    engine = doc.get("engine", {})
                    if not isinstance(engine, dict):
                        engine = {}
                    for field in ("engine_build_sha256", "graph_sha256"):
                        check(
                            "TRANSPORT_ENGINE_BINDING",
                            (
                                "MATCH"
                                if field in engine
                                and sidecar.get(field) == engine.get(field)
                                else "MISSING_OR_MISMATCH"
                            ),
                            path,
                            field,
                        )
            transport = capture.get("transport", capture)
            if not isinstance(transport, dict):
                check("TRANSPORT_STRUCTURE", "INVALID", path)
                continue
            target = transport.get("request_target")
            try:
                if (
                    not isinstance(target, str)
                    or len(target) > 4096
                    or any(ord(c) < 33 or ord(c) > 126 for c in target)
                ):
                    raise ValueError("target")
                u = urlsplit(target)
                if (
                    u.scheme
                    or u.netloc
                    or u.fragment
                    or "#" in target
                    or u.path != "/route"
                ):
                    raise ValueError("target")
                if re.search(r"%(?![0-9a-fA-F]{2})", target):
                    raise ValueError("ambiguous_target")
                pairs = parse_qsl(
                    u.query,
                    keep_blank_values=True,
                    strict_parsing=True,
                    max_num_fields=32,
                )
                hints = [v for k, v in pairs if k.lower() == "ch.disable"]
                if len(hints) > 1 or any(
                    k.lower() == "ch.disable" and k != "ch.disable" for k, v in pairs
                ):
                    raise ValueError("hints")
                request = capture["request"]
                if any(
                    k.lower() == "ch.disable" and k != "ch.disable" for k in request
                ) or (
                    isinstance(request.get("hints"), dict)
                    and "ch.disable" in request["hints"]
                ):
                    raise ValueError("ambiguous_body_hints")
                body = capture["request"].get("ch.disable")
                if any(v != "true" for v in hints):
                    raise ValueError("conflicting_query_hint")
                if body is not True:
                    if "ch.disable" not in capture["request"] and hints == ["true"]:
                        check(
                            "POST_QUERY_EFFECT",
                            "INSTALLED_EFFECT_REVIEW_REQUIRED",
                            path,
                        )
                    else:
                        raise ValueError("body_hint_not_verified")
                good = (
                    transport.get("method") == "POST"
                    and type(transport.get("http_status", capture.get("http_status")))
                    is int
                    and transport.get("http_status", capture.get("http_status")) == 200
                    and capture["request"].get("profile") == "car"
                )
                check(
                    "TRANSPORT_DECLARATION",
                    "STRUCTURE_VALID" if good else "INVALID",
                    path,
                )
            except (ValueError, TypeError):
                check("TRANSPORT_DECLARATION", "UNVERIFIED_OR_CONFLICTING", path)
            if not any(
                isinstance(transport.get(k), str) and transport[k]
                for k in ("recording_point", "recording_hop")
            ):
                check("RECORDING_HOP", "MISSING", path)
            else:
                check("RECORDING_HOP", "CLAIM_PRESENT_UNAUTHENTICATED", path)
            for field in ("source_request_file_sha256",):
                if field in capture:
                    expected = capture[field]
                    found = (
                        isinstance(expected, str)
                        and HASH.fullmatch(expected)
                        and any(f["sha256"] == expected for f in files)
                    )
                    check(
                        "SOURCE_FILE_BYTE_REFERENCE",
                        "MATCH" if found else "NOT_IDENTIFIED_IN_INVENTORY",
                        path,
                        field,
                    )
            check("INSTALLED_ENGINE_AND_TRANSPORT", "INDEPENDENT_REVIEW_REQUIRED", path)
    bound_endpoint = False
    spec_doc = docs.get(endpoint_file["path"]) if endpoint_file else None
    for path, doc in docs.items():
        if not isinstance(doc, dict) or not all(
            field in doc for field in ("request_sha256", "response_sha256")
        ):
            continue
        if not all(
            isinstance(doc[field], str) and HASH.fullmatch(doc[field])
            for field in ("request_sha256", "response_sha256")
        ):
            check("RECEIPT_CAPTURE_PAIR", "INVALID_HASH", path)
            continue
        selected = capture_objects.get((doc["request_sha256"], doc["response_sha256"]))
        check(
            "RECEIPT_CAPTURE_PAIR",
            "MATCH" if selected else "NOT_IDENTIFIED_IN_INVENTORY",
            path,
        )
        if (
            selected
            and isinstance(spec_doc, dict)
            and type(spec_doc.get("fixture_id")) is int
            and type(doc.get("fixture_id")) is int
            and doc["fixture_id"] == spec_doc["fixture_id"]
        ):
            try:
                from voyagr.services.routing.journey_geometry import decode_geometry

                capture = selected[1]
                points = capture["request"]["points"]
                native = capture["response"]["paths"][0]
                multiplier = native.get("points_encoded_multiplier", 100000)
                if multiplier not in (100000, 1000000):
                    raise ValueError("precision")
                snaps = decode_geometry(
                    native["snapped_waypoints"], 5 if multiplier == 100000 else 6
                )
                good = (
                    points[0][::-1] == spec_doc["origin"]["coordinate"]
                    and list(snaps[0]) == spec_doc["target"]["coordinate"]
                )
                check(
                    "CAPTURE_ENDPOINT_BINDING",
                    "MATCH" if good else "MISMATCH",
                    endpoint_file["path"],
                )
            except (ValueError, KeyError, TypeError, IndexError, AttributeError):
                check(
                    "CAPTURE_ENDPOINT_BINDING",
                    "INVALID_OR_UNSUPPORTED",
                    endpoint_file["path"],
                )
            bound_endpoint = True
    if not bound_endpoint:
        check("CAPTURE_ENDPOINT_BINDING", "NO_UNIQUE_DECLARED_FIXTURE_BINDING")
    for role in (
        "transport_manifest",
        "graph_manifest",
        "profile_configuration",
        "road_source_receipt",
        "camera_dataset_receipt",
    ):
        for artifact in groups[role]:
            check(
                "ARTIFACT_PROVENANCE_SCHEMA",
                "FORMAT_AND_INSTALLED_RELATIONSHIP_REVIEW_REQUIRED",
                artifact["path"],
            )
    if len(set(capture_pairs)) < len(capture_pairs):
        check("CAPTURE_PAIRS", "DUPLICATE_CAPTURE_PAIR")
    check(
        "FIVE_CAPTURE_RECORDS",
        (
            "STRUCTURE_VALID"
            if len(groups["capture_record"]) == 5 and len(valid_capture_paths) == 5
            else "MISSING_OR_AMBIGUOUS"
        ),
    )
    check("PROVENANCE_AUTHENTICITY", "INDEPENDENT_REVIEW_REQUIRED")
    check("ORIGIN_INTEGRITY", "INDEPENDENT_REVIEW_REQUIRED")
    check("APPLICATION_DEVICE_ACCEPTANCE", "INDEPENDENT_REVIEW_REQUIRED")

    availability = {
        role: {
            "required_count": count,
            "present_count": len(groups[role]),
            "decoded_or_fingerprinted_count": sum(
                available_file(f, role) for f in groups[role]
            ),
        }
        for role, count in REQUIRED.items()
    }
    manifest = {
        "schema_version": 1,
        "scope": "PRIVATE_INDEPENDENT_REVIEW_PREPARATION_ONLY",
        **SAFETY,
        "originals": "EXTERNAL_OPERATOR_DIRECTORY_RELATIVE_PATHS_ONLY",
        "files": files,
        "duplicate_bytes": duplicates,
        "availability": availability,
        "deterministic": True,
        "atime_preservation": "REQUIRED_NO_ATIME_HANDLES",
    }
    results = {
        "schema_version": 1,
        **SAFETY,
        "checks": checks,
        "authenticity": "NOT_ESTABLISHED",
        "independent_approval": "NOT_PERFORMED",
    }
    unresolved = {
        "schema_version": 1,
        **SAFETY,
        "findings": findings,
        "restrictions": "NOT_RESOLVED_BY_PACKAGER",
        "operator_reported_findings": "PROVISIONAL_NOT_INDEPENDENTLY_APPROVED",
    }
    checklist = reviewer_checklist(availability, checks, groups)
    summary = (
        "Private Phase 12F-B independent review preparation\n\n"
        "PRODUCTION_NO_GO. Reviewed: false. Navigation authorized: false. Acceptance: UNVERIFIED.\n\n"
        f"Inventoried files: {len(files)}. Checks: {len(checks)}. Unresolved observations: {len(findings)}.\n\n"
        "Fingerprints were recomputed from supplied bytes where limits permit. MATCH establishes only the stated byte/object binding, not authenticity, recording hop, installed engine identity or approval.\n\n"
        "No originals were copied; no ZIP, accepted oracle reference, review approval, live request or routing result was generated. Keep this package and its relative filenames private.\n\n"
        "Operator-reported approximately 46.31 m origin displacement exceeds the two-metre gate; this packager does not recompute that displacement or waive it. Operator-reported five restriction relations and motorcar findings remain provisional pending source review.\n"
    )
    return {
        "evidence-manifest.json": json.dumps(
            manifest, sort_keys=True, indent=2
        ).encode(),
        "verification-results.json": json.dumps(
            results, sort_keys=True, indent=2
        ).encode(),
        "unresolved-findings.json": json.dumps(
            unresolved, sort_keys=True, indent=2
        ).encode(),
        "reviewer-checklist.md": checklist.encode(),
        "package-summary.md": summary.encode(),
    }


def reviewer_checklist(availability, checks, groups):
    items = [
        ("Capture byte integrity / strict JSON", "capture_record"),
        ("HTTP method, target, query and recording hop", "transport_manifest"),
        ("GraphHopper 8.0 build identity", "engine_provenance"),
        ("Loaded vehicle profile and configuration", "profile_configuration"),
        ("Graph-cache manifest and graph-import relationship", "graph_manifest"),
        ("Import receipt authenticity and loaded graph continuity", "import_receipt"),
        (
            "Road source identity, timestamp and extraction completeness",
            "road_source_receipt",
        ),
        ("Camera dataset identity and graph-import binding", "camera_dataset_receipt"),
        (
            "Exact requested/snapped origins and ordered OSM endpoint segments",
            "endpoint_specification",
        ),
        (
            "Five globally unresolved restriction relations / vehicle exceptions",
            "osm_export",
        ),
        ("Conditional access and physical barriers", "topology_report"),
        ("Provisional motorcar policy and complete report scope", "motorcar_report"),
        (
            "Reported 46.31 m displacement / two-metre integrity failure",
            "capture_record",
        ),
        (
            "Five-fixture replay readiness and separately accepted oracle reference",
            "offline_replay_report",
        ),
        ("Remaining application acceptance requirements", "application_acceptance"),
        ("Remaining device acceptance requirements", "device_acceptance"),
    ]
    text = """# Private independent reviewer checklist

Every item requires an authorised independent reviewer. This package does not approve evidence.

| Item | File availability | Machine verification | Operator assertions | Missing/unsupported evidence | Independent review |
| --- | --- | --- | --- | --- | --- |
"""
    for item, role in items:
        a = availability[role]
        available = (
            "MISSING_OR_UNIDENTIFIED"
            if a["present_count"] < a["required_count"]
            else "PRESENT_UNREVIEWED"
        )
        paths = {f["path"] for f in groups[role]}
        observations = [c for c in checks if c.get("artifact") in paths]
        matches = sum(c["status"] == "MATCH" for c in observations)
        fingerprints = sum(
            c["check"] == "FILE_FINGERPRINT" and c["status"] == "BYTES_RECOMPUTED"
            for c in observations
        )
        unresolved = sum(
            c["status"]
            not in (
                "MATCH",
                "STRUCTURE_VALID",
                "BYTES_RECOMPUTED",
                "CLAIM_PRESENT_UNAUTHENTICATED",
            )
            for c in observations
        )
        text += f'| {item} | {available} ({a["present_count"]}/{a["required_count"]}) | Byte fingerprints: {fingerprints}; matching declared bindings: {matches} | UNAUTHENTICATED; reported displacement not recomputed | Unresolved observations: {unresolved}; missing/unidentified role: {a["present_count"]<a["required_count"]} | REQUIRED, NOT PERFORMED |\n'
    return text + """
Record reviewer identity, date, scope, examined original hashes, recording-hop evidence,
installed-build/profile/graph/import relationships and unresolved limitations separately.
Do not edit original receipts, captures or reviewed flags to satisfy a tool. Unreviewed
receipts may support review after their underlying records are examined; a matching hash
is not an attestation. No accepted oracle_sha256 is generated by this workflow.

Windows file/folder ACLs must already restrict the private evidence and output parent.
The package retains relative filenames and hashes; deliberately share only with an
authorised reviewer. No package output automatically changes production eligibility.
"""


def prepare(root, output):
    destination = io.output_directory(root, output)
    files, blobs = io.inventory(root)
    documents = build(files, blobs)
    if sum(map(len, documents.values())) > 16 * 1024 * 1024:
        raise ValueError("package_output_limit")
    io.write_package(destination, documents)
    return len(files)

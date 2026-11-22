"""Separate authenticated Flask/test-client bridge to the real local GH11 process.

Selected fixture cases only. No app.run, production imports, persistent cache, live-provider
fallback, client edge keys, custom models or real navigation authority.
"""
import copy
import hashlib
import hmac
import json
import math
import os
from pathlib import Path
import re
import selectors
import signal
import subprocess
import tempfile
import threading
import time

from flask import Flask, Response, jsonify, request
from prototypes.graphhopper11.policy_compiler import compile_policy, normalize_policy, InvalidPolicy, CATEGORIES

SETTINGS_SOURCES = {"private_cache_adapter": Path(__file__).with_name("private_complete_cache.py"),
                    "private_cache_impl": Path(__file__).resolve().parents[2] / "voyagr/services/routing/private_route_cache.py",
                    "request_bridge": Path(__file__).with_name("app_request_bridge.py"),
                    "adapter": Path(__file__).with_name("app_settings_adapter.py"),
                    "contract": Path(__file__).resolve().parents[2] / "voyagr/avoidance_contract.py"}
COMPILER = Path(__file__).with_name("policy_compiler.py")
VIEWER_FILES = {name: Path(__file__).with_name(name) for name in ("isolated_viewer.js", "isolated_viewer.html")}

JAR_SHA256 = "8462f758d9ea49edaded557cec5c687a0a24f004ec371cd4daaeb0534824ea33"
RUNNER = Path(__file__).with_name("ReadOnlyRouteRegression.java")
MARKER = b"VOYAGR_GH11_REGRESSION "
WEB_ROOT = Path(__file__).resolve().parents[2] / "static/js"
BROWSER_ASSETS = {
    "gh11-uk-host-boot.js": Path(__file__).with_name("uk_host_boot.js"),
    "gh11-host-journey.js": Path(__file__).with_name("host_journey_adapter.js"),
    "speed-gps.js": WEB_ROOT / "modules/navigation/speed-gps.js",
    "gh11-journey-evidence.js": Path(__file__).with_name("journey_evidence.js"),
    "local-store.js": WEB_ROOT / "modules/privacy/local-store.js",
    "gh11-saved-plans.js": Path(__file__).with_name("saved_plans.js"),
    "polyline-codec.js": WEB_ROOT / "modules/navigation/polyline-codec.js",
    "strict-route-policy.js": WEB_ROOT / "modules/navigation/strict-route-policy.js",
    "avoidance-integrity.js": WEB_ROOT / "modules/navigation/avoidance-integrity.js",
    "navigation-safety-ux.js": WEB_ROOT / "app/navigation-safety-ux.js",
}


class Refused(ValueError):
    pass


class PolicyRefused(Refused):
    def __init__(self, report):
        super().__init__('mandatory_policy_unavailable')
        self.report = copy.deepcopy(report)


def digest(path):
    with Path(path).open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def graph_files(graph):
    graph = Path(graph)
    files = {}
    for path in sorted(graph.rglob("*")):
        if path.is_symlink():
            raise Refused("graph_symlink")
        if path.is_file():
            files[path.relative_to(graph).as_posix()] = digest(path)
    if not files:
        raise Refused("graph_missing")
    return files


def version(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


def build_manifest(*, jar, graph, config, registry, source):
    """Operator-owned local inputs, never an HTTP endpoint. Does not write files."""
    paths = {k: str(Path(v).resolve(strict=True)) for k, v in
             dict(jar=jar, graph=graph, config=config, registry=registry, source=source).items()}
    if digest(paths["jar"]) != JAR_SHA256:
        raise Refused("artifact_mismatch")
    hashes = {k: digest(paths[k]) for k in ("config", "registry", "source")}
    files = graph_files(paths["graph"])
    browser_hashes = {name: digest(path) for name, path in BROWSER_ASSETS.items()}
    viewer_hashes = {name: digest(path) for name, path in VIEWER_FILES.items()}
    settings_hashes = {name: digest(path) for name, path in SETTINGS_SOURCES.items()}
    return {"schema": 2, "settings_hashes": settings_hashes, "paths": paths, "hashes": hashes, "graph_files": files,
            "graph_version": version(files), "source_version": hashes["source"],
            "policy_version": version([hashes["registry"], hashes["config"], digest(RUNNER), digest(__file__), browser_hashes, digest(COMPILER), viewer_hashes, settings_hashes]),
            "viewer_hashes": viewer_hashes, "compiler_sha256": digest(COMPILER), "browser_hashes": browser_hashes, "runner_sha256": digest(RUNNER), "bridge_sha256": digest(__file__), "engine_sha256": JAR_SHA256}


class LocalJavaBridge:
    def __init__(self, manifest, *, java="java", timeout=60, output_limit=2*1024*1024, heap_mb=512):
        self.manifest = copy.deepcopy(manifest)
        self.java = java
        if not 1 <= timeout <= 120 or not 1024 <= output_limit <= 2*1024*1024:
            raise ValueError("invalid_transport_limits")
        if type(heap_mb) is not int or heap_mb not in (512, 1024, 2048, 4096):
            raise ValueError("invalid_heap_limit")
        self.heap_mb = heap_mb
        self.timeout, self.output_limit = timeout, output_limit
        self.verify(check_source=True)
        self.registry = json.loads(Path(self.manifest["paths"]["registry"]).read_text())
        if self.registry.get("source_pbf_sha256", self.manifest["source_version"]) != self.manifest["source_version"]:
            raise Refused("registry_source_mismatch")
        cases = self.registry.get("cases", [])
        if not isinstance(cases, list) or not 1 <= len(cases) <= 10:
            raise Refused("registry_contract")
        self.cases = {}
        for case in cases:
            name = case.get("id")
            if not isinstance(name, str) or not re.fullmatch(r"[A-Za-z0-9_-]{1,80}", name) or name in self.cases:
                raise Refused("registry_identity")
            self.cases[name] = case
        self.lock = threading.Lock()
        # Bounded, process-local public fixtures only. Never persisted or shared
        # with production; cache entries retain raw evidence, not trusted verdicts.
        self.cache = {}

    def settings(self, case_id):
        case = self.cases[case_id]
        return {"profile": "car", "alternatives": bool(case.get("alternatives", False)),
                "no_motorways": bool(case.get("no_motorways", False)),
                "mandatory_associations": sorted(case.get("blocked_associations", [])),
                "both_directions": bool(case.get("block_both_directions", False))}

    def policy(self, case_id, selected=None):
        return compile_policy(selected if selected is not None else {'profile':'car','requirements':[]},
                              registered_no_motorways=self.cases[case_id].get('no_motorways') is True)

    def plan_reference(self, case_id, selected=None):
        result = {"schema": 2 if selected is not None else 1, "case_id": case_id,
                **{key: self.manifest[key] for key in ("graph_version", "source_version", "policy_version")},
                "selected_settings": self.settings(case_id), "request_binding": self.binding(case_id, selected)}
        if selected is not None:
            result['policy_request'] = normalize_policy(selected)
        return result

    def binding(self, case_id, selected=None):
        base = version([self.manifest["graph_version"], self.manifest["source_version"],
                        self.manifest["policy_version"], self.cases[case_id], self.settings(case_id)])
        return base if selected is None else version([base, normalize_policy(selected)])

    def verify(self, *, check_source=False):
        m = self.manifest
        if m.get("schema") != 2 or m.get("engine_sha256") != JAR_SHA256:
            raise Refused("manifest_contract")
        if m.get("settings_hashes") != {name: digest(path) for name, path in SETTINGS_SOURCES.items()}:
            raise Refused("runtime_changed")
        if m.get("compiler_sha256") != digest(COMPILER):
            raise Refused("runtime_changed")
        if digest(m["paths"]["jar"]) != JAR_SHA256 or digest(RUNNER) != m["runner_sha256"] or digest(__file__) != m["bridge_sha256"]:
            raise Refused("runtime_changed")
        if {name: digest(path) for name, path in BROWSER_ASSETS.items()} != m["browser_hashes"]:
            raise Refused("browser_policy_changed")
        if {name: digest(path) for name, path in VIEWER_FILES.items()} != m.get("viewer_hashes"):
            raise Refused("browser_policy_changed")
        for key in ("config", "registry") + (("source",) if check_source else ()):
            if digest(m["paths"][key]) != m["hashes"][key]:
                raise Refused("input_changed")
        files = graph_files(m["paths"]["graph"])
        if files != m["graph_files"] or version(files) != m["graph_version"]:
            raise Refused("graph_changed")
        if (m["source_version"] != m["hashes"]["source"] or m["policy_version"] !=
                version([m["hashes"]["registry"], m["hashes"]["config"], m["runner_sha256"], m["bridge_sha256"], m["browser_hashes"], m["compiler_sha256"], m["viewer_hashes"], m["settings_hashes"]])):
            raise Refused("version_mismatch")

    def _execute(self, fixture, directory):
        command = [self.java, f"-Xmx{self.heap_mb}m", "-XX:ActiveProcessorCount=1", "--class-path",
                   self.manifest["paths"]["jar"], str(RUNNER), self.manifest["paths"]["config"],
                   self.manifest["paths"]["graph"], str(fixture)]
        output = bytearray()
        process = subprocess.Popen(command, cwd=directory, stdin=subprocess.DEVNULL,
                                   stdout=subprocess.PIPE, stderr=subprocess.STDOUT, start_new_session=True)
        deadline = time.monotonic() + self.timeout
        completed = False
        try:
            with selectors.DefaultSelector() as selector:
                selector.register(process.stdout, selectors.EVENT_READ)
                while selector.get_map():
                    remaining = deadline - time.monotonic()
                    if remaining <= 0:
                        raise Refused("transport_timeout")
                    for key, _ in selector.select(min(remaining, .2)):
                        chunk = os.read(key.fd, 65536)
                        if not chunk:
                            selector.unregister(key.fileobj)
                        else:
                            output.extend(chunk)
                            if len(output) > self.output_limit:
                                raise Refused("transport_output_limit")
            code = process.wait(timeout=max(.01, deadline-time.monotonic()))
            completed = True
        finally:
            if not completed:
                try:
                    os.killpg(process.pid, signal.SIGKILL)
                except ProcessLookupError:
                    pass
            if process.poll() is None:
                process.wait()
            process.stdout.close()
        rows = [line[len(MARKER):] for line in bytes(output).splitlines() if line.startswith(MARKER)]
        if len(rows) != 1:
            raise Refused("transport_report_missing")
        report = json.loads(rows[0])
        if code != 0:
            raise Refused("engine_refused")
        return report

    def route(self, case_id, selected=None, *, force_refresh=False, evidence_cache=None, cache_key=None):
        if case_id not in self.cases:
            raise Refused("case_not_registered")
        policy = self.policy(case_id, selected)
        if not policy['route_preview_allowed']:
            raise PolicyRefused(policy)
        if not self.lock.acquire(blocking=False):
            raise Refused("transport_busy")
        try:
            self.verify()
            binding = self.binding(case_id, selected)
            now = time.monotonic()
            self.cache = {key: entry for key, entry in self.cache.items() if entry[0] > now}
            private = evidence_cache is not None and isinstance(cache_key,str) and not force_refresh
            try:
                cached = evidence_cache.get(cache_key) if private else None if force_refresh else self.cache.get(binding)
            except Exception:
                if private:
                    evidence_cache.clear()
                raise Refused('cached_evidence_refused') from None
            if cached is not None:
                try:
                    # Re-run the same independent validation for every candidate.
                    result = self.validate(copy.deepcopy(cached if private else cached[1]), self.cases[case_id], selected)
                    self.verify()
                    return result
                except Exception:
                    if private:
                        evidence_cache.clear()
                    else:
                        self.cache.pop(binding, None)
                    raise Refused("cached_evidence_refused") from None
            fixture = copy.deepcopy(self.registry)
            case = copy.deepcopy(self.cases[case_id])
            case["include_path_data"] = True
            fixture["cases"] = [case]
            with tempfile.TemporaryDirectory(prefix="voyagr-gh11-app-") as directory:
                path = Path(directory) / "request.json"
                path.write_text(json.dumps(fixture))
                report = self._execute(path, directory)
            self.verify()
            result = self.validate(report, case, selected)
            if private:
                evidence_cache.set(cache_key,report)
            elif not force_refresh:
                if len(self.cache) >= 8:
                    self.cache.pop(next(iter(self.cache)))
                self.cache[binding] = (time.monotonic() + 30, copy.deepcopy(report))
            return result
        finally:
            self.lock.release()

    def validate(self, report, case, selected=None):
        policy = self.policy(case['id'], selected)
        if not policy['route_preview_allowed']:
            raise PolicyRefused(policy)
        if report.get("engine_version") != "11.1" or report.get("all_available_graph_checks_passed") is not True:
            raise Refused("engine_contract")
        cases = report.get("cases")
        if not isinstance(cases, list) or len(cases) != 1:
            raise Refused("case_contract")
        result = cases[0]
        if result.get("id") != case["id"] or result.get("status") != "PASS_AVAILABLE_GRAPH_CHECKS":
            raise Refused("case_refused")
        if any(result.get(name) is not bool(case.get(name, False)) for name in ("alternatives", "no_motorways")):
            raise Refused("settings_evidence_mismatch")
        blocked = result.get("blocked_edge_keys")
        if not isinstance(blocked, list) or any(type(k) is not int or k < 0 for k in blocked):
            raise Refused("block_contract")
        evidence = report.get("associations", [])
        sources = {}
        for source in evidence:
            if source.get("status") != "PASS_AVAILABLE_GRAPH_CHECKS" or source.get("id") in sources:
                raise Refused("association_contract")
            candidates = source.get("candidates", [])
            if len(candidates) != 1:
                raise Refused("association_contract")
            source_keys = candidates[0].get("directed_edge_keys")
            if not isinstance(source_keys, list) or not source_keys or any(type(k) is not int or k < 0 for k in source_keys):
                raise Refused("association_contract")
            sources[source["id"]] = source_keys
        if set(sources) != {s["id"] for s in self.registry.get("associations", [])}:
            raise Refused("association_registry_mismatch")
        expected = set()
        for name in case.get("blocked_associations", []):
            if name not in sources:
                raise Refused("association_missing")
            for key in sources[name]:
                expected.add(key)
                if case.get("block_both_directions"):
                    expected.add(key ^ 1)
        if blocked != sorted(expected):
            raise Refused("blocks_mismatch")
        rows = result.get("candidates")
        if not isinstance(rows, list) or not 1 <= len(rows) <= (3 if case.get("alternatives") else 1):
            raise Refused("candidate_contract")
        identities = set()
        for row in rows:
            geometry = row.get("geometry", {})
            coords = geometry.get("coordinates")
            if geometry.get("type") != "LineString" or not isinstance(coords, list) or not 2 <= len(coords) <= 20000:
                raise Refused("geometry_contract")
            for point in coords:
                if (not isinstance(point, list) or len(point) != 2 or
                        any(type(x) not in (float, int) or not math.isfinite(x) for x in point)
                        or abs(point[0]) > 180 or abs(point[1]) > 90):
                    raise Refused("geometry_contract")
            intervals = row.get("edge_intervals")
            if not isinstance(intervals, list) or not intervals:
                raise Refused("trace_missing")
            cursor, keys = 0, []
            for interval in intervals:
                if (not isinstance(interval, list) or len(interval) != 3 or
                        any(type(x) is not int for x in interval)):
                    raise Refused("trace_contract")
                first, last, key = interval
                if first != cursor or not first < last < len(coords) or key < 0 or key in blocked:
                    raise Refused("trace_or_exclusion_violation")
                cursor = last
                if not keys or keys[-1] != key:
                    keys.append(key)
            if cursor != len(coords)-1 or keys != row.get("directed_edge_keys") or len(keys) != row.get("directed_edges") or tuple(keys) in identities:
                raise Refused("trace_contract")
            identities.add(tuple(keys))
            instructions = row.get("instruction_details")
            if not isinstance(instructions, list) or not instructions or len(instructions) != row.get("instructions"):
                raise Refused("instructions_missing")
            cursor = 0
            for instruction in instructions:
                if (not isinstance(instruction, dict) or not isinstance(instruction.get("name"), str)
                        or type(instruction.get("sign")) is not int):
                    raise Refused("instruction_contract")
                interval = instruction.get("interval")
                if (instruction["sign"] not in PREVIEW_SIGN_TYPES or not isinstance(instruction.get("text"), str)
                        or not instruction["text"].strip() or len(instruction["text"]) > 2000
                        or not isinstance(interval, list) or len(interval) != 2
                        or any(type(x) is not int for x in interval)
                        or interval[0] != cursor or not cursor <= interval[1] < len(coords)):
                    raise Refused("instruction_interval_contract")
                cursor = interval[1]
                for field in ("distance_m", "time_ms"):
                    if type(instruction.get(field)) not in (int, float) or not math.isfinite(instruction[field]) or instruction[field] < 0:
                        raise Refused("instruction_contract")
            indices = row.get("waypoint_indices")
            if (cursor != len(coords)-1 or type(result.get("requested_points")) is not int or not isinstance(indices, list) or not 2 <= len(indices) <= 5
                    or len(indices) != result.get("requested_points")
                    or any(type(x) is not int or not 0 <= x < len(coords) for x in indices)
                    or indices[0] != 0 or indices[-1] != len(coords)-1
                    or indices != sorted(indices)):
                raise Refused("waypoint_or_instruction_coverage")
            for field in ("distance_km", "duration_minutes"):
                if type(row.get(field)) not in (int, float) or not math.isfinite(row[field]) or row[field] < 0:
                    raise Refused("metrics_contract")
            if row["distance_km"] <= 0:
                raise Refused("metrics_contract")
        public_rows = []
        fields = ("distance_km", "duration_minutes", "directed_edges", "instructions", "geometry",
                  "instruction_details", "edge_intervals", "directed_edge_keys", "waypoint_indices")
        for row in rows:
            public_rows.append({**{key: row[key] for key in fields}, "forbidden_traversals": 0,
                                "navigation_allowed": False, "scope": "selected_fixture_graph_checks_only"})
        m = self.manifest
        result = {"success": True, "case_id": case["id"], "engine_version": "11.1",
                "selected_settings": self.settings(case["id"]), "request_binding": self.binding(case["id"], selected),
                "policy_report": policy,
                "plan_reference": self.plan_reference(case["id"], selected),
                **{key: m[key] for key in ("graph_version", "source_version", "policy_version")},
                "scope": "selected_fixture_graph_checks_only", "navigation_allowed": False,
                "production_migration": "NO_GO", "blocked_edge_keys": blocked, "candidates": public_rows}
        result["app_preview"] = app_preview(result)
        return result



# Preview mapping mirrors the established application signs; a parity regression
# checks voyagr.utils.graphhopper. Unknown signs refuse instead of guessing straight.
PREVIEW_SIGN_TYPES = {-98:13, -8:13, -7:24, -6:27, -3:14, -2:15, -1:16,
                      0:8, 1:9, 2:10, 3:11, 4:4, 5:0, 6:26, 7:23, 8:12}


def app_preview(result):
    """Validated registered-case evidence -> real app planning shape; never authority."""
    routes = []
    for row in result["candidates"]:
        points = [[math.floor(lat*1e6+.5), math.floor(lon*1e6+.5)]
                  for lon, lat in row["geometry"]["coordinates"]]
        encoded, previous = [], [0, 0]
        binding = 2166136261
        for point in points:
            for axis in (0, 1):
                delta = point[axis]-previous[axis]
                previous[axis] = point[axis]
                value = ~(delta << 1) if delta < 0 else delta << 1
                while value >= 32:
                    encoded.append(chr((32 | (value & 31))+63)); value >>= 5
                encoded.append(chr(value+63))
            for char in f"{point[0]},{point[1]};":
                binding = ((binding ^ ord(char))*16777619) & 0xffffffff
        identity = version([result["request_binding"], row["directed_edge_keys"], row["geometry"]])
        maneuvers = [{"type": PREVIEW_SIGN_TYPES[item["sign"]], "instruction": item["text"],
                      "begin_shape_index": item["interval"][0], "end_shape_index": item["interval"][1],
                      "length": item["distance_m"]/1000, "time": item["time_ms"]/1000,
                      "street_names": [item["name"]] if item["name"] else []}
                     for item in row["instruction_details"]]
        indices = row["waypoint_indices"]
        routes.append({"id": identity, "source": "GraphHopper 11.1 isolated preview",
                       "geometry": "".join(encoded), "geometry_precision": 6,
                       "polyline": [[lat/1e6, lon/1e6] for lat, lon in points],
                       "distance_km": row["distance_km"], "duration_minutes": row["duration_minutes"],
                       "maneuvers": maneuvers, "geometry_complete": True,
                       "leg_geometry_ranges": [{"leg_index": i, "start_shape_index": indices[i],
                                                "end_shape_index": indices[i+1], "preview_only": True}
                                               for i in range(len(indices)-1)],
                       "gh11_evidence": copy.deepcopy(row),
                       "routing_context": {**{key: result[key] for key in
                           ("graph_version", "source_version", "policy_version", "request_binding")},
                           "scope": "selected_fixture_graph_checks_only"},
                       "navigation_allowed": False, "automatic_selection_allowed": False,
                       "avoidance_assessment": {"status": "UNVERIFIED", "geometry_valid": True,
                           "checked_at": time.time(), "geometry_binding": f"{binding:08x}",
                           "requirements": [dict(rule, status='UNVERIFIED' if rule['enabled'] else 'DISABLED')
                                            for rule in result['policy_report']['selected']['requirements']],
                           "automatic_selection_allowed": False,
                           "claim": "selected_fixture_graph_checks_only"}})
    return {"success": True, "routes": routes, "navigation_allowed": False,
            "scope": "selected_fixture_graph_checks_only", "production_migration": "NO_GO"}


def create_app(manifest, *, password, java="java", timeout=60, heap_mb=512):
    """Factory only: no listener starts here. Separate secret, never a UK credential."""
    if not isinstance(password, str) or len(password) < 32:
        raise ValueError("separate_strong_password_required")
    bridge = LocalJavaBridge(manifest, java=java, timeout=timeout, heap_mb=heap_mb)
    app = Flask(__name__)
    app.config.update(MAX_CONTENT_LENGTH=4096, TESTING=False)
    app.extensions["gh11_bridge"] = bridge
    from prototypes.graphhopper11.app_request_bridge import RegisteredAppRequestBridge, public_request_template
    from prototypes.graphhopper11.private_complete_cache import PrivateCompleteCache
    private_cache = PrivateCompleteCache()
    app.extensions["gh11_private_cache"] = private_cache
    complete_bridge = RegisteredAppRequestBridge(bridge,private_cache=private_cache)
    app.extensions["gh11_app_request_bridge"] = complete_bridge

    @app.before_request
    def authenticate():
        auth = request.authorization
        if not auth or auth.type.lower() != "basic" or auth.username != "prototype" or not hmac.compare_digest((auth.password or "").encode(), password.encode()):
            return Response(status=401, headers={"WWW-Authenticate": 'Basic realm="Isolated GH11"'})
        if request.method == "POST" and (request.headers.get("Sec-Fetch-Site") == "cross-site" or
                request.headers.get("Origin", request.host_url.rstrip("/")) != request.host_url.rstrip("/")):
            return jsonify(success=False, reason="cross_origin_refused", navigation_allowed=False), 403

    @app.before_request
    def policy_body_limit():
        if request.method == 'POST' and request.path in ('/api/prototype/route','/api/prototype/restore'):
            # Legacy envelopes retain 1 KiB; full canonical policy lists get a
            # bounded 4 KiB envelope. Flask bounds the read before JSON parsing.
            raw = request.get_data(cache=True)
            if len(raw) > 1024:
                body = request.get_json(silent=True)
                if not isinstance(body, dict) or 'policy_request' not in body:
                    return jsonify(success=False, reason='request_too_large', navigation_allowed=False), 413

    @app.after_request
    def private_response(response):
        response.headers["Cache-Control"] = "private, no-store"
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "no-referrer"
        response.headers["Content-Security-Policy"] = "default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'"
        return response

    @app.get("/")
    def viewer():
        return Response(Path(__file__).with_name("isolated_viewer.html").read_text(), mimetype="text/html")

    @app.get("/strict-assets/<name>")
    def strict_asset(name):
        if name not in BROWSER_ASSETS:
            return Response(status=404)
        return Response(BROWSER_ASSETS[name].read_text(), mimetype="application/javascript")

    @app.get("/prototype-viewer.js")
    def viewer_script():
        return Response(Path(__file__).with_name("isolated_viewer.js").read_text(), mimetype="application/javascript")

    @app.get("/api/prototype/cases")
    def cases():
        templates = {}
        for name,case in bridge.cases.items():
            try:
                templates[name] = public_request_template(case)
            except Refused:
                pass  # Anchor-only legacy cases keep their existing preview path.
        return jsonify(case_requests=templates, cases=list(bridge.cases), policy_categories=list(CATEGORIES), case_settings={name: bridge.settings(name) for name in bridge.cases},
                       case_bindings={name: bridge.binding(name) for name in bridge.cases},
                       navigation_allowed=False)

    @app.post("/api/prototype/route")
    def route():
        body = request.get_json(silent=True)
        required = {"case_id", "graph_version", "source_version", "policy_version"}
        if (not isinstance(body, dict) or not required <= set(body)
                or not set(body) <= required | {"selected_settings", "policy_request"}):
            return jsonify(success=False, reason="request_contract", navigation_allowed=False), 400
        if not isinstance(body["case_id"], str) or body["case_id"] not in bridge.cases:
            return jsonify(success=False, reason="case_not_registered", navigation_allowed=False), 400
        if "selected_settings" in body and version(body["selected_settings"]) != version(bridge.settings(body["case_id"])):
            return jsonify(success=False, reason="settings_not_registered", navigation_allowed=False), 400
        if any(body[key] != bridge.manifest[key] for key in ("graph_version", "source_version", "policy_version")):
            return jsonify(success=False, reason="version_changed", navigation_allowed=False), 409
        try:
            selected = normalize_policy(body['policy_request']) if 'policy_request' in body else None
        except InvalidPolicy as error:
            return jsonify(success=False, reason=str(error), navigation_allowed=False), 400
        return calculate_registered(body["case_id"], selected)

    @app.post("/api/prototype/policy")
    def policy_preflight():
        body = request.get_json(silent=True)
        required = {'case_id', 'graph_version', 'source_version', 'policy_version'}
        if not isinstance(body, dict) or set(body) not in (required | {'policy_request'}, required | {'app_settings'}) or not isinstance(body.get('case_id'), str) or body['case_id'] not in bridge.cases:
            return jsonify(success=False, reason='request_contract', navigation_allowed=False), 400
        if any(body[key] != bridge.manifest[key] for key in ('graph_version','source_version','policy_version')):
            return jsonify(success=False, reason='version_changed', navigation_allowed=False), 409
        try:
            if 'app_settings' in body:
                from prototypes.graphhopper11.app_settings_adapter import adapt_settings
                adapted = adapt_settings(body['app_settings'])
                selected = normalize_policy(dict(adapted['policy_request'], app_settings=adapted['app_settings']))
            else:
                selected = normalize_policy(body['policy_request'])
        except ValueError as error:
            return jsonify(success=False, reason=str(error), navigation_allowed=False), 400
        return calculate_registered(body['case_id'], selected, preflight=True)

    @app.post("/api/prototype/restore")
    def restore():
        # References are selectors, never proof of route compliance. Do not
        # accept geometry, cached verdicts, authority flags or arbitrary settings.
        body = request.get_json(silent=True)
        fields = {"schema", "case_id", "graph_version", "source_version", "policy_version",
                  "selected_settings", "request_binding"}
        if (not isinstance(body, dict) or type(body.get("schema")) is not int
                or body['schema'] not in (1, 2)
                or set(body) != (fields | {'policy_request'} if body['schema'] == 2 else fields) or not isinstance(body.get("case_id"), str)
                or body["case_id"] not in bridge.cases):
            return jsonify(success=False, reason="plan_reference_contract", navigation_allowed=False), 400
        try:
            selected = normalize_policy(body['policy_request']) if body['schema'] == 2 else None
        except InvalidPolicy as error:
            return jsonify(success=False, reason=str(error), navigation_allowed=False), 400
        if version(body) != version(bridge.plan_reference(body["case_id"], selected)):
            return jsonify(success=False, reason="plan_reference_changed", navigation_allowed=False), 409
        return calculate_registered(body["case_id"], selected)

    def calculate_registered(case_id, selected=None, preflight=False):
        try:
            if preflight:
                bridge.verify()
                report = bridge.policy(case_id, selected)
                if not report['route_preview_allowed']:
                    raise PolicyRefused(report)
                return jsonify(success=True, policy_report=report, request_binding=bridge.binding(case_id, selected), navigation_allowed=False)
            return jsonify(bridge.route(case_id, selected))
        except PolicyRefused as error:
            return jsonify(success=False, reason='profile_not_supported' if not error.report['profile_supported'] else 'mandatory_avoidance_unavailable', policy_report=error.report, navigation_allowed=False), 422
        except Refused as error:
            safe = {"engine_refused": 422, "transport_busy": 503, "transport_timeout": 504,
                    "transport_output_limit": 422, "graph_changed": 409, "input_changed": 409,
                    "runtime_changed": 409}
            code = str(error) if str(error) in safe else "routing_refused"
            return jsonify(success=False, reason=code, navigation_allowed=False), safe.get(code, 422)
        except Exception:
            # No stack traces, engine logs, filesystem paths or supplied secrets.
            return jsonify(success=False, reason="routing_refused", navigation_allowed=False), 422

    @app.post('/api/prototype/app-policy')
    @app.post('/api/prototype/app-route')
    @app.post('/api/prototype/app-restore')
    @private_cache.protect
    def complete_request():
        body = request.get_json(silent=True)
        try:
            if request.path.endswith('/app-restore'):
                result = complete_bridge.restore(body)
            else:
                required = {'case_id','graph_version','source_version','policy_version','app_request'}
                if not isinstance(body,dict) or set(body) != required:
                    raise Refused('app_request_contract')
                identities = {key:body[key] for key in ('graph_version','source_version','policy_version')}
                method = complete_bridge.preflight if request.path.endswith('/app-policy') else complete_bridge.calculate
                result = method(body['case_id'],body['app_request'],identities)
            return jsonify(result)
        except PolicyRefused as error:
            return jsonify(success=False,reason='mandatory_avoidance_unavailable',policy_report=error.report,navigation_allowed=False),422
        except Refused as error:
            code = str(error)
            contracts = {'app_request_contract','app_reference_contract','request_coordinates','app_request_boolean',
                         'ordered_visits_contract','visit_provenance_contract','cost_parameter_contract',
                         'journey_not_registered','case_not_registered'}
            versions = {'version_changed','app_reference_changed','runtime_changed','graph_changed','input_changed'}
            safe = contracts | versions | {'engine_refused','transport_busy','transport_timeout',
                    'stop_semantics_not_supported','journey_optimization_not_supported','time_sensitive_journey_not_supported'}
            return jsonify(success=False,reason=code if code in safe else 'routing_refused',navigation_allowed=False), (400 if code in contracts else 409 if code in versions else 503 if code=='transport_busy' else 504 if code=='transport_timeout' else 422)
        except Exception:
            return jsonify(success=False,reason='routing_refused',navigation_allowed=False),422

    @app.get("/api/prototype/versions")
    def versions():
        return jsonify(**{key: bridge.manifest[key] for key in ("graph_version", "source_version", "policy_version")}, navigation_allowed=False)

    return app

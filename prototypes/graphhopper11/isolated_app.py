"""Separate authenticated Flask/test-client bridge to the real local GH11 process.

Selected fixture cases only. No app.run, production imports, cache, live-provider
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

JAR_SHA256 = "8462f758d9ea49edaded557cec5c687a0a24f004ec371cd4daaeb0534824ea33"
RUNNER = Path(__file__).with_name("ReadOnlyRouteRegression.java")
MARKER = b"VOYAGR_GH11_REGRESSION "


class Refused(ValueError):
    pass


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
    return {"schema": 1, "paths": paths, "hashes": hashes, "graph_files": files,
            "graph_version": version(files), "source_version": hashes["source"],
            "policy_version": version([hashes["registry"], hashes["config"], digest(RUNNER), digest(__file__)]),
            "runner_sha256": digest(RUNNER), "bridge_sha256": digest(__file__), "engine_sha256": JAR_SHA256}


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

    def verify(self, *, check_source=False):
        m = self.manifest
        if m.get("schema") != 1 or m.get("engine_sha256") != JAR_SHA256:
            raise Refused("manifest_contract")
        if digest(m["paths"]["jar"]) != JAR_SHA256 or digest(RUNNER) != m["runner_sha256"] or digest(__file__) != m["bridge_sha256"]:
            raise Refused("runtime_changed")
        for key in ("config", "registry") + (("source",) if check_source else ()):
            if digest(m["paths"][key]) != m["hashes"][key]:
                raise Refused("input_changed")
        files = graph_files(m["paths"]["graph"])
        if files != m["graph_files"] or version(files) != m["graph_version"]:
            raise Refused("graph_changed")
        if (m["source_version"] != m["hashes"]["source"] or m["policy_version"] !=
                version([m["hashes"]["registry"], m["hashes"]["config"], m["runner_sha256"], m["bridge_sha256"]])):
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

    def route(self, case_id):
        if case_id not in self.cases:
            raise Refused("case_not_registered")
        if not self.lock.acquire(blocking=False):
            raise Refused("transport_busy")
        try:
            self.verify()
            fixture = copy.deepcopy(self.registry)
            case = copy.deepcopy(self.cases[case_id])
            case["include_path_data"] = True
            fixture["cases"] = [case]
            with tempfile.TemporaryDirectory(prefix="voyagr-gh11-app-") as directory:
                path = Path(directory) / "request.json"
                path.write_text(json.dumps(fixture))
                report = self._execute(path, directory)
            self.verify()
            return self.validate(report, case)
        finally:
            self.lock.release()

    def validate(self, report, case):
        if report.get("engine_version") != "11.1" or report.get("all_available_graph_checks_passed") is not True:
            raise Refused("engine_contract")
        cases = report.get("cases")
        if not isinstance(cases, list) or len(cases) != 1:
            raise Refused("case_contract")
        result = cases[0]
        if result.get("id") != case["id"] or result.get("status") != "PASS_AVAILABLE_GRAPH_CHECKS":
            raise Refused("case_refused")
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
            for instruction in instructions:
                if (not isinstance(instruction, dict) or not isinstance(instruction.get("name"), str)
                        or type(instruction.get("sign")) is not int):
                    raise Refused("instruction_contract")
                for field in ("distance_m", "time_ms"):
                    if type(instruction.get(field)) not in (int, float) or not math.isfinite(instruction[field]) or instruction[field] < 0:
                        raise Refused("instruction_contract")
            for field in ("distance_km", "duration_minutes"):
                if type(row.get(field)) not in (int, float) or not math.isfinite(row[field]) or row[field] < 0:
                    raise Refused("metrics_contract")
            if row["distance_km"] <= 0:
                raise Refused("metrics_contract")
        public_rows = []
        fields = ("distance_km", "duration_minutes", "directed_edges", "instructions", "geometry",
                  "instruction_details", "edge_intervals", "directed_edge_keys")
        for row in rows:
            public_rows.append({**{key: row[key] for key in fields}, "forbidden_traversals": 0,
                                "navigation_allowed": False, "scope": "selected_fixture_graph_checks_only"})
        m = self.manifest
        return {"success": True, "case_id": case["id"], "engine_version": "11.1",
                **{key: m[key] for key in ("graph_version", "source_version", "policy_version")},
                "scope": "selected_fixture_graph_checks_only", "navigation_allowed": False,
                "production_migration": "NO_GO", "blocked_edge_keys": blocked, "candidates": public_rows}


def create_app(manifest, *, password, java="java", timeout=60, heap_mb=512):
    """Factory only: no listener starts here. Separate secret, never a UK credential."""
    if not isinstance(password, str) or len(password) < 32:
        raise ValueError("separate_strong_password_required")
    bridge = LocalJavaBridge(manifest, java=java, timeout=timeout, heap_mb=heap_mb)
    app = Flask(__name__)
    app.config.update(MAX_CONTENT_LENGTH=1024, TESTING=False)
    app.extensions["gh11_bridge"] = bridge

    @app.before_request
    def authenticate():
        auth = request.authorization
        if not auth or auth.type.lower() != "basic" or auth.username != "prototype" or not hmac.compare_digest((auth.password or "").encode(), password.encode()):
            return Response(status=401, headers={"WWW-Authenticate": 'Basic realm="Isolated GH11"'})
        if request.method == "POST" and (request.headers.get("Sec-Fetch-Site") == "cross-site" or
                request.headers.get("Origin", request.host_url.rstrip("/")) != request.host_url.rstrip("/")):
            return jsonify(success=False, reason="cross_origin_refused", navigation_allowed=False), 403

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

    @app.get("/prototype-viewer.js")
    def viewer_script():
        return Response(Path(__file__).with_name("isolated_viewer.js").read_text(), mimetype="application/javascript")

    @app.get("/api/prototype/cases")
    def cases():
        return jsonify(cases=list(bridge.cases), navigation_allowed=False)

    @app.post("/api/prototype/route")
    def route():
        body = request.get_json(silent=True)
        if not isinstance(body, dict) or set(body) != {"case_id", "graph_version", "source_version", "policy_version"}:
            return jsonify(success=False, reason="request_contract", navigation_allowed=False), 400
        if not isinstance(body["case_id"], str) or body["case_id"] not in bridge.cases:
            return jsonify(success=False, reason="case_not_registered", navigation_allowed=False), 400
        if any(body[key] != bridge.manifest[key] for key in ("graph_version", "source_version", "policy_version")):
            return jsonify(success=False, reason="version_changed", navigation_allowed=False), 409
        try:
            return jsonify(bridge.route(body["case_id"]))
        except Refused as error:
            safe = {"engine_refused": 422, "transport_busy": 503, "transport_timeout": 504,
                    "transport_output_limit": 422, "graph_changed": 409, "input_changed": 409,
                    "runtime_changed": 409}
            code = str(error) if str(error) in safe else "routing_refused"
            return jsonify(success=False, reason=code, navigation_allowed=False), safe.get(code, 422)
        except Exception:
            # No stack traces, engine logs, filesystem paths or supplied secrets.
            return jsonify(success=False, reason="routing_refused", navigation_allowed=False), 422

    @app.get("/api/prototype/versions")
    def versions():
        return jsonify(**{key: bridge.manifest[key] for key in ("graph_version", "source_version", "policy_version")}, navigation_allowed=False)

    return app

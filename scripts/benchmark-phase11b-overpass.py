#!/usr/bin/env python3
"""Synthetic before/after acquisition benchmark; optional loopback mock HTTP only."""
import argparse
from concurrent.futures import ThreadPoolExecutor
import importlib.util
import json
import logging
from pathlib import Path
import statistics
import subprocess
import sys
import threading
import time
import tracemalloc
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import requests
import overpass_helper as after
from voyagr.utils import request_budget as rb
from flask import Flask, g

BASE = "d0482d3eb00ba883b74b362692f67a69eb873372"
N = 20
LOCAL = "http://127.0.0.1:8080/api/interpreter"
NODE = {
    "type": "node",
    "id": 1,
    "lat": 53.5,
    "lon": -1.2,
    "tags": {"highway": "traffic_signals"},
}
logging.disable(logging.CRITICAL)


def response(size=0, status=200):
    r = requests.Response()
    r.status_code = status
    r._content = json.dumps({"elements": [NODE] * size}).encode()
    r._content_consumed = True
    r.headers["Content-Type"] = "application/json"
    return r


def distribution(values):
    values = sorted(values)
    return {
        "samples": len(values),
        "median_ms": round(statistics.median(values), 3),
        "p95_ms": round(values[max(0, int(0.95 * len(values) + 0.999) - 1)], 3),
        "max_ms": round(max(values), 3),
    }


def measure(fn):
    values = []
    for _ in range(N):
        started = time.perf_counter()
        fn()
        values.append((time.perf_counter() - started) * 1000)
    return distribution(values)


def main():
    args = argparse.ArgumentParser()
    args.add_argument("--mock-http", action="store_true")
    options = args.parse_args()
    before = importlib.util.module_from_spec(
        importlib.util.spec_from_loader("phase11_before", loader=None)
    )
    source = subprocess.check_output(
        ["git", "show", BASE + ":overpass_helper.py"], text=True
    )
    exec(compile(source, "phase11_before", "exec"), before.__dict__)
    report = {
        "scope": "synthetic actual helper functions; mocked transport; no Overpass engine or Contabo",
        "baseline": BASE,
        "samples_per_case": N,
        "cases": {},
        "mock_http": None,
    }
    for label, module in [("before", before), ("after", after)]:

        def client():
            return module.OverpassClient(
                endpoints=[LOCAL], max_retries=1, cache=module.OverpassCache()
            )

        counts = {}
        with patch.object(rb, "post", side_effect=lambda *a, **k: response()) as post:
            c = client()
            counts["cache_miss"] = measure(
                lambda: c.query("synthetic", skip_cache=True)
            )
            counts["miss_http_calls"] = post.call_count
            counts["cache_hit"] = measure(lambda: c.query("synthetic"))
            counts["cache_hit_added_http_calls"] = post.call_count - N
        with patch.object(rb, "post", side_effect=lambda *a, **k: response(5295)):
            counts["large_5295"] = measure(
                lambda: client().query("large", skip_cache=True)
            )
            tracemalloc.start()
            client().query("large", skip_cache=True)
            _, peak = tracemalloc.get_traced_memory()
            tracemalloc.stop()
            counts["large_peak_traced_bytes"] = peak
        concurrent_calls = []

        def concurrent():
            c = client()
            barrier = threading.Barrier(4)

            def transport(*a, **k):
                time.sleep(0.005)
                return response()

            def query():
                barrier.wait(2)
                return c.query("identical")

            with patch.object(
                rb, "post", side_effect=transport
            ) as post, ThreadPoolExecutor(max_workers=4) as pool:
                assert all(r["success"] for r in pool.map(lambda _: query(), range(4)))
            concurrent_calls.append(post.call_count)

        counts["four_identical_requests"] = measure(concurrent)
        counts["coalesced_http_calls_per_sample"] = concurrent_calls
        counts["concurrent_caller_throughput_per_second"] = round(
            4000 / counts["four_identical_requests"]["median_ms"], 2
        )

        def retry():
            c = module.OverpassClient(
                endpoints=[LOCAL],
                max_retries=3,
                base_delay=0.001,
                cache=module.OverpassCache(),
            )
            with patch.object(
                rb, "post", side_effect=lambda *a, **k: response(status=502)
            ):
                assert not c.query("retry")["success"]

        counts["retry_exhaustion_scaled_backoff"] = measure(retry)
        app = Flask(label)

        def expired():
            with app.test_request_context("/api/route"):
                g.routing_budget = rb.RoutingBudget(0)
                try:
                    client().query("expired")
                except rb.RoutingDeadlineExceeded:
                    return
                raise AssertionError("Expired deadline accepted")

        counts["expired_flask_request"] = measure(expired)
        report["cases"][label] = counts
    raw = response(5295).content
    report["validation_only_5295"] = measure(lambda: after.validate_payload(raw))
    if options.mock_http:
        from http.server import HTTPServer, BaseHTTPRequestHandler

        body = response(10).content

        class Handler(BaseHTTPRequestHandler):
            def do_POST(self):
                self.rfile.read(int(self.headers.get("Content-Length", 0)))
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)

            def log_message(self, *args):
                pass

        server = HTTPServer(("127.0.0.1", 0), Handler)
        thread = threading.Thread(
            target=lambda: server.serve_forever(poll_interval=0.05), daemon=True
        )
        thread.start()
        c = after.OverpassClient(
            endpoints=[f"http://127.0.0.1:{server.server_port}/api/interpreter"],
            cache=after.OverpassCache(),
        )
        try:
            report["mock_http"] = {
                "scope": "loopback HTTP fixture, not Overpass",
                "ten_elements": measure(lambda: c.query("fixture", skip_cache=True)),
            }
        finally:
            server.shutdown()
            server.server_close()
            thread.join(2)
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()

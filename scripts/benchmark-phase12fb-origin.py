#!/usr/bin/env python3
"""Compare actual merged Phase12F code with current code, offline CPU only."""
import concurrent.futures
import importlib.util
import json
import math
from pathlib import Path
import statistics
import subprocess
import sys
import tempfile
import time

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from voyagr.services.routing import origin_integrity as current

base = "8a01e63d98a15f56395bae5fae506cad0fb9cdf2"
source = subprocess.run(
    ["git", "show", base + ":voyagr/services/routing/origin_integrity.py"],
    capture_output=True,
    text=True,
    check=True,
).stdout
areas = json.loads(Path("camera_areas.geojson").read_text())


def stats(v):
    return {
        "n": len(v),
        "median_ms": round(statistics.median(v), 3),
        "p95_ms": round(sorted(v)[math.ceil(0.95 * len(v)) - 1], 3),
        "max_ms": round(max(v), 3),
    }


with tempfile.TemporaryDirectory(prefix="phase12fb-baseline-") as directory:
    file = Path(directory) / "baseline.py"
    file.write_text(source)
    spec = importlib.util.spec_from_file_location("phase12f_baseline", file)
    baseline = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(baseline)
    report = {
        "scope": "OFFLINE_SYNTHETIC_COORDINATES_REAL_REPOSITORY_GEOMETRY",
        "baseline_commit": base,
        "engine_samples": 0,
        "samples": {},
    }
    for scenario, mandatory, legs in [
        ("normal_numeric", False, 1),
        ("large_dataset", True, 1),
        ("multi_stop", True, 5),
        ("fresh_request_same_cached_geometry", True, 1),
        ("recalculation_relocated", True, 1),
        ("concurrent_4", True, 1),
    ]:
        comparison = {}
        for label, module in [("phase12f", baseline), ("current", current)]:

            def measure(_):
                context = {
                    "start": (53.0, -1.0),
                    "end": (53.01, -1.0),
                    "areas": areas,
                    "camera_mandatory": mandatory,
                    "relations": {},
                    "accuracy_m": None,
                }
                start = time.perf_counter()
                for leg in range(legs):
                    context.update(
                        start=(53.0 + leg * 0.001, -1.0),
                        end=(53.0 + (leg + 1) * 0.001, -1.0),
                    )
                    route = {"geometry": [context["start"], context["end"]]}
                    if scenario == "recalculation_relocated":
                        route["geometry"][0] = (53.002, -1.0)
                    module.assess_origin(route, context)
                return (time.perf_counter() - start) * 1000

            if scenario == "concurrent_4":
                with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
                    values = list(pool.map(measure, range(16)))
            else:
                values = [measure(i) for i in range(25)]
            comparison[label] = stats(values)
        report["samples"][scenario] = comparison
    print(json.dumps(report, indent=2))

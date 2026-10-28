#!/usr/bin/env python3
"""Bounded local geometry benchmark; no routing services or production access."""
import argparse, json, statistics, sys, time, tracemalloc
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from voyagr.utils.camera_area_candidate import (
    build_candidate,
    encode,
    digest,
    MAX_BYTES,
)


def stats(values):
    values = sorted(values)
    return {
        "samples": len(values),
        "median_ms": round(statistics.median(values), 3),
        "p95_ms": round(
            values[max(0, __import__("math").ceil(0.95 * len(values)) - 1)], 3
        ),
        "max_ms": round(max(values), 3),
    }


if __name__ == "__main__":
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--samples", type=int, default=5)
    args = p.parse_args()
    if not 3 <= args.samples <= 20:
        raise SystemExit("samples must be between3and20")
    with open("camera_areas.geojson", "rb") as source:
        raw = source.read(MAX_BYTES + 1)
    totals = []
    stages = {}
    hashes = []
    for _ in range(args.samples):
        timing = {}
        started = time.perf_counter()
        candidate, manifest, metrics = build_candidate(raw, timing)
        begun = time.perf_counter()
        encode(manifest)
        encode(metrics)
        timing["serialization"].append((time.perf_counter() - begun) * 1000)
        totals.append((time.perf_counter() - started) * 1000)
        hashes.append(digest(candidate))
        for name, values in timing.items():
            stages.setdefault(name, []).append(sum(values))
    tracemalloc.start()
    build_candidate(raw)
    _, peak = tracemalloc.get_traced_memory()
    tracemalloc.stop()
    print(
        json.dumps(
            {
                "scope": "actual_repository_geometry_local_CPU_not_routing_or_Contabo",
                "source_sha256": digest(raw),
                "candidate_sha256": hashes[0],
                "all_sample_hashes_equal": len(set(hashes)) == 1,
                "candidate_bytes": len(candidate),
                "pipeline": stats(totals),
                "stage_totals_per_run": {k: stats(v) for k, v in stages.items()},
                "peak_traced_bytes_one_extra_run": peak,
                "native_GEOS_PROJ_allocations": "NOT_FULLY_MEASURED",
                "real_engine_route_samples": 0,
                "real_engine_enforcement": "NOT_TESTED",
            },
            indent=2,
        )
    )

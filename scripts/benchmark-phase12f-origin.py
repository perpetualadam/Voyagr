#!/usr/bin/env python3
"""Offline CPU comparison only; no engine calls or private journey inputs."""
import json
import math
from pathlib import Path
import statistics
import sys
import time

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from voyagr.services.routing.integrity import assess_response, normalize_requirements

areas = json.loads(Path("camera_areas.geojson").read_text())
report = {
    "scope": "OFFLINE_SYNTHETIC_COORDINATES_WITH_REPOSITORY_AREA_GEOMETRY",
    "engine_samples": 0,
    "samples": {},
}
for name, offset, mandatory in [
    ("coincident_preference", 0, False),
    ("relocated_preference", 197, False),
    ("mandatory_local_geometry", 0, True),
]:
    requirements = normalize_requirements(
        {
            "avoid_caz": False,
            "avoidance_requirements": [
                {
                    "category": "speed_cameras",
                    "enabled": True,
                    "mode": "mandatory" if mandatory else "preference",
                }
            ],
        }
    )
    payload = {
        "success": True,
        "routes": [
            {
                "source": "GraphHopper",
                "name": "⚡ Optimised",
                "geometry": [(53 + offset / 111195, -1), (53.01, -1)],
            }
        ],
    }
    groups = {}
    for mode in ("baseline_assessment", "with_origin"):
        samples = []
        for _ in range(25):
            context = {
                "start": (53.0, -1.0),
                "end": (53.01, -1.0),
                "areas": areas,
                "camera_mandatory": mandatory,
                "accuracy_m": None,
                "relations": {},
            }
            started = time.perf_counter()
            assess_response(
                payload,
                requirements,
                origin_context=context if mode == "with_origin" else None,
            )
            samples.append((time.perf_counter() - started) * 1000)
        groups[mode] = {
            "n": len(samples),
            "median_ms": round(statistics.median(samples), 4),
            "p95_ms": round(sorted(samples)[math.ceil(0.95 * len(samples)) - 1], 4),
            "max_ms": round(max(samples), 4),
        }
    groups["median_added_ms"] = round(
        groups["with_origin"]["median_ms"] - groups["baseline_assessment"]["median_ms"],
        4,
    )
    report["samples"][name] = groups
print(json.dumps(report, indent=2))

#!/usr/bin/env python3
"""Offline by default. Explicit approval + reviewed plan required for isolated requests."""
import argparse, json, sys
from shapely.errors import ShapelyError
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from voyagr.utils.graphhopper_acceptance import artifacts, read_json, run

if __name__ == "__main__":
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument(
        "--manifest",
        type=Path,
        default=Path("artifacts/camera-areas/phase12b/manifest.json"),
    )
    p.add_argument("--original", type=Path, default=Path("camera_areas.geojson"))
    p.add_argument(
        "--plan",
        type=Path,
        default=Path("scripts/fixtures/phase12c/plan-template.json"),
    )
    p.add_argument("--approved-isolated-services", action="store_true")
    p.add_argument("--mode", choices=["compile", "fixtures"], default="compile")
    p.add_argument("--area-start", type=int, default=0)
    p.add_argument("--area-count", type=int, default=8)
    p.add_argument("--fixture-start", type=int, default=0)
    p.add_argument("--fixture-count", type=int, default=2)
    args = p.parse_args()
    try:
        bundle = artifacts(args.manifest, args.original)
        _, plan = read_json(args.plan, 131072)
        result = run(
            bundle,
            plan,
            approved=args.approved_isolated_services,
            mode=args.mode,
            area_start=args.area_start,
            area_count=args.area_count,
            fixture_start=args.fixture_start,
            fixture_count=args.fixture_count,
        )
    except (ValueError, OSError, KeyError, TypeError, ShapelyError):
        print(
            json.dumps(
                {
                    "status": "REFUSED_INVALID_OR_UNREVIEWED_INPUT",
                    "replacement_decision": "CANDIDATE_NOT_VERIFIED",
                }
            )
        )
        raise SystemExit(1)
    print(json.dumps(result, indent=2))
    if (
        any(
            a["status"]
            not in (
                "NOT_TESTED",
                "REQUEST_ACCEPTED_ENFORCEMENT_UNVERIFIED",
                "NO_PATH_COMPILATION_UNVERIFIED",
            )
            for items in result["area_compilation"].values()
            for a in items
        )
        or result["engine_execution"] == "STOPPED_OR_PARTIAL"
        or any(
            f["status"] != "PASS_OBSERVED_FIXTURE" for f in result["fixture_results"]
        )
    ):
        raise SystemExit(2)

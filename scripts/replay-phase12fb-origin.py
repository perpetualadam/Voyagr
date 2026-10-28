#!/usr/bin/env python3
"""Offline, default NOT_TESTED. Private native captures only; no engine HTTP calls."""

import argparse, json, sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from voyagr.utils.origin_replay import load_bundle, replay, unexecuted

p = argparse.ArgumentParser(description=__doc__)
p.add_argument("--bundle", type=Path)
p.add_argument(
    "--areas",
    type=Path,
    default=Path("artifacts/camera-areas/phase12b/camera_areas_candidate.geojson"),
)
for name in ("oracle-export", "oracle-receipt", "oracle-specification"):
    p.add_argument("--" + name, type=Path)
a = p.parse_args()
try:
    report = replay(*load_bundle(a.bundle, a.areas)) if a.bundle else unexecuted()
    diagnostic_paths = (a.oracle_export, a.oracle_receipt, a.oracle_specification)
    if any(diagnostic_paths):
        if not a.bundle or not all(diagnostic_paths):
            raise ValueError("complete_diagnostic_inputs_required")
        from voyagr.utils.road_oracle import diagnostic, read_private

        report["independent_road_diagnostic"] = diagnostic(
            read_private(a.oracle_export),
            read_private(a.bundle),
            read_private(a.oracle_receipt),
            read_private(a.oracle_specification),
        )
except Exception as error:
    print(
        json.dumps(
            {
                "status": "REFUSED_OR_UNAVAILABLE",
                "error_type": type(error).__name__,
                "live_engine": "NOT_TESTED",
                "production": "NO_GO",
            }
        )
    )
    raise SystemExit(2)
print(json.dumps(report, indent=2))
if any(f["status"] == "FAIL_OR_UNVERIFIED" for f in report["fixtures"]):
    raise SystemExit(1)

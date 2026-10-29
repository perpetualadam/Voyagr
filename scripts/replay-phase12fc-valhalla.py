#!/usr/bin/env python3
"""Offline Valhalla diagnostics; no routing calls and no acceptance output."""

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from voyagr.utils.valhalla_acceptance import load_private, replay, unexecuted
from voyagr.utils.origin_replay import offline_guard

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--bundle", type=Path)
args = parser.parse_args()
try:
    with offline_guard():
        report = replay(load_private(args.bundle)) if args.bundle else unexecuted()
except Exception:
    print(
        json.dumps(
            {
                "status": "REFUSED_OR_UNAVAILABLE",
                "reviewed": False,
                "navigation_authorized": False,
                "operational_status": "PRODUCTION_NO_GO",
            }
        )
    )
    raise SystemExit(2)
print(json.dumps(report, indent=2))
# No exit-zero acceptance signal: a populated replay remains unreviewed.
raise SystemExit(1 if args.bundle else 0)

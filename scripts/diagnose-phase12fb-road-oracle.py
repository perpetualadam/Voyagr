#!/usr/bin/env python3
"""Private offline OSM diagnostic; stdout is sanitized JSON, stderr a fixed summary."""

import argparse
import json
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from voyagr.utils.road_oracle import diagnostic, summary, read_private


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ("export", "capture", "receipt", "specification"):
        parser.add_argument("--" + name, type=Path, required=True)
    args = parser.parse_args()
    try:
        report = diagnostic(
            *(
                read_private(getattr(args, key))
                for key in ("export", "capture", "receipt", "specification")
            )
        )
    except Exception:
        # Never echo exception text, paths, source tags, coordinates or bodies.
        print(
            json.dumps(
                {
                    "status": "REFUSED_OR_UNAVAILABLE",
                    "reviewed": False,
                    "navigation_authorized": False,
                    "production": "PRODUCTION_NO_GO",
                }
            )
        )
        return 2
    print(json.dumps(report, indent=2, sort_keys=True))
    print(summary(report), file=sys.stderr)
    return 0  # Successful diagnostic execution is never acceptance.


if __name__ == "__main__":
    sys.exit(main())

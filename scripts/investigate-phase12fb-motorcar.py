#!/usr/bin/env python3
"""Offline motorcar plausibility, never acceptance. Private evidence requires explicit output."""

import argparse
from contextlib import redirect_stdout, redirect_stderr
import json
import os
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


class Parser(argparse.ArgumentParser):
    def error(self, message):
        self.exit(2, "MOTORCAR_INVESTIGATION_REFUSED\n")


def main():
    p = Parser(description=__doc__)
    p.add_argument("--export", type=Path, required=True)
    p.add_argument("--specification", type=Path, required=True)
    p.add_argument("--private-output", type=Path)
    p.add_argument("--max-states", type=int, default=100000)
    a = p.parse_args()
    try:
        with open(os.devnull, "w") as quiet, redirect_stdout(quiet), redirect_stderr(
            quiet
        ):
            from voyagr.utils.motorcar_investigation import (
                investigate,
                inspect_alternative,
                insufficient,
            )
            from voyagr.utils.road_oracle import read_private
            from voyagr.utils.road_oracle_private import output_target, write_report

            if any(
                str(path).startswith(("\\\\", "//"))
                for path in (a.export, a.specification)
            ):
                raise ValueError("local_inputs_required")
            target = output_target(a.private_output) if a.private_output else None
            raw, spec = read_private(a.export), read_private(a.specification)
            if target:
                evidence = inspect_alternative(raw, spec, max_states=a.max_states)
                write_report(target, evidence)
                summary = evidence["motorcar_investigation"]
            else:
                summary = investigate(raw, spec, max_states=a.max_states)
    except Exception:
        # No filenames, tags, IDs, coordinates, exception strings or bodies.
        print(
            json.dumps(
                {
                    "classification": "EVIDENCE_INSUFFICIENT",
                    "reviewed": False,
                    "navigation_authorized": False,
                    "acceptance": "UNVERIFIED",
                    "production": "PRODUCTION_NO_GO",
                }
            )
        )
        return 2
    print(json.dumps(summary, indent=2, sort_keys=True))
    return 2 if summary["classification"] == "EVIDENCE_INSUFFICIENT" else 0


if __name__ == "__main__":
    sys.exit(main())

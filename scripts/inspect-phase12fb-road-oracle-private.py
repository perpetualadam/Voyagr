#!/usr/bin/env python3
"""Write private provisional OSM evidence to a NEW file outside Git. No HTTP/DB."""

import argparse
from contextlib import redirect_stdout, redirect_stderr
import os
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


class PrivateParser(argparse.ArgumentParser):
    def error(self, message):
        # argparse normally echoes unknown arguments, potentially private paths/data.
        self.exit(2, "PRIVATE_INSPECTION_REFUSED\n")


def main():
    p = PrivateParser(description=__doc__)
    p.add_argument("--export", type=Path, required=True)
    p.add_argument("--specification", type=Path, required=True)
    p.add_argument("--output", type=Path, required=True)
    p.add_argument("--max-states", type=int, default=100000)
    a = p.parse_args()
    try:
        with open(os.devnull, "w") as quiet, redirect_stdout(quiet), redirect_stderr(
            quiet
        ):
            from voyagr.utils.road_oracle import read_private
            from voyagr.utils.road_oracle_private import (
                inspect,
                output_target,
                write_report,
            )

            if any(
                str(path).startswith(("\\\\", "//"))
                for path in (a.export, a.specification)
            ):
                raise ValueError("local_inputs_required")
            target = output_target(a.output)
            if target in (a.export.resolve(), a.specification.resolve()):
                raise ValueError("input_output_conflict")
            report = inspect(
                read_private(a.export),
                read_private(a.specification),
                max_states=a.max_states,
            )
            write_report(target, report)
    except Exception:
        print("PRIVATE_INSPECTION_REFUSED", file=sys.stderr)
        return 2
    print("PRIVATE_PROVISIONAL_TOPOLOGY_ONLY_REPORT_CREATED")
    return 0


if __name__ == "__main__":
    sys.exit(main())

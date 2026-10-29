#!/usr/bin/env python3
"""Opt-in Windows metadata diagnostic. No source-byte reads or package creation."""

import argparse
from contextlib import redirect_stdout, redirect_stderr
import json
import os
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


class Parser(argparse.ArgumentParser):
    def error(self, message):
        print("PRIVATE_IDENTITY_DIAGNOSTIC_REFUSED", file=sys.stderr)
        self.exit(2)


def main():
    parser = Parser(description=__doc__)
    parser.add_argument("--evidence-directory", type=Path, required=True)
    args = parser.parse_args()
    classify = None
    try:
        with open(os.devnull, "w") as quiet, redirect_stdout(quiet), redirect_stderr(
            quiet
        ):
            from voyagr.utils.review_package_diagnostics import (
                refusal_details,
                operation,
            )

            classify = refusal_details
            with operation("INVENTORY"):
                from voyagr.utils.review_identity_diagnostic import diagnose

                report = diagnose(args.evidence_directory)
    except Exception as error:
        print("PRIVATE_IDENTITY_DIAGNOSTIC_REFUSED", file=sys.stderr)
        if classify is not None:
            print(json.dumps(classify(error), sort_keys=True), file=sys.stderr)
        return 2
    print(json.dumps(report, sort_keys=True))
    return 1  # Diagnostic only: never an acceptance/pass exit code.


if __name__ == "__main__":
    sys.exit(main())

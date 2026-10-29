#!/usr/bin/env python3
"""Offline metadata-only independent review preparation; originals stay private and unchanged."""

import argparse
from contextlib import redirect_stdout, redirect_stderr
import os
import json
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


def emit_refusal(details=None):
    print("PRIVATE_REVIEW_PACKAGE_REFUSED", file=sys.stderr)
    if details is not None:
        print(json.dumps(details, sort_keys=True), file=sys.stderr)


class Parser(argparse.ArgumentParser):
    diagnostic_requested = False

    def error(self, message):
        details = (
            {
                "diagnostic_schema_version": 1,
                "outcome": "REFUSED",
                "category": "ARGUMENTS_INVALID",
                "operation": "ARGUMENT_PARSING",
                "reason": "INVALID_ARGUMENT",
                "reviewed": False,
                "navigation_authorized": False,
                "production": "PRODUCTION_NO_GO",
            }
            if self.diagnostic_requested
            else None
        )
        emit_refusal(details)
        self.exit(2)


def main():
    p = Parser(description=__doc__)
    p.diagnostic_requested = "--diagnose-refusal" in sys.argv[1:]
    p.add_argument("--evidence-directory", type=Path, required=True)
    p.add_argument("--output-directory", type=Path, required=True)
    p.add_argument(
        "--diagnose-refusal",
        action="store_true",
        help="Emit one fixed-vocabulary refusal JSON object to stderr; no probes, retries or paths.",
    )
    a = p.parse_args()
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
            with operation("IMPORT"):
                from voyagr.utils.review_package import prepare

            prepare(a.evidence_directory, a.output_directory)
    except Exception as error:
        details = None
        if a.diagnose_refusal:
            if classify is not None:
                try:
                    details = classify(error)
                except Exception:
                    # Even diagnostic failure must not expose the original chain.
                    details = {
                        "diagnostic_schema_version": 1,
                        "outcome": "REFUSED",
                        "category": "INTERNAL_ERROR",
                        "operation": "UNKNOWN",
                        "reason": "DIAGNOSTIC_UNAVAILABLE",
                        "reviewed": False,
                        "navigation_authorized": False,
                        "production": "PRODUCTION_NO_GO",
                    }
            else:
                details = {
                    "diagnostic_schema_version": 1,
                    "outcome": "REFUSED",
                    "category": "RUNTIME_UNAVAILABLE",
                    "operation": "IMPORT",
                    "reason": "IMPORT_UNAVAILABLE",
                    "reviewed": False,
                    "navigation_authorized": False,
                    "production": "PRODUCTION_NO_GO",
                }
        emit_refusal(details)
        return 2
    print("PRIVATE_REVIEW_PACKAGE_CREATED_UNREVIEWED_PRODUCTION_NO_GO")
    return 0


if __name__ == "__main__":
    sys.exit(main())

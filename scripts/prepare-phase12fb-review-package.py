#!/usr/bin/env python3
"""Offline metadata-only independent review preparation; originals stay private and unchanged."""

import argparse
from contextlib import redirect_stdout, redirect_stderr
import os
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


class Parser(argparse.ArgumentParser):
    def error(self, message):
        self.exit(2, "PRIVATE_REVIEW_PACKAGE_REFUSED\n")


def main():
    p = Parser(description=__doc__)
    p.add_argument("--evidence-directory", type=Path, required=True)
    p.add_argument("--output-directory", type=Path, required=True)
    a = p.parse_args()
    try:
        with open(os.devnull, "w") as quiet, redirect_stdout(quiet), redirect_stderr(
            quiet
        ):
            from voyagr.utils.review_package import prepare

            prepare(a.evidence_directory, a.output_directory)
    except Exception:
        print("PRIVATE_REVIEW_PACKAGE_REFUSED", file=sys.stderr)
        return 2
    print("PRIVATE_REVIEW_PACKAGE_CREATED_UNREVIEWED_PRODUCTION_NO_GO")
    return 0


if __name__ == "__main__":
    sys.exit(main())

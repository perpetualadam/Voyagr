#!/usr/bin/env python3
"""Create or verify a separate offline candidate; never overwrites existing files."""
import argparse
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from voyagr.utils.camera_area_candidate import (
    build_candidate,
    encode,
    digest,
    MAX_BYTES,
    SOURCE_SHA,
)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=Path("camera_areas.geojson"))
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--expected-source-sha", default=SOURCE_SHA)
    parser.add_argument(
        "--verify",
        action="store_true",
        help="Recompute and compare existing artifacts, without writing",
    )
    args = parser.parse_args()
    with args.source.open("rb") as stream:
        raw = stream.read(MAX_BYTES + 1)
    if digest(raw) != args.expected_source_sha:
        raise ValueError("source_hash_mismatch")
    candidate, manifest, metrics = build_candidate(raw)
    results = {
        "camera_areas_candidate.geojson": candidate,
        "manifest.json": encode(manifest),
        "feature_metrics.json": encode(metrics),
    }
    output = args.output_dir.resolve()
    approved = (
        Path(__file__).resolve().parents[1] / "artifacts/camera-areas/phase12b"
    ).resolve()
    if not (output == approved or Path("/tmp") in output.parents):
        raise ValueError("offline_output_directory_required")
    paths = [output / name for name in results]
    if any(
        p.resolve() == args.source.resolve()
        or p.resolve() == Path("camera_areas.geojson").resolve()
        for p in paths
    ):
        raise ValueError("protected_original_path")
    if args.verify:
        for path in paths:
            with path.open("rb") as stream:
                existing = stream.read(len(results[path.name]) + 1)
            if existing != results[path.name]:
                raise ValueError("candidate_reproducibility_failed")
    else:
        if any(path.exists() for path in paths):
            raise ValueError("existing_output_refused")
        args.output_dir.mkdir(parents=True, exist_ok=True)
        for path in paths:
            with path.open("xb") as stream:
                stream.write(results[path.name])
    with args.source.open("rb") as stream:
        final_source = stream.read(MAX_BYTES + 1)
    if digest(final_source) != manifest["source_sha256"]:
        raise ValueError("original_changed_during_run")
    print(
        encode(
            {
                "status": (
                    "VERIFIED_REPRODUCIBLE" if args.verify else "CANDIDATE_CREATED"
                ),
                "sha256": manifest["candidate_sha256"],
                "features": manifest["candidate_features"],
                "invalid": manifest["candidate_invalid_features"],
            }
        )
        .decode()
        .strip()
    )


if __name__ == "__main__":
    try:
        main()
    except (ValueError, OSError, __import__("shapely").errors.ShapelyError) as error:
        print("Candidate generation refused: " + type(error).__name__, file=sys.stderr)
        raise SystemExit(1)

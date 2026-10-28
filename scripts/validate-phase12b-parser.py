#!/usr/bin/env python3
"""Offline GH8 JSON/JTS only. Never contacts an engine or claims expression compilation."""
import argparse, hashlib, json, os, subprocess, sys, tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from voyagr.services.hazards import merge_graphhopper_custom_model_parts


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--jar-dir", type=Path, required=True)
    args = p.parse_args()
    dependencies = json.loads(
        Path("docs/audits/VOYAGR_GRAPHHOPPER8_PARSER_EVIDENCE.json").read_text()
    )["libraries"]
    files = []
    for library in dependencies:
        file = args.jar_dir / library["file"]
        if hashlib.sha256(file.read_bytes()).hexdigest() != library["sha256"]:
            raise ValueError("parser_dependency_hash_mismatch")
        files.append(str(file.resolve()))
    candidate = json.loads(
        Path(
            "artifacts/camera-areas/phase12b/camera_areas_candidate.geojson"
        ).read_text()
    )
    inline = {
        "areas": candidate,
        "priority": [
            {
                "if": " || ".join("in_" + f["id"] for f in candidate["features"]),
                "multiply_by": "0",
            }
        ],
    }
    mixed = json.loads(
        Path("scripts/fixtures/graphhopper8/mixed-after.json").read_text()
    )
    combined = merge_graphhopper_custom_model_parts(inline, mixed)
    original = {"areas": json.loads(Path("camera_areas.geojson").read_text())}
    results = []
    with tempfile.TemporaryDirectory(prefix="phase12b-parser-") as directory:
        for name, model, expected in [
            ("original_invalid", original, 2),
            ("candidate_all_128", inline, 0),
            ("candidate_mixed_scdb_osm_caz", combined, 0),
        ]:
            file = Path(directory) / (name + ".json")
            file.write_text(json.dumps(model))
            result = subprocess.run(
                [
                    "java",
                    "--class-path",
                    os.pathsep.join(files),
                    "scripts/CheckGraphHopper8Model.java",
                    str(file),
                ],
                capture_output=True,
                text=True,
                timeout=60,
            )
            if result.returncode != expected:
                raise ValueError("unexpected_parser_result")
            results.append(
                {
                    "case": name,
                    "expected_exit": expected,
                    "observed_exit": result.returncode,
                    "summary": result.stdout.strip(),
                    "geometry_check": (
                        "PASS"
                        if result.returncode == 0
                        else "EXPECTED_INVALID_ORIGINAL"
                    ),
                    "area_count": len(model["areas"]["features"]),
                }
            )
    print(
        json.dumps(
            {
                "scope": "OFFLINE_GH8_DESERIALIZATION_AND_JTS_NOT_EXPRESSION_COMPILATION_OR_ROUTING",
                "verified_dependency_count": len(files),
                "cases": results,
                "real_engine_enforcement": "NOT_TESTED",
                "all_128_installed_encoded_area_expressions": "NOT_TESTED",
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    try:
        main()
    except (ValueError, OSError, subprocess.SubprocessError):
        print("Offline parser validation refused", file=sys.stderr)
        raise SystemExit(1)

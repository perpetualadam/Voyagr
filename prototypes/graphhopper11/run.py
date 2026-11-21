"""Run only a checksum-pinned, local, synthetic GH11 experiment; no network code."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import tempfile

from adapter import UnverifiedRoute, validate_journey, validate_paths

JAR_SHA256 = "8462f758d9ea49edaded557cec5c687a0a24f004ec371cd4daaeb0534824ea33"
MARKER = "VOYAGR_GH11_RESULT "


def digest(path):
    with path.open("rb") as source:
        return hashlib.file_digest(source, "sha256").hexdigest()


def run(jar):
    jar = Path(jar).resolve(strict=True)
    if digest(jar) != JAR_SHA256:
        raise ValueError("GH11.1 artifact checksum mismatch; nothing executed")
    source = Path(__file__).with_name("DirectedGraphProbe.java").resolve()
    with tempfile.TemporaryDirectory(prefix="voyagr-gh11-synthetic-") as temporary:
        # subprocess cwd confines engine side effects to an ephemeral directory.
        with tempfile.TemporaryFile() as output:
            completed = subprocess.run(
                ["java", "-Xmx512m", "--class-path", str(jar), str(source), temporary],
                cwd=temporary, stdout=output, stderr=subprocess.STDOUT, timeout=90,
                check=False,
            )
            output.seek(0)
            log = output.read(2 * 1024 * 1024 + 1)
        if len(log) > 2 * 1024 * 1024:
            raise ValueError("prototype output limit exceeded")
        if completed.returncode:
            raise RuntimeError("local GH11 probe failed:\n" + log.decode(errors="replace")[-6000:])
        rows = [line[len(MARKER):] for line in log.decode().splitlines() if line.startswith(MARKER)]
        if len(rows) != 1:
            raise ValueError("missing or ambiguous experiment report")
        report = json.loads(rows[0])
        if report.get("engine_version") != "11.1":
            raise ValueError("unexpected runtime version")
        validated = {}
        for name, case in report["cases"].items():
            validated[name] = len(validate_paths(case, case["blocked_keys"], coverage="SYNTHETIC_COMPLETE"))
        turn = report["turn_fixture"]
        graph_version = hashlib.sha256((JAR_SHA256 + digest(source) + digest(Path(temporary) / "synthetic-turn.osm")).encode()).hexdigest()
        def leg(paths):
            return {"graph_version": graph_version, "paths": paths}
        arguments = dict(blocked_keys=[], graph_version=graph_version,
                         forbidden_turn_pairs=turn["forbidden_turn_pairs"], coverage="SYNTHETIC_COMPLETE")
        try:
            validate_journey([leg(turn["first_leg"]), leg(turn["independent_second_leg"])],
                             visits=turn["visits"], **arguments)
        except UnverifiedRoute as error:
            if str(error) != "mandatory_turn_violation":
                raise
        else:
            raise ValueError("independent legs bypassed imported turn restriction")
        legal = validate_journey([leg(turn["first_leg"]), leg(turn["continuation_second_leg"])],
                                 visits=turn["visits"], **arguments)
        for key, endpoints in (("complete", [turn["visits"][0], turn["visits"][-1]]),
                               ("reverse", [turn["visits"][-1], turn["visits"][0]])):
            validate_journey([leg(turn[key])], visits=endpoints, **arguments)
        return {
            "engine_version": report["engine_version"], "java_runtime": report["java_runtime"],
            "jar_sha256": JAR_SHA256,
            "probe_sha256": digest(source),
            "synthetic_osm_sha256": digest(Path(temporary) / "synthetic.osm"),
            "validated_candidate_counts": validated,
            "concurrent_checks": report["concurrent_checks"],
            "turn_fixture": {"graph_version": graph_version, "imported_restriction": True,
                             "whole_route_and_reverse": "PASS",
                             "illegal_independent_leg_join": "REFUSED",
                             "legal_continuation_leg_count": legal["leg_count"]},
            "status": "SYNTHETIC_PROOF_ONLY",
            "production_migration": "NO_GO",
            "unverified": ["real hazard association", "general turn-restriction coverage", "general multi-stop planning",
                           "parallel roads", "intersections", "CH/LM", "UK/US imports",
                           "browser integration", "capacity and latency"],
        }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--jar", required=True, help="Previously downloaded official GH11.1 JAR")
    args = parser.parse_args()
    print(json.dumps(run(args.jar), indent=2))

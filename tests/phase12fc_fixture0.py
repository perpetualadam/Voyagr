"""Private, offline fixture-0 refusal regression; never route acceptance.

Run: python -m tests.phase12fc_fixture0 --private-directory ABSOLUTE_DIRECTORY
Defaults: corrected-request.json, corrected-response.json. Override basenames with
--request-file / --response-file; originals need not be renamed. Directory may also
be configured with VOYAGR_PHASE12FC_PRIVATE_DIRECTORY. Missing files exit 2 with
PRIVATE_CAPTURE_NOT_AVAILABLE. No hash override, reviewed receipt or oracle needed.
Only fixed statuses/booleans are published. No source/output files are written.
"""

import argparse
import copy
from contextlib import redirect_stdout, redirect_stderr
import hashlib
import json
import os
from pathlib import Path
import stat
import subprocess

REQUEST_SHA256 = "17b546e688b23d6a4204f1dbc88f8bf881baf33f615ae730d32d01c17cad8859"
RESPONSE_SHA256 = "4c2390f361558cce8a380b5a28ae5a82182287ab4f9b03047b089e45a725eba4"
ROOT = Path(__file__).resolve().parents[1]


class CaptureUnavailable(Exception):
    pass


class CaptureHashMismatch(Exception):
    pass


class GateFailure(Exception):
    pass


def require(condition):
    if not condition:
        raise GateFailure("REGRESSION_FAILED")


def _load_pair(directory, names, expected):
    """Both exact-byte hashes must match before either buffer reaches JSON parsing.

    Generic expected hashes are for synthetic loader unit tests only. The public
    recorded entrypoint below always supplies the two pinned original hashes.
    """
    from voyagr.utils import review_package_io as io
    from voyagr.utils.review_package import strict_json

    if not directory:
        raise CaptureUnavailable()
    root = io.local_path(directory)
    io.outside_git(root)
    reader = io.Reader()
    buffers = []
    with reader.directory(root) as parent:
        before_root = reader.directory_metadata(parent)
        for name, limit in zip(names, (65536, 2 * 1024 * 1024)):
            if io.relative_path(name) != name or "/" in name:
                raise ValueError("basename_required")
            path = root / name
            before = reader.path_metadata(path)
            if (
                io.reparse(before)
                or not stat.S_ISREG(before.st_mode)
                or before.st_nlink != 1
                or before.st_dev != before_root.st_dev
                or before.st_size > limit
            ):
                raise ValueError("unsafe_capture")
            with reader.file(path, parent, name) as fd:
                require(io.stamp(reader.file_metadata(fd)) == io.stamp(before))
                parts, size = [], 0
                while True:
                    chunk = os.read(fd, min(65536, limit + 1 - size))
                    if not chunk:
                        break
                    size += len(chunk)
                    if size > limit:
                        raise ValueError("capture_limit")
                    parts.append(chunk)
                require(size == before.st_size)
                require(io.stamp(reader.file_metadata(fd)) == io.stamp(before))
            require(io.stamp(reader.path_metadata(path)) == io.stamp(before))
            buffers.append(b"".join(parts))
        require(io.stamp(reader.directory_metadata(parent)) == io.stamp(before_root))
    require(io.stamp(reader.path_metadata(root)) == io.stamp(before_root))
    observed = tuple(hashlib.sha256(raw).hexdigest() for raw in buffers)
    if observed != tuple(expected):
        raise CaptureHashMismatch()
    return tuple(strict_json(raw) for raw in buffers)


def load_recorded(
    directory,
    request_name="corrected-request.json",
    response_name="corrected-response.json",
):
    try:
        return _load_pair(
            directory, (request_name, response_name), (REQUEST_SHA256, RESPONSE_SHA256)
        )
    except FileNotFoundError:
        raise CaptureUnavailable() from None


def normalize(request, response):
    """Same main-route builder as voyagr_web.py; no geometry/snaps invented."""
    from voyagr.services.routing.origin_integrity import coordinate
    from voyagr.services.routing.route_entries import build_valhalla_route_entry

    if not isinstance(request, dict) or request.get("costing") != "auto":
        raise ValueError("unsupported_request")
    locations = request.get("locations")
    if not isinstance(locations, list) or len(locations) != 2:
        raise ValueError("two_original_endpoints_required")
    if any(coordinate(p) is None for p in locations):
        raise ValueError("invalid_endpoint")
    if request.get("shape_format", "polyline6") != "polyline6":
        raise ValueError("unsupported_shape")
    if not isinstance(response, dict) or "error" in response:
        raise ValueError("invalid_response")
    trip = response["trip"]
    if (
        type(trip.get("status")) is not int
        or trip["status"] != 0
        or trip.get("units") != "kilometers"
    ):
        raise ValueError("invalid_trip")

    class NoAcquisitionCosts:
        def calculate_costs(self, *args, **kwargs):
            return {"fuel_cost": 0, "fuel_litres": 0, "toll_cost": 0, "caz_cost": 0}

    route = build_valhalla_route_entry(
        trip=copy.deepcopy(trip),
        name="Fastest",
        route_id=1,
        traffic_multiplier=1,
        hazards={},
        cost_calculator=NoAcquisitionCosts(),
        vehicle_type="petrol_diesel",
        fuel_efficiency=6,
        fuel_price=1,
        energy_efficiency=18,
        electricity_price=1,
        include_tolls=False,
        include_caz=False,
        caz_exempt=False,
    )
    # Derived endpoint-only test context, NOT reconstructed historical preferences.
    # The captured engine request itself is never changed.
    application_request = {
        "start": f"{locations[0]['lat']},{locations[0]['lon']}",
        "end": f"{locations[-1]['lat']},{locations[-1]['lon']}",
        "avoid_caz": False,
        "enable_hazard_avoidance": False,
        "avoidance_mode": "preference",
    }
    return route, application_request


def through_http(application_request, routes, *, cached=False, reroute=False):
    from flask import Flask, g, jsonify
    from voyagr.services.routing.integrity_api import register_avoidance_integrity

    app = Flask(__name__)
    register_avoidance_integrity(app)

    @app.post("/api/route")
    def endpoint():
        g.route_avoidance_hazards = {}
        return jsonify(success=True, cached=cached, routes=copy.deepcopy(routes))

    response = app.test_client().post(
        "/api/route", json=dict(application_request, is_reroute=reroute)
    )
    require(response.status_code == 200)
    body = response.get_json()
    require(
        body["success"] is True
    )  # Refusal must not be a generic parser/HTTP failure.
    return body


def assert_rejected(body):
    require(body["automatic_selection_allowed"] is False)
    require(body["navigation_state"] == "UNRESOLVED")
    for route in body["routes"]:
        assessment = route["avoidance_assessment"]
        origin = assessment["origin_integrity"]
        require(assessment["geometry_valid"] is True)
        require(assessment["automatic_selection_allowed"] is False)
        require(origin["navigation_allowed"] is False)
        require(origin["status"] == "UNVERIFIED")
        require(origin["reason"] == "material_endpoint_relocation")
        require(origin["origin_displacement_m"] <= 2)
        require(origin["destination_displacement_m"] > 2)
        require(origin["snap_evidence"] == "RETURNED_GEOMETRY_ONLY")
        require(origin["transition_verified"] is False)


def exercise(request, response, *, check_browser=True):
    """Real builder, HTTP hook, assessment/ranking and JS functions; no approval."""
    from voyagr.utils.origin_replay import offline_guard

    original = copy.deepcopy((request, response))
    with offline_guard():
        route, application_request = normalize(request, response)
        body = through_http(application_request, [route])
        assert_rejected(body)
        stale = copy.deepcopy(body["routes"][0])
        stale["avoidance_assessment"].update(
            automatic_selection_allowed=True,
            status="SATISFIED",
            requires_acceptance=False,
        )
        stale["avoidance_assessment"]["origin_integrity"].update(
            navigation_allowed=True,
            status="CONTINUOUS_WITHIN_NUMERICAL_TOLERANCE",
            reason="no_material_relocation",
        )
        cached = through_http(application_request, [stale], cached=True)
        assert_rejected(cached)
        require(cached["cached"] is True)
        assert_rejected(through_http(application_request, [stale], reroute=True))
        labelled = copy.deepcopy(route)
        labelled.update(source="GraphHopper", name="⚡ Optimised")
        # Derived label fault injection, not a GraphHopper capture or new geometry.
        assert_rejected(through_http(application_request, [route, labelled]))
        browser = "NOT_TESTED"
        if check_browser:
            driver = subprocess.run(
                ["node", str(ROOT / "tests/phase12fc_browser_gate.cjs")],
                input=json.dumps(body),
                text=True,
                capture_output=True,
                timeout=15,
                cwd=ROOT,
                check=False,
            )
            require(driver.returncode == 0)
            browser = json.loads(driver.stdout)
            require(
                set(browser)
                == {
                    "manual_refused",
                    "automatic_refused",
                    "start_refused",
                    "selection_refused",
                    "reroute_refused",
                    "resume_refused",
                    "resume_preserves_endpoint_refusal",
                    "confirmation_never_invoked",
                    "navigation_unchanged",
                    "no_network",
                }
            )
            require(all(value is True for value in browser.values()))
    require((request, response) == original)
    return {
        "http_destination_refused": True,
        "automatic_ineligible": True,
        "ranking_preserves_refusal": True,
        "cache_ingress_reassessed": True,
        "recalculation_reassessed": True,
        "browser": browser,
        "cache_scope": "PRODUCTION_HTTP_HOOK_WITH_STALE_PAYLOAD_NOT_REAL_STORAGE",
        "request_context": "DERIVED_ENDPOINT_ONLY_NOT_HISTORICAL_PREFERENCES",
        "ranking_scope": "DERIVED_PROVIDER_LABEL_INJECTION",
        "route_scope": "PRIMARY_RECORDED_TRIP_ONLY",
    }


def main(argv=None):
    class Parser(argparse.ArgumentParser):
        def error(self, message):
            raise ValueError("invalid_arguments")

    report = {
        "reviewed": False,
        "navigation_authorized": False,
        "independent_review": "NOT_PERFORMED",
        "operational_status": "PRODUCTION_NO_GO",
    }
    try:
        parser = Parser(description=__doc__)
        parser.add_argument(
            "--private-directory",
            default=os.getenv("VOYAGR_PHASE12FC_PRIVATE_DIRECTORY"),
        )
        parser.add_argument("--request-file", default="corrected-request.json")
        parser.add_argument("--response-file", default="corrected-response.json")
        args = parser.parse_args(argv)
        with open(os.devnull, "w") as quiet, redirect_stdout(quiet), redirect_stderr(
            quiet
        ):
            request, response = load_recorded(
                args.private_directory, args.request_file, args.response_file
            )
            checks = exercise(request, response)
        report.update(status="RECORDED_REFUSAL_REGRESSION_PASSED", checks=checks)
        code = 0
    except (CaptureUnavailable, FileNotFoundError):
        report["status"], code = "PRIVATE_CAPTURE_NOT_AVAILABLE", 2
    except CaptureHashMismatch:
        report["status"], code = "CAPTURE_HASH_MISMATCH", 2
    except GateFailure:
        report["status"], code = "REGRESSION_FAILED", 1
    except Exception:
        report["status"], code = "CAPTURE_OR_HARNESS_REFUSED", 2
    print(json.dumps(report, sort_keys=True))
    return code


if __name__ == "__main__":
    raise SystemExit(main())

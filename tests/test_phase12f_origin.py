"""Phase12E distances are operator evidence, not locally executed graph fixtures."""

import copy
import math
from unittest.mock import patch

import pytest
from flask import Flask, jsonify
from voyagr.services.routing.integrity import normalize_requirements, assess_response
from voyagr.services.routing.integrity_api import register_avoidance_integrity

START = (53.0, -1.0)


def r(metres=0, source="GraphHopper"):
    return {
        "geometry": [(53.0 + metres / 111195.0, -1.0), (53.01, -1.0)],
        "source": source,
        "name": "⚡ Optimised" if source == "GraphHopper" else "Fastest",
        "distance_km": 1,
        "duration_minutes": 1,
    }


def app_response(routes, **data):
    app = Flask(__name__)
    register_avoidance_integrity(app)

    @app.post("/api/route")
    def endpoint():
        return jsonify(success=True, routes=copy.deepcopy(routes))

    with app.test_client() as client:
        return client.post(
            "/api/route",
            json=dict(start="53,-1", end="53.01,-1", avoid_caz=False, **data),
        )


@pytest.mark.parametrize("metres", [46.31, 70.41, 197.0, 52.68, 119.44])
def test_phase12e_displacements_cannot_be_automatic_even_without_mandatory(metres):
    out = app_response([r(metres)]).get_json()
    assert out["automatic_selection_allowed"] is False
    assert (
        out["routes"][0]["avoidance_assessment"]["origin_integrity"][
            "navigation_allowed"
        ]
        is False
    )


def test_eligible_graphhopper_first_but_unsafe_origin_cannot_displace_eligible_fallback():
    out = app_response([r(197), r(0, "Valhalla")]).get_json()
    assert out["routes"][0]["source"] == "Valhalla"
    assert (
        out["routes"][1]["avoidance_assessment"]["automatic_selection_allowed"] is False
    )
    out = app_response([r(0, "Valhalla"), r(0)]).get_json()
    assert out["routes"][0]["source"] == "GraphHopper"


def test_cached_origin_claim_is_recomputed_against_current_request():
    route = r(119.44)
    route["avoidance_assessment"] = {"origin_integrity": {"navigation_allowed": True}}
    out = app_response([route]).get_json()
    assert out["automatic_selection_allowed"] is False


from voyagr.services.routing import origin_integrity as oi
from voyagr.utils import request_budget as budget


def context(start=START, end=(53.01, -1.0), areas=None, mandatory=False, gps=None):
    return {
        "start": start,
        "end": end,
        "areas": areas,
        "camera_mandatory": mandatory,
        "accuracy_m": gps,
        "relations": {},
    }


def square():
    return {
        "features": [
            {
                "geometry": {
                    "type": "Polygon",
                    "coordinates": [
                        [
                            [-1.001, 52.999],
                            [-0.999, 52.999],
                            [-0.999, 53.001],
                            [-1.001, 53.001],
                            [-1.001, 52.999],
                        ]
                    ],
                }
            }
        ]
    }


@pytest.mark.parametrize(
    "metres,allowed", [(0, True), (1.9, True), (2.1, False), (10, False), (197, False)]
)
def test_numerical_continuity_boundary_is_not_a_gps_search_radius(metres, allowed):
    assert oi.assess_origin(r(metres), context())["navigation_allowed"] is allowed


def test_small_gps_uncertainty_is_reported_but_does_not_prove_reachability():
    out = oi.assess_origin(r(5), context(gps=8))
    assert out["reason"] == "within_gps_uncertainty_connectivity_unknown"
    assert not out["navigation_allowed"]
    assert out["transition_verified"] is False


@pytest.mark.parametrize(
    "gps", [None, -1, 0, float("nan"), float("inf"), True, 151, "10"]
)
def test_bad_or_missing_accuracy_cannot_expand_continuity(gps):
    assert oi.accuracy(gps) is None
    assert not oi.assess_origin(r(20), context(gps=oi.accuracy(gps)))[
        "navigation_allowed"
    ]


@pytest.mark.parametrize(
    "point,relation",
    [(START, "INSIDE"), ((53.0, -0.999), "BOUNDARY"), ((53.0, -0.998999), "OUTSIDE")],
)
def test_inside_boundary_immediately_outside_exclusion(point, relation):
    assert oi.area_relation(point, square()) == relation
    route = {"geometry": [point, (53.01, -1.0)]}
    out = oi.assess_origin(route, context(start=point, areas=square(), mandatory=True))
    assert out["requested_area_relation"] == relation
    assert out["navigation_allowed"] is (relation == "OUTSIDE")


def test_holes_and_overlapping_members_use_union_semantics():
    areas = square()
    areas["features"][0]["geometry"]["coordinates"].append(
        [
            [-1.0005, 52.9995],
            [-0.9995, 52.9995],
            [-0.9995, 53.0005],
            [-1.0005, 53.0005],
            [-1.0005, 52.9995],
        ]
    )
    assert oi.area_relation(START, areas) == "OUTSIDE"
    areas["features"] += square()["features"]
    assert oi.area_relation(START, areas) == "INSIDE"


def test_destination_inside_exclusion_cannot_be_ignored():
    route = {"geometry": [(53.01, -1.0), START]}
    out = oi.assess_origin(
        route, context(start=(53.01, -1.0), end=START, areas=square(), mandatory=True)
    )
    assert not out["navigation_allowed"]
    assert out["destination_area_relation"] == "INSIDE"


@pytest.mark.parametrize(
    "areas",
    [
        None,
        {},
        {"features": []},
        {"features": [{"geometry": {"type": "Point", "coordinates": [0, 0]}}]},
    ],
)
def test_incomplete_geometry_evidence_is_unknown(areas):
    out = oi.assess_origin(r(), context(areas=areas, mandatory=True))
    assert out["hazard_evidence"] == "UNKNOWN"
    # This is continuity alone; independent mandatory coverage must still pass.
    assert out["road_connectivity"] == "NOT_VERIFIED"


@pytest.mark.parametrize("source", ["GraphHopper", "Valhalla", "OSRM"])
@pytest.mark.parametrize(
    "road", ["same-road", "parallel-opposing", "one-way", "disconnected"]
)
def test_provider_or_road_label_never_proves_legal_transition(source, road):
    route = r(53.6, source)
    route["road_id"] = road
    route["origin_integrity"] = {
        "transition_verified": True,
        "navigation_allowed": True,
    }
    out = oi.assess_origin(route, context())
    assert out["navigation_allowed"] is False
    assert out["transition_verified"] is False


@pytest.mark.parametrize(
    "native",
    [None, {}, "", {"type": "Point", "coordinates": [-1, 53]}, [[53, -1], [53, -1]]],
)
def test_present_malformed_or_zero_length_native_snaps_quarantined(native):
    route = r()
    route["provider_snapped_waypoints"] = native
    assert (
        oi.assess_origin(route, context())["reason"]
        == "malformed_or_zero_length_snapped_waypoints"
    )


def test_missing_native_snaps_use_actual_geometry_not_an_invented_connector():
    assert oi.assess_origin(r(), context())["snap_evidence"] == "RETURNED_GEOMETRY_ONLY"
    route = r()
    route["provider_snapped_waypoints"] = {
        "type": "LineString",
        "coordinates": [[-1, 53.002], [-1, 53.01]],
    }
    assert (
        oi.assess_origin(route, context())["reason"]
        == "snapped_waypoints_geometry_mismatch"
    )


def test_zero_length_connection_does_not_establish_safe_exit():
    route = {"geometry": [START, START], "distance_km": 0}
    assert (
        oi.assess_origin(route, context())["reason"]
        == "invalid_or_zero_length_geometry"
    )


def test_multistop_leg_displacement_quarantines_entire_journey():
    leg = {
        "geometry": [(53.0005, -1.0), (53.01, -1.0)],
        "from": {"lat": 53.0, "lon": -1.0},
        "to": {"lat": 53.01, "lon": -1.0},
    }
    route = r()
    route["legs"] = [leg]
    out = assess_response(
        {"success": True, "routes": [route]},
        normalize_requirements({"avoid_caz": False}),
        origin_context=context(),
    )
    assert not out["automatic_selection_allowed"]
    assert (
        out["routes"][0]["avoidance_assessment"]["origin_integrity"]["reason"]
        == "unverified_leg_endpoint"
    )


def test_deadline_expiry_propagates_and_never_publishes_safe_origin():
    with patch.object(
        budget, "check_budget", side_effect=budget.RoutingDeadlineExceeded()
    ):
        with pytest.raises(budget.RoutingDeadlineExceeded):
            oi.assess_origin(r(), context())


def test_deadline_during_http_origin_stage_returns_structured_504():
    with patch.object(
        oi, "assess_origin", side_effect=budget.RoutingDeadlineExceeded()
    ):
        response = app_response([r()])
    assert response.status_code == 504
    assert response.get_json()["automatic_selection_allowed"] is False


def test_privacy_safe_telemetry_never_logs_coordinates_or_precise_distance(caplog):
    import logging

    with caplog.at_level(logging.INFO):
        app_response([r(197)])
    lines = [
        record.getMessage()
        for record in caplog.records
        if "origin_integrity request_id=" in record.getMessage()
    ]
    assert lines and "over_100m" in lines[0]
    assert "53.0" not in "".join(lines)
    assert "197" not in "".join(lines)


def test_http_mandatory_inside_recalculation_stays_unresolved_and_missing_data_not_satisfied():
    from voyagr.services import hazards

    req = [{"category": "speed_cameras", "enabled": True, "mode": "mandatory"}]
    with patch.object(hazards, "CAMERA_AREAS_DATA", square()):
        out = app_response(
            [r()], avoidance_requirements=req, is_reroute=True
        ).get_json()
    assert out["automatic_selection_allowed"] is False
    assert out["navigation_state"] == "UNRESOLVED"
    assert (
        out["routes"][0]["avoidance_assessment"]["origin_integrity"]["reason"]
        == "mandatory_endpoint_in_or_on_exclusion"
    )


def test_graphhopper_native_snap_metadata_survives_actual_parser():
    from unittest.mock import MagicMock
    from voyagr.services.routing import engines
    import polyline

    response = MagicMock(status_code=200)
    snaps = polyline.encode([START, (53.01, -1.0)], precision=5)
    response.json.return_value = {
        "paths": [
            {
                "points": snaps,
                "snapped_waypoints": snaps,
                "distance": 1000,
                "time": 60000,
            }
        ]
    }
    with patch.object(
        engines,
        "get_graphhopper_capabilities",
        return_value={
            "state": "unavailable",
            "encoded_values": {},
            "profile_available": True,
        },
    ), patch.object(engines.route_transport, "get", return_value=response):
        result = engines.route_with_graphhopper(
            *START, 53.01, -1.0, enable_camera_avoidance=False
        )
    assert result["provider_snapped_waypoints"] == snaps
    assert result["provider_snap_precision"] == 5


def test_current_intermediate_requests_not_cached_leg_from_define_origins():
    a = START
    b = (53.005, -1.0)
    c = (53.01, -1.0)
    route = r()
    route["geometry"] = [a, b, c]
    route["legs"] = [{"geometry": [a, b]}, {"geometry": [b, c]}]
    out = assess_response(
        {"success": True, "routes": [route]},
        normalize_requirements({"avoid_caz": False}),
        origin_context=context(),
        waypoints=[{"lat": b[0], "lon": b[1]}],
    )
    assert out["automatic_selection_allowed"]
    route["legs"][1].update(
        geometry=[(53.0055, -1.0), c],
        **{"from": {"lat": 53.0055, "lon": -1.0}, "to": {"lat": 53.01, "lon": -1.0}}
    )
    out = assess_response(
        {"success": True, "routes": [route]},
        normalize_requirements({"avoid_caz": False}),
        origin_context=context(),
        waypoints=[{"lat": b[0], "lon": b[1]}],
    )
    assert not out["automatic_selection_allowed"]


def test_missing_mandatory_polygon_evidence_is_not_empty_or_satisfied():
    out = oi.assess_origin(r(), context(areas=None, mandatory=True))
    assert not out["navigation_allowed"]
    assert out["reason"] == "mandatory_exclusion_geometry_unavailable"


def test_exact_numerical_boundary_and_trusted_native_snaps():
    route = r(1.999)
    route["provider_snapped_waypoints"] = {
        "type": "LineString",
        "coordinates": [[-1, route["geometry"][0][0]], [-1, 53.01]],
    }
    assert oi.assess_origin(route, context())["navigation_allowed"]
    assert not oi.assess_origin(r(2.001), context())["navigation_allowed"]


def test_malformed_cached_route_entry_cannot_bypass_gate_or_crash_diagnostics():
    response=app_response([None,{'source':'GraphHopper','geometry':None}])
    assert response.status_code==200
    out=response.get_json()
    assert out['automatic_selection_allowed'] is False
    assert len(out['routes'])==1
    assert not out['routes'][0]['avoidance_assessment']['origin_integrity']['navigation_allowed']

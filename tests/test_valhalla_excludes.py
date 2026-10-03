"""Tests for build_prioritised_valhalla_exclude_locations.

This assembles the Valhalla exclude_locations list for the primary /api/route
request (extracted from voyagr_web.calculate_route). The contract: honour
Valhalla's 50-avoid cap and keep the priority order avoid_point > road_closed >
CAZ > general hazards, and never raise (return [] on failure/empty).
"""

from voyagr.services.hazards import (
    VALHALLA_CAMERA_EXCLUDE_RADIUS_M,
    build_prioritised_valhalla_exclude_locations,
)

BBOX = {'min_lat': 51.5, 'max_lat': 51.6, 'min_lon': -0.2, 'max_lon': -0.1}
KW = dict(route_bbox=BBOX, start_lat=51.5, start_lon=-0.2,
          end_lat=51.6, end_lon=-0.1, apply_caz_routing_avoidance=False)


def test_empty_hazards_returns_empty():
    assert build_prioritised_valhalla_exclude_locations({}, **KW) == []


def test_avoid_points_take_top_priority():
    hz = {
        'avoid_point': [{'lat': 51.55, 'lon': -0.15}],
        'road_closed': [{'lat': 51.52, 'lon': -0.14}],
    }
    out = build_prioritised_valhalla_exclude_locations(hz, **KW)
    assert out[0] == {'lat': 51.55, 'lon': -0.15}
    assert {'lat': 51.52, 'lon': -0.14} in out


def test_road_closures_included_before_general_hazards():
    hz = {
        'road_closed': [{'lat': 51.52, 'lon': -0.14}],
        'camera': [{'lat': 51.53, 'lon': -0.13}],
    }
    out = build_prioritised_valhalla_exclude_locations(hz, **KW)
    assert out[0] == {'lat': 51.52, 'lon': -0.14}


def test_never_exceeds_fifty_locations():
    hz = {
        'avoid_point': [{'lat': 51.5 + i * 0.0001, 'lon': -0.15} for i in range(20)],
        'road_closed': [{'lat': 51.5 + i * 0.0001, 'lon': -0.16} for i in range(30)],
        'camera': [{'lat': 51.5 + i * 0.0001, 'lon': -0.17} for i in range(100)],
    }
    out = build_prioritised_valhalla_exclude_locations(hz, **KW)
    assert len(out) <= 50


def test_omit_camera_hazards_keeps_closures_and_drops_cameras():
    hz = {
        'road_closed': [{'lat': 51.52, 'lon': -0.14}],
        'camera_speed': [{'lat': 51.53, 'lon': -0.13}],
        'camera': [{'lat': 51.54, 'lon': -0.12}],
    }
    out = build_prioritised_valhalla_exclude_locations(hz, omit_camera_hazards=True, **KW)
    assert {'lat': 51.52, 'lon': -0.14} in out
    coords = {(loc['lat'], loc['lon']) for loc in out}
    assert (51.53, -0.13) not in coords
    assert (51.54, -0.12) not in coords


def test_cameras_stay_in_the_fastest_exclude_list_by_default():
    hz = {
        'road_closed': [{'lat': 51.52, 'lon': -0.14}],
        'camera_speed': [{'lat': 51.53, 'lon': -0.13}],
    }
    out = build_prioritised_valhalla_exclude_locations(hz, **KW)
    assert out[0] == {'lat': 51.52, 'lon': -0.14}
    assert {'lat': 51.53, 'lon': -0.13, 'radius': VALHALLA_CAMERA_EXCLUDE_RADIUS_M} in out


def test_camera_exclude_locations_use_documented_search_radius():
    """Radius selects every candidate edge near the camera, not one closest edge."""
    hz = {'camera': [{'lat': 51.54, 'lon': -0.12}]}
    out = build_prioritised_valhalla_exclude_locations(hz, **KW)
    assert out == [{
        'lat': 51.54,
        'lon': -0.12,
        'radius': VALHALLA_CAMERA_EXCLUDE_RADIUS_M,
    }]


def test_malformed_hazards_do_not_raise():
    # Missing lat/lon keys must be skipped, not raise.
    hz = {'avoid_point': [{'foo': 'bar'}], 'road_closed': [{'lat': 51.52}]}
    out = build_prioritised_valhalla_exclude_locations(hz, **KW)
    assert isinstance(out, list)

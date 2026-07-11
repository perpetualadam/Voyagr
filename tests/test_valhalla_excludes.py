"""Tests for build_prioritised_valhalla_exclude_locations.

This assembles the Valhalla exclude_locations list for the primary /api/route
request (extracted from voyagr_web.calculate_route). The contract: honour
Valhalla's 50-avoid cap and keep the priority order avoid_point > road_closed >
CAZ > general hazards, and never raise (return [] on failure/empty).
"""

from voyagr.services.hazards import build_prioritised_valhalla_exclude_locations

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


def test_malformed_hazards_do_not_raise():
    # Missing lat/lon keys must be skipped, not raise.
    hz = {'avoid_point': [{'foo': 'bar'}], 'road_closed': [{'lat': 51.52}]}
    out = build_prioritised_valhalla_exclude_locations(hz, **KW)
    assert isinstance(out, list)

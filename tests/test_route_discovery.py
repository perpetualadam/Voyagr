"""Tests for append_distinct_valhalla_route_types.

Covers the guard (auto + hazard avoidance + missing distinct variety) and the
🌿 Scenic / 🛤️ Quiet append paths. Preference fetches are mocked.
"""

from unittest.mock import patch

import polyline

from voyagr.services.routing.discovery import append_distinct_valhalla_route_types
from voyagr.services.routing.optimised_route import QUIET_ROUTE_NAME, SCENIC_ROUTE_NAME

COORDS = [(51.5074, -0.1278), (51.5085, -0.1265)]
SHAPE = polyline.encode(COORDS, precision=6)
SHAPE_B = polyline.encode([(51.5074, -0.2278), (51.5085, -0.2265)], precision=6)


class StubCostCalculator:
    def calculate_costs(self, *a, route_coords=None, **k):
        return {'fuel_cost': 1.0, 'fuel_litres': 2.0, 'toll_cost': 0.0,
                'caz_cost': 0.0, 'caz_details': {}}


BASE = dict(
    url='http://valhalla/route', headers={}, route_locations=[], has_waypoints=False,
    start_lat=51.5, start_lon=-0.12, end_lat=51.6, end_lon=-0.10,
    route_bbox={'min_lat': 51.5, 'max_lat': 51.6, 'min_lon': -0.2, 'max_lon': -0.1},
    route_geometry=None,
    hazard_count=5, hazards={}, cost_calculator=StubCostCalculator(),
    avoid_cameras=True, vehicle_type='petrol_diesel', fuel_efficiency=6.0,
    fuel_price=1.5, energy_efficiency=18.0, electricity_price=0.3,
    include_tolls=True, include_caz=True, caz_exempt=False,
)


def test_guard_skips_non_auto():
    routes = [{'id': 1}]
    out = append_distinct_valhalla_route_types(
        list(routes), valhalla_costing='pedestrian', enable_hazard_avoidance=True, **BASE)
    assert out == routes


def test_guard_skips_when_avoidance_disabled():
    routes = [{'id': 1}]
    out = append_distinct_valhalla_route_types(
        list(routes), valhalla_costing='auto', enable_hazard_avoidance=False, **BASE)
    assert out == routes


def test_guard_skips_when_three_distinct_routes_and_scenic_quiet_present():
    shape_c = polyline.encode([(51.6074, -0.3278), (51.6085, -0.3265)], precision=6)
    routes = [
        {'id': 1, 'name': 'Fastest', 'geometry': SHAPE, 'geometry_precision': 6, 'distance_km': 10.0},
        {'id': 2, 'name': 'Alternate', 'geometry': SHAPE_B, 'geometry_precision': 6, 'distance_km': 12.0},
        {'id': 3, 'name': 'Balanced', 'geometry': shape_c, 'geometry_precision': 6, 'distance_km': 11.0},
        {'id': 4, 'name': SCENIC_ROUTE_NAME, 'geometry': SHAPE_B, 'geometry_precision': 6, 'distance_km': 9.0},
        {'id': 5, 'name': QUIET_ROUTE_NAME, 'geometry': shape_c, 'geometry_precision': 6, 'distance_km': 9.5},
    ]
    out = append_distinct_valhalla_route_types(
        list(routes), valhalla_costing='auto', enable_hazard_avoidance=True, **BASE)
    assert len(out) == 5


@patch('voyagr.services.routing.discovery._append_preference_route_if_distinct')
def test_runs_when_three_routes_are_similar_copies(mock_append):
    routes = [
        {'id': 1, 'name': 'Fastest', 'geometry': SHAPE, 'geometry_precision': 6, 'distance_km': 10.0},
        {'id': 2, 'name': 'Alternate', 'geometry': SHAPE, 'geometry_precision': 6, 'distance_km': 10.1},
        {'id': 3, 'name': 'Balanced', 'geometry': SHAPE, 'geometry_precision': 6, 'distance_km': 10.2},
    ]
    mock_append.side_effect = lambda r, **kw: r + [{'id': 4, 'name': kw['name']}]
    out = append_distinct_valhalla_route_types(
        routes, valhalla_costing='auto', enable_hazard_avoidance=True, **BASE)
    assert mock_append.call_count == 2
    assert any(r.get('name') == QUIET_ROUTE_NAME for r in out)
    assert any(r.get('name') == SCENIC_ROUTE_NAME for r in out)


@patch('voyagr.services.routing.optimised_route.fetch_valhalla_auto_costing_preference_json')
def test_appends_quiet_route_when_fetch_returns_data(mock_fetch):
    trip_json = {'trip': {'legs': [{'shape': SHAPE_B}], 'summary': {'length': 9.0, 'time': 540}}}
    mock_fetch.side_effect = [trip_json, None]
    routes = [{'id': 1, 'name': 'Fastest', 'geometry': SHAPE, 'geometry_precision': 6, 'distance_km': 10.0}]
    out = append_distinct_valhalla_route_types(
        routes, valhalla_costing='auto', enable_hazard_avoidance=True, **BASE)
    quiet = [r for r in out if r['name'] == QUIET_ROUTE_NAME]
    assert len(quiet) == 1
    assert quiet[0]['distance_km'] == 9.0


@patch('voyagr.services.routing.discovery._append_preference_route_if_distinct')
def test_preference_append_failure_is_swallowed(mock_append):
    mock_append.side_effect = RuntimeError('boom')
    routes = [{'id': 1}]
    out = append_distinct_valhalla_route_types(
        list(routes), valhalla_costing='auto', enable_hazard_avoidance=True, **BASE)
    assert len(out) == 1

"""Tests for append_distinct_valhalla_route_types.

Covers the guard (only runs for auto + hazard avoidance + <3 routes) and the
📏 Shortest append path. Only the network wrapper (fetch_shortest_route_json) is
mocked; the real valhalla_trip_json_to_std_route_entry builds the entry from a
real encoded polyline + a stub cost calculator, so the wiring is exercised for
real (not mirrored).
"""

from unittest.mock import patch

import polyline

from voyagr.services.routing.discovery import append_distinct_valhalla_route_types

COORDS = [(51.5074, -0.1278), (51.5085, -0.1265)]
SHAPE = polyline.encode(COORDS, precision=6)


class StubCostCalculator:
    def calculate_costs(self, *a, route_coords=None, **k):
        return {'fuel_cost': 1.0, 'fuel_litres': 2.0, 'toll_cost': 0.0,
                'caz_cost': 0.0, 'caz_details': {}}


BASE = dict(
    url='http://valhalla/route', headers={}, route_locations=[], has_waypoints=False,
    start_lat=51.5, start_lon=-0.12, end_lat=51.6, end_lon=-0.10,
    route_bbox={'min_lat': 51.5, 'max_lat': 51.6, 'min_lon': -0.2, 'max_lon': -0.1},
    route_geometry=None,  # skip the Optimised Discovery (network) branch
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


def test_guard_skips_when_three_routes_present():
    routes = [{'id': 1}, {'id': 2}, {'id': 3}]
    out = append_distinct_valhalla_route_types(
        list(routes), valhalla_costing='auto', enable_hazard_avoidance=True, **BASE)
    assert len(out) == 3


def test_appends_shortest_route_when_wrapper_returns_data():
    trip_json = {'trip': {'legs': [{'shape': SHAPE}], 'summary': {'length': 9.0, 'time': 540}}}
    routes = [{'id': 1, 'name': 'Fastest'}]
    with patch('voyagr_web.fetch_shortest_route_json', return_value=(trip_json, True)):
        out = append_distinct_valhalla_route_types(
            routes, valhalla_costing='auto', enable_hazard_avoidance=True, **BASE)
    shortest = [r for r in out if r['name'] == '📏 Shortest']
    assert len(shortest) == 1
    assert shortest[0]['camera_exclusions_applied'] is True
    assert shortest[0]['distance_km'] == 9.0


def test_shortest_wrapper_failure_is_swallowed():
    routes = [{'id': 1}]
    with patch('voyagr_web.fetch_shortest_route_json', side_effect=RuntimeError('boom')):
        out = append_distinct_valhalla_route_types(
            list(routes), valhalla_costing='auto', enable_hazard_avoidance=True, **BASE)
    # No crash; no Shortest added.
    assert not any(r.get('name') == '📏 Shortest' for r in out)

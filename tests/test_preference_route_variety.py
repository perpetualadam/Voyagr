"""Tests for costing-preference route variety (Scenic / Quiet)."""

from unittest.mock import MagicMock, patch

import polyline

from voyagr.services.routing.optimised_route import (
    QUIET_ROUTE_NAME,
    SCENIC_ROUTE_NAME,
    _preference_variety_fetch_order,
    ensure_costing_preference_variety_routes,
    fetch_valhalla_auto_costing_preference_json,
)

COORDS_A = [(51.50, -0.12), (51.51, -0.11), (51.52, -0.10)]
COORDS_B = [(51.50, -0.12), (51.51, -0.15), (51.52, -0.18)]
SHAPE_A = polyline.encode(COORDS_A, precision=6)
SHAPE_B = polyline.encode(COORDS_B, precision=6)

TRIP_A = {'trip': {'legs': [{'shape': SHAPE_A}], 'summary': {'length': 10.0, 'time': 600}}}
TRIP_B = {'trip': {'legs': [{'shape': SHAPE_B}], 'summary': {'length': 11.5, 'time': 720}}}


class StubCostCalculator:
    def calculate_costs(self, *a, route_coords=None, **k):
        return {'fuel_cost': 1.0, 'fuel_litres': 2.0, 'toll_cost': 0.0,
                'caz_cost': 0.0, 'caz_details': {}}


BASE_KW = dict(
    url='http://valhalla/route',
    headers={'Accept': 'application/json'},
    route_locations=[],
    has_waypoints=False,
    start_lat=51.5, start_lon=-0.12, end_lat=51.6, end_lon=-0.10,
    route_bbox={'min_lat': 51.5, 'max_lat': 51.6, 'min_lon': -0.2, 'max_lon': -0.1},
    hazards={}, enable_hazard_avoidance=False, avoid_cameras=False,
    cost_calculator=StubCostCalculator(),
    vehicle_type='petrol_diesel', fuel_efficiency=6.0, fuel_price=1.5,
    energy_efficiency=18.0, electricity_price=0.3,
    include_tolls=True, include_caz=True, caz_exempt=False,
)


def test_preference_fetch_order_prefers_opposite_of_user_scenic():
    order = _preference_variety_fetch_order(user_prefer_scenic=True, user_prefer_quiet=False)
    assert order[0][0] == QUIET_ROUTE_NAME


def test_preference_fetch_order_prefers_opposite_of_user_quiet():
    order = _preference_variety_fetch_order(user_prefer_scenic=False, user_prefer_quiet=True)
    assert order[0][0] == SCENIC_ROUTE_NAME


@patch('voyagr.services.routing.optimised_route.requests.post')
def test_fetch_costing_preference_includes_costing_options(mock_post):
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = TRIP_A
    mock_post.return_value = mock_resp

    out = fetch_valhalla_auto_costing_preference_json(
        'http://valhalla/route', {}, [{'lat': 1, 'lon': 2}, {'lat': 3, 'lon': 4}],
        prefer_quiet=True,
    )
    assert out is not None
    payload = mock_post.call_args.kwargs['json']
    assert payload['costing_options']['auto']['use_living_streets'] == 0.8


TRIP_C = {'trip': {'legs': [{'shape': polyline.encode([(51.50, -0.12), (51.55, -0.05), (51.60, 0.02)], precision=6)}], 'summary': {'length': 12.0, 'time': 800}}}


@patch('voyagr.services.routing.optimised_route.fetch_valhalla_auto_costing_preference_json')
def test_ensure_adds_both_scenic_and_quiet_when_missing(mock_fetch):
    mock_fetch.side_effect = [TRIP_B, TRIP_C]
    routes = [{
        'id': 1, 'name': 'Fastest', 'geometry': SHAPE_A,
        'geometry_precision': 6, 'distance_km': 10.0, 'duration_minutes': 10,
    }]
    out = ensure_costing_preference_variety_routes(routes, **BASE_KW)
    names = [r['name'] for r in out]
    assert QUIET_ROUTE_NAME in names
    assert SCENIC_ROUTE_NAME in names
    assert len(out) == 3


@patch('voyagr.services.routing.optimised_route.fetch_valhalla_auto_costing_preference_json')
def test_ensure_skips_existing_scenic_and_quiet(mock_fetch):
    routes = [
        {'id': 1, 'name': 'Fastest', 'geometry': SHAPE_A, 'geometry_precision': 6,
         'distance_km': 10.0, 'duration_minutes': 10},
        {'id': 2, 'name': SCENIC_ROUTE_NAME, 'geometry': SHAPE_B, 'geometry_precision': 6,
         'distance_km': 12.0, 'duration_minutes': 12},
        {'id': 3, 'name': QUIET_ROUTE_NAME, 'geometry': SHAPE_B, 'geometry_precision': 6,
         'distance_km': 11.0, 'duration_minutes': 11},
    ]
    out = ensure_costing_preference_variety_routes(routes, **BASE_KW)
    assert out == routes
    mock_fetch.assert_not_called()


@patch('voyagr.services.routing.optimised_route.fetch_valhalla_auto_costing_preference_json')
def test_ensure_skips_duplicate_geometry(mock_fetch):
    mock_fetch.return_value = TRIP_A
    routes = [{
        'id': 1, 'name': 'Fastest', 'geometry': SHAPE_A,
        'geometry_precision': 6, 'distance_km': 10.0, 'duration_minutes': 10,
    }]
    out = ensure_costing_preference_variety_routes(routes, **BASE_KW)
    assert len(out) == 1
    assert mock_fetch.call_count >= 1

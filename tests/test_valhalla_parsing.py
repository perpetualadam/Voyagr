"""Behavioural tests for voyagr.services.routing.valhalla_parsing.

These assert the product contract of the Valhalla JSON -> standard route parsers:
the /api/route dict shape, km distances, minute durations, injected cost fields,
alternates handling, and the None guards. Hazards are empty and the cost
calculator is a stub so the parsers are exercised purely/offline.
"""

import polyline
import pytest

from voyagr.services.routing.valhalla_parsing import (
    valhalla_route_json_to_standard_routes,
    valhalla_trip_json_to_std_route_entry,
)

# A short London-ish path, encoded at Valhalla's precision 6.
COORDS = [(51.5074, -0.1278), (51.5085, -0.1265), (51.5096, -0.1250)]
SHAPE = polyline.encode(COORDS, precision=6)


class StubCostCalculator:
    """Records the coords it was given and returns deterministic costs."""

    def __init__(self):
        self.calls = []

    def calculate_costs(self, distance_km, vehicle_type, fuel_efficiency, fuel_price,
                        energy_efficiency, electricity_price, include_tolls, include_caz,
                        caz_exempt, route_coords=None):
        self.calls.append(route_coords)
        return {
            'fuel_cost': 1.234,
            'fuel_litres': 5.678,
            'toll_cost': 2.5,
            'caz_cost': 0.0,
            'caz_details': {'zones_crossed': []},
        }


COST_KWARGS = dict(
    vehicle_type='petrol_diesel',
    fuel_efficiency=6.0,
    fuel_price=1.5,
    energy_efficiency=18.0,
    electricity_price=0.3,
    include_tolls=True,
    include_caz=True,
    caz_exempt=False,
)


def _trip(length_km, time_s, maneuvers=None):
    leg = {'shape': SHAPE, 'summary': {'length': length_km, 'time': time_s}}
    if maneuvers is not None:
        leg['maneuvers'] = maneuvers
    return {'summary': {'length': length_km, 'time': time_s}, 'legs': [leg]}


def test_route_json_primary_route_shape_and_costs():
    data = {'trip': _trip(10.0, 600, maneuvers=[
        {'instruction': 'Head north', 'type': 1, 'length': 0.5, 'time': 30},
    ])}
    routes = valhalla_route_json_to_standard_routes(
        data, valhalla_costing='auto_shorter', start_lat=51.5, start_lon=-0.12,
        hazards={}, cost_calculator=StubCostCalculator(), **COST_KWARGS,
    )
    assert len(routes) == 1
    r = routes[0]
    assert r['id'] == 1
    assert r['name'] == 'Fastest'
    assert r['distance_km'] == 10.0
    # Non-auto costing => no traffic multiplier: 600s == 10 minutes.
    assert r['duration_minutes'] == 10
    assert r['base_duration_minutes'] == 10
    assert r['traffic_multiplier'] == 1.0
    assert r['traffic_level'] == 'N/A'
    assert r['fuel_cost'] == 1.23
    assert r['toll_cost'] == 2.5
    assert r['geometry'] == SHAPE
    assert r['geometry_precision'] == 6
    assert r['source'] == 'Valhalla'
    # Empty hazards => no penalty/count and empty list.
    assert r['hazard_count'] == 0
    assert r['hazards'] == []
    assert len(r['maneuvers']) == 1
    assert r['maneuvers'][0]['instruction'] == 'Head north'


def test_route_json_includes_alternates_capped_at_three():
    data = {
        'trip': _trip(10.0, 600),
        'alternates': [
            {'trip': _trip(11.0, 660)},
            {'trip': _trip(12.0, 720)},
            {'trip': _trip(13.0, 780)},
            {'trip': _trip(14.0, 840)},  # 4th should be ignored (cap at 3)
        ],
    }
    routes = valhalla_route_json_to_standard_routes(
        data, valhalla_costing='auto_shorter', start_lat=51.5, start_lon=-0.12,
        hazards={}, cost_calculator=StubCostCalculator(), **COST_KWARGS,
    )
    assert len(routes) == 4  # 1 primary + 3 alternates
    assert [r['id'] for r in routes] == [1, 2, 3, 4]
    assert routes[1]['name'] == 'Alternate'
    assert routes[2]['name'] == 'Balanced'
    assert routes[3]['name'] == 'Alternative'


def test_route_json_returns_empty_when_no_trip():
    assert valhalla_route_json_to_standard_routes(
        {}, valhalla_costing='auto_shorter', start_lat=0, start_lon=0,
        hazards={}, cost_calculator=StubCostCalculator(), **COST_KWARGS,
    ) == []


def test_route_json_passes_decoded_coords_to_cost_calculator():
    stub = StubCostCalculator()
    valhalla_route_json_to_standard_routes(
        {'trip': _trip(10.0, 600)}, valhalla_costing='auto_shorter',
        start_lat=51.5, start_lon=-0.12, hazards={}, cost_calculator=stub, **COST_KWARGS,
    )
    assert stub.calls, "cost calculator should be invoked"
    # Decoded coords round-trip to ~the source coordinates.
    first_lat, first_lon = stub.calls[0][0]
    assert first_lat == pytest.approx(COORDS[0][0], abs=1e-4)
    assert first_lon == pytest.approx(COORDS[0][1], abs=1e-4)


def test_trip_entry_shape_defaults_to_free_flow_duration():
    trip_json = {'trip': _trip(8.0, 480, maneuvers=[
        {'instruction': 'Turn left', 'type': 15, 'length': 1.0, 'time': 60},
    ])}
    entry = valhalla_trip_json_to_std_route_entry(
        'Shortest', trip_json, 7, hazards={}, cost_calculator=StubCostCalculator(),
        **COST_KWARGS,
    )
    assert entry is not None
    assert entry['id'] == 7
    assert entry['name'] == 'Shortest'
    assert entry['distance_km'] == 8.0
    assert entry['duration_minutes'] == 8  # 480s / 60, no multiplier supplied
    assert entry['base_duration_minutes'] == 8
    assert entry['traffic_multiplier'] == 1.0
    assert entry['source'] == 'Valhalla'
    assert entry['geometry_precision'] == 6
    # maneuver_length_in_meters=True => 1.0 km -> 1000.0 m
    assert entry['maneuvers'][0]['distance'] == 1000.0


def test_trip_entry_applies_the_callers_traffic_multiplier():
    """🌿 Scenic / 🛤️ Quiet / ⚡ Optimised come from here and sit beside Fastest."""
    entry = valhalla_trip_json_to_std_route_entry(
        '🛤️ Quiet', {'trip': _trip(8.0, 480)}, 3, hazards={},
        cost_calculator=StubCostCalculator(),
        traffic_multiplier=1.35, traffic_level='Peak Hours', **COST_KWARGS,
    )
    assert entry['duration_minutes'] == 11  # 8 min * 1.35, rounded
    assert entry['base_duration_minutes'] == 8
    assert entry['traffic_multiplier'] == 1.35
    assert entry['traffic_level'] == 'Peak Hours'


def test_route_json_uses_supplied_traffic_factors_without_a_lookup(monkeypatch):
    """One request resolves traffic once; the parser must not look it up again."""
    import voyagr.services.routing.valhalla_parsing as vp

    def fail(*a, **k):
        raise AssertionError('traffic must not be resolved again')

    monkeypatch.setattr(vp, 'get_traffic_duration_multiplier', fail)

    routes = valhalla_route_json_to_standard_routes(
        {'trip': _trip(10.0, 600), 'alternates': [{'trip': _trip(12.0, 720)}]},
        valhalla_costing='auto', start_lat=51.5, start_lon=-0.12,
        hazards={}, cost_calculator=StubCostCalculator(),
        traffic_factors=(1.5, 'Heavy'), **COST_KWARGS,
    )

    assert [r['duration_minutes'] for r in routes] == [15, 18]  # 10 and 12 min * 1.5
    # Both options record the same scaling, so the client can compare them.
    assert [r['traffic_multiplier'] for r in routes] == [1.5, 1.5]
    assert [r['traffic_level'] for r in routes] == ['Heavy', 'Heavy']
    assert [r['base_duration_minutes'] for r in routes] == [10, 12]


def test_trip_entry_none_guards():
    stub = StubCostCalculator()
    assert valhalla_trip_json_to_std_route_entry(
        'X', {}, 1, hazards={}, cost_calculator=stub, **COST_KWARGS) is None
    assert valhalla_trip_json_to_std_route_entry(
        'X', {'trip': {'legs': []}}, 1, hazards={}, cost_calculator=stub, **COST_KWARGS) is None
    # legs present but first leg has no shape.
    assert valhalla_trip_json_to_std_route_entry(
        'X', {'trip': {'legs': [{'summary': {}}], 'summary': {'length': 1, 'time': 1}}},
        1, hazards={}, cost_calculator=stub, **COST_KWARGS) is None

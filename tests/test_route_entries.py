"""Tests for build_valhalla_route_entry (shared primary/alternate route entry builder)."""

import unittest

from voyagr.services.routing.route_entries import build_valhalla_route_entry


class _FakeCostCalc:
    def calculate_costs(self, distance_km, *a, **k):
        return {
            'fuel_cost': distance_km * 0.1,
            'fuel_litres': distance_km * 0.06,
            'toll_cost': 0.0,
            'caz_cost': 0.0,
            'caz_details': {'zone': 'none'},
        }


def _trip():
    # precision-6 two-point shape + two maneuvers
    return {
        'summary': {'length': 10.0, 'time': 600},
        'legs': [{
            'shape': 'yy_ilAdo}hEqBqB',
            'maneuvers': [
                {'type': 1, 'instruction': 'Head north', 'length': 10.0},
                {'type': 4, 'instruction': 'Arrive', 'length': 0},
            ],
        }],
    }


COMMON = dict(
    hazards={}, cost_calculator=_FakeCostCalc(),
    vehicle_type='petrol_diesel', fuel_efficiency=6.0, fuel_price=1.5,
    energy_efficiency=18.0, electricity_price=0.3,
    include_tolls=False, include_caz=False, caz_exempt=False,
)


class BuildValhallaRouteEntryTest(unittest.TestCase):
    def test_primary_entry_has_traffic_fields_and_adjusted_duration(self):
        e = build_valhalla_route_entry(
            trip=_trip(), name='Fastest', route_id=1,
            traffic_multiplier=1.2, traffic_level='moderate',
            include_traffic_fields=True, **COMMON,
        )
        self.assertEqual(e['id'], 1)
        self.assertEqual(e['name'], 'Fastest')
        self.assertEqual(e['distance_km'], 10.0)
        self.assertEqual(e['duration_minutes'], 12)   # 10 min base * 1.2
        self.assertEqual(e['base_duration_minutes'], 10)
        self.assertEqual(e['traffic_multiplier'], 1.2)
        self.assertEqual(e['traffic_level'], 'moderate')
        self.assertEqual(e['geometry_precision'], 6)
        self.assertEqual(e['source'], 'Valhalla')
        self.assertEqual(len(e['maneuvers']), 2)
        self.assertEqual(e['caz_details'], {'zone': 'none'})

    def test_maneuver_length_in_meters_scales_distances(self):
        km = build_valhalla_route_entry(
            trip=_trip(), name='Fastest', route_id=1, traffic_multiplier=1.0, **COMMON,
        )
        m = build_valhalla_route_entry(
            trip=_trip(), name='Fastest', route_id=1, traffic_multiplier=1.0,
            maneuver_length_in_meters=True, **COMMON,
        )
        # First maneuver length 10.0 -> km leaves 10.0, meters scales to 10000.0
        self.assertEqual(km['maneuvers'][0]['distance'], 10.0)
        self.assertEqual(m['maneuvers'][0]['distance'], 10000.0)

    def test_alternate_entry_omits_traffic_fields(self):
        e = build_valhalla_route_entry(
            trip=_trip(), name='Alternate', route_id=2,
            traffic_multiplier=1.0, **COMMON,
        )
        self.assertEqual(e['id'], 2)
        self.assertEqual(e['duration_minutes'], 10)
        self.assertNotIn('base_duration_minutes', e)
        self.assertNotIn('traffic_multiplier', e)
        self.assertNotIn('traffic_level', e)

    def test_hazards_scored_when_present(self):
        from unittest.mock import patch
        import voyagr.services.routing.route_entries as re_mod
        with patch.object(re_mod, 'score_route_by_hazards', return_value=(240.0, 3)), \
             patch.object(re_mod, 'get_hazards_on_route', return_value=[{'type': 'camera_speed'}]):
            e = build_valhalla_route_entry(
                trip=_trip(), name='Fastest', route_id=1,
                traffic_multiplier=1.0, hazards={'camera_speed': [{'lat': 1, 'lon': 2}]},
                **{k: v for k, v in COMMON.items() if k != 'hazards'},
            )
        self.assertEqual(e['hazard_penalty_seconds'], 240)
        self.assertEqual(e['hazard_count'], 3)
        self.assertEqual(len(e['hazards']), 1)


class ManeuversFromGraphhopperRouteTest(unittest.TestCase):
    def test_speed_limit_changes_emit_synthetic_continues(self):
        """Long continues that span max_speed zones get intermediate type-8 maneuvers."""
        import polyline as pl
        from voyagr.services.routing.route_entries import maneuvers_from_graphhopper_route

        # Five collinear points — enough vertices for interval + speed change.
        coords = [(51.50 + i * 0.001, -0.10) for i in range(5)]
        geometry = pl.encode(coords, precision=5)
        route = {
            'geometry': geometry,
            'instructions': [
                {
                    'sign': 0,
                    'text': 'Continue',
                    'street_name': 'A Road',
                    'distance': 400,
                    'time': 30,
                    'interval': [0, 4],
                },
                {
                    'sign': 4,
                    'text': 'Arrive',
                    'street_name': '',
                    'distance': 0,
                    'time': 0,
                    'interval': [4, 4],
                },
            ],
            # max_speed: 112 km/h (≈70 mph) then 48 km/h (≈30 mph) mid-instruction
            'details': {
                'max_speed': [
                    [0, 2, 112],
                    [2, 5, 48],
                ],
            },
        }
        maneuvers = maneuvers_from_graphhopper_route(route)
        # Primary continue + synthetic continue at speed change + arrive
        self.assertGreaterEqual(len(maneuvers), 3)
        self.assertEqual(maneuvers[0]['speed_limit'], 112)
        speed_changes = [m for m in maneuvers if m.get('type') == 8 and m.get('speed_limit') == 48]
        self.assertEqual(len(speed_changes), 1)
        self.assertGreater(speed_changes[0]['begin_shape_index'], maneuvers[0]['begin_shape_index'])

    def test_roundabout_exit_sign_and_exit_number(self):
        import polyline as pl
        from voyagr.services.routing.route_entries import maneuvers_from_graphhopper_route

        coords = [(51.5, -0.1), (51.501, -0.1), (51.502, -0.1)]
        geometry = pl.encode(coords, precision=5)
        route = {
            'geometry': geometry,
            'instructions': [
                {
                    'sign': 6,
                    'text': 'Enter roundabout',
                    'street_name': '',
                    'distance': 50,
                    'time': 5,
                    'interval': [0, 1],
                    'exit_number': 2,
                },
                {
                    'sign': -6,
                    'text': 'Exit roundabout',
                    'street_name': 'High St',
                    'distance': 30,
                    'time': 3,
                    'interval': [1, 2],
                    'exit_number': 2,
                },
            ],
            'details': {},
        }
        maneuvers = maneuvers_from_graphhopper_route(route)
        self.assertEqual(maneuvers[0]['type'], 26)
        self.assertEqual(maneuvers[0]['roundabout_exit_count'], 2)
        self.assertEqual(maneuvers[1]['type'], 27)
        self.assertEqual(maneuvers[1]['roundabout_exit_count'], 2)


if __name__ == '__main__':
    unittest.main()

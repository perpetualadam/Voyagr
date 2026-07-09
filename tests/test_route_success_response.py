"""Tests for the shared /api/route success-envelope builder."""

import unittest

from voyagr.services.routing.orchestrator import build_route_success_response


def _routes():
    return [{
        'id': 1, 'name': 'Fastest',
        'distance_km': 12.34, 'duration_minutes': 20,
        'fuel_cost': 1.5, 'fuel_litres': 0.9,
        'toll_cost': 0.0, 'caz_cost': 0.0,
        'caz_details': {'zone': 'none'},
        'geometry': 'abc', 'geometry_precision': 6,
        'hazard_penalty_seconds': 120, 'hazard_count': 2,
        'hazards': [{'type': 'camera_speed'}],
        'maneuvers': [{'type': 1}],
    }]


class BuildRouteSuccessResponseTest(unittest.TestCase):
    def test_consistent_superset_shape(self):
        r = build_route_success_response(
            _routes(), source='GraphHopper+Valhalla ✅',
            camera_avoidance_engine='GraphHopper',
            total_stop_time=15, via_points_count=1, stops_count=2,
            start_lat=53.5, start_lon=-1.4, end_lat=53.4, end_lon=-1.1,
        )
        # Envelope basics
        self.assertTrue(r['success'])
        self.assertEqual(r['source'], 'GraphHopper+Valhalla ✅')
        self.assertEqual(r['camera_avoidance_engine'], 'GraphHopper')
        self.assertFalse(r['cached'])
        # Preview mirrors routes[0]
        self.assertEqual(r['distance'], '12.34 km')
        self.assertEqual(r['time'], '20 minutes')
        self.assertEqual(r['geometry'], 'abc')
        self.assertEqual(r['fuel_cost'], 1.5)
        self.assertEqual(r['caz_details'], {'zone': 'none'})
        self.assertEqual(r['maneuvers'], [{'type': 1}])
        # Multi-drop totals present on every path now
        self.assertEqual(r['total_stop_time'], 15)
        self.assertEqual(r['total_time_with_stops'], '35 minutes')   # 20 + 15
        self.assertEqual(r['via_points_count'], 1)
        self.assertEqual(r['stops_count'], 2)
        # Top-level hazard summary present on every path now
        self.assertEqual(r['hazard_count'], 2)
        self.assertEqual(r['hazard_penalty_seconds'], 120)
        self.assertEqual(len(r['hazards']), 1)
        # Endpoints
        self.assertEqual((r['start_lat'], r['start_lon'], r['end_lat'], r['end_lon']),
                         (53.5, -1.4, 53.4, -1.1))

    def test_all_paths_share_identical_key_set(self):
        keys = set(build_route_success_response(
            _routes(), source='s', camera_avoidance_engine='Valhalla',
            total_stop_time=0, via_points_count=0, stops_count=0,
            start_lat=0, start_lon=0, end_lat=0, end_lon=0,
        ).keys())
        expected = {
            'success', 'routes', 'source', 'distance', 'time',
            'total_time_with_stops', 'total_stop_time', 'via_points_count', 'stops_count',
            'geometry', 'geometry_precision', 'fuel_cost', 'fuel_litres', 'toll_cost',
            'caz_cost', 'caz_details', 'maneuvers', 'cached',
            'hazard_count', 'hazard_penalty_seconds', 'hazards',
            'camera_avoidance_engine', 'start_lat', 'start_lon', 'end_lat', 'end_lon',
        }
        self.assertEqual(keys, expected)


if __name__ == '__main__':
    unittest.main()

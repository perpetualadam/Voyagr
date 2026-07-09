"""Tests for Valhalla /route payload builder."""

import unittest

from voyagr.services.routing.orchestrator import (
    build_valhalla_retry_payload,
    build_valhalla_route_payload,
)


BASE = dict(
    route_locations=[{'lat': 53.5, 'lon': -1.4}, {'lat': 53.4, 'lon': -1.1}],
    has_waypoints=False,
    start_lat=53.5, start_lon=-1.4, end_lat=53.4, end_lon=-1.1,
    valhalla_costing='auto',
    avoid_tolls=False, avoid_motorways=False, avoid_ferries=False,
    prefer_scenic=False, prefer_quiet=False, avoid_unpaved=False,
    route_optimization='fastest',
    departure_time=None,
    exclude_locations=None,
    now_str='2026-01-01T12:00',
)


class TestBuildValhallaRoutePayload(unittest.TestCase):
    def test_auto_two_point_defaults(self):
        p = build_valhalla_route_payload(**BASE)
        self.assertEqual(p['costing'], 'auto')
        self.assertEqual(p['alternates'], 3)
        self.assertEqual(p['units'], 'kilometers')
        self.assertEqual(p['language'], 'en-GB')
        self.assertEqual(p['locations'], [{'lat': 53.5, 'lon': -1.4}, {'lat': 53.4, 'lon': -1.1}])
        self.assertEqual(p['date_time'], {'type': 1, 'value': '2026-01-01T12:00'})

    def test_waypoints_disable_alternates(self):
        p = build_valhalla_route_payload(**{**BASE, 'has_waypoints': True})
        self.assertEqual(p['alternates'], 0)

    def test_pedestrian_costing_options(self):
        p = build_valhalla_route_payload(**{**BASE, 'valhalla_costing': 'pedestrian'})
        self.assertEqual(p['alternates'], 0)
        self.assertIn('pedestrian', p['costing_options'])
        self.assertNotIn('date_time', p)

    def test_bicycle_costing_options(self):
        p = build_valhalla_route_payload(**{**BASE, 'valhalla_costing': 'bicycle'})
        self.assertIn('bicycle', p['costing_options'])
        self.assertTrue(p['costing_options']['bicycle']['use_bike_lanes'])

    def test_explicit_departure_time(self):
        p = build_valhalla_route_payload(**{**BASE, 'departure_time': '2026-06-01T09:30'})
        self.assertEqual(p['date_time'], {'type': 1, 'value': '2026-06-01T09:30'})

    def test_exclude_locations_included(self):
        excl = [{'lat': 53.45, 'lon': -1.2}]
        p = build_valhalla_route_payload(**{**BASE, 'exclude_locations': excl})
        self.assertEqual(p['exclude_locations'], excl)

    def test_no_exclude_locations_key_when_empty(self):
        p = build_valhalla_route_payload(**BASE)
        self.assertNotIn('exclude_locations', p)

    def test_avoid_ferries_maps_to_pedestrian_use_ferry(self):
        p = build_valhalla_route_payload(**{**BASE, 'valhalla_costing': 'pedestrian', 'avoid_ferries': True})
        self.assertFalse(p['costing_options']['pedestrian']['use_ferry'])


RETRY_BASE = dict(
    start_lat=53.5, start_lon=-1.4, end_lat=53.4, end_lon=-1.1,
    valhalla_costing='auto',
    exclude_locations=[{'lat': 53.45, 'lon': -1.2}],
    avoid_tolls=False, avoid_motorways=False, avoid_ferries=False,
    prefer_scenic=False, prefer_quiet=False, avoid_unpaved=False,
    route_optimization='fastest',
)


class TestBuildValhallaRetryPayload(unittest.TestCase):
    def test_two_point_with_exclusions_no_datetime(self):
        p = build_valhalla_retry_payload(**RETRY_BASE)
        self.assertEqual(p['costing'], 'auto')
        self.assertEqual(p['alternates'], 3)
        self.assertEqual(p['exclude_locations'], [{'lat': 53.45, 'lon': -1.2}])
        self.assertEqual(len(p['locations']), 2)
        # Retry never adds time-dependent routing.
        self.assertNotIn('date_time', p)

    def test_pedestrian_alternates_zero(self):
        p = build_valhalla_retry_payload(**{**RETRY_BASE, 'valhalla_costing': 'pedestrian'})
        self.assertEqual(p['alternates'], 0)
        self.assertIn('pedestrian', p['costing_options'])

    def test_avoid_ferries_maps_to_pedestrian_use_ferry(self):
        p = build_valhalla_retry_payload(**{**RETRY_BASE, 'valhalla_costing': 'pedestrian', 'avoid_ferries': True})
        self.assertFalse(p['costing_options']['pedestrian']['use_ferry'])


if __name__ == '__main__':
    unittest.main()

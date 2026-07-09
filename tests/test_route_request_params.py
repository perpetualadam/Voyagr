"""Tests for /api/route request parsing (voyagr.services.routing.request_params)."""

import unittest

from voyagr.services.routing.request_params import parse_route_request


BASE = {'start': '51.5,-0.12', 'end': '51.52,-0.10'}


class TestParseRouteRequestDefaults(unittest.TestCase):
    def test_defaults_preserve_previous_behaviour(self):
        p = parse_route_request(dict(BASE))
        self.assertEqual(p.routing_mode, 'auto')
        self.assertEqual(p.valhalla_costing, 'auto')
        self.assertEqual(p.vehicle_type, 'petrol_diesel')
        self.assertTrue(p.include_tolls)
        self.assertTrue(p.include_caz)
        self.assertFalse(p.caz_exempt)
        self.assertTrue(p.avoid_caz)
        self.assertFalse(p.enable_hazard_avoidance)
        self.assertTrue(p.avoid_traffic_lights)
        self.assertTrue(p.avoid_railway_crossings)
        self.assertTrue(p.avoid_cameras)
        self.assertEqual(p.route_optimization, 'fastest')
        self.assertEqual(p.max_detour, 20)
        self.assertEqual(p.avoid_points, [])
        self.assertEqual(p.total_stop_time, 0)

    def test_coordinates_parsed(self):
        p = parse_route_request(dict(BASE))
        self.assertEqual((p.start_lat, p.start_lon), (51.5, -0.12))
        self.assertEqual((p.end_lat, p.end_lon), (51.52, -0.10))
        self.assertEqual(p.start_coords, (51.5, -0.12))


class TestParseRouteRequestNormalization(unittest.TestCase):
    def test_invalid_route_optimization_falls_back_to_fastest(self):
        p = parse_route_request({**BASE, 'route_optimization': 'nonsense'})
        self.assertEqual(p.route_optimization, 'fastest')

    def test_valid_route_optimization_preserved(self):
        p = parse_route_request({**BASE, 'route_optimization': 'ECO'})
        self.assertEqual(p.route_optimization, 'eco')

    def test_max_detour_clamped(self):
        self.assertEqual(parse_route_request({**BASE, 'max_detour': 500}).max_detour, 100)
        self.assertEqual(parse_route_request({**BASE, 'max_detour': -5}).max_detour, 0)
        self.assertEqual(parse_route_request({**BASE, 'max_detour': 'x'}).max_detour, 20)

    def test_non_auto_mode_still_uses_auto_costing_only_for_unknown(self):
        self.assertEqual(parse_route_request({**BASE, 'routing_mode': 'pedestrian'}).valhalla_costing, 'pedestrian')
        self.assertEqual(parse_route_request({**BASE, 'routing_mode': 'weird'}).valhalla_costing, 'auto')

    def test_caz_routing_avoidance_disabled_for_electric(self):
        p = parse_route_request({**BASE, 'vehicle_type': 'electric'})
        self.assertFalse(p.apply_caz_routing_avoidance)

    def test_caz_routing_avoidance_disabled_when_exempt(self):
        p = parse_route_request({**BASE, 'caz_exempt': True})
        self.assertFalse(p.apply_caz_routing_avoidance)


class TestParseRouteRequestAvoidPoints(unittest.TestCase):
    def test_garbage_avoid_points_filtered_and_capped(self):
        pts = [{'lat': 51.5, 'lon': -0.1}, {'lat': 999, 'lon': 0}, {'nope': 1}]
        pts += [{'lat': 51.5, 'lon': -0.1}] * 20
        p = parse_route_request({**BASE, 'avoid_points': pts})
        self.assertLessEqual(len(p.avoid_points), 10)
        self.assertTrue(all(-90 <= a['lat'] <= 90 for a in p.avoid_points))

    def test_avoid_points_promote_hazard_avoidance(self):
        p = parse_route_request({**BASE, 'avoid_points': [{'lat': 51.5, 'lon': -0.1}]})
        self.assertTrue(p.enable_hazard_avoidance)

    def test_no_avoid_points_leaves_hazard_flag_from_request(self):
        p = parse_route_request({**BASE, 'enable_hazard_avoidance': False})
        self.assertFalse(p.enable_hazard_avoidance)


class TestParseRouteRequestStops(unittest.TestCase):
    def test_total_stop_time_defaults_to_15_per_stop(self):
        p = parse_route_request({**BASE, 'stops': [{'lat': 1, 'lon': 2}, {'lat': 3, 'lon': 4}]})
        self.assertEqual(p.total_stop_time, 30)

    def test_total_stop_time_uses_explicit_durations(self):
        p = parse_route_request({**BASE, 'stops': [{'lat': 1, 'lon': 2, 'duration': 5}]})
        self.assertEqual(p.total_stop_time, 5)


if __name__ == '__main__':
    unittest.main()

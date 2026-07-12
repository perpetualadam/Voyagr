"""Tests for route variety post-processing."""

import unittest

import polyline

from voyagr.services.routing.route_variety import (
    count_distinct_routes,
    dedupe_similar_routes,
    filter_routes_by_max_detour,
    finalize_route_variety,
    should_append_distinct_valhalla_route_types,
)

COORDS_A = [(51.50, -0.12), (51.51, -0.11), (51.52, -0.10)]
COORDS_B = [(51.50, -0.12), (51.51, -0.15), (51.52, -0.18)]
SHAPE_A = polyline.encode(COORDS_A, precision=6)
SHAPE_B = polyline.encode(COORDS_B, precision=6)
COORDS_C = [(51.50, -0.12), (51.55, -0.05), (51.60, 0.02)]
SHAPE_C = polyline.encode(COORDS_C, precision=6)


def _route(name, shape, *, duration=10.0, distance=5.0, route_id=1):
    return {
        'id': route_id,
        'name': name,
        'geometry': shape,
        'geometry_precision': 6,
        'duration_minutes': duration,
        'distance_km': distance,
    }


class TestRouteVariety(unittest.TestCase):
    def test_count_distinct_routes(self):
        similar = [_route('Fastest', SHAPE_A, route_id=1), _route('Alternate', SHAPE_A, route_id=2)]
        self.assertEqual(count_distinct_routes(similar), 1)
        mixed = [_route('Fastest', SHAPE_A, route_id=1), _route('Shortest', SHAPE_B, route_id=2, distance=7.0)]
        self.assertEqual(count_distinct_routes(mixed), 2)

    def test_dedupe_keeps_primary(self):
        routes = [
            _route('Fastest', SHAPE_A, route_id=1),
            _route('Alternate', SHAPE_A, route_id=2),
            _route('Balanced', SHAPE_B, route_id=3, distance=7.0),
        ]
        out = dedupe_similar_routes(routes)
        self.assertEqual(len(out), 2)
        self.assertEqual(out[0]['name'], 'Fastest')
        self.assertEqual(out[1]['name'], 'Balanced')
        self.assertEqual(out[0]['id'], 1)
        self.assertEqual(out[1]['id'], 2)

    def test_filter_routes_by_max_detour(self):
        routes = [
            _route('Fastest', SHAPE_A, duration=10, route_id=1),
            _route('Alternate', SHAPE_B, duration=12, route_id=2, distance=7.0),
            _route('Slow', SHAPE_B, duration=20, route_id=3, distance=8.0),
        ]
        out = filter_routes_by_max_detour(routes, 25)
        names = [r['name'] for r in out]
        self.assertEqual(names, ['Fastest', 'Alternate'])
        self.assertNotIn('Slow', names)

    def test_finalize_applies_both_filters(self):
        routes = [
            _route('Fastest', SHAPE_A, duration=10, route_id=1),
            _route('Copy', SHAPE_A, duration=11, route_id=2),
            _route('Slow copy', SHAPE_A, duration=30, route_id=3),
        ]
        out = finalize_route_variety(routes, max_detour_percent=20)
        self.assertEqual(len(out), 1)
        self.assertEqual(out[0]['name'], 'Fastest')

    def test_should_append_when_three_similar_routes(self):
        routes = [
            _route('Fastest', SHAPE_A, route_id=1),
            _route('Alternate', SHAPE_A, route_id=2),
            _route('Balanced', SHAPE_A, route_id=3),
        ]
        self.assertTrue(should_append_distinct_valhalla_route_types(
            routes, valhalla_costing='auto', enable_hazard_avoidance=True,
        ))

    def test_should_still_append_when_shortest_present_but_few_distinct(self):
        routes = [
            _route('Fastest', SHAPE_A, route_id=1),
            _route('Alternate', SHAPE_B, route_id=2, distance=7.0),
            _route('Balanced', SHAPE_B, route_id=3, distance=7.0),
            _route('📏 Shortest', SHAPE_B, route_id=4, distance=7.0),
        ]
        self.assertEqual(count_distinct_routes(routes), 2)
        self.assertTrue(should_append_distinct_valhalla_route_types(
            routes, valhalla_costing='auto', enable_hazard_avoidance=True,
        ))

    def test_should_not_append_when_shortest_and_three_distinct_geometries(self):
        routes = [
            _route('Fastest', SHAPE_A, route_id=1),
            _route('Alternate', SHAPE_B, route_id=2, distance=7.0),
            _route('Balanced', SHAPE_C, route_id=3, distance=8.0),
            _route('📏 Shortest', SHAPE_B, route_id=4, distance=6.5),
        ]
        self.assertGreaterEqual(count_distinct_routes(routes), 3)
        self.assertFalse(should_append_distinct_valhalla_route_types(
            routes, valhalla_costing='auto', enable_hazard_avoidance=True,
        ))

    def test_should_append_when_shortest_missing_despite_three_routes(self):
        routes = [
            _route('Fastest', SHAPE_A, route_id=1),
            _route('Alternate', SHAPE_A, route_id=2),
            _route('Balanced', SHAPE_A, route_id=3),
        ]
        self.assertTrue(should_append_distinct_valhalla_route_types(
            routes, valhalla_costing='auto', enable_hazard_avoidance=True,
        ))


if __name__ == '__main__':
    unittest.main()

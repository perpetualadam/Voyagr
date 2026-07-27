"""Tests for route variety post-processing."""

import unittest

import polyline

from voyagr.services.routing.route_variety import (
    count_distinct_routes,
    dedupe_similar_routes,
    filter_routes_by_max_detour,
    finalize_route_variety,
    pin_optimised_route_first,
    should_append_distinct_valhalla_route_types,
)
from voyagr.services.routing.optimised_route import PRIMARY_OPTIMISED_NAME

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

    def test_dedupe_keeps_optimised_even_when_similar(self):
        routes = [
            _route('Fastest', SHAPE_A, route_id=1),
            {'id': 2, 'name': PRIMARY_OPTIMISED_NAME, 'geometry': SHAPE_A,
             'geometry_precision': 6, 'distance_km': 5.0, 'duration_minutes': 10},
        ]
        out = dedupe_similar_routes(routes)
        assert len(out) == 2
        assert out[1]['name'] == PRIMARY_OPTIMISED_NAME

    def test_dedupe_keeps_fastest_when_optimised_already_first(self):
        """Regression: Optimised-first must not collapse a similar Fastest."""
        routes = [
            {'id': 1, 'name': PRIMARY_OPTIMISED_NAME, 'geometry': SHAPE_A,
             'geometry_precision': 6, 'distance_km': 5.0, 'duration_minutes': 12},
            _route('Fastest', SHAPE_A, duration=10, route_id=2),
            _route('Alternate', SHAPE_A, duration=11, route_id=3),
        ]
        out = dedupe_similar_routes(routes)
        names = [r['name'] for r in out]
        self.assertEqual(names, [PRIMARY_OPTIMISED_NAME, 'Fastest'])

    def test_max_detour_keeps_optimised_even_when_slow(self):
        routes = [
            _route('Fastest', SHAPE_A, duration=10, route_id=1),
            {'id': 2, 'name': PRIMARY_OPTIMISED_NAME, 'geometry': SHAPE_B,
             'geometry_precision': 6, 'distance_km': 8.0, 'duration_minutes': 50},
        ]
        out = filter_routes_by_max_detour(routes, 20)
        assert len(out) == 2

    def test_pin_optimised_route_first(self):
        routes = [
            _route('Fastest', SHAPE_A, route_id=1),
            _route('Alternate', SHAPE_B, route_id=2, distance=7.0),
            {'id': 3, 'name': PRIMARY_OPTIMISED_NAME, 'geometry': SHAPE_B,
             'geometry_precision': 6, 'distance_km': 7.5, 'duration_minutes': 12},
        ]
        out = pin_optimised_route_first(routes)
        assert out[0]['name'] == PRIMARY_OPTIMISED_NAME
        assert out[0]['id'] == 1

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

    def test_finalize_keeps_fastest_and_pins_similar_optimised(self):
        """Route preview needs >=2 options when Optimised ≈ Fastest."""
        routes = [
            _route('Fastest', SHAPE_A, duration=10, route_id=1),
            {'id': 2, 'name': PRIMARY_OPTIMISED_NAME, 'geometry': SHAPE_A,
             'geometry_precision': 6, 'distance_km': 5.0, 'duration_minutes': 12},
        ]
        out = finalize_route_variety(routes, max_detour_percent=20)
        self.assertEqual(len(out), 2)
        self.assertEqual(out[0]['name'], PRIMARY_OPTIMISED_NAME)
        self.assertEqual(out[1]['name'], 'Fastest')
        self.assertEqual(out[0]['id'], 1)
        self.assertEqual(out[1]['id'], 2)

    def test_finalize_keeps_both_when_optimised_already_first(self):
        routes = [
            {'id': 1, 'name': PRIMARY_OPTIMISED_NAME, 'geometry': SHAPE_A,
             'geometry_precision': 6, 'distance_km': 5.0, 'duration_minutes': 12},
            _route('Fastest', SHAPE_A, duration=10, route_id=2),
        ]
        out = finalize_route_variety(routes, max_detour_percent=20)
        self.assertEqual(len(out), 2)
        self.assertEqual(out[0]['name'], PRIMARY_OPTIMISED_NAME)
        self.assertEqual(out[1]['name'], 'Fastest')

    def test_should_append_when_three_similar_routes(self):
        routes = [
            _route('Fastest', SHAPE_A, route_id=1),
            _route('Alternate', SHAPE_A, route_id=2),
            _route('Balanced', SHAPE_A, route_id=3),
        ]
        self.assertTrue(should_append_distinct_valhalla_route_types(
            routes, valhalla_costing='auto', enable_hazard_avoidance=True,
        ))

    def test_should_still_append_when_scenic_quiet_present_but_few_distinct(self):
        routes = [
            _route('Fastest', SHAPE_A, route_id=1),
            _route('Alternate', SHAPE_B, route_id=2, distance=7.0),
            _route('Balanced', SHAPE_B, route_id=3, distance=7.0),
            _route('🌿 Scenic', SHAPE_B, route_id=4, distance=7.0),
            _route('🛤️ Quiet', SHAPE_B, route_id=5, distance=7.0),
        ]
        self.assertEqual(count_distinct_routes(routes), 2)
        self.assertTrue(should_append_distinct_valhalla_route_types(
            routes, valhalla_costing='auto', enable_hazard_avoidance=True,
        ))

    def test_should_not_append_when_scenic_quiet_and_three_distinct_geometries(self):
        routes = [
            _route('Fastest', SHAPE_A, route_id=1),
            _route('Alternate', SHAPE_B, route_id=2, distance=7.0),
            _route('Balanced', SHAPE_C, route_id=3, distance=8.0),
            _route('🌿 Scenic', SHAPE_B, route_id=4, distance=6.5),
            _route('🛤️ Quiet', SHAPE_C, route_id=5, distance=6.8),
        ]
        self.assertGreaterEqual(count_distinct_routes(routes), 3)
        self.assertFalse(should_append_distinct_valhalla_route_types(
            routes, valhalla_costing='auto', enable_hazard_avoidance=True,
        ))

    def test_should_append_when_scenic_or_quiet_missing(self):
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

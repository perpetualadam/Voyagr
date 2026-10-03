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
from voyagr.services.routing.optimised_route import (
    PRIMARY_OPTIMISED_NAME,
    QUIET_ROUTE_NAME,
    SCENIC_ROUTE_NAME,
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

    def test_same_road_with_different_vertex_counts_is_not_distinct(self):
        """GraphHopper and Valhalla encode one road with different point counts."""
        dense = []
        steps = 5
        for i in range(len(COORDS_A) - 1):
            a, b = COORDS_A[i], COORDS_A[i + 1]
            for s in range(steps):
                t = s / steps
                dense.append((a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t))
        dense.append(COORDS_A[-1])
        shape_dense = polyline.encode(dense, precision=6)
        # Length labels differ by more than the old 0.25 km shortcut, but the line is the same.
        same_road = [
            _route('Fastest', SHAPE_A, distance=10.0, route_id=1),
            _route('⚡ Optimised', shape_dense, distance=10.4, route_id=2),
        ]
        self.assertEqual(count_distinct_routes(same_road), 1)

    def test_different_road_with_similar_length_stays_distinct(self):
        mixed = [
            _route('Fastest', SHAPE_A, distance=10.0, route_id=1),
            _route('⚡ Optimised', SHAPE_B, distance=10.1, route_id=2),
        ]
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

    def test_dedupe_drops_optimised_on_the_same_road_as_fastest(self):
        """The same geometry must not be offered as both Fastest and Optimised."""
        routes = [
            _route('Fastest', SHAPE_A, route_id=1),
            {'id': 2, 'name': PRIMARY_OPTIMISED_NAME, 'geometry': SHAPE_A,
             'geometry_precision': 6, 'distance_km': 5.0, 'duration_minutes': 10},
        ]
        out = dedupe_similar_routes(routes)
        self.assertEqual([r['name'] for r in out], ['Fastest'])
        self.assertEqual(out[0]['id'], 1)

    def test_dedupe_keeps_optimised_when_it_is_a_different_road(self):
        routes = [
            _route('Fastest', SHAPE_A, route_id=1),
            {'id': 2, 'name': PRIMARY_OPTIMISED_NAME, 'geometry': SHAPE_B,
             'geometry_precision': 6, 'distance_km': 7.5, 'duration_minutes': 12},
        ]
        out = dedupe_similar_routes(routes)
        self.assertEqual([r['name'] for r in out], ['Fastest', PRIMARY_OPTIMISED_NAME])

    def test_dedupe_keeps_fastest_when_optimised_already_first(self):
        """Same-road Optimised listed first must not replace Fastest."""
        routes = [
            {'id': 1, 'name': PRIMARY_OPTIMISED_NAME, 'geometry': SHAPE_A,
             'geometry_precision': 6, 'distance_km': 5.0, 'duration_minutes': 12},
            _route('Fastest', SHAPE_A, duration=10, route_id=2),
            _route('Alternate', SHAPE_A, duration=11, route_id=3),
        ]
        out = dedupe_similar_routes(routes)
        self.assertEqual([r['name'] for r in out], ['Fastest'])

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

    def test_finalize_drops_optimised_that_matches_fastest(self):
        """One road must not appear as both Fastest and Optimised."""
        routes = [
            _route('Fastest', SHAPE_A, duration=10, route_id=1),
            {'id': 2, 'name': PRIMARY_OPTIMISED_NAME, 'geometry': SHAPE_A,
             'geometry_precision': 6, 'distance_km': 5.0, 'duration_minutes': 12},
        ]
        out = finalize_route_variety(routes, max_detour_percent=20)
        self.assertEqual([r['name'] for r in out], ['Fastest'])
        self.assertEqual(out[0]['id'], 1)

    def test_finalize_keeps_fastest_when_same_road_optimised_is_first(self):
        routes = [
            {'id': 1, 'name': PRIMARY_OPTIMISED_NAME, 'geometry': SHAPE_A,
             'geometry_precision': 6, 'distance_km': 5.0, 'duration_minutes': 12},
            _route('Fastest', SHAPE_A, duration=10, route_id=2),
        ]
        out = finalize_route_variety(routes, max_detour_percent=20)
        self.assertEqual([r['name'] for r in out], ['Fastest'])

    def test_max_detour_uses_fastest_baseline_not_optimised(self):
        """Regression: Optimised-first must not drop a modestly slower Fastest."""
        routes = [
            {'id': 1, 'name': PRIMARY_OPTIMISED_NAME, 'geometry': SHAPE_A,
             'geometry_precision': 6, 'distance_km': 12.0, 'duration_minutes': 18},
            _route('Fastest', SHAPE_B, duration=22, distance=11.0, route_id=2),
            _route('Alternate', SHAPE_C, duration=24, distance=13.0, route_id=3),
            _route('Slow', SHAPE_C, duration=40, distance=20.0, route_id=4),
        ]
        # Fastest is ~22% slower than Optimised; old bug used Optimised as baseline
        # and dropped Fastest under max_detour=20 → single preview option.
        out = filter_routes_by_max_detour(routes, 20)
        names = [r['name'] for r in out]
        self.assertEqual(names[0], PRIMARY_OPTIMISED_NAME)
        self.assertIn('Fastest', names)
        self.assertIn('Alternate', names)  # ~9% over Fastest baseline
        self.assertNotIn('Slow', names)

    def test_finalize_keeps_fastest_when_optimised_quicker(self):
        routes = [
            {'id': 1, 'name': PRIMARY_OPTIMISED_NAME, 'geometry': SHAPE_A,
             'geometry_precision': 6, 'distance_km': 12.0, 'duration_minutes': 18,
             'source': 'GraphHopper'},
            _route('Fastest', SHAPE_B, duration=22, distance=11.0, route_id=2),
        ]
        out = finalize_route_variety(routes, max_detour_percent=20)
        self.assertEqual(len(out), 2)
        self.assertEqual(out[0]['name'], PRIMARY_OPTIMISED_NAME)
        self.assertEqual(out[1]['name'], 'Fastest')

    def test_max_detour_keeps_quiet_route_at_default_cap(self):
        """🛤️ Quiet trades time for calmer roads, so it must survive the 20% default."""
        routes = [
            _route('Fastest', SHAPE_A, duration=30, distance=24.0, route_id=1),
            _route(QUIET_ROUTE_NAME, SHAPE_B, duration=42, distance=27.0, route_id=2),
            _route(SCENIC_ROUTE_NAME, SHAPE_C, duration=38, distance=29.0, route_id=3),
        ]
        out = filter_routes_by_max_detour(routes, 20)
        names = [r['name'] for r in out]
        self.assertIn(QUIET_ROUTE_NAME, names)
        self.assertIn(SCENIC_ROUTE_NAME, names)

    def test_max_detour_still_drops_unnamed_alternate_at_default_cap(self):
        """The wider allowance is only for the named preference options."""
        routes = [
            _route('Fastest', SHAPE_A, duration=30, distance=24.0, route_id=1),
            _route('Alternate', SHAPE_B, duration=42, distance=27.0, route_id=2),
            _route(QUIET_ROUTE_NAME, SHAPE_C, duration=42, distance=29.0, route_id=3),
        ]
        names = [r['name'] for r in filter_routes_by_max_detour(routes, 20)]
        self.assertNotIn('Alternate', names)
        self.assertIn(QUIET_ROUTE_NAME, names)

    def test_max_detour_keeps_preference_routes_under_a_tight_cap(self):
        """A tight cap is about quicker roads; Quiet/Scenic are asked for despite the time."""
        routes = [
            _route('Fastest', SHAPE_A, duration=30, distance=24.0, route_id=1),
            _route(QUIET_ROUTE_NAME, SHAPE_B, duration=48, distance=27.0, route_id=2),
            _route(SCENIC_ROUTE_NAME, SHAPE_C, duration=51, distance=29.0, route_id=3),
        ]
        # 60% and 70% over Fastest — far past a 5% cap, inside the preference floor.
        names = [r['name'] for r in filter_routes_by_max_detour(routes, 5)]
        self.assertIn(QUIET_ROUTE_NAME, names)
        self.assertIn(SCENIC_ROUTE_NAME, names)

    def test_max_detour_drops_preference_routes_beyond_the_floor(self):
        """The floor is a tolerance, not an exemption: twice as long is not an option."""
        routes = [
            _route('Fastest', SHAPE_A, duration=30, distance=24.0, route_id=1),
            _route(QUIET_ROUTE_NAME, SHAPE_B, duration=45, distance=27.0, route_id=2),
            _route(SCENIC_ROUTE_NAME, SHAPE_C, duration=90, distance=52.0, route_id=3),
        ]
        # Quiet is 50% over, Scenic 200% over.
        names = [r['name'] for r in filter_routes_by_max_detour(routes, 20)]
        self.assertIn(QUIET_ROUTE_NAME, names)
        self.assertNotIn(SCENIC_ROUTE_NAME, names)

    def test_max_detour_lets_a_generous_user_cap_beat_the_floor(self):
        routes = [
            _route('Fastest', SHAPE_A, duration=30, distance=24.0, route_id=1),
            _route(QUIET_ROUTE_NAME, SHAPE_B, duration=57, distance=31.0, route_id=2),
        ]
        # 90% over Fastest: past the floor, inside a 95% cap.
        self.assertIn(QUIET_ROUTE_NAME, [r['name'] for r in filter_routes_by_max_detour(routes, 95)])

    def test_max_detour_decision_is_independent_of_traffic_scaling(self):
        """
        The same routes must survive whether durations are free-flow or traffic-scaled.

        Every option in a response is scaled by one multiplier, so scaling cannot
        change which options are offered. It used to: the baseline was inflated while
        Quiet and Scenic were not, so the effective tolerance drifted with the traffic.
        """
        def routes_at(multiplier):
            return [
                _route('Fastest', SHAPE_A, duration=30 * multiplier, distance=24.0, route_id=1),
                _route(QUIET_ROUTE_NAME, SHAPE_B, duration=48 * multiplier, distance=27.0, route_id=2),
                _route('Alternate', SHAPE_C, duration=39 * multiplier, distance=29.0, route_id=3),
            ]

        free_flow = [r['name'] for r in filter_routes_by_max_detour(routes_at(1.0), 20)]
        peak = [r['name'] for r in filter_routes_by_max_detour(routes_at(1.35), 20)]
        heavy = [r['name'] for r in filter_routes_by_max_detour(routes_at(2.0), 20)]

        self.assertEqual(free_flow, peak)
        self.assertEqual(free_flow, heavy)
        # Quiet (60% over) is kept by the preference floor, Alternate (30% over) dropped.
        self.assertIn(QUIET_ROUTE_NAME, free_flow)
        self.assertNotIn('Alternate', free_flow)

    def test_max_detour_respects_zero_allowance_for_preference_routes(self):
        routes = [
            _route('Fastest', SHAPE_A, duration=30, distance=24.0, route_id=1),
            _route(QUIET_ROUTE_NAME, SHAPE_B, duration=42, distance=27.0, route_id=2),
            _route(SCENIC_ROUTE_NAME, SHAPE_C, duration=50, distance=29.0, route_id=3),
        ]
        names = [r['name'] for r in filter_routes_by_max_detour(routes, 0)]
        # A 0% cap means no detour at all; the preview keeps the closest option only.
        self.assertEqual(names, ['Fastest', QUIET_ROUTE_NAME])

    def test_max_detour_restores_closest_option_instead_of_collapsing(self):
        """A very slow Quiet still beats showing a single option."""
        routes = [
            _route('Fastest', SHAPE_A, duration=30, distance=24.0, route_id=1),
            _route(QUIET_ROUTE_NAME, SHAPE_B, duration=70, distance=31.0, route_id=2),
            _route(SCENIC_ROUTE_NAME, SHAPE_C, duration=95, distance=40.0, route_id=3),
        ]
        out = filter_routes_by_max_detour(routes, 20)
        self.assertEqual([r['name'] for r in out], ['Fastest', QUIET_ROUTE_NAME])
        self.assertEqual([r['id'] for r in out], [1, 2])

    def test_finalize_offers_quiet_alongside_optimised_and_fastest(self):
        routes = [
            {'id': 1, 'name': PRIMARY_OPTIMISED_NAME, 'geometry': SHAPE_A,
             'geometry_precision': 6, 'distance_km': 25.0, 'duration_minutes': 33,
             'source': 'GraphHopper'},
            _route('Fastest', SHAPE_B, duration=30, distance=24.0, route_id=2),
            _route(QUIET_ROUTE_NAME, SHAPE_C, duration=42, distance=27.0, route_id=3),
        ]
        out = finalize_route_variety(routes, max_detour_percent=20)
        names = [r['name'] for r in out]
        self.assertEqual(names[0], PRIMARY_OPTIMISED_NAME)
        self.assertIn('Fastest', names)
        self.assertIn(QUIET_ROUTE_NAME, names)

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

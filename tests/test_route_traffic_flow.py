"""Tests for route-traffic-flow endpoint hardening."""

import unittest

from voyagr.api.traffic import _sample_route_points, _simulate_route_traffic_segments


class TestRouteTrafficFlow(unittest.TestCase):
    def test_sample_route_points_caps_segments(self):
        points = [[51.0 + i * 0.001, -0.1] for i in range(200)]
        sampled = _sample_route_points(points, sample_interval=1)
        self.assertLessEqual(len(sampled) - 1, 8)

    def test_simulated_segments_are_well_formed(self):
        points = [[51.0, -0.1], [51.01, -0.1], [51.02, -0.1], [51.03, -0.1]]
        segments = _simulate_route_traffic_segments(points)
        self.assertTrue(segments)
        for seg in segments:
            self.assertIn('traffic_level', seg)
            self.assertEqual(len(seg['start']), 2)
            self.assertEqual(len(seg['end']), 2)


if __name__ == '__main__':
    unittest.main()

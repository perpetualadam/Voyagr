"""
Guards for the hazard-function dedup: voyagr.services.hazards is now the single
source of truth for /api/route, /api/multi-stop-route and GraphHopper avoidance.

These assert the (previously monolith-only) behaviour that was ported into the
service module, so a future edit can't silently regress the verified /api/route
path back to the older service-module defaults.
"""

import unittest

from voyagr.services import hazards as hz
from voyagr.utils.camera_buckets import normalize_camera_hazard_bucket


class ValhallaExcludeWeightsTest(unittest.TestCase):
    def test_avoid_point_outranks_camera_when_truncating(self):
        # No start/end -> distance_to_route is inf for all, so sort falls back to
        # weight desc. avoid_point (60) must outrank a camera (50) at the cap.
        hazards = {
            'avoid_point': [{'lat': 51.0, 'lon': -0.1}],
            'camera_speed': [{'lat': 52.0, 'lon': -1.0}],
        }
        out = hz.build_valhalla_exclude_locations(hazards, max_hazards=1)
        self.assertEqual(len(out), 1)
        self.assertEqual(out[0], {'lat': 51.0, 'lon': -0.1})

    def test_red_light_uses_camera_weight_not_100(self):
        # camera_red_light must be weighted as a camera (50), NOT the old
        # service-module special-case of 100. With a police hazard (40) and a
        # red-light camera, both are kept but ordering reflects camera==50>40.
        hazards = {
            'police': [{'lat': 52.0, 'lon': -1.0}],
            'camera_red_light': [{'lat': 51.0, 'lon': -0.1}],
        }
        out = hz.build_valhalla_exclude_locations(hazards, max_hazards=1)
        # Highest weight kept = camera_red_light (50) over police (40).
        self.assertEqual(out[0], {'lat': 51.0, 'lon': -0.1})


class MarkerDisplayTypeTest(unittest.TestCase):
    def test_bare_camera_maps_to_speed(self):
        self.assertEqual(hz._hazard_marker_display_type('camera', {}), 'camera_speed')

    def test_camera_subtype_passthrough(self):
        self.assertEqual(hz._hazard_marker_display_type('camera_red_light', {}), 'camera_red_light')

    def test_numeric_original_type_is_ignored(self):
        # TomTom original_type is numeric -> keep the category, don't leak "8".
        self.assertEqual(
            hz._hazard_marker_display_type('road_closed', {'original_type': '8'}),
            'road_closed',
        )

    def test_named_original_type_used(self):
        self.assertEqual(
            hz._hazard_marker_display_type('accident', {'original_type': 'Collision'}),
            'Collision',
        )


class ProximityDefaultsTest(unittest.TestCase):
    def test_defaults_include_traffic_light(self):
        prefs = hz._default_hazard_proximity_preferences()
        self.assertIn('traffic_light', prefs)
        self.assertEqual(prefs['traffic_light']['threshold'], 80)


class CameraBucketNormalizationTest(unittest.TestCase):
    def test_fetch_uses_shared_normalizer_for_legacy_labels(self):
        # The shared normalizer (now used by fetch_hazards_for_route) understands
        # legacy SCDB labels that the old inline _norm_cam did not.
        self.assertEqual(normalize_camera_hazard_bucket('speed_camera'), 'camera_speed')
        self.assertEqual(normalize_camera_hazard_bucket('traffic_light_camera'), 'camera_red_light')


if __name__ == '__main__':
    unittest.main()

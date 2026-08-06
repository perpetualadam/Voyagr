#!/usr/bin/env python3
"""Voice hazard types must be accepted by POST /api/hazards/report."""

import json
import unittest

from voyagr.api.hazards import (
    ALLOWED_COMMUNITY_HAZARD_TYPES,
    normalize_community_hazard_type,
)
from voyagr.api.navigation import _parse_voice_command
from voyagr_web import app


class TestCommunityHazardTypeNormalization(unittest.TestCase):
    def test_aliases_map_to_canonical(self):
        self.assertEqual(normalize_community_hazard_type('road_closure'), 'closure')
        self.assertEqual(normalize_community_hazard_type('traffic'), 'congestion')
        self.assertEqual(
            normalize_community_hazard_type('traffic_light_camera'),
            'camera_red_light',
        )

    def test_canonical_types_pass_through(self):
        for hazard_type in (
            'accident',
            'closure',
            'congestion',
            'pothole',
            'speed_camera',
            'camera_red_light',
        ):
            self.assertEqual(normalize_community_hazard_type(hazard_type), hazard_type)
            self.assertIn(hazard_type, ALLOWED_COMMUNITY_HAZARD_TYPES)

    def test_invalid_inputs(self):
        self.assertIsNone(normalize_community_hazard_type(None))
        self.assertIsNone(normalize_community_hazard_type(''))
        self.assertIsNone(normalize_community_hazard_type('   '))
        self.assertIsNone(normalize_community_hazard_type(123))


class TestVoiceHazardTypesAlignWithReportApi(unittest.TestCase):
    """Every voice report_hazard type must succeed against /api/hazards/report."""

    def setUp(self):
        self.client = app.test_client()
        self.lat = 51.5074
        self.lon = -0.1278

    def _voice_report_cases(self):
        return (
            ('report speed camera', 'speed_camera'),
            ('report traffic light camera', 'camera_red_light'),
            ('report road closure', 'closure'),
            ('report traffic jam', 'congestion'),
            ('report pothole', 'pothole'),
            ('report accident', 'accident'),
        )

    def test_voice_parser_emits_allowed_types(self):
        for command, expected_type in self._voice_report_cases():
            with self.subTest(command=command):
                result = _parse_voice_command(command, self.lat, self.lon)
                self.assertTrue(result.get('success'), result)
                self.assertEqual(result.get('action'), 'report_hazard')
                hazard_type = result.get('hazard_type')
                self.assertEqual(hazard_type, expected_type)
                canonical = normalize_community_hazard_type(hazard_type)
                self.assertIn(canonical, ALLOWED_COMMUNITY_HAZARD_TYPES)

    def test_report_api_accepts_voice_hazard_types(self):
        for _command, hazard_type in self._voice_report_cases():
            with self.subTest(hazard_type=hazard_type):
                response = self.client.post(
                    '/api/hazards/report',
                    json={
                        'lat': self.lat,
                        'lon': self.lon,
                        'hazard_type': hazard_type,
                        'description': f'voice alignment test {hazard_type}',
                        'severity': 'medium',
                    },
                    content_type='application/json',
                )
                self.assertEqual(response.status_code, 200, response.data)
                data = json.loads(response.data)
                self.assertTrue(data.get('success'), data)
                self.assertIn('report_id', data)

    def test_report_api_accepts_voice_aliases(self):
        for alias, canonical in (
            ('road_closure', 'closure'),
            ('traffic', 'congestion'),
            ('traffic_light_camera', 'camera_red_light'),
        ):
            with self.subTest(alias=alias):
                response = self.client.post(
                    '/api/hazards/report',
                    json={
                        'lat': self.lat,
                        'lon': self.lon,
                        'hazard_type': alias,
                        'description': f'alias test {alias}',
                    },
                    content_type='application/json',
                )
                self.assertEqual(response.status_code, 200, response.data)
                data = json.loads(response.data)
                self.assertTrue(data.get('success'), data)
                self.assertIn(canonical, ALLOWED_COMMUNITY_HAZARD_TYPES)

    def test_report_api_still_rejects_unknown_types(self):
        response = self.client.post(
            '/api/hazards/report',
            json={
                'lat': self.lat,
                'lon': self.lon,
                'hazard_type': 'not_a_real_hazard_type',
            },
            content_type='application/json',
        )
        self.assertEqual(response.status_code, 400)
        data = json.loads(response.data)
        self.assertFalse(data.get('success'))
        self.assertEqual(data.get('error'), 'Invalid hazard_type')


if __name__ == '__main__':
    unittest.main()

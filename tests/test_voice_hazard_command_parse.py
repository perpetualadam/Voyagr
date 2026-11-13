#!/usr/bin/env python3
"""Voice hazard command parsing — uses the real navigation parser symbol."""

import json
import unittest

from voyagr.api.navigation import _parse_voice_command
from voyagr_web import app


class TestVoiceHazardCommandParse(unittest.TestCase):
    def setUp(self):
        self.client = app.test_client()
        self.lat = 51.5074
        self.lon = -0.1278

    def test_negated_and_ambiguous_commands_do_not_execute(self):
        commands = (
            'do not avoid tolls', "don't avoid tolls", 'never avoid tolls',
            'avoid tolls and do not avoid tolls', 'avoid tolls not now',
            'can you explain avoid tolls', 'do not report police',
            'report no police', 'report police and debris',
            'support police', 'the report mentions police',
            'do not navigate to barnsley', 'do not recalculate',
            'do not select fastest route',
        )
        for command in commands:
            with self.subTest(command=command):
                response = self.client.post('/api/voice/command', json={
                    'command': command, 'lat': self.lat, 'lon': self.lon,
                })
                result = response.get_json()
                self.assertFalse(result['success'], result)
                self.assertNotIn('action', result)

    def test_explicit_commands_preserve_supported_actions(self):
        for command, action in (
            ('Please avoid tolls.', 'set_preference'),
            ('Report police ahead, please!', 'report_hazard'),
            ('report a red light camera here', 'report_hazard'),
            ('navigate to nottingham', 'navigate'),
            ('recalculate', 'reroute'),
            ('fastest route', 'set_preference'),
        ):
            with self.subTest(command=command):
                result = _parse_voice_command(command, self.lat, self.lon)
                self.assertTrue(result['success'], result)
                self.assertEqual(result['action'], action)

    def test_report_speed_camera(self):
        result = _parse_voice_command('report speed camera', self.lat, self.lon)
        self.assertTrue(result['success'])
        self.assertEqual(result['action'], 'report_hazard')
        self.assertEqual(result['hazard_type'], 'speed_camera')

    def test_report_traffic_light_camera_uses_camera_red_light(self):
        """Parser emits camera_red_light (not legacy traffic_light_camera)."""
        result = _parse_voice_command('report traffic light camera', self.lat, self.lon)
        self.assertTrue(result['success'])
        self.assertEqual(result['action'], 'report_hazard')
        self.assertEqual(result['hazard_type'], 'camera_red_light')

    def test_report_pothole(self):
        result = _parse_voice_command('report pothole', self.lat, self.lon)
        self.assertTrue(result['success'])
        self.assertEqual(result['action'], 'report_hazard')
        self.assertEqual(result['hazard_type'], 'pothole')

    def test_voice_command_api_hazard_report(self):
        response = self.client.post(
            '/api/voice/command',
            data=json.dumps({
                'command': 'report traffic light camera',
                'lat': self.lat,
                'lon': self.lon,
            }),
            content_type='application/json',
        )
        self.assertEqual(response.status_code, 200)
        data = json.loads(response.data)
        self.assertTrue(data['success'])
        self.assertEqual(data['action'], 'report_hazard')
        self.assertEqual(data['hazard_type'], 'camera_red_light')


if __name__ == '__main__':
    unittest.main()

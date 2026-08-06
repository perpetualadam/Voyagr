#!/usr/bin/env python3
"""Documented voice phrases 'Report police' and 'Report debris' must parse and save."""

import json
import unittest

from voyagr.api.hazards import ALLOWED_COMMUNITY_HAZARD_TYPES
from voyagr.api.navigation import _parse_voice_command
from voyagr_web import app


class TestVoiceReportPoliceAndDebris(unittest.TestCase):
    def setUp(self):
        self.client = app.test_client()
        self.lat = 51.5074
        self.lon = -0.1278

    def _cases(self):
        return (
            ('report police', 'police', 'Logging a police report.'),
            ('report debris', 'debris', 'Logging a debris report.'),
        )

    def test_parser_recognizes_documented_phrases(self):
        for command, expected_type, expected_message in self._cases():
            with self.subTest(command=command):
                result = _parse_voice_command(command, self.lat, self.lon)
                self.assertTrue(result.get('success'), result)
                self.assertEqual(result.get('action'), 'report_hazard')
                self.assertEqual(result.get('hazard_type'), expected_type)
                self.assertEqual(result.get('message'), expected_message)
                self.assertIn(expected_type, ALLOWED_COMMUNITY_HAZARD_TYPES)

    def test_voice_command_api_returns_report_hazard(self):
        for command, expected_type, _message in self._cases():
            with self.subTest(command=command):
                response = self.client.post(
                    '/api/voice/command',
                    json={
                        'command': command,
                        'lat': self.lat,
                        'lon': self.lon,
                    },
                    content_type='application/json',
                )
                self.assertEqual(response.status_code, 200, response.data)
                data = json.loads(response.data)
                self.assertTrue(data.get('success'), data)
                self.assertEqual(data.get('action'), 'report_hazard')
                self.assertEqual(data.get('hazard_type'), expected_type)

    def test_report_api_accepts_parsed_types(self):
        for _command, hazard_type, _message in self._cases():
            with self.subTest(hazard_type=hazard_type):
                response = self.client.post(
                    '/api/hazards/report',
                    json={
                        'lat': self.lat,
                        'lon': self.lon,
                        'hazard_type': hazard_type,
                        'description': f'voice {hazard_type} test',
                        'severity': 'medium',
                    },
                    content_type='application/json',
                )
                self.assertEqual(response.status_code, 200, response.data)
                data = json.loads(response.data)
                self.assertTrue(data.get('success'), data)
                self.assertIn('report_id', data)

    def test_without_report_keyword_police_is_not_a_hazard_report(self):
        # Keep matching scoped to "report …" so unrelated police phrases stay unrecognized
        # rather than silently logging a hazard.
        result = _parse_voice_command('where is the police station', self.lat, self.lon)
        self.assertFalse(result.get('success'))
        self.assertNotEqual(result.get('action'), 'report_hazard')


if __name__ == '__main__':
    unittest.main()

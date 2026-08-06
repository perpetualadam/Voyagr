#!/usr/bin/env python3
"""Desktop/PWA shared voice hazard classification and community submission parity."""

import unittest

from voyagr.api.navigation import _parse_voice_command
from voyagr.utils.voice_hazard_report import (
    DESKTOP_COMMUNITY_HAZARD_TYPES,
    build_desktop_voice_hazard_submission,
    classify_voice_hazard_report,
    normalize_voice_hazard_type,
    severity_for_voice_hazard_type,
)


class TestNormalizeVoiceHazardType(unittest.TestCase):
    def test_aliases(self):
        self.assertEqual(normalize_voice_hazard_type('road_closure'), 'closure')
        self.assertEqual(normalize_voice_hazard_type('traffic'), 'congestion')
        self.assertEqual(normalize_voice_hazard_type('camera'), 'speed_camera')
        self.assertEqual(normalize_voice_hazard_type('incident'), 'closure')
        self.assertEqual(normalize_voice_hazard_type('toll'), 'other')

    def test_invalid(self):
        self.assertIsNone(normalize_voice_hazard_type(None))
        self.assertIsNone(normalize_voice_hazard_type(''))
        self.assertIsNone(normalize_voice_hazard_type(1))


class TestClassifyVoiceHazardReportPwaMode(unittest.TestCase):
    """PWA mode requires the word 'report' and matches shared structured types."""

    def test_requires_report_keyword(self):
        self.assertIsNone(classify_voice_hazard_report('pothole ahead', require_report_keyword=True))

    def test_pwa_phrases(self):
        cases = (
            ('report speed camera', 'speed_camera'),
            ('report traffic light camera', 'camera_red_light'),
            ('report road closure', 'closure'),
            ('report traffic jam', 'congestion'),
            ('report pothole', 'pothole'),
            ('report accident', 'accident'),
        )
        for command, expected in cases:
            with self.subTest(command=command):
                result = classify_voice_hazard_report(command, require_report_keyword=True)
                self.assertIsNotNone(result)
                self.assertEqual(result['hazard_type'], expected)
                self.assertIn(result['hazard_type'], DESKTOP_COMMUNITY_HAZARD_TYPES)

    def test_accident_severity_high(self):
        result = classify_voice_hazard_report('report crash', require_report_keyword=True)
        self.assertEqual(result['severity'], 'high')
        self.assertEqual(severity_for_voice_hazard_type('accident'), 'high')
        self.assertEqual(severity_for_voice_hazard_type('pothole'), 'medium')


class TestClassifyVoiceHazardReportDesktopMode(unittest.TestCase):
    """Desktop free-form mode (no report keyword) still maps to community types."""

    def test_free_form_keywords(self):
        cases = (
            ('pothole ahead', 'pothole'),
            ('debris in road', 'debris'),
            ('police checkpoint', 'police'),
            ('camera on the left', 'speed_camera'),
            ('road closure', 'closure'),
            ('unknown hazard phrase', 'other'),
        )
        for command, expected in cases:
            with self.subTest(command=command):
                result = classify_voice_hazard_report(command, require_report_keyword=False)
                self.assertEqual(result['hazard_type'], expected)

    def test_build_desktop_submission(self):
        submission = build_desktop_voice_hazard_submission(
            'report speed camera', 51.5, -0.1
        )
        self.assertEqual(submission['hazard_type'], 'speed_camera')
        self.assertEqual(submission['lat'], 51.5)
        self.assertEqual(submission['lon'], -0.1)
        self.assertEqual(submission['severity'], 'medium')
        self.assertIn('speed camera', submission['description'])

    def test_build_desktop_submission_empty(self):
        self.assertIsNone(build_desktop_voice_hazard_submission('', 51.5, -0.1))


class TestPwaParserUsesSharedClassifier(unittest.TestCase):
    def test_parse_voice_command_report_types(self):
        result = _parse_voice_command('report road closure', 51.5, -0.1)
        self.assertTrue(result['success'])
        self.assertEqual(result['action'], 'report_hazard')
        # Canonical community type (not legacy road_closure)
        self.assertEqual(result['hazard_type'], 'closure')

    def test_parse_voice_command_traffic_jam(self):
        result = _parse_voice_command('report traffic jam', 51.5, -0.1)
        self.assertTrue(result['success'])
        self.assertEqual(result['hazard_type'], 'congestion')


if __name__ == '__main__':
    unittest.main()

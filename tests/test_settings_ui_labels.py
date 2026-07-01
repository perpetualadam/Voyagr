#!/usr/bin/env python3
"""
Settings UI contract tests.

Asserts the served settings panel keeps required control IDs (so JS keeps working)
and uses the neutral routing copy — not that arbitrary strings exist without purpose.
"""

import re
import unittest

from voyagr_web import app


# Toggle / control IDs the settings JavaScript binds to — must survive label-only edits.
REQUIRED_SETTINGS_CONTROL_IDS = [
    'avoidCAZ',
    'avoidCameras',
    'avoidTrafficLights',
    'avoidRailwayCrossings',
    'avoidTollRoads',
    'avoidMotorways',
    'avoidFerries',
    'cameraAlertType',
    'cameraAlertDistance',
    'speedUnit',
    'distanceUnit',
]

# Subsection headings users should see (routing reorganisation).
EXPECTED_SETTINGS_HEADINGS = [
    'Route around',
    'Smarter routing',
    'Map data filters',
]

# Wording we deliberately retired from the settings UI (regulatory / evasion tone).
RETIRED_SETTINGS_PHRASES = [
    'Avoid CAZ',
    'Hazard Avoidance',
    'Optimised Routing (cameras)',
    'Speed cameras',
    'Avoid Traffic Lights',
]


class TestSettingsUILabels(unittest.TestCase):
    """Settings HTML contract: controls wired, copy neutral, no retired phrases."""

    def setUp(self):
        self.client = app.test_client()

    def _settings_html(self) -> str:
        response = self.client.get('/')
        self.assertEqual(response.status_code, 200)
        html = response.get_data(as_text=True)
        start = html.find('id="settingsTab"')
        self.assertGreater(start, -1, 'settings tab markup missing from index HTML')
        return html[start:start + 120_000]

    def test_settings_controls_preserved(self):
        """Every settings toggle the app reads must still exist in the DOM."""
        html = self._settings_html()
        for control_id in REQUIRED_SETTINGS_CONTROL_IDS:
            with self.subTest(control_id=control_id):
                self.assertIn(f'id="{control_id}"', html)

    def test_settings_hazard_api_toggles_preserved(self):
        """Per-type map-data filters must keep data-hazard-type attributes."""
        html = self._settings_html()
        for hazard_type in (
            'camera_speed',
            'camera_red_light',
            'camera_average_speed',
            'camera_bus_lane',
            'camera_mobile',
            'camera_other',
        ):
            with self.subTest(hazard_type=hazard_type):
                self.assertIn(f'data-hazard-type="{hazard_type}"', html)

    def test_settings_onclick_handlers_preserved(self):
        """Critical onclick hooks must remain on routing toggles."""
        html = self._settings_html()
        self.assertIn("onclick=\"togglePreference('caz')\"", html)
        self.assertIn("onclick=\"togglePreference('cameras')\"", html)
        self.assertIn("onclick=\"toggleHazardPreferenceApi('camera_speed', event)\"", html)

    def test_settings_routing_subsections_present(self):
        html = self._settings_html()
        for heading in EXPECTED_SETTINGS_HEADINGS:
            with self.subTest(heading=heading):
                self.assertIn(heading, html)

    def test_settings_retired_phrases_absent(self):
        html = self._settings_html()
        for phrase in RETIRED_SETTINGS_PHRASES:
            with self.subTest(phrase=phrase):
                self.assertNotIn(phrase, html)

    def test_settings_responsibility_notice_present(self):
        html = self._settings_html()
        self.assertRegex(
            html,
            re.compile(r'responsible for following road signs', re.I),
        )


if __name__ == '__main__':
    unittest.main()

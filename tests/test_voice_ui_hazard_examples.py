#!/usr/bin/env python3
"""Voice Control UI must surface documented hazard-report example phrases."""

import unittest

from voyagr_web import app


# Documented hazard report phrases (PWA voice quick start / product docs).
EXPECTED_HAZARD_REPORT_PHRASES = [
    'Report speed camera',
    'traffic light camera',
    'police',
    'pothole',
    'debris',
    'accident',
]

# Existing navigation examples that must remain in the same list.
EXPECTED_NAV_EXAMPLE_PHRASES = [
    'Navigate to',
    'Find nearest',
    'Reroute',
]


class TestVoiceUiHazardExamples(unittest.TestCase):
    def setUp(self):
        self.client = app.test_client()

    def _voice_examples_html(self) -> str:
        response = self.client.get('/')
        self.assertEqual(response.status_code, 200)
        html = response.get_data(as_text=True)
        start = html.find('class="voice-examples"')
        self.assertGreater(start, -1, 'voice-examples block missing from index HTML')
        end = html.find('</details>', start)
        self.assertGreater(end, start, 'voice-examples details block not closed')
        return html[start:end]

    def test_voice_examples_include_hazard_report_phrases(self):
        section = self._voice_examples_html()
        self.assertIn('Example phrases', section)
        for phrase in EXPECTED_HAZARD_REPORT_PHRASES:
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, section)

    def test_voice_examples_keep_navigation_phrases(self):
        section = self._voice_examples_html()
        for phrase in EXPECTED_NAV_EXAMPLE_PHRASES:
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, section)

    def test_hazard_report_examples_are_a_list_item(self):
        section = self._voice_examples_html()
        self.assertIn(
            '<li>Report speed camera, traffic light camera, police, pothole, debris, or accident</li>',
            section,
        )


if __name__ == '__main__':
    unittest.main()

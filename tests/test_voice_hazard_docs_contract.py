#!/usr/bin/env python3
"""Keep voice-hazard user docs aligned with parser + community allowlist reality."""

from pathlib import Path
import unittest

from voyagr.api.hazards import ALLOWED_COMMUNITY_HAZARD_TYPES
from voyagr.api.navigation import _parse_voice_command
from voyagr.config.voice_hazard_docs import (
    DOCUMENTED_END_TO_END_VOICE_HAZARD_PHRASES,
    DOCUMENTED_PARSED_BUT_NOT_SAVED_VOICE_HAZARD_PHRASES,
    DOCUMENTED_UNSUPPORTED_VOICE_HAZARD_PHRASES,
    PRIMARY_VOICE_HAZARD_DOC_PATHS,
    VOICE_HAZARD_DOC_PARSED_NOT_SAVED_HEADING,
    VOICE_HAZARD_DOC_UNSUPPORTED_HEADING,
    VOICE_HAZARD_DOC_WORKING_HEADING,
)

REPO_ROOT = Path(__file__).resolve().parents[1]


class TestDocumentedEndToEndVoiceHazards(unittest.TestCase):
    def test_documented_working_phrases_parse_and_are_allowlisted(self):
        for phrase, expected_type in DOCUMENTED_END_TO_END_VOICE_HAZARD_PHRASES:
            with self.subTest(phrase=phrase):
                result = _parse_voice_command(phrase, 51.5, -0.1)
                self.assertTrue(result.get('success'), result)
                self.assertEqual(result.get('action'), 'report_hazard')
                self.assertEqual(result.get('hazard_type'), expected_type)
                self.assertIn(expected_type, ALLOWED_COMMUNITY_HAZARD_TYPES)

    def test_documented_parsed_but_not_saved_are_parsed_and_rejected_by_allowlist(self):
        for phrase, expected_type in DOCUMENTED_PARSED_BUT_NOT_SAVED_VOICE_HAZARD_PHRASES:
            with self.subTest(phrase=phrase):
                result = _parse_voice_command(phrase, 51.5, -0.1)
                self.assertTrue(result.get('success'), result)
                self.assertEqual(result.get('hazard_type'), expected_type)
                self.assertNotIn(
                    expected_type,
                    ALLOWED_COMMUNITY_HAZARD_TYPES,
                    f'{expected_type} is allowlisted; move it to end-to-end docs constants',
                )

    def test_unsupported_phrases_are_not_recognized(self):
        for phrase in DOCUMENTED_UNSUPPORTED_VOICE_HAZARD_PHRASES:
            with self.subTest(phrase=phrase):
                result = _parse_voice_command(phrase.lower(), 51.5, -0.1)
                self.assertFalse(result.get('success'), result)
                self.assertNotEqual(result.get('action'), 'report_hazard')


class TestPrimaryVoiceDocsStatusSections(unittest.TestCase):
    def test_primary_docs_include_status_headings_and_honest_claims(self):
        for rel_path in PRIMARY_VOICE_HAZARD_DOC_PATHS:
            path = REPO_ROOT / rel_path
            with self.subTest(doc=rel_path):
                self.assertTrue(path.is_file(), f'missing doc {rel_path}')
                text = path.read_text(encoding='utf-8')
                self.assertIn(VOICE_HAZARD_DOC_WORKING_HEADING, text)
                self.assertIn(VOICE_HAZARD_DOC_PARSED_NOT_SAVED_HEADING, text)
                self.assertIn(VOICE_HAZARD_DOC_UNSUPPORTED_HEADING, text)

                working_idx = text.index(VOICE_HAZARD_DOC_WORKING_HEADING)
                unsupported_idx = text.index(VOICE_HAZARD_DOC_UNSUPPORTED_HEADING)
                self.assertLess(working_idx, unsupported_idx)

                # Unsupported phrases may only appear at/after the unsupported heading
                for phrase in DOCUMENTED_UNSUPPORTED_VOICE_HAZARD_PHRASES:
                    first = text.find(phrase)
                    self.assertGreaterEqual(first, 0, f'{phrase} missing from {rel_path}')
                    self.assertGreaterEqual(
                        first,
                        unsupported_idx,
                        f'{phrase} appears as a working claim before unsupported section in {rel_path}',
                    )

                # End-to-end example used in quick tests must not claim speed-camera save
                if 'Should save hazard report' in text:
                    self.assertIn('accident', text.lower())


if __name__ == '__main__':
    unittest.main()

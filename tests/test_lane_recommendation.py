"""Behaviour-first tests for the LIVE web lane-recommendation logic.

These import the real functions used by the ``/api/lane-guidance`` endpoint
(``voyagr/api/navigation.py``) and assert the *correct* answer for each
scenario — not merely that the result is "in range" or "didn't crash".

They lock in the corrections made for:
  * roundabout 1st exit -> LEFT; 2nd+ on multi-lane dual approaches -> RIGHT
    (early pre-position after motorway slips); quiet residential 2nd -> LEFT
  * sharp_left / sharp_right honouring OSM ``turn:lanes`` instead of silently
    falling back to "through"
  * going straight ahead choosing a through lane when the left lane is
    turn-only ("left|through|through")
"""

import unittest
from unittest.mock import patch

from flask import Flask

from voyagr.api.navigation import (
    _parse_turn_lanes,
    _recommend_lane_from_turn_lanes,
    _recommend_lanes_from_turn_lanes,
    _get_recommended_lane_simple,
    _estimate_candidate_lanes_uk,
    _normalize_lane_maneuver_for_uk,
    _descriptive_lane_name,
    _apply_confidence_lane_selection,
    _score_lane_guidance_confidence,
    get_lane_guidance,
    navigation_bp,
)


class TestSimpleLaneFallback(unittest.TestCase):
    """No OSM turn:lanes data -> heuristic fallback (UK, left-hand traffic)."""

    def test_single_lane_is_always_lane_1(self):
        self.assertEqual(_get_recommended_lane_simple('right', 1), 1)
        self.assertEqual(_get_recommended_lane_simple('roundabout', 1, 3), 1)

    def test_left_family_uses_left_lane(self):
        for m in ('left', 'slight_left', 'sharp_left', 'exit_left'):
            self.assertEqual(_get_recommended_lane_simple(m, 3), 1, m)

    def test_right_family_uses_right_lane(self):
        for m in ('right', 'slight_right', 'sharp_right', 'exit_right', 'exit'):
            self.assertEqual(_get_recommended_lane_simple(m, 3), 3, m)

    def test_straight_uses_middle_lane(self):
        self.assertEqual(_get_recommended_lane_simple('straight', 3), 2)
        # 4 lanes: (4 + 1)//2 = 2
        self.assertEqual(_get_recommended_lane_simple('straight', 4), 2)

    def test_merge_uses_centre_lane_not_first_candidate(self):
        # Candidates for 3+ lane merges are edge lanes [1, total]; primary must stay
        # the centre-lane middle heuristic, not lanes[0] (== 1).
        self.assertEqual(_estimate_candidate_lanes_uk('merge', 3), [1, 3])
        self.assertEqual(_get_recommended_lane_simple('merge', 3), 2)
        self.assertEqual(_estimate_candidate_lanes_uk('merge', 4), [1, 4])
        self.assertEqual(_get_recommended_lane_simple('merge', 4), 2)
        self.assertEqual(_get_recommended_lane_simple('merge', 2), 1)

    def test_roundabout_first_exit_uses_left_lane(self):
        self.assertEqual(_get_recommended_lane_simple('roundabout', 3, 1), 1)
        self.assertEqual(_get_recommended_lane_simple('roundabout', 2, 1, 'primary'), 1)

    def test_roundabout_second_exit_right_on_dual_approach_left_on_residential(self):
        # Multi-lane primary/trunk: pre-position right for 2nd+ exits.
        self.assertEqual(_get_recommended_lane_simple('roundabout', 2, 2, 'primary'), 2)
        self.assertEqual(_get_recommended_lane_simple('roundabout', 3, 2, 'trunk'), 3)
        # Quiet residential keeps classic UK ahead/left for 2nd exit.
        self.assertEqual(_get_recommended_lane_simple('roundabout', 2, 2, 'residential'), 1)

    def test_roundabout_third_plus_exit_uses_right_lane(self):
        self.assertEqual(_get_recommended_lane_simple('roundabout', 3, 3), 3)
        self.assertEqual(_get_recommended_lane_simple('roundabout', 4, 4), 4)

    def test_slight_right_two_lane_primary_defaults_left(self):
        # Valhalla "keep right" on a 2-lane A-road should stay left (UK default).
        normalized = _normalize_lane_maneuver_for_uk('slight_right', 2, 'primary')
        self.assertEqual(normalized, 'straight')
        self.assertEqual(_get_recommended_lane_simple(normalized, 2), 1)

    def test_slight_right_motorway_still_uses_right_lane(self):
        normalized = _normalize_lane_maneuver_for_uk('slight_right', 3, 'motorway')
        self.assertEqual(normalized, 'slight_right')
        self.assertEqual(_get_recommended_lane_simple(normalized, 3), 3)


class TestNormalizeLaneManeuverForUK(unittest.TestCase):
    def test_through_alias_to_straight(self):
        self.assertEqual(_normalize_lane_maneuver_for_uk('through', 2, 'primary'), 'straight')

    def test_slight_hints_on_two_lane_non_motorway_become_straight(self):
        for m in ('slight_right', 'slight_left'):
            self.assertEqual(_normalize_lane_maneuver_for_uk(m, 2, 'primary'), 'straight')
            self.assertEqual(_normalize_lane_maneuver_for_uk(m, 2, 'secondary'), 'straight')

    def test_slight_hints_preserved_on_motorway(self):
        self.assertEqual(_normalize_lane_maneuver_for_uk('slight_right', 3, 'motorway'), 'slight_right')

    def test_slight_hints_preserved_on_three_lane_primary(self):
        self.assertEqual(_normalize_lane_maneuver_for_uk('slight_right', 3, 'primary'), 'slight_right')


class TestParseTurnLanes(unittest.TestCase):
    def test_parses_pipe_and_semicolon(self):
        self.assertEqual(
            _parse_turn_lanes('left|through|through;right', 3),
            [['left'], ['through'], ['through', 'right']],
        )

    def test_empty_returns_none(self):
        self.assertIsNone(_parse_turn_lanes('', 3))

    def test_lane_count_mismatch_returns_none(self):
        # 2 segments but total_lanes says 3 -> untrustworthy, ignore.
        self.assertIsNone(_parse_turn_lanes('left|through', 3))


class TestRecommendFromTurnLanes(unittest.TestCase):
    """OSM turn:lanes present -> real markings win."""

    def _dirs(self, s, n):
        return _parse_turn_lanes(s, n)

    def test_no_data_returns_none(self):
        self.assertIsNone(_recommend_lane_from_turn_lanes(None, 'left'))

    def test_left_turn_picks_left_lane(self):
        dirs = self._dirs('left|through|through', 3)
        self.assertEqual(_recommend_lane_from_turn_lanes(dirs, 'left'), 1)

    def test_sharp_left_honours_left_lane_not_through(self):
        # Regression: sharp_left used to fall through to "through" and miss the turn lane.
        dirs = self._dirs('left|through', 2)
        self.assertEqual(_recommend_lane_from_turn_lanes(dirs, 'sharp_left'), 1)

    def test_sharp_right_honours_right_lane(self):
        dirs = self._dirs('through|right', 2)
        self.assertEqual(_recommend_lane_from_turn_lanes(dirs, 'sharp_right'), 2)

    def test_straight_avoids_left_turn_only_lane(self):
        # Left lane is turn-only; going straight must use a through (middle) lane.
        dirs = self._dirs('left|through|through', 3)
        self.assertEqual(_recommend_lane_from_turn_lanes(dirs, 'straight'), 2)

    def test_roundabout_first_exit_takes_left_lane(self):
        dirs = self._dirs('left|through|through', 3)
        self.assertEqual(
            _recommend_lane_from_turn_lanes(dirs, 'roundabout', roundabout_exit_count=1), 1
        )

    def test_roundabout_second_exit_takes_through_lane(self):
        # Straight-through exit should pick a through lane, skipping the left-turn-only lane.
        dirs = self._dirs('left|through|right', 3)
        self.assertEqual(
            _recommend_lane_from_turn_lanes(dirs, 'roundabout', roundabout_exit_count=2), 2
        )

    def test_roundabout_second_exit_can_use_right_when_no_through(self):
        dirs = self._dirs('left|right', 2)
        self.assertEqual(
            _recommend_lane_from_turn_lanes(dirs, 'roundabout', roundabout_exit_count=2), 2
        )

    def test_roundabout_late_exit_takes_right_lane(self):
        dirs = self._dirs('through|through|right', 3)
        self.assertEqual(
            _recommend_lane_from_turn_lanes(dirs, 'roundabout', roundabout_exit_count=3), 3
        )


class TestDescriptiveLaneName(unittest.TestCase):
    def test_names(self):
        self.assertEqual(_descriptive_lane_name(1, 1), 'lane')
        self.assertEqual(_descriptive_lane_name(1, 3), 'left lane')
        self.assertEqual(_descriptive_lane_name(3, 3), 'right lane')
        self.assertEqual(_descriptive_lane_name(2, 3), 'middle lane')


class TestLowConfidenceGuidanceCopy(unittest.TestCase):
    """Sub-70 confidence must not emit lane-specific urgency/guidance copy."""

    def test_estimated_guidance_uses_neutral_copy_when_lanes_hidden(self):
        app = Flask(__name__)
        app.register_blueprint(navigation_bp, url_prefix='/api')
        with app.test_request_context(
            '/api/lane-guidance?lat=51.5&lon=-0.1&maneuver=left&distance=200&road_type=unknown'
        ):
            with patch('voyagr.api.navigation._fetch_osm_lane_data', return_value=None):
                data = get_lane_guidance().get_json()

        self.assertTrue(data['success'])
        self.assertLess(data['confidence'], 70)
        self.assertFalse(data['show_lane_guidance'])
        self.assertIsNone(data['recommended_lane'])
        self.assertEqual(data['urgency'], 'none')
        self.assertEqual(data['urgency_text'], '')
        self.assertEqual(data['guidance_text'], 'Stay in current lane')
        self.assertFalse(data['lane_change_needed'])
        combined = data['urgency_text'] + data['guidance_text']
        self.assertNotIn('  ', combined)
        self.assertNotRegex(combined, r'\bthe\s+in\b')


class TestConfidenceLaneSelection(unittest.TestCase):
    def test_high_confidence_single_lane(self):
        lanes, primary = _apply_confidence_lane_selection([1, 2], 95)
        self.assertEqual(lanes, [1])
        self.assertEqual(primary, 1)

    def test_medium_confidence_multiple_lanes(self):
        lanes, primary = _apply_confidence_lane_selection([2, 3], 82)
        self.assertEqual(lanes, [2, 3])
        self.assertEqual(primary, 2)

    def test_preferred_primary_kept_for_merge_candidates(self):
        # Edge candidates with centre preferred primary (merge on 3+ lanes).
        lanes, primary = _apply_confidence_lane_selection([1, 3], 76, preferred_primary=2)
        self.assertEqual(lanes, [1, 3])
        self.assertEqual(primary, 2)
        lanes, primary = _apply_confidence_lane_selection([1, 3], 95, preferred_primary=2)
        self.assertEqual(lanes, [2])
        self.assertEqual(primary, 2)

    def test_low_confidence_hides_lanes(self):
        lanes, primary = _apply_confidence_lane_selection([1], 65)
        self.assertEqual(lanes, [])
        self.assertIsNone(primary)

    def test_turn_lanes_score_highest(self):
        self.assertEqual(_score_lane_guidance_confidence(True, True, 'primary', 'left', 3), 95)

    def test_recommend_lanes_returns_all_tied_best_lanes(self):
        dirs = _parse_turn_lanes('through|through|right', 3)
        self.assertEqual(_recommend_lanes_from_turn_lanes(dirs, 'straight'), [1, 2])


if __name__ == '__main__':
    unittest.main()

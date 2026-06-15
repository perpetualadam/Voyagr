"""Behaviour-first tests for the LIVE web lane-recommendation logic.

These import the real functions used by the ``/api/lane-guidance`` endpoint
(``voyagr/api/navigation.py``) and assert the *correct* answer for each
scenario — not merely that the result is "in range" or "didn't crash".

They lock in the corrections made for:
  * roundabout 2nd exit -> LEFT lane (not middle), per UK Highway Code
  * sharp_left / sharp_right honouring OSM ``turn:lanes`` instead of silently
    falling back to "through"
  * going straight ahead choosing a through lane when the left lane is
    turn-only ("left|through|through")
"""

import unittest

from voyagr.api.navigation import (
    _parse_turn_lanes,
    _recommend_lane_from_turn_lanes,
    _get_recommended_lane_simple,
    _descriptive_lane_name,
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

    def test_roundabout_first_and_second_exit_use_left_lane(self):
        # THE FIX: 2nd exit (straight ahead) must be the LEFT lane, not middle.
        self.assertEqual(_get_recommended_lane_simple('roundabout', 3, 1), 1)
        self.assertEqual(_get_recommended_lane_simple('roundabout', 3, 2), 1)
        self.assertEqual(_get_recommended_lane_simple('roundabout', 2, 2), 1)

    def test_roundabout_third_plus_exit_uses_right_lane(self):
        self.assertEqual(_get_recommended_lane_simple('roundabout', 3, 3), 3)
        self.assertEqual(_get_recommended_lane_simple('roundabout', 4, 4), 4)


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


if __name__ == '__main__':
    unittest.main()

"""Behaviour-first tests for the GraphHopper -> Valhalla maneuver mapping.

This is the single source of truth now imported by ``voyagr_web.py`` for the
"Optimised" (GraphHopper) routes and reroutes. The mapping previously had an
off-by-one for left turns, which surfaced as "keep left" text and a straight
arrow where a real left/sharp-left turn was expected.
"""

import unittest

from voyagr.utils.graphhopper import (
    GH_SIGN_TO_VALHALLA,
    gh_sign_to_valhalla_type,
)


class TestGraphHopperSignMapping(unittest.TestCase):
    def test_left_turn_family_is_not_off_by_one(self):
        # The regression: these must be Sharp Left / Left / Slight Left,
        # NOT shifted to Left / Slight Left / Ramp.
        self.assertEqual(gh_sign_to_valhalla_type(-3), 14)  # Sharp left
        self.assertEqual(gh_sign_to_valhalla_type(-2), 15)  # Left
        self.assertEqual(gh_sign_to_valhalla_type(-1), 16)  # Slight left

    def test_right_turn_family(self):
        self.assertEqual(gh_sign_to_valhalla_type(1), 9)    # Slight right
        self.assertEqual(gh_sign_to_valhalla_type(2), 10)   # Right
        self.assertEqual(gh_sign_to_valhalla_type(3), 11)   # Sharp right

    def test_keep_and_uturn_signs(self):
        self.assertEqual(gh_sign_to_valhalla_type(-7), 24)  # Keep left  -> Stay Left
        self.assertEqual(gh_sign_to_valhalla_type(7), 23)   # Keep right -> Stay Right
        self.assertEqual(gh_sign_to_valhalla_type(-8), 13)  # U-turn left
        self.assertEqual(gh_sign_to_valhalla_type(8), 12)   # U-turn right
        self.assertEqual(gh_sign_to_valhalla_type(-98), 13)  # U-turn (unknown)

    def test_straight_finish_via_roundabout(self):
        self.assertEqual(gh_sign_to_valhalla_type(0), 8)    # Continue
        self.assertEqual(gh_sign_to_valhalla_type(4), 4)    # Destination
        self.assertEqual(gh_sign_to_valhalla_type(5), 0)    # None (via)
        self.assertEqual(gh_sign_to_valhalla_type(6), 26)   # Roundabout enter
        self.assertEqual(gh_sign_to_valhalla_type(-6), 27)  # Roundabout exit

    def test_unknown_sign_defaults_to_continue(self):
        self.assertEqual(gh_sign_to_valhalla_type(999), 8)
        self.assertEqual(gh_sign_to_valhalla_type(None), 8)

    def test_custom_default_is_respected(self):
        self.assertEqual(gh_sign_to_valhalla_type(999, default=0), 0)

    def test_voyagr_web_uses_the_shared_constant(self):
        # Guards against re-introducing a divergent inline copy in the web app.
        import voyagr_web
        self.assertIs(voyagr_web.GH_SIGN_TO_VALHALLA, GH_SIGN_TO_VALHALLA)

    def test_roundabout_exit_is_in_shared_map(self):
        self.assertEqual(GH_SIGN_TO_VALHALLA[-6], 27)


if __name__ == '__main__':
    unittest.main()

"""Tests for shared lane_maneuvers helpers and GraphHopper lane parity."""

import unittest

from voyagr.utils.provider_lanes import normalize_provider_lanes


class TestProviderLaneProtocols(unittest.TestCase):
    def test_valhalla_documented_masks_preserve_valid_and_preferred(self):
        lanes = normalize_provider_lanes([{'directions':8,'active':8}, {'directions':10,'valid':8}], 'Valhalla')
        self.assertEqual(lanes[0]['directions'], ['left'])
        self.assertTrue(lanes[0]['active'])
        self.assertEqual(lanes[1]['directions'], ['through','left'])
        self.assertEqual(lanes[1]['valid_indications'], ['left'])
        self.assertTrue(lanes[1]['valid'])
        self.assertFalse(lanes[1]['active'])

    def test_masks_reject_unknown_bits_booleans_and_conflicting_subsets(self):
        for lane in ({'directions':2048}, {'directions':8,'active':True},
                     {'directions':8,'active':64}, {'directions':10,'active':8,'valid':2},
                     {'directions':-1}, {'directions':8.0}):
            with self.subTest(lane=lane):
                self.assertIsNone(normalize_provider_lanes([lane, {'directions':2}], 'Valhalla'))

    def test_osrm_valid_is_not_an_invented_preferred_lane(self):
        lanes = normalize_provider_lanes([{'indications':['left'],'valid':True},
                                          {'indications':['straight','right'],'valid':False}], 'OSRM')
        self.assertTrue(lanes[0]['active'])
        self.assertFalse(lanes[0]['preferred'])
        self.assertEqual(lanes[1]['directions'], ['through','right'])
        self.assertFalse(lanes[1]['active'])

    def test_provider_flags_are_not_coerced_or_inferred(self):
        for lanes in ([{'indications':['left'],'valid':'true'}, {}],
                      [{'directions':[], 'active':True, 'evidence_state':'INFERRED'}, {}],
                      [{'indications':['invented'],'valid':True}, {}], [{}]*13):
            self.assertIsNone(normalize_provider_lanes(lanes,'OSRM'))

    def test_full_indications_survive_separate_selected_direction(self):
        lanes=normalize_provider_lanes([
            {'directions':['left','through'],'valid_indications':['left'],'active':True},
            {'directions':['through'],'active':False}], 'GraphHopper')
        self.assertEqual(lanes[0]['directions'],['left','through'])
        self.assertEqual(lanes[0]['active_indications'],['left'])
        self.assertIsNone(normalize_provider_lanes([
            {'indications':['left'],'valid':True,'valid_indication':'right'},{}],'OSRM'))

from voyagr.utils.lane_maneuvers import (
    attach_lanes_to_graphhopper_maneuver,
    build_lanes_for_maneuver,
    build_valhalla_lane_objects,
    extract_turn_lanes_string_from_graphhopper_instruction,
    recommend_lanes_from_turn_lanes,
    parse_turn_lanes,
    turn_lanes_string_from_lane_dicts,
)


class TestGraphHopperLaneExtraction(unittest.TestCase):
    def test_turn_lanes_string_from_lane_dicts(self):
        s = turn_lanes_string_from_lane_dicts([
            {'directions': ['left'], 'active': True},
            {'directions': ['straight'], 'active': False},
            {'directions': ['right'], 'active': False},
        ])
        self.assertEqual(s, 'left|through|right')

    def test_extract_from_osm_style_instruction_field(self):
        s = extract_turn_lanes_string_from_graphhopper_instruction({
            'turn_lanes': 'left|through|through;right',
        })
        self.assertEqual(s, 'left|through|through;right')

    def test_extract_from_mapbox_style_components(self):
        s = extract_turn_lanes_string_from_graphhopper_instruction({
            'components': [
                {'type': 'lane', 'directions': ['left'], 'active': True},
                {'type': 'lane', 'directions': ['right'], 'active': False},
            ],
        })
        self.assertEqual(s, 'left|right')


class TestBuildLanesForManeuver(unittest.TestCase):
    def test_right_turn_with_turn_lanes_marks_right_lane_active(self):
        lanes = build_lanes_for_maneuver(
            valhalla_type=10,
            road_class='primary',
            turn_lanes_str='left|through|right',
        )
        self.assertIsNotNone(lanes)
        self.assertEqual(len(lanes), 3)
        self.assertTrue(lanes[2]['active'])
        self.assertFalse(lanes[0]['active'])

    def test_heuristic_lanes_from_path_lane_count(self):
        lanes = build_lanes_for_maneuver(
            valhalla_type=10,
            road_class='motorway',
            path_lane_count=3,
        )
        self.assertIsNotNone(lanes)
        self.assertEqual(len(lanes), 3)
        self.assertTrue(lanes[2]['active'])

    def test_continue_maneuver_returns_none(self):
        self.assertIsNone(build_lanes_for_maneuver(valhalla_type=8, road_class='primary', path_lane_count=3))


class TestAttachLanesToGraphHopperManeuver(unittest.TestCase):
    def test_attaches_lanes_to_maneuver_dict(self):
        maneuver = {'type': 10, 'road_class': 'primary'}
        instr = {'turn_lanes': 'left|through|right', 'interval': [0, 2]}
        attach_lanes_to_graphhopper_maneuver(
            maneuver,
            instr,
            valhalla_type=10,
            path_details={'lanes': [[0, 3, 3]]},
            shape_index_src=1,
        )
        self.assertIn('lanes', maneuver)
        self.assertEqual(len(maneuver['lanes']), 3)
        self.assertTrue(maneuver['lanes'][2]['active'])


class TestValhallaLaneObjects(unittest.TestCase):
    def test_build_valhalla_lane_objects_marks_multiple_active(self):
        objs = build_valhalla_lane_objects(3, [1, 2], [['left'], ['through'], ['right']])
        self.assertTrue(objs[0]['active'])
        self.assertTrue(objs[1]['active'])
        self.assertFalse(objs[2]['active'])
        self.assertEqual(objs[0]['valid_indications'], ['left'])


if __name__ == '__main__':
    unittest.main()

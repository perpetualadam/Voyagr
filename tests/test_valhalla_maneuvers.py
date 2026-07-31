"""Tests for Valhalla maneuver normalization + extraction."""

import unittest

from voyagr.services.routing.maneuvers import (
    extract_valhalla_maneuvers,
    valhalla_maneuver_dict,
)


class ValhallaManeuverDictTest(unittest.TestCase):
    def test_basic_fields_and_km_length(self):
        m = valhalla_maneuver_dict({
            'instruction': 'Turn left',
            'type': 15,
            'length': 2.0,
            'time': 60,
            'street_names': ['High Street'],
            'begin_shape_index': 3,
            'end_shape_index': 7,
        })
        self.assertEqual(m['instruction'], 'Turn left')
        self.assertEqual(m['type'], 15)
        self.assertEqual(m['distance'], 2.0)  # km untouched
        self.assertEqual(m['street_name'], 'High Street')
        self.assertEqual(m['begin_shape_index'], 3)
        self.assertEqual(m['end_shape_index'], 7)

    def test_length_in_meters_scales(self):
        m = valhalla_maneuver_dict({'length': 2.0}, length_in_meters=True)
        self.assertEqual(m['distance'], 2000.0)

    def test_roundabout_exit_count_only_for_roundabout_types(self):
        m = valhalla_maneuver_dict({'type': 26, 'roundabout_exit_count': '2'})
        self.assertEqual(m['roundabout_exit_count'], 2)
        m2 = valhalla_maneuver_dict({'type': 15, 'roundabout_exit_count': '2'})
        self.assertNotIn('roundabout_exit_count', m2)

    def test_road_class_inferred_from_ref(self):
        m = valhalla_maneuver_dict({'begin_street_names': ['M1'], 'type': 8})
        self.assertEqual(m.get('road_class'), 'motorway')

    def test_speed_limit_converted_from_kmh_to_mph(self):
        """Valhalla units=kilometers → store mph like GraphHopper/OSRM maneuvers."""
        m = valhalla_maneuver_dict({'speed_limit': 48, 'type': 8})
        self.assertEqual(m['speed_limit'], 30)
        m70 = valhalla_maneuver_dict({'speed_limit': 112, 'type': 8})
        self.assertEqual(m70['speed_limit'], 70)
        m65 = valhalla_maneuver_dict({'speed_limit': 105, 'type': 8})
        self.assertEqual(m65['speed_limit'], 65)
        m_none = valhalla_maneuver_dict({'type': 8})
        self.assertIsNone(m_none['speed_limit'])


class ExtractValhallaManeuversTest(unittest.TestCase):
    def _trip(self):
        return {'legs': [
            {'maneuvers': [{'instruction': 'Head north', 'type': 1, 'length': 1.0}]},
            {'maneuvers': [{'instruction': 'Arrive', 'type': 4, 'length': 0}]},
        ]}

    def test_collects_across_legs(self):
        out = extract_valhalla_maneuvers(self._trip())
        self.assertEqual(len(out), 2)
        self.assertEqual(out[0]['instruction'], 'Head north')
        self.assertEqual(out[1]['type'], 4)

    def test_length_in_meters_passthrough(self):
        out = extract_valhalla_maneuvers(self._trip(), length_in_meters=True)
        self.assertEqual(out[0]['distance'], 1000.0)

    def test_missing_legs_returns_empty(self):
        self.assertEqual(extract_valhalla_maneuvers({}), [])
        self.assertEqual(extract_valhalla_maneuvers(None), [])

    def test_leg_without_maneuvers_skipped(self):
        out = extract_valhalla_maneuvers({'legs': [{'shape': 'abc'}]})
        self.assertEqual(out, [])


if __name__ == '__main__':
    unittest.main()

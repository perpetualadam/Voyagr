"""Tests for OSRM step -> Valhalla maneuver conversion."""

import unittest

from voyagr.utils.osrm import (
    build_osrm_maneuvers,
    infer_road_class_from_names,
    nearest_shape_index,
    osrm_maneuver_type,
    parse_osrm_maxspeed_kmh,
)


class TestOsrmRoadClassInference(unittest.TestCase):
    def test_motorway_from_ref(self):
        self.assertEqual(infer_road_class_from_names('M1', []), 'motorway')

    def test_primary_from_a_road(self):
        self.assertEqual(infer_road_class_from_names('A40', ['Oxford Street']), 'primary')

    def test_secondary_from_b_road(self):
        self.assertEqual(infer_road_class_from_names('B1234', []), 'secondary')


class TestOsrmManeuverTypeMapping(unittest.TestCase):
    def test_turn_left(self):
        self.assertEqual(osrm_maneuver_type('turn', 'left'), 15)

    def test_motorway_continue(self):
        self.assertEqual(osrm_maneuver_type('continue', None), 8)


class TestOsrmMaxspeedParsing(unittest.TestCase):
    def test_kmh(self):
        self.assertEqual(parse_osrm_maxspeed_kmh({'speed': 48, 'unit': 'km/h'}), 48)

    def test_mph(self):
        self.assertEqual(parse_osrm_maxspeed_kmh({'speed': 30, 'unit': 'mph'}), 48)

    def test_unknown(self):
        self.assertIsNone(parse_osrm_maxspeed_kmh({'unknown': True}))


class TestBuildOsrmManeuvers(unittest.TestCase):
    ROUTE_COORDS = [
        (51.50, -0.12),
        (51.51, -0.11),
        (51.52, -0.10),
        (51.53, -0.09),
    ]

    def test_builds_maneuvers_with_shape_indices_and_speed_limit(self):
        route = {
            'legs': [{
                'annotation': {
                    'maxspeed': [
                        {'speed': 48, 'unit': 'km/h'},
                        {'speed': 48, 'unit': 'km/h'},
                        {'speed': 48, 'unit': 'km/h'},
                    ],
                },
                'steps': [
                    {
                        'distance': 500,
                        'duration': 30,
                        'name': 'High Street',
                        'ref': '',
                        'maneuver': {
                            'type': 'depart',
                            'location': [-0.12, 51.50],
                        },
                    },
                    {
                        'distance': 800,
                        'duration': 45,
                        'name': 'M1',
                        'ref': 'M1',
                        'maneuver': {
                            'type': 'turn',
                            'modifier': 'right',
                            'location': [-0.11, 51.51],
                        },
                    },
                    {
                        'distance': 200,
                        'duration': 20,
                        'name': 'Destination',
                        'ref': '',
                        'maneuver': {
                            'type': 'arrive',
                            'location': [-0.09, 51.53],
                        },
                    },
                ],
            }],
        }

        maneuvers = build_osrm_maneuvers(route, self.ROUTE_COORDS)
        self.assertEqual(len(maneuvers), 3)
        self.assertEqual(maneuvers[0]['begin_shape_index'], 0)
        self.assertEqual(maneuvers[1]['begin_shape_index'], nearest_shape_index(
            self.ROUTE_COORDS, -0.11, 51.51
        ))
        self.assertEqual(maneuvers[1]['road_class'], 'motorway')
        self.assertEqual(maneuvers[1]['speed_limit'], 48)
        self.assertEqual(maneuvers[1]['type'], 10)
        self.assertTrue(maneuvers[2]['instruction'].lower().startswith('you have arrived'))


if __name__ == '__main__':
    unittest.main()

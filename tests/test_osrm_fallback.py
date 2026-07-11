"""Offline tests for OSRM fallback route building (build_osrm_routes)."""

import unittest
from unittest.mock import patch

import polyline

from voyagr.services.routing.osrm_fallback import OsrmRouteContext, build_osrm_routes


def _encode(coords):
    """Encode (lat, lon) tuples to an OSRM-style precision-5 polyline."""
    return polyline.encode(coords, 5)


def _osrm_response(num_routes=2):
    coords = [(51.50, -0.12), (51.51, -0.11), (51.52, -0.10)]
    geom = _encode(coords)
    routes = []
    for i in range(num_routes):
        routes.append({
            'distance': 5000 + i * 1000,
            'duration': 600 + i * 120,
            'geometry': geom,
            'legs': [{
                'annotation': {'maxspeed': [{'speed': 48, 'unit': 'km/h'}] * 3},
                'steps': [
                    {'distance': 5000, 'duration': 600, 'name': 'A40', 'ref': 'A40',
                     'maneuver': {'type': 'depart', 'location': [-0.12, 51.50]}},
                    {'distance': 0, 'duration': 0, 'name': '', 'ref': '',
                     'maneuver': {'type': 'arrive', 'location': [-0.10, 51.52]}},
                ],
            }],
        })
    return {'code': 'Ok', 'routes': routes}


def _ctx(**overrides):
    base = dict(
        hazards={},
        vehicle_type='petrol_diesel',
        fuel_efficiency=6.0,
        fuel_price=1.5,
        energy_efficiency=18.0,
        electricity_price=0.3,
        include_tolls=False,
        include_caz=False,
        caz_exempt=False,
    )
    base.update(overrides)
    return OsrmRouteContext(**base)


class BuildOsrmRoutesTest(unittest.TestCase):
    def test_basic_routes_names_and_shape(self):
        routes = build_osrm_routes(_osrm_response(3), _ctx())
        self.assertEqual(len(routes), 3)
        self.assertEqual([r['name'] for r in routes], ['Fastest', 'Shortest', 'Balanced'])
        for i, r in enumerate(routes):
            self.assertEqual(r['id'], i + 1)
            self.assertEqual(r['source'], 'OSRM')
            self.assertEqual(r['geometry_precision'], 5)
            self.assertGreater(len(r['maneuvers']), 0)

    def test_caps_at_four_routes(self):
        routes = build_osrm_routes(_osrm_response(6), _ctx())
        self.assertEqual(len(routes), 4)
        self.assertEqual(routes[3]['name'], 'Alternative 3')

    def test_petrol_fuel_cost_estimate(self):
        # 5 km at 6 L/100km * £1.5/L = 0.3 L => £0.45
        routes = build_osrm_routes(_osrm_response(1), _ctx())
        self.assertAlmostEqual(routes[0]['fuel_litres'], 0.3, places=2)
        self.assertAlmostEqual(routes[0]['fuel_cost'], 0.45, places=2)

    def test_electric_uses_energy_params(self):
        routes = build_osrm_routes(_osrm_response(1), _ctx(vehicle_type='electric'))
        # 5 km at 18 kWh/100km => 0.9 kWh * £0.3 = £0.27
        self.assertAlmostEqual(routes[0]['fuel_litres'], 0.9, places=2)
        self.assertAlmostEqual(routes[0]['fuel_cost'], 0.27, places=2)

    def test_hazard_scoring_invoked_when_hazards_present(self):
        import voyagr_web as vw
        with patch.object(vw, 'score_route_by_hazards', return_value=(120.0, 2)) as sc, \
             patch.object(vw, 'get_hazards_on_route', return_value=[{'type': 'camera'}]):
            routes = build_osrm_routes(
                _osrm_response(1), _ctx(hazards={'camera_speed': [{'lat': 51.5, 'lon': -0.1}]})
            )
        self.assertTrue(sc.called)
        self.assertEqual(routes[0]['hazard_penalty_seconds'], 120)
        self.assertEqual(routes[0]['hazard_count'], 2)
        self.assertEqual(len(routes[0]['hazards']), 1)

    def test_toll_and_caz_called_when_enabled(self):
        import voyagr_web as vw
        with patch.object(vw, 'calculate_toll_cost', return_value=3.2) as toll, \
             patch.object(vw, 'calculate_caz_cost', return_value=(15.0, {})) as caz:
            routes = build_osrm_routes(
                _osrm_response(1), _ctx(include_tolls=True, include_caz=True)
            )
        self.assertTrue(toll.called)
        self.assertTrue(caz.called)
        self.assertEqual(routes[0]['toll_cost'], 3.2)
        self.assertEqual(routes[0]['caz_cost'], 15.0)


if __name__ == '__main__':
    unittest.main()

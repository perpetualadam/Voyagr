"""
Flask-level smoke tests for /api/route with mocked routing engines.

These exercise the REAL calculate_route code path (parse -> hazard prep ->
engine orchestration -> enrichment -> response) against the REAL ensure_*
helpers, catching signature/wiring regressions that pure unit tests miss.

A previous refactor passed graphhopper_route to scenic/shortest ensure_* helpers
(which don't accept it), raising TypeError that surfaced only as success:false on
the live server. A hazard-on smoke here reproduces that class of bug offline.
"""

import unittest
from unittest.mock import patch

import voyagr_web as vw


def _fake_valhalla_trip():
    # Two-point polyline (precision 6) with two maneuvers.
    return {
        'trip': {
            'summary': {'length': 5.0, 'time': 600},
            'legs': [{
                'shape': 'yy_ilAdo}hEqBqB',
                'maneuvers': [
                    {'type': 1, 'instruction': 'Head north', 'begin_shape_index': 0,
                     'end_shape_index': 1, 'street_names': ['A1'], 'length': 5.0, 'time': 600},
                    {'type': 4, 'instruction': 'Arrive', 'begin_shape_index': 1,
                     'end_shape_index': 1, 'length': 0, 'time': 0},
                ],
            }],
        }
    }


class _FakeResp:
    status_code = 200
    text = ''

    def json(self):
        return _fake_valhalla_trip()


class CalculateRouteSmokeTest(unittest.TestCase):
    def setUp(self):
        self.client = vw.app.test_client()

    def _post(self, body):
        return self.client.post('/api/route', json=body)

    def test_valhalla_primary_no_hazard_avoidance(self):
        """Valhalla-only path (GH unavailable, hazard avoidance off)."""
        with patch.object(vw, 'route_with_graphhopper', return_value=None), \
             patch.object(vw.requests, 'post', return_value=_FakeResp()), \
             patch.object(vw.requests, 'get', return_value=_FakeResp()):
            r = self._post({
                'start': '53.536,-1.380', 'end': '53.517,-1.150',
                'routing_mode': 'auto', 'enable_hazard_avoidance': False,
            })
        self.assertEqual(r.status_code, 200)
        d = r.get_json()
        self.assertTrue(d.get('success'), f"error: {d.get('error')}")
        self.assertGreaterEqual(len(d.get('routes') or []), 1)

    def test_valhalla_primary_with_hazard_avoidance(self):
        """
        Hazard-avoidance ON exercises the real ensure_optimised/scenic/shortest
        enrichment branch (this is where the graphhopper_route kwargs bug lived).
        Network hazard fetchers are mocked/skipped for speed and determinism.
        """
        with patch.object(vw, 'route_with_graphhopper', return_value=None), \
             patch.object(vw, 'fetch_hazards_for_route', return_value={}), \
             patch.object(vw, 'fetch_tomtom_incidents', return_value={}), \
             patch.object(vw.requests, 'post', return_value=_FakeResp()), \
             patch.object(vw.requests, 'get', return_value=_FakeResp()):
            r = self._post({
                'start': '53.536,-1.380', 'end': '53.517,-1.150',
                'routing_mode': 'auto', 'enable_hazard_avoidance': True,
                'avoid_cameras': True,
                'avoid_traffic_lights': False, 'avoid_railway_crossings': False,
            })
        self.assertEqual(r.status_code, 200)
        d = r.get_json()
        self.assertTrue(d.get('success'), f"error: {d.get('error')}")
        self.assertGreaterEqual(len(d.get('routes') or []), 1)


if __name__ == '__main__':
    unittest.main()

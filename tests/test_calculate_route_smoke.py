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
from voyagr.services.routing.optimised_route import QUIET_ROUTE_NAME, SCENIC_ROUTE_NAME

# Distinct shapes (precision 6) for the same Doncaster-area origin/destination, so the
# preference requests come back as genuinely different paths rather than near-copies.
FASTEST_SHAPE = '_oqbeB~hfsA~uJ_kiFnkX_zuE'
QUIET_SHAPE = '_oqbeB~hfsA_xq@_hmFn{vA_}qE'
SCENIC_SHAPE = '_oqbeB~hfsA~eiA_neFobd@_wyE'


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


def _trip(shape, length_km, time_seconds):
    return {
        'trip': {
            'summary': {'length': length_km, 'time': time_seconds},
            'legs': [{
                'shape': shape,
                'maneuvers': [
                    {'type': 1, 'instruction': 'Head east', 'begin_shape_index': 0,
                     'end_shape_index': 2, 'street_names': ['A635'],
                     'length': length_km, 'time': time_seconds},
                    {'type': 4, 'instruction': 'Arrive', 'begin_shape_index': 2,
                     'end_shape_index': 2, 'length': 0, 'time': 0},
                ],
            }],
        }
    }


class _PreferenceAwareResp:
    """Valhalla stub that answers quiet/scenic costing requests with slower, distinct paths."""

    status_code = 200
    text = ''

    def __init__(self, payload):
        auto_opts = ((payload or {}).get('costing_options') or {}).get('auto') or {}
        if 'use_living_streets' in auto_opts:
            self._body = _trip(QUIET_SHAPE, 27.0, 2520)  # 42 min — 40% over Fastest
        elif auto_opts.get('use_highways') == 0.2:
            self._body = _trip(SCENIC_SHAPE, 29.0, 2280)  # 38 min — 27% over Fastest
        else:
            self._body = _trip(FASTEST_SHAPE, 24.0, 1800)  # 30 min

    def json(self):
        return self._body


class RoutePreviewVarietySmokeTest(unittest.TestCase):
    """/api/route must offer the 🛤️ Quiet option at the default 20% max_detour."""

    def setUp(self):
        self.client = vw.app.test_client()

    def _route_names(self, body):
        def fake_post(url, json=None, **kwargs):
            return _PreferenceAwareResp(json)

        with patch.object(vw, 'route_with_graphhopper', return_value=None), \
             patch.object(vw, 'fetch_hazards_for_route', return_value={}), \
             patch.object(vw, 'fetch_tomtom_incidents', return_value={}), \
             patch.object(vw, 'get_traffic_duration_multiplier', return_value=(1.0, 'N/A')), \
             patch.object(vw.requests, 'post', side_effect=fake_post), \
             patch.object(vw.requests, 'get', return_value=_FakeResp()):
            r = self.client.post('/api/route', json=body)
        self.assertEqual(r.status_code, 200)
        d = r.get_json()
        self.assertTrue(d.get('success'), f"error: {d.get('error')}")
        return [route.get('name') for route in (d.get('routes') or [])]

    def test_quiet_option_offered_at_default_max_detour(self):
        names = self._route_names({
            'start': '53.536,-1.380', 'end': '53.517,-1.150',
            'routing_mode': 'auto', 'enable_hazard_avoidance': False,
            'force_refresh': True,
        })
        self.assertIn(QUIET_ROUTE_NAME, names)
        self.assertIn(SCENIC_ROUTE_NAME, names)

    def test_preview_offers_a_choice_with_hazard_avoidance_on(self):
        names = self._route_names({
            'start': '53.536,-1.380', 'end': '53.517,-1.150',
            'routing_mode': 'auto', 'enable_hazard_avoidance': True,
            'avoid_cameras': True,
            'avoid_traffic_lights': False, 'avoid_railway_crossings': False,
            'force_refresh': True,
        })
        self.assertIn(QUIET_ROUTE_NAME, names)
        self.assertGreater(len(names), 1)


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

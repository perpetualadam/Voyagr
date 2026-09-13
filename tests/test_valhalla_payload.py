"""Tests for Valhalla /route payload builder."""

import unittest
from unittest.mock import patch

from voyagr.services.routing import orchestrator as _orch
from voyagr.services.routing.orchestrator import (
    post_valhalla_route,
    build_valhalla_baseline_request_payload,
    build_valhalla_discovery_payload,
    build_valhalla_minimal_request_payload,
    build_valhalla_retry_payload,
    build_valhalla_route_payload,
    classify_valhalla_route_data,
    describe_valhalla_http_error,
    find_baseline_cameras_on_route,
    normalize_valhalla_datetime,
    sanitize_valhalla_exclude_locations,
    VALHALLA_MAX_ALTERNATES,
    VALHALLA_MAX_EXCLUDE_LOCATIONS,
)


BASE = dict(
    route_locations=[{'lat': 53.5, 'lon': -1.4}, {'lat': 53.4, 'lon': -1.1}],
    has_waypoints=False,
    start_lat=53.5, start_lon=-1.4, end_lat=53.4, end_lon=-1.1,
    valhalla_costing='auto',
    avoid_tolls=False, avoid_motorways=False, avoid_ferries=False,
    prefer_scenic=False, prefer_quiet=False, avoid_unpaved=False,
    route_optimization='fastest',
    departure_time=None,
    exclude_locations=None,
    now_str='2026-01-01T12:00',
)


class TestBuildValhallaRoutePayload(unittest.TestCase):
    def test_auto_two_point_defaults(self):
        p = build_valhalla_route_payload(**BASE)
        self.assertEqual(p['costing'], 'auto')
        self.assertEqual(p['alternates'], VALHALLA_MAX_ALTERNATES)
        self.assertEqual(p['units'], 'kilometers')
        self.assertEqual(p['language'], 'en-GB')
        self.assertEqual(p['generalize'], 0)
        self.assertNotIn('directions_options', p)
        self.assertEqual(p['locations'], [{'lat': 53.5, 'lon': -1.4}, {'lat': 53.4, 'lon': -1.1}])
        self.assertEqual(p['date_time'], {'type': 1, 'value': '2026-01-01T12:00'})

    def test_waypoints_disable_alternates(self):
        p = build_valhalla_route_payload(**{**BASE, 'has_waypoints': True})
        self.assertEqual(p['alternates'], 0)

    def test_pedestrian_costing_options(self):
        p = build_valhalla_route_payload(**{**BASE, 'valhalla_costing': 'pedestrian'})
        self.assertEqual(p['alternates'], 0)
        self.assertIn('pedestrian', p['costing_options'])
        self.assertNotIn('date_time', p)

    def test_bicycle_costing_options(self):
        p = build_valhalla_route_payload(**{**BASE, 'valhalla_costing': 'bicycle'})
        self.assertIn('bicycle', p['costing_options'])
        self.assertNotIn('use_bike_lanes', p['costing_options']['bicycle'])
        self.assertEqual(p['costing_options']['bicycle']['cycling_speed'], 18)

    def test_hhmm_departure_time_is_expanded_to_iso_local(self):
        p = build_valhalla_route_payload(**{**BASE, 'departure_time': '08:00'})
        self.assertEqual(p['date_time']['type'], 1)
        self.assertRegex(p['date_time']['value'], r'^\d{4}-\d{2}-\d{2}T08:00$')

    def test_datetime_local_with_seconds_is_trimmed(self):
        p = build_valhalla_route_payload(**{**BASE, 'departure_time': '2026-06-01T09:30:00'})
        self.assertEqual(p['date_time'], {'type': 1, 'value': '2026-06-01T09:30'})

    def test_exclude_locations_capped_at_valhalla_limit(self):
        excl = [{'lat': 53.0 + i * 0.001, 'lon': -1.2} for i in range(80)]
        p = build_valhalla_route_payload(**{**BASE, 'exclude_locations': excl})
        self.assertEqual(len(p['exclude_locations']), VALHALLA_MAX_EXCLUDE_LOCATIONS)

    def test_explicit_departure_time(self):
        p = build_valhalla_route_payload(**{**BASE, 'departure_time': '2026-06-01T09:30'})
        self.assertEqual(p['date_time'], {'type': 1, 'value': '2026-06-01T09:30'})

    def test_exclude_locations_included(self):
        excl = [{'lat': 53.45, 'lon': -1.2}]
        p = build_valhalla_route_payload(**{**BASE, 'exclude_locations': excl})
        self.assertEqual(p['exclude_locations'], excl)

    def test_no_exclude_locations_key_when_empty(self):
        p = build_valhalla_route_payload(**BASE)
        self.assertNotIn('exclude_locations', p)

    def test_avoid_ferries_maps_to_pedestrian_use_ferry(self):
        p = build_valhalla_route_payload(**{**BASE, 'valhalla_costing': 'pedestrian', 'avoid_ferries': True})
        self.assertFalse(p['costing_options']['pedestrian']['use_ferry'])


RETRY_BASE = dict(
    start_lat=53.5, start_lon=-1.4, end_lat=53.4, end_lon=-1.1,
    valhalla_costing='auto',
    exclude_locations=[{'lat': 53.45, 'lon': -1.2}],
    avoid_tolls=False, avoid_motorways=False, avoid_ferries=False,
    prefer_scenic=False, prefer_quiet=False, avoid_unpaved=False,
    route_optimization='fastest',
)


class TestBuildValhallaRetryPayload(unittest.TestCase):
    def test_two_point_with_exclusions_no_datetime(self):
        p = build_valhalla_retry_payload(**RETRY_BASE)
        self.assertEqual(p['costing'], 'auto')
        self.assertEqual(p['alternates'], VALHALLA_MAX_ALTERNATES)
        self.assertEqual(p['exclude_locations'], [{'lat': 53.45, 'lon': -1.2}])
        self.assertEqual(len(p['locations']), 2)
        # Retry never adds time-dependent routing.
        self.assertNotIn('date_time', p)

    def test_pedestrian_alternates_zero(self):
        p = build_valhalla_retry_payload(**{**RETRY_BASE, 'valhalla_costing': 'pedestrian'})
        self.assertEqual(p['alternates'], 0)
        self.assertIn('pedestrian', p['costing_options'])

    def test_avoid_ferries_maps_to_pedestrian_use_ferry(self):
        p = build_valhalla_retry_payload(**{**RETRY_BASE, 'valhalla_costing': 'pedestrian', 'avoid_ferries': True})
        self.assertFalse(p['costing_options']['pedestrian']['use_ferry'])


class TestBuildValhallaBaselinePayload(unittest.TestCase):
    BASE = dict(
        start_lat=53.5, start_lon=-1.4, end_lat=53.4, end_lon=-1.1,
        route_locations=[{'lat': 53.5, 'lon': -1.4}, {'lat': 53.4, 'lon': -1.1}],
        has_waypoints=False, valhalla_costing='auto',
        avoid_tolls=False, avoid_motorways=False, avoid_ferries=False,
        departure_time=None,
    )

    def test_no_exclude_locations_key(self):
        p = build_valhalla_baseline_request_payload(**self.BASE)
        self.assertNotIn('exclude_locations', p)
        self.assertEqual(p['alternates'], VALHALLA_MAX_ALTERNATES)

    def test_waypoints_disable_alternates(self):
        p = build_valhalla_baseline_request_payload(**{**self.BASE, 'has_waypoints': True})
        self.assertEqual(p['alternates'], 0)

    def test_auto_adds_datetime(self):
        p = build_valhalla_baseline_request_payload(**self.BASE)
        self.assertIn('date_time', p)


class TestClassifyValhallaRouteData(unittest.TestCase):
    def test_error_body(self):
        self.assertEqual(
            classify_valhalla_route_data({'error': 'No path could be found'}),
            'Valhalla returned error: No path could be found',
        )

    def test_missing_trip(self):
        self.assertEqual(classify_valhalla_route_data({'foo': 1}), "Valhalla response missing 'trip' key")

    def test_usable_body_returns_none(self):
        self.assertIsNone(classify_valhalla_route_data({'trip': {'legs': []}}))


class TestValhallaPayloadSanitizers(unittest.TestCase):
    def test_hhmm_uses_supplied_now(self):
        from datetime import datetime as dt
        self.assertEqual(
            normalize_valhalla_datetime('08:00', now=dt(2026, 9, 13, 15, 45)),
            '2026-09-13T08:00',
        )

    def test_iso_with_seconds_and_space_separator(self):
        self.assertEqual(normalize_valhalla_datetime('2026-09-13T08:00:00'), '2026-09-13T08:00')
        self.assertEqual(normalize_valhalla_datetime('2026-09-13 08:00'), '2026-09-13T08:00')

    def test_garbage_datetime_returns_none(self):
        self.assertIsNone(normalize_valhalla_datetime('soon'))
        self.assertIsNone(normalize_valhalla_datetime(''))

    def test_exclude_locations_drop_invalid_and_cap(self):
        locs = (
            [{'lat': 91, 'lon': 0}]
            + [{'lat': 51.5, 'lon': -0.1 + i * 0.001} for i in range(60)]
            + [{'foo': 1}]
        )
        out = sanitize_valhalla_exclude_locations(locs)
        self.assertEqual(len(out), VALHALLA_MAX_EXCLUDE_LOCATIONS)
        self.assertEqual(out[0], {'lat': 51.5, 'lon': -0.1})

    def test_describe_http_error_prefers_json_error(self):
        class _Resp:
            status_code = 400
            text = '{"error":"Exceeded max alternates"}'

            def json(self):
                return {'error': 'Exceeded max alternates', 'error_code': 158}

        self.assertEqual(
            describe_valhalla_http_error(_Resp()),
            'HTTP 400: Exceeded max alternates',
        )

    def test_minimal_payload_omits_fields_that_400(self):
        p = build_valhalla_minimal_request_payload(
            start_lat=53.5, start_lon=-1.4, end_lat=53.4, end_lon=-1.1,
        )
        self.assertEqual(p['costing'], 'auto')
        self.assertEqual(len(p['locations']), 2)
        self.assertNotIn('alternates', p)
        self.assertNotIn('date_time', p)
        self.assertNotIn('language', p)
        self.assertNotIn('exclude_locations', p)
        self.assertNotIn('directions_options', p)


class _FakeResp:
    status_code = 200


class TestPostValhallaRoute(unittest.TestCase):
    def test_success_returns_response(self):
        with patch.object(_orch.requests, 'post', return_value=_FakeResp()) as p:
            out = post_valhalla_route('http://v/route', {'a': 1}, {'H': '1'}, 7)
        self.assertIsNotNone(out.response)
        self.assertIsNone(out.error)
        self.assertFalse(out.timed_out)
        p.assert_called_once()

    def test_timeout_flagged(self):
        with patch.object(_orch.requests, 'post', side_effect=_orch.requests.exceptions.Timeout()):
            out = post_valhalla_route('http://v/route', {}, {}, 7)
        self.assertTrue(out.timed_out)
        self.assertIsNone(out.response)
        self.assertIsNone(out.error)

    def test_request_exception_maps_to_error(self):
        with patch.object(_orch.requests, 'post',
                          side_effect=_orch.requests.exceptions.ConnectionError('down')):
            out = post_valhalla_route('http://v/route', {}, {}, 7)
        self.assertFalse(out.timed_out)
        self.assertIsNone(out.response)
        self.assertTrue(out.error.startswith('Routing service unreachable:'))


class TestDiscoveryHelpers(unittest.TestCase):
    def test_discovery_payload_shape(self):
        excl = [{'lat': 53.45, 'lon': -1.2}]
        p = build_valhalla_discovery_payload(
            start_lat=53.5, start_lon=-1.4, end_lat=53.4, end_lon=-1.1,
            exclude_locations=excl,
        )
        self.assertEqual(p['costing'], 'auto')
        self.assertEqual(p['exclude_locations'], excl)
        self.assertEqual(len(p['locations']), 2)
        self.assertNotIn('alternates', p)

    def test_baseline_cameras_kept_when_near_route(self):
        coords = [(53.50, -1.40), (53.45, -1.20), (53.40, -1.10)]
        near = {'lat': 53.4500, 'lon': -1.2000}   # on a sampled vertex
        far = {'lat': 10.0, 'lon': 10.0}
        out = find_baseline_cameras_on_route(coords, [near, far], sample_step=1)
        self.assertIn(near, out)
        self.assertNotIn(far, out)

    def test_baseline_cameras_respects_max_candidates(self):
        coords = [(53.45, -1.20)]
        cands = [{'lat': 53.45, 'lon': -1.20} for _ in range(50)]
        out = find_baseline_cameras_on_route(coords, cands, max_candidates=5, sample_step=1)
        self.assertEqual(len(out), 5)

    def test_baseline_cameras_empty_inputs(self):
        self.assertEqual(find_baseline_cameras_on_route([], [{'lat': 1, 'lon': 2}]), [])
        self.assertEqual(find_baseline_cameras_on_route([(1, 2)], []), [])


if __name__ == '__main__':
    unittest.main()

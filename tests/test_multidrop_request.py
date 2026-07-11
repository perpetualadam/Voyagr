"""Behavioural tests for build_multidrop_route_from_request.

This function holds the /api/multi-stop-route request parsing, validation and
response formatting that used to live inline in the Flask handler. The
engine-calling core (build_multidrop_route) is mocked so these run offline and
assert the product contract: validation status codes, response shaping, and the
never-raise error behaviour.
"""

from unittest.mock import patch

from voyagr.services.routing import multidrop
from voyagr.services.routing.multidrop import (
    build_multidrop_route_from_request,
    build_route_multidrop_response,
)
from voyagr.services.routing.request_params import parse_route_request


def test_requires_at_least_one_stop():
    result, status = build_multidrop_route_from_request({})
    assert status == 400
    assert result['success'] is False
    assert 'at least 1 stop' in result['error']


def test_rejects_more_than_25_stops():
    stops = [{'lat': 51.5 + i * 0.01, 'lon': -0.1, 'name': f's{i}'} for i in range(26)]
    result, status = build_multidrop_route_from_request({'start': '51.5,-0.1', 'stops': stops})
    assert status == 400
    assert 'Maximum 25 stops' in result['error']


def test_requires_stop_besides_start_when_start_derived_from_stops():
    # No explicit start => first stop becomes start; with only one stop, nothing remains.
    result, status = build_multidrop_route_from_request({'stops': [{'lat': 51.5, 'lon': -0.1}]})
    assert status == 400
    assert 'besides start/end' in result['error']


def test_success_path_formats_response():
    fake = {'success': True, 'total_distance_km': 12.5, 'total_duration_minutes': 30.0}
    with patch.object(multidrop, 'build_multidrop_route', return_value=fake) as m:
        result, status = build_multidrop_route_from_request({
            'start': '51.5,-0.12',
            'stops': [{'lat': 51.52, 'lon': -0.1, 'name': 'A'}],
        })
    assert status == 200
    assert m.called
    assert result['distance'] == '12.50 km'
    assert result['time'] == '30 minutes'
    assert result['source'] == 'Voyagr Multi-Drop'


def test_unsuccessful_core_result_returns_500():
    fake = {'success': False, 'error': 'no route'}
    with patch.object(multidrop, 'build_multidrop_route', return_value=fake):
        result, status = build_multidrop_route_from_request({
            'start': '51.5,-0.12',
            'stops': [{'lat': 51.52, 'lon': -0.1}],
        })
    assert status == 500
    assert result['success'] is False


def test_exceptions_are_swallowed_with_200():
    with patch.object(multidrop, 'build_multidrop_route', side_effect=RuntimeError('boom')):
        result, status = build_multidrop_route_from_request({
            'start': '51.5,-0.12',
            'stops': [{'lat': 51.52, 'lon': -0.1}],
        })
    assert status == 200
    assert result['success'] is False
    assert 'boom' in result['error']


def test_waypoint_strings_are_parsed_into_stops():
    fake = {'success': True, 'total_distance_km': 1.0, 'total_duration_minutes': 2.0}
    with patch.object(multidrop, 'build_multidrop_route', return_value=fake) as m:
        _result, status = build_multidrop_route_from_request({
            'start': '51.5,-0.12',
            'end': '51.6,-0.10',
            'waypoints': ['51.55,-0.11'],
        })
    assert status == 200
    # The string waypoint must have been parsed into the stops passed to the core.
    passed_stops = m.call_args.kwargs['stops']
    assert any(abs(s['lat'] - 51.55) < 1e-6 and abs(s['lon'] - -0.11) < 1e-6 for s in passed_stops)


# ---------------------------------------------------------------------------
# build_route_multidrop_response: the /api/route multi-drop branch
# ---------------------------------------------------------------------------

def _params(**overrides):
    data = {'start': '51.5,-0.12', 'end': '51.6,-0.10'}
    data.update(overrides)
    return parse_route_request(data)


def test_route_multidrop_returns_none_when_optimize_off():
    p = _params(optimize_stop_order=False,
                via_points=[{'lat': 51.55, 'lon': -0.11}, {'lat': 51.56, 'lon': -0.12}])
    assert build_route_multidrop_response(p) is None


def test_route_multidrop_returns_none_with_fewer_than_two_intermediates():
    p = _params(optimize_stop_order=True, via_points=[{'lat': 51.55, 'lon': -0.11}])
    assert build_route_multidrop_response(p) is None


def test_route_multidrop_returns_none_when_core_fails():
    p = _params(optimize_stop_order=True,
                via_points=[{'lat': 51.55, 'lon': -0.11}, {'lat': 51.56, 'lon': -0.12}])
    with patch.object(multidrop, 'build_multidrop_route', return_value={'success': False}):
        assert build_route_multidrop_response(p) is None


def test_route_multidrop_success_formats_full_response():
    p = _params(optimize_stop_order=True, enable_hazard_avoidance=False,
                via_points=[{'lat': 51.55, 'lon': -0.11}, {'lat': 51.56, 'lon': -0.12}])
    fake = {
        'success': True,
        'total_distance_km': 12.5,
        'total_duration_minutes': 30.0,
        'optimized': True,
        'legs': [{'geometry_precision': 6}],
        'all_geometry': ['abc'],
        'all_maneuvers': [{'instruction': 'Go'}],
    }
    with patch.object(multidrop, 'build_multidrop_route', return_value=fake):
        result = build_route_multidrop_response(p)
    assert result is not None
    assert result['multi_drop'] is True
    assert result['cached'] is False
    assert result['source'] == 'Voyagr Multi-Drop'
    assert result['distance'] == '12.50 km'
    assert result['time'] == '30 minutes'
    assert result['geometry'] == 'abc'
    assert result['geometry_precision'] == 6
    assert result['maneuvers'] == [{'instruction': 'Go'}]
    assert len(result['routes']) == 1
    assert result['routes'][0]['name'] == 'Multi-Drop (Optimized)'
    assert result['start_lat'] == p.start_lat and result['end_lon'] == p.end_lon

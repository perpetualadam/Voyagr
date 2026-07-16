"""Tests for attempt_graphhopper_camera_route.

Covers the GraphHopper-first branch of /api/route (extracted from
voyagr_web.calculate_route): when it is / isn't attempted, and how it maps the
route_with_graphhopper outcome into (route, error). route_with_graphhopper is
mocked so nothing hits the network.
"""

from unittest.mock import patch

from voyagr.services.routing import engines
from voyagr.services.routing.engines import attempt_graphhopper_camera_route

BBOX = {'min_lat': 51.5, 'max_lat': 51.6, 'min_lon': -0.2, 'max_lon': -0.1}
BASE = dict(
    route_bbox=BBOX, start_lat=51.5, start_lon=-0.2, end_lat=51.6, end_lon=-0.1,
    routing_mode='auto', enable_hazard_avoidance=True, avoid_cameras=True,
    avoid_traffic_lights=False, avoid_railway_crossings=False,
    apply_caz_routing_avoidance=False, avoid_points=None,
)


def test_not_attempted_when_avoidance_disabled():
    with patch.object(engines, 'route_with_graphhopper') as m:
        route, error = attempt_graphhopper_camera_route(hazards={}, **{**BASE, 'enable_hazard_avoidance': False})
    assert route is None and error is None
    m.assert_not_called()


def test_not_attempted_for_non_auto_mode():
    with patch.object(engines, 'route_with_graphhopper') as m:
        route, error = attempt_graphhopper_camera_route(hazards={}, **{**BASE, 'routing_mode': 'pedestrian'})
    assert route is None and error is None
    m.assert_not_called()


def test_success_returns_route_and_no_error():
    ok = {'success': True, 'distance_km': 5.0}
    with patch.object(engines, 'route_with_graphhopper', return_value=ok):
        route, error = attempt_graphhopper_camera_route(hazards={}, **BASE)
    assert route == ok
    assert error is None


def test_no_route_sets_error():
    with patch.object(engines, 'route_with_graphhopper', return_value=None):
        route, error = attempt_graphhopper_camera_route(hazards={}, **BASE)
    assert route is None
    assert error == 'No route found'


def test_exception_is_captured_as_error():
    with patch.object(engines, 'route_with_graphhopper', side_effect=RuntimeError('boom')):
        route, error = attempt_graphhopper_camera_route(hazards={}, **BASE)
    assert route is None
    assert error == 'boom'


def test_camera_hazards_forwarded_when_present():
    ok = {'success': True}
    hazards = {'camera_speed': [{'lat': 51.55, 'lon': -0.15}]}
    with patch.object(engines, 'route_with_graphhopper', return_value=ok) as m:
        attempt_graphhopper_camera_route(hazards=hazards, **BASE)
    kwargs = m.call_args.kwargs
    assert kwargs['camera_hazards'] is not None
    assert 'camera_speed' in kwargs['camera_hazards']


def test_costing_preferences_forwarded_to_graphhopper():
    ok = {'success': True}
    with patch.object(engines, 'route_with_graphhopper', return_value=ok) as m:
        attempt_graphhopper_camera_route(
            hazards={},
            **{
                **BASE,
                'avoid_tolls': True,
                'avoid_motorways': True,
                'avoid_ferries': True,
                'prefer_scenic': True,
                'route_optimization': 'eco',
            },
        )
    kwargs = m.call_args.kwargs
    assert kwargs['avoid_tolls'] is True
    assert kwargs['avoid_motorways'] is True
    assert kwargs['avoid_ferries'] is True
    assert kwargs['prefer_scenic'] is True
    assert kwargs['route_optimization'] == 'eco'

"""Unit tests for route cache key helpers."""

from voyagr.services.routing.route_cache_key import (
    build_route_cache_key,
    fingerprint_avoid_points,
    should_bypass_route_cache,
)


def test_fingerprint_avoid_points_empty():
    assert fingerprint_avoid_points([]) == ''
    assert fingerprint_avoid_points(None) == ''


def test_fingerprint_avoid_points_stable():
    pts = [{'lat': 51.5, 'lon': -0.12}, {'lat': 51.51, 'lon': -0.11}]
    assert fingerprint_avoid_points(pts) == fingerprint_avoid_points(pts)


def test_build_route_cache_key_changes_with_avoid_points():
    base = dict(
        start_lat=51.5,
        start_lon=-0.1,
        end_lat=51.6,
        end_lon=-0.2,
        routing_mode='auto',
        vehicle_type='petrol_diesel',
    )
    k1 = build_route_cache_key(**base, avoid_points=[])
    k2 = build_route_cache_key(**base, avoid_points=[{'lat': 51.55, 'lon': -0.15}])
    assert k1 != k2
    assert k1.endswith(',rv9')
    assert k2.endswith(',rv9')


def test_build_route_cache_key_changes_with_route_prefs():
    base = dict(
        start_lat=51.5,
        start_lon=-0.1,
        end_lat=51.6,
        end_lon=-0.2,
        routing_mode='auto',
        vehicle_type='petrol_diesel',
    )
    k1 = build_route_cache_key(**base, prefer_scenic=False, route_optimization='fastest')
    k2 = build_route_cache_key(**base, prefer_scenic=True, route_optimization='scenic')
    assert k1 != k2


def test_should_bypass_route_cache_for_reroute_and_avoid_points():
    assert should_bypass_route_cache(force_refresh=False, is_reroute=True, avoid_points=[]) is True
    assert should_bypass_route_cache(force_refresh=True, is_reroute=False, avoid_points=[]) is True
    assert should_bypass_route_cache(
        force_refresh=False,
        is_reroute=False,
        avoid_points=[{'lat': 1.0, 'lon': 2.0}],
    ) is True
    assert should_bypass_route_cache(force_refresh=False, is_reroute=False, avoid_points=[]) is False


def test_build_route_cache_key_changes_with_via_points():
    """Cache key must differ when via_points change to prevent wrong multi-leg routes."""
    base = dict(
        start_lat=51.5,
        start_lon=-0.1,
        end_lat=51.6,
        end_lon=-0.2,
        routing_mode='auto',
        vehicle_type='petrol_diesel',
    )
    k1 = build_route_cache_key(**base, via_points=[])
    k2 = build_route_cache_key(**base, via_points=[{'lat': 51.55, 'lon': -0.15}])
    assert k1 != k2


def test_build_route_cache_key_changes_with_stops():
    """Cache key must differ when stops change to prevent wrong multi-drop routes."""
    base = dict(
        start_lat=51.5,
        start_lon=-0.1,
        end_lat=51.6,
        end_lon=-0.2,
        routing_mode='auto',
        vehicle_type='petrol_diesel',
    )
    k1 = build_route_cache_key(**base, stops=[])
    k2 = build_route_cache_key(**base, stops=[{'lat': 51.55, 'lon': -0.15}])
    assert k1 != k2


def test_build_route_cache_key_changes_with_departure_time():
    """Cache key must differ when departure_time changes to prevent wrong time-dependent routes."""
    base = dict(
        start_lat=51.5,
        start_lon=-0.1,
        end_lat=51.6,
        end_lon=-0.2,
        routing_mode='auto',
        vehicle_type='petrol_diesel',
    )
    k1 = build_route_cache_key(**base, departure_time=None)
    k2 = build_route_cache_key(**base, departure_time='2026-07-16T09:00:00')
    assert k1 != k2

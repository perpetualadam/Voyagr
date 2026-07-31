"""Tests for preference-aware persistent route DB cache."""

import json
import sqlite3
from unittest.mock import patch

from voyagr.services.costs import CostCalculator, invalidate_route_cache
from voyagr.services.routing.route_cache_key import build_route_cache_key


def _make_db():
    conn = sqlite3.connect(':memory:')
    cursor = conn.cursor()
    cursor.execute('''
        CREATE TABLE persistent_route_cache (
            id INTEGER PRIMARY KEY,
            start_lat REAL, start_lon REAL,
            end_lat REAL, end_lon REAL,
            routing_mode TEXT, vehicle_type TEXT,
            route_data TEXT,
            distance_km REAL, duration_minutes REAL,
            fuel_cost REAL, toll_cost REAL, caz_cost REAL,
            total_cost REAL,
            source TEXT,
            cache_key TEXT,
            access_count INTEGER DEFAULT 1,
            last_accessed DATETIME DEFAULT CURRENT_TIMESTAMP,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    cursor.execute(
        'CREATE UNIQUE INDEX IF NOT EXISTS uq_persistent_route_cache_key '
        'ON persistent_route_cache(cache_key)'
    )
    conn.commit()
    return conn


def _cache_key(**overrides):
    base = dict(
        start_lat=51.5, start_lon=-0.1, end_lat=51.6, end_lon=-0.2,
        routing_mode='auto', vehicle_type='petrol_diesel',
        enable_hazard_avoidance=True, avoid_cameras=True,
    )
    base.update(overrides)
    return build_route_cache_key(**base)


@patch('voyagr.services.costs.db_connection')
def test_db_cache_round_trip_by_cache_key(mock_db_conn):
    conn = _make_db()
    mock_db_conn.return_value.__enter__.return_value = conn
    mock_db_conn.return_value.__exit__.return_value = None

    calc = CostCalculator()
    route_data = {'success': True, 'routes': [{'name': 'Fastest'}], 'distance_km': 12.0, 'duration_minutes': 20}
    key_scenic = _cache_key(prefer_scenic=True, route_optimization='scenic')
    key_fast = _cache_key(prefer_scenic=False, route_optimization='fastest')

    assert calc.cache_route_to_db(
        51.5, -0.1, 51.6, -0.2, 'auto', 'petrol_diesel',
        route_data, 'Valhalla', cache_key=key_scenic,
    )
    assert calc.cache_route_to_db(
        51.5, -0.1, 51.6, -0.2, 'auto', 'petrol_diesel',
        {'success': True, 'routes': [{'name': 'Fast'}], 'distance_km': 10.0, 'duration_minutes': 15},
        'Valhalla', cache_key=key_fast,
    )

    scenic_hit = calc.get_cached_route_from_db(key_scenic)
    fast_hit = calc.get_cached_route_from_db(key_fast)

    assert scenic_hit is not None
    assert fast_hit is not None
    assert scenic_hit['routes'][0]['name'] == 'Fastest'
    assert fast_hit['routes'][0]['name'] == 'Fast'
    assert scenic_hit.get('db_cached') is True


@patch('voyagr.services.costs.db_connection')
def test_db_cache_miss_for_different_preference_key(mock_db_conn):
    conn = _make_db()
    mock_db_conn.return_value.__enter__.return_value = conn
    mock_db_conn.return_value.__exit__.return_value = None

    calc = CostCalculator()
    key_a = _cache_key(avoid_tolls=False)
    key_b = _cache_key(avoid_tolls=True)

    calc.cache_route_to_db(
        51.5, -0.1, 51.6, -0.2, 'auto', 'petrol_diesel',
        {'success': True}, 'Valhalla', cache_key=key_a,
    )

    assert calc.get_cached_route_from_db(key_a) is not None
    assert calc.get_cached_route_from_db(key_b) is None


def _age_rows(conn, hours, *, touch_last_accessed=False):
    """Backdate created_at (and optionally last_accessed) by `hours`."""
    conn.execute(
        "UPDATE persistent_route_cache SET created_at = datetime('now', ?)",
        (f'-{hours} hours',),
    )
    conn.execute(
        'UPDATE persistent_route_cache SET last_accessed = '
        + ('CURRENT_TIMESTAMP' if touch_last_accessed else "datetime('now', ?)"),
        () if touch_last_accessed else (f'-{hours} hours',),
    )
    conn.commit()


@patch('voyagr.services.costs.db_connection')
def test_keyed_lookup_expires_by_write_time_not_last_access(mock_db_conn):
    """A row used every day must still expire, or stale option lists live forever."""
    conn = _make_db()
    mock_db_conn.return_value.__enter__.return_value = conn
    mock_db_conn.return_value.__exit__.return_value = None

    calc = CostCalculator()
    key = _cache_key()
    calc.cache_route_to_db(
        51.5, -0.1, 51.6, -0.2, 'auto', 'petrol_diesel',
        {'success': True, 'routes': [{'name': 'Fastest'}]}, 'Valhalla', cache_key=key,
    )

    _age_rows(conn, 72, touch_last_accessed=True)

    assert calc.get_cached_route_from_db(key) is None


@patch('voyagr.services.costs.db_connection')
def test_legacy_lookup_ignores_preference_keyed_rows(mock_db_conn):
    """The coord-only match must not become a back door around a keyed miss."""
    conn = _make_db()
    mock_db_conn.return_value.__enter__.return_value = conn
    mock_db_conn.return_value.__exit__.return_value = None

    calc = CostCalculator()
    calc.cache_route_to_db(
        51.5, -0.1, 51.6, -0.2, 'auto', 'petrol_diesel',
        {'success': True, 'routes': [{'name': 'Fastest'}]}, 'Valhalla',
        cache_key=_cache_key(avoid_tolls=False),
    )

    assert calc.get_cached_route_from_db(_cache_key(avoid_tolls=True)) is None
    assert calc.get_cached_route_from_db_legacy(
        51.5, -0.1, 51.6, -0.2, 'auto', 'petrol_diesel',
    ) is None


@patch('voyagr.services.costs.db_connection')
def test_legacy_lookup_serves_then_expires_pre_migration_rows(mock_db_conn):
    conn = _make_db()
    mock_db_conn.return_value.__enter__.return_value = conn
    mock_db_conn.return_value.__exit__.return_value = None

    calc = CostCalculator()
    calc.cache_route_to_db(
        51.5, -0.1, 51.6, -0.2, 'auto', 'petrol_diesel',
        {'success': True, 'routes': [{'name': 'Fastest'}]}, 'Valhalla',
    )

    fresh = calc.get_cached_route_from_db_legacy(
        51.5, -0.1, 51.6, -0.2, 'auto', 'petrol_diesel',
    )
    assert fresh is not None
    assert fresh['routes'][0]['name'] == 'Fastest'

    _age_rows(conn, 72)

    assert calc.get_cached_route_from_db_legacy(
        51.5, -0.1, 51.6, -0.2, 'auto', 'petrol_diesel',
    ) is None


@patch('voyagr.services.costs.db_connection')
def test_invalidate_route_cache_drops_actively_used_rows(mock_db_conn):
    """Preference changes must clear the routes the user actually drives."""
    conn = _make_db()
    mock_db_conn.return_value.__enter__.return_value = conn
    mock_db_conn.return_value.__exit__.return_value = None

    calc = CostCalculator()
    key = _cache_key()
    calc.cache_route_to_db(
        51.5, -0.1, 51.6, -0.2, 'auto', 'petrol_diesel',
        {'success': True, 'routes': [{'name': 'Fastest'}]}, 'Valhalla', cache_key=key,
    )
    assert calc.get_cached_route_from_db(key) is not None

    assert invalidate_route_cache() is True

    assert calc.get_cached_route_from_db(key) is None
    assert conn.execute('SELECT COUNT(*) FROM persistent_route_cache').fetchone()[0] == 0

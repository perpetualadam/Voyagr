"""Tests for preference-aware persistent route DB cache."""

import json
import sqlite3
from unittest.mock import patch

from voyagr.services.costs import CostCalculator
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

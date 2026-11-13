"""Retired route-cache APIs must never access SQL or erase historical records."""

import sqlite3
from unittest.mock import patch

from voyagr.services.costs import CostCalculator, invalidate_route_cache


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



def test_retired_route_cache_apis_never_open_database():
    calc = CostCalculator()
    with patch('voyagr.services.costs.db_connection', side_effect=AssertionError('No persistent route access')):
        assert calc.cache_route_to_db(51.5,-.1,51.6,-.2,'auto','car',{'success':True},'Valhalla') is False
        assert calc.cache_alternative_routes(51.5,-.1,51.6,-.2,'auto','car',[]) is False
        assert calc.get_cached_route_from_db('legacy-key') is None
        assert calc.get_cached_route_from_db_legacy(51.5,-.1,51.6,-.2,'auto','car') is None
        prediction = calc.predict_cost(10,'petrol_diesel',6,1.5,20,.3,False,False)
        assert prediction['predicted_cost'] > 0
        assert prediction['predicted_cost'] == prediction['base_cost']


def test_invalidation_does_not_delete_legacy_rows():
    conn = _make_db()
    conn.execute("INSERT INTO persistent_route_cache(cache_key, route_data) VALUES('legacy','{}')")
    conn.commit()
    with patch('voyagr.services.costs.db_connection', side_effect=AssertionError('Historical rows must not be touched')), \
         patch('voyagr.api.routing.clear_route_cache', return_value=True) as clear:
        assert invalidate_route_cache() is True
        clear.assert_called_once_with()
    assert conn.execute('SELECT COUNT(*) FROM persistent_route_cache').fetchone()[0] == 1
    conn.close()

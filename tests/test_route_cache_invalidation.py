"""Hazard changes clear active memory without deleting quarantined legacy rows.

The routing blueprint and compatibility exports must share the active cache.
"""

import unittest
from unittest.mock import patch

import voyagr_web as vw
import voyagr.api.routing as routing_api

from tests.test_persistent_route_cache import _make_db as _make_route_cache_db


class HazardPreferenceRouteCacheInvalidationTest(unittest.TestCase):
    def setUp(self):
        self.client = vw.app.test_client()
        vw.route_cache.clear()
        self.conn = _make_route_cache_db()
        patcher = patch('voyagr.services.costs.db_connection')
        mock_db = patcher.start()
        self.addCleanup(patcher.stop)
        self.addCleanup(vw.route_cache.clear)
        mock_db.return_value.__enter__.return_value = self.conn
        mock_db.return_value.__exit__.return_value = None

    def test_blueprint_holds_the_cache_the_route_endpoint_reads(self):
        self.assertIs(routing_api._route_cache, vw.route_cache)

    def test_penalty_change_clears_the_in_memory_route_cache(self):
        key = 'synthetic-private-key'
        vw.route_cache.set(key, {'success': True, 'routes': [{'name': 'Fastest'}]})
        self.assertIsNotNone(vw.route_cache.get(key))
        self.conn.execute("INSERT INTO persistent_route_cache(start_lat, end_lat) VALUES(53.536,53.517)")
        self.conn.commit()

        response = self.client.post('/api/hazard-preferences', json={
            'hazard_type': 'camera_speed',
            'penalty_seconds': 900,
            'enabled': True,
            'proximity_threshold_meters': 120,
        })

        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.get_json().get('success'))
        self.assertIsNone(vw.route_cache.get(key))
        self.assertEqual(self.conn.execute('SELECT COUNT(*) FROM persistent_route_cache').fetchone()[0], 1)



if __name__ == '__main__':
    unittest.main()

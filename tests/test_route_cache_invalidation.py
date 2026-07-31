"""
The route cache tiers /api/route reads from must be the ones invalidation reaches.

Hazard penalties feed route scoring and ordering but are not part of the in-memory
cache key, so a penalty change has to clear that tier outright or the previous
option list is replayed until the entry ages out.

Both assertions also guard the singleton wiring: the routing blueprint holds the
cache reference used for invalidation, and if a second copy of ``voyagr_web`` ever
registers itself again the reference stops pointing at the cache the endpoint reads.
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
        vw.route_cache.set(
            53.536, -1.380, 53.517, -1.150, 'auto', 'petrol_diesel',
            {'success': True, 'routes': [{'name': 'Fastest'}]},
        )
        self.assertIsNotNone(vw.route_cache.get(
            53.536, -1.380, 53.517, -1.150, 'auto', 'petrol_diesel',
        ))

        response = self.client.post('/api/hazard-preferences', json={
            'hazard_type': 'camera_speed',
            'penalty_seconds': 900,
            'enabled': True,
            'proximity_threshold_meters': 120,
        })

        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.get_json().get('success'))
        self.assertIsNone(vw.route_cache.get(
            53.536, -1.380, 53.517, -1.150, 'auto', 'petrol_diesel',
        ))


if __name__ == '__main__':
    unittest.main()

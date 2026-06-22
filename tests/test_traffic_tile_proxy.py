"""Tests for TomTom traffic tile proxy graceful degradation."""

import unittest
from unittest.mock import MagicMock, patch

from voyagr.api.traffic import tomtom_traffic_tile_proxy


class TestTrafficTileProxy(unittest.TestCase):
    def test_upstream_500_returns_transparent_png_200(self):
        upstream = MagicMock()
        upstream.status_code = 500
        upstream.content = b'error'
        with patch.dict('os.environ', {'TOMTOM_API_KEY': 'test-key'}):
            with patch('voyagr.api.traffic.requests.get', return_value=upstream):
                resp = tomtom_traffic_tile_proxy(17, 65033, 42370)
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.mimetype, 'image/png')
        self.assertTrue(resp.data)
        self.assertIn(b'PNG', resp.data[:8])

    def test_rate_limited_returns_transparent_png_200(self):
        with patch.dict('os.environ', {'TOMTOM_API_KEY': 'test-key'}):
            with patch('voyagr.api.traffic._allow_tomtom_tile_request', return_value=False):
                resp = tomtom_traffic_tile_proxy(17, 1, 1)
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.mimetype, 'image/png')


if __name__ == '__main__':
    unittest.main()

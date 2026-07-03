"""Tests for Redis-backed rate limiting with in-memory fallback."""

from unittest.mock import MagicMock, patch

import pytest

from voyagr.config.rate_limit_storage import rate_limit_storage_uri
from voyagr.utils.rate_limiting import RateLimiter, reset_rate_limit_redis_for_tests


@pytest.fixture(autouse=True)
def _reset_redis():
    reset_rate_limit_redis_for_tests()
    yield
    reset_rate_limit_redis_for_tests()


class TestRateLimitStorageUri:
    def test_memory_default(self, monkeypatch):
        monkeypatch.delenv('RATELIMIT_STORAGE_URI', raising=False)
        assert rate_limit_storage_uri() == 'memory://'

    def test_redis_unreachable_falls_back(self, monkeypatch):
        monkeypatch.setenv('RATELIMIT_STORAGE_URI', 'redis://127.0.0.1:6399/0')
        assert rate_limit_storage_uri() == 'memory://'


class TestRateLimiter:
    def test_memory_allows_under_limit(self, monkeypatch):
        monkeypatch.delenv('RATELIMIT_STORAGE_URI', raising=False)
        lim = RateLimiter(max_requests=3, window_seconds=60, key_prefix='test:mem')
        assert lim.is_allowed('1.2.3.4')
        assert lim.is_allowed('1.2.3.4')
        assert lim.is_allowed('1.2.3.4')
        assert not lim.is_allowed('1.2.3.4')

    def test_redis_shared_counter(self, monkeypatch):
        monkeypatch.setenv('RATELIMIT_STORAGE_URI', 'redis://127.0.0.1:6379/0')
        store = {}

        mock_client = MagicMock()

        def incr(key):
            store[key] = store.get(key, 0) + 1
            return store[key]

        def expire(key, ttl):
            return True

        mock_client.incr.side_effect = incr
        mock_client.expire.side_effect = expire
        mock_client.ping.return_value = True

        with patch('redis.from_url', return_value=mock_client):
            reset_rate_limit_redis_for_tests()
            a = RateLimiter(max_requests=2, window_seconds=60, key_prefix='test:redis')
            b = RateLimiter(max_requests=2, window_seconds=60, key_prefix='test:redis')
            assert a.is_allowed('9.9.9.9')
            assert b.is_allowed('9.9.9.9')
            assert not a.is_allowed('9.9.9.9')

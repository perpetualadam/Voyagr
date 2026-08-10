"""DoS hardening for the PWA shell page (GET /) and request body limits."""

from unittest.mock import patch

import pytest

from voyagr.utils.rate_limiting import RateLimiter, reset_rate_limit_redis_for_tests


@pytest.fixture(autouse=True)
def _reset_redis():
    reset_rate_limit_redis_for_tests()
    yield
    reset_rate_limit_redis_for_tests()


@pytest.fixture
def client():
    from voyagr_web import app

    app.config['TESTING'] = True
    with app.test_client() as c:
        yield c


class TestPageRateLimit:
    def test_index_allows_normal_load(self, client):
        rv = client.get('/')
        assert rv.status_code == 200
        assert b'html' in rv.data.lower()

    def test_index_returns_429_when_page_limit_exceeded(self, client, monkeypatch):
        from voyagr.api import core

        monkeypatch.delenv('RATELIMIT_STORAGE_URI', raising=False)
        monkeypatch.setattr(core.page_limiter, 'max_requests', 2)
        monkeypatch.setattr(core.page_limiter, 'window_seconds', 60)
        core.page_limiter.requests.clear()

        assert client.get('/').status_code == 200
        assert client.get('/').status_code == 200
        rv = client.get('/')
        assert rv.status_code == 429
        assert rv.headers.get('Retry-After')
        assert 'no-store' in (rv.headers.get('Cache-Control') or '').lower()
        assert b'Too Many Requests' in rv.data

    def test_rate_limit_page_decorator_unit(self, monkeypatch):
        from voyagr.utils.rate_limiting import rate_limit_page

        monkeypatch.delenv('RATELIMIT_STORAGE_URI', raising=False)
        lim = RateLimiter(max_requests=1, window_seconds=60, key_prefix='test:page')

        @rate_limit_page(lim)
        def hello():
            return 'ok', 200

        with patch('voyagr.utils.rate_limiting.get_client_ip', return_value='203.0.113.9'):
            from flask import Flask

            app = Flask(__name__)
            with app.test_request_context('/'):
                assert hello() == ('ok', 200)
                blocked = hello()
                assert blocked.status_code == 429


class TestMaxContentLength:
    def test_max_content_length_configured(self):
        from voyagr_web import app

        assert app.config.get('MAX_CONTENT_LENGTH')
        assert app.config['MAX_CONTENT_LENGTH'] >= 64 * 1024

    def test_oversized_body_rejected(self, client):
        from voyagr_web import app

        # Keep test fast: temporarily lower the cap.
        previous = app.config.get('MAX_CONTENT_LENGTH')
        app.config['MAX_CONTENT_LENGTH'] = 1024
        try:
            rv = client.post(
                '/api/config',
                data=b'x' * 2048,
                content_type='application/json',
                headers={'Content-Length': '2048'},
            )
            assert rv.status_code == 413
            body = rv.get_json(silent=True) or {}
            assert body.get('success') is False
        finally:
            app.config['MAX_CONTENT_LENGTH'] = previous

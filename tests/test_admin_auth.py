"""Tests for fail-closed VOYAGR_ADMIN_SECRET route gating."""

import json
from unittest.mock import patch

import pytest


@pytest.fixture
def client(monkeypatch):
    monkeypatch.delenv("VOYAGR_ADMIN_SECRET", raising=False)
    from voyagr_web import app
    app.config['TESTING'] = True
    with app.test_client() as c:
        yield c


class TestAdminAuthMissingSecret:
    def test_monitoring_disabled_without_secret(self, client):
        rv = client.get('/api/monitoring/engine-status')
        assert rv.status_code == 503

    def test_cache_stats_disabled_without_secret(self, client):
        rv = client.get('/api/cache-stats')
        assert rv.status_code == 503

    def test_app_settings_post_open_without_secret(self, client):
        rv = client.post('/api/app-settings', json={'map_theme': 'dark'})
        assert rv.status_code in (200, 500)

    def test_hazard_preferences_post_open_without_secret(self, client):
        rv = client.post('/api/hazard-preferences', json={
            'hazard_type': 'camera_speed',
            'enabled': True,
        })
        assert rv.status_code in (200, 400, 500)

    def test_ml_predictions_get_open_without_secret(self, client):
        rv = client.get('/api/ml-predictions')
        assert rv.status_code in (200, 500)


class TestAdminAuthWhenConfigured:
    @patch.dict('os.environ', {'VOYAGR_ADMIN_SECRET': 'test-admin-secret'}, clear=False)
    def test_monitoring_requires_key(self, client):
        rv = client.get('/api/monitoring/engine-status')
        assert rv.status_code == 401
        data = json.loads(rv.data)
        assert data['success'] is False

        rv2 = client.get(
            '/api/monitoring/engine-status',
            headers={'X-Voyagr-Admin-Key': 'test-admin-secret'},
        )
        assert rv2.status_code in (200, 500)

    @patch.dict('os.environ', {'VOYAGR_ADMIN_SECRET': 'test-admin-secret'}, clear=False)
    def test_cache_clear_requires_key(self, client):
        rv = client.post('/api/cache-clear')
        assert rv.status_code == 401

        rv2 = client.post(
            '/api/cache-clear',
            headers={'X-Voyagr-Admin-Key': 'test-admin-secret'},
        )
        assert rv2.status_code in (200, 500)

    @patch.dict('os.environ', {'VOYAGR_ADMIN_SECRET': 'test-admin-secret'}, clear=False)
    def test_route_still_public(self, client):
        rv = client.post('/api/route', json={
            'start': 'invalid',
            'end': 'invalid',
        })
        assert rv.status_code != 401

    @patch.dict('os.environ', {'VOYAGR_ADMIN_SECRET': 'test-admin-secret'}, clear=False)
    def test_ml_predictions_post_gated_get_open(self, client):
        rv_get = client.get('/api/ml-predictions')
        assert rv_get.status_code != 401

        rv_post = client.post('/api/ml-predictions', json={
            'start_lat': 51.5,
            'start_lon': -0.1,
            'end_lat': 51.6,
            'end_lon': -0.2,
        })
        assert rv_post.status_code == 401

        rv_post_ok = client.post(
            '/api/ml-predictions',
            json={
                'start_lat': 51.5,
                'start_lon': -0.1,
                'end_lat': 51.6,
                'end_lon': -0.2,
            },
            headers={'X-Voyagr-Admin-Key': 'test-admin-secret'},
        )
        assert rv_post_ok.status_code in (200, 500)


@pytest.mark.parametrize('secret', ['', '   '])
@pytest.mark.parametrize('path,method', [
    ('/api/cache-clear', 'post'), ('/api/debug-route', 'post'),
    ('/api/test-routing-engines', 'get'), ('/api/monitoring/engine-status', 'get'),
])
def test_privileged_routes_fail_closed(client, monkeypatch, secret, path, method):
    monkeypatch.setenv('VOYAGR_ADMIN_SECRET', secret)
    rv = getattr(client, method)(path, headers={'X-Voyagr-Admin-Key': 'arbitrary'})
    assert rv.status_code == 503
    assert rv.get_json()['success'] is False


def test_wrong_admin_key_denied_without_running_handler(client, monkeypatch):
    monkeypatch.setenv('VOYAGR_ADMIN_SECRET', 'expected')
    with patch('voyagr.api.routing.clear_route_cache') as clear:
        rv = client.post('/api/cache-clear', headers={'X-Voyagr-Admin-Key': 'wrong'})
    assert rv.status_code == 401
    clear.assert_not_called()

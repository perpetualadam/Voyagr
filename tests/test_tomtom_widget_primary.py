"""Real Flask/primary transport wiring; no external provider calls."""
from unittest.mock import Mock, patch
import pytest
from flask import Flask
from voyagr.api import navigation as nav
from speed_limit_detector import SpeedLimitDetector


@pytest.fixture
def client(monkeypatch):
    app = Flask(__name__)
    app.register_blueprint(nav.navigation_bp, url_prefix='/api')
    monkeypatch.setenv('TOMTOM_API_KEY', 'synthetic-key')
    monkeypatch.setattr(nav, 'speed_limit_detector', SpeedLimitDetector())
    monkeypatch.setattr(nav._road_evidence_limiter, 'is_allowed', lambda _: True)
    return app.test_client()


def body(**extra):
    return dict(lat=53.5535683, lon=-1.4823286, accuracy=10,
                vehicle_type='car', heading=0, road_type='residential', **extra)


def test_actual_primary_endpoint_uses_tomtom_without_osm_or_legal_authority(client):
    response = Mock(status_code=200)
    response.json.return_value = {'route': [{'properties': {'speedLimits': {'value': 48, 'unit': 'kmph', 'type': 'Maximum'}}}]}
    with patch('speed_limit_detector.requests.get', return_value=response) as transport, patch('overpass_helper.query_overpass') as osm:
        result = client.post('/api/speed-limit/observation', json=body())
    assert result.status_code == 200
    assert result.headers['Cache-Control'] == 'no-store'
    data = result.get_json()
    assert data['status'] == 'AVAILABLE'
    assert data['observation']['speed_limit_mph'] == 30
    assert data['observation']['applicable'] is False
    assert data['observation']['evidence_state'] == 'MAPPED_OBSERVATION'
    assert data['observation']['source'] == 'TomTom'
    assert 'synthetic-key' not in result.get_data(as_text=True)
    assert transport.call_count == 1
    osm.assert_not_called()


@pytest.mark.parametrize('kind', ['missing_key', 'http_failure', 'timeout', 'missing_limit'])
def test_primary_failure_is_explicit_and_does_not_call_osm(client, monkeypatch, kind):
    import requests
    response = Mock(status_code=403 if kind == 'http_failure' else 200)
    response.json.return_value = {'route': []}
    if kind == 'missing_key':
        monkeypatch.delenv('TOMTOM_API_KEY')
    with patch('speed_limit_detector.requests.get', return_value=response, side_effect=requests.Timeout() if kind == 'timeout' else None) as transport, patch('overpass_helper.query_overpass') as osm:
        result = client.post('/api/speed-limit/observation', json=body()).get_json()
    assert result['status'] == 'UNAVAILABLE'
    assert result['observation'] is None
    osm.assert_not_called()
    if kind == 'missing_key':
        transport.assert_not_called()


@pytest.mark.parametrize('updates,code', [({'vehicle_type': 'truck'}, 'UNSUPPORTED_VEHICLE'), ({'accuracy': 50}, 'GPS_INVALID'), ({'lat': 200}, 'INVALID_REQUEST'), ({'heading': 500}, 'INVALID_REQUEST')])
def test_unusable_request_makes_no_provider_call(client, updates, code):
    payload = body()
    payload.update(updates)
    with patch('speed_limit_detector.requests.get') as transport:
        data = client.post('/api/speed-limit/observation', json=payload).get_json()
    assert data['reasonCode'] == code
    transport.assert_not_called()


def test_primary_keeps_client_edge_plausibility(client):
    with patch.object(nav.speed_limit_detector, '_tomtom_snap_speed_limit_mph', return_value=(70, None)):
        data = client.post('/api/speed-limit/observation', json=body()).get_json()
    assert data['reasonCode'] == 'ROAD_CONTEXT_CONFLICT'
    assert data['observation'] is None


@pytest.mark.parametrize('speed', [
    {'value': True, 'unit': 'kmph'}, {'value': 48, 'unit': 'mph'},
    {'value': '48', 'unit': 'kmph'}, {'value': 48, 'unit': 'unknown'},
    {'value': 48, 'unit': 'kmph', 'type': 'Minimum'},
    {'value': 999, 'unit': 'kmph'},
])
def test_uninterpretable_provider_speed_falls_back_instead_of_becoming_a_number(client, speed):
    response = Mock(status_code=200)
    response.json.return_value = {'route': [{'properties': {'speedLimits': speed}}]}
    with patch('speed_limit_detector.requests.get', return_value=response):
        result = client.post('/api/speed-limit/observation', json=body()).get_json()
    assert result['status'] == 'UNAVAILABLE'
    assert result['observation'] is None

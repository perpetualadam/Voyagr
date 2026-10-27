"""Exercise real route ingress and cache/error paths without external calls."""
import logging
from unittest.mock import patch

import pytest
import voyagr_web as vw


@pytest.fixture
def client():
    return vw.app.test_client()


PAYLOAD = {
    'start': '51.512345,-0.123456', 'end': '51.623456,-0.234567',
    'user_id': 'private-user-sentinel',
    'waypoints': [{'lat': 51.534567, 'lon': -0.345678}, {'lat': 51.545678, 'lon': -0.456789}],
}
SENSITIVE = ['51.512345', '-0.123456', '51.623456', '-0.234567',
             '51.534567', '-0.345678', 'private-user-sentinel']


def assert_private(caplog, capsys):
    captured = capsys.readouterr()
    # Inspect structured record fields too, not just the formatted message.
    output = caplog.text + captured.out + captured.err + repr([r.__dict__ for r in caplog.records])
    for value in SENSITIVE:
        assert value not in output


@pytest.mark.parametrize('tier', ['memory', 'persistent'])
def test_cache_paths_do_not_log_locations(client, caplog, capsys, tier):
    caplog.set_level(logging.DEBUG)
    response = {'success': True, 'routes': [{'name': 'Fastest'}]}
    with patch.object(vw.route_cache, 'get', return_value=response.copy() if tier == 'memory' else None), \
         patch.object(vw.route_cache, 'set'), \
         patch.object(vw.cost_calculator, 'get_cached_route_from_db', return_value=response.copy() if tier == 'persistent' else None), \
         patch.object(vw.cost_calculator, 'get_cached_route_from_db_legacy', return_value=response.copy() if tier == 'legacy' else None):
        rv = client.post('/api/route', json=PAYLOAD)
    assert rv.status_code == 200
    assert rv.get_json()['cached'] is True
    assert_private(caplog, capsys)
    completed = [r for r in caplog.records if getattr(r, 'route_event', '') == 'request_completed']
    assert len(completed) == 1 and completed[0].duration_ms >= 0


def test_exception_message_is_not_logged_or_returned(client, caplog, capsys):
    caplog.set_level(logging.DEBUG)
    with patch.object(vw, 'parse_route_request', side_effect=ValueError(str(PAYLOAD))):
        rv = client.post('/api/route', json=PAYLOAD)
    assert rv.status_code == 500
    assert rv.get_json()['error'] == 'Route calculation failed'
    assert_private(caplog, capsys)


def test_invalid_enum_does_not_enter_logs(client, caplog, capsys):
    caplog.set_level(logging.DEBUG)
    rv = client.post('/api/route', json={**PAYLOAD, 'routing_mode': 'private-user-sentinel'})
    assert rv.status_code == 400
    assert_private(caplog, capsys)


@pytest.mark.parametrize('body', [[], ['private-user-sentinel'], 'private-user-sentinel', None])
def test_non_object_json_is_rejected(client, caplog, capsys, body):
    rv = client.post('/api/route', json=body)
    assert rv.status_code == 400
    assert_private(caplog, capsys)


def test_keyed_cache_miss_never_replays_unverifiable_legacy_constraints(client):
    with patch.object(vw.route_cache, 'get', return_value=None), \
         patch.object(vw.cost_calculator, 'get_cached_route_from_db', return_value=None), \
         patch.object(vw.cost_calculator, 'get_cached_route_from_db_legacy', return_value={'success': True}) as legacy, \
         patch.object(vw, 'prepare_route_hazards', side_effect=RuntimeError('stop before network')) as prepare:
        rv = client.post('/api/route', json={**PAYLOAD, 'avoid_tolls': True})
    legacy.assert_not_called()
    prepare.assert_called_once()
    assert rv.status_code == 500  # deliberate offline boundary, not a cached success


def test_provider_failure_does_not_echo_payload_or_coordinates(client, caplog, capsys):
    from voyagr.services.routing.orchestrator import ValhallaPostOutcome
    caplog.set_level(logging.DEBUG)
    with patch.object(vw, 'prepare_route_hazards', return_value={}), \
         patch.object(vw, 'attempt_graphhopper_camera_route', return_value=(None, 'unavailable')), \
         patch.object(vw, 'post_valhalla_route', return_value=ValhallaPostOutcome(response=None, error=None, timed_out=True)), \
         patch.object(vw.requests, 'get', side_effect=vw.requests.exceptions.ConnectionError(str(PAYLOAD))):
        rv = client.post('/api/route', json={**PAYLOAD, 'force_refresh': True})
    assert rv.get_json()['success'] is False
    for value in SENSITIVE:
        assert value not in rv.get_data(as_text=True)
    assert_private(caplog, capsys)


@pytest.mark.parametrize('start', ['nan,-0.1', '51.5,nan', 'inf,-0.1', '-inf,0'])
def test_non_finite_route_coordinates_fail_before_provider_calls(client, start):
    with patch.object(vw, 'prepare_route_hazards') as prepare:
        rv = client.post('/api/route', json={**PAYLOAD, 'start': start})
    assert rv.status_code == 400
    assert rv.get_json()['success'] is False
    prepare.assert_not_called()

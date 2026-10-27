"""Real response parsing/logging with provider transport mocked, no live routes."""
import json
import logging
from unittest.mock import patch

import pytest
import requests

from voyagr.services.routing.engines import route_with_graphhopper
from voyagr.services.routing.graphhopper_diagnostics import MAX_BODY_BYTES, summarise_graphhopper_error


PRIVATE = '51.512345,-0.123456 Bearer secret-sentinel in_camera_area_12345 user@example.com'


def response(body, status=400):
    result = requests.Response()
    result.status_code = status
    result._content = body if isinstance(body, bytes) else json.dumps(body).encode()
    return result


@pytest.mark.parametrize('body,category,name', [
    ({'message': 'Cannot deserialize custom_model: ' + PRIVATE}, 'request_json_invalid', 'custom_model'),
    ({'message': 'Cannot compile expression road_class == INVALID: ' + PRIVATE}, 'custom_model_error', 'road_class'),
    ({'message': 'Cannot find encoded value max_speed: ' + PRIVATE}, 'encoded_value_error', 'max_speed'),
    ({'message': 'Profile is incompatible with custom models: ' + PRIVATE}, 'profile_error', 'profile'),
    ({'message': 'Unknown parameter ch.disable: ' + PRIVATE}, 'parameter_error', 'ch.disable'),
    ({'message': 'Internal failure: ' + PRIVATE}, 'unclassified_http_error', None),
])
def test_failed_camera_model_logs_only_safe_diagnostics_and_never_retries_unfiltered(caplog, body, category, name):
    caplog.set_level(logging.WARNING, logger='voyagr_web')
    body['hints'] = [{'message': body['message'], 'details': 'java.lang.IllegalArgumentException', 'secret': PRIVATE}]
    with patch('voyagr.services.routing.engines.USE_GRAPHHOPPER_CAMERA_AVOIDANCE', True), \
         patch('voyagr.services.hazards.build_graphhopper_combined_camera_model', return_value={'priority': [{'if': 'in_camera_area_12345', 'multiply_by': '0'}]}), \
         patch('voyagr.services.routing.engines.route_transport.post', return_value=response(body)) as post, \
         patch('voyagr.services.routing.engines.route_transport.get') as get:
        assert route_with_graphhopper(51.512345, -0.123456, 51.623456, -0.234567) is None
    get.assert_not_called()
    assert post.call_count == 1
    records = [r for r in caplog.records if 'validation_error' in r.msg]
    assert len(records) == 1
    diagnostic = json.loads(records[0].args[-1])
    assert category in diagnostic['categories']
    assert 'invalid_argument' in diagnostic['error_types']
    if name:
        assert name in diagnostic['names']
    output = caplog.text + repr([r.__dict__ for r in caplog.records])
    for secret in (PRIVATE, '51.512345', '-0.123456', '51.623456', '-0.234567', 'secret-sentinel', 'in_camera_area_12345', 'user@example.com', 'INVALID'):
        assert secret not in output
    assert len(records[0].getMessage()) < 700


@pytest.mark.parametrize('body,state', [
    (b'{bad json ' + PRIVATE.encode(), 'malformed_json'),
    (b'\xff', 'malformed_json'),
    (b'[]', 'unexpected_json'),
    (b'"' + b'x' * MAX_BODY_BYTES + b'"', 'oversized'),
    (b'[' * 2000, 'malformed_json'),
])
def test_malformed_and_oversized_bodies_have_no_raw_excerpt(body, state):
    result = summarise_graphhopper_error(response(body))
    assert result['body_state'] == state
    assert result['names'] == []
    assert result['categories'] == []
    assert PRIVATE not in repr(result)


def test_hints_messages_types_and_names_are_bounded_and_allowlisted():
    result = summarise_graphhopper_error(response({'message': 'x' * 1024 + ' max_speed', 'hints': [
        {'message': PRIVATE, 'details': PRIVATE},
        None, {'message': {'secret': PRIVATE}}, {'message': 'unknown parameter totally_private_name'},
        {'message': 'encoded value toll'},
    ]}))
    assert result == {'body_state': 'json', 'categories': ['parameter_error'], 'error_types': [], 'names': []}


def test_non_model_compatibility_retries_log_each_failure_once(caplog):
    caplog.set_level(logging.WARNING, logger='voyagr_web')
    with patch('voyagr.services.routing.engines.route_transport.get', side_effect=[response({'message': PRIVATE}, 502), response(b'not json', 500)]) as get, \
         patch('voyagr.services.routing.engines.route_transport.post', return_value=response({'message': PRIVATE}, 503)) as post:
        assert route_with_graphhopper(51.512345, -0.123456, 51.623456, -0.234567, enable_camera_avoidance=False) is None
    assert get.call_count == 2
    assert post.call_count == 1
    records = [r for r in caplog.records if 'validation_error' in r.msg]
    assert [r.args[0] for r in records] == ['get_point', 'get_points', 'post_default']
    assert PRIVATE not in caplog.text + repr([r.__dict__ for r in records])


@pytest.mark.parametrize('body', [b'{bad json ' + PRIVATE.encode(), b'x' * (MAX_BODY_BYTES + 1)])
def test_unparseable_diagnostics_cannot_bypass_hazard_fallback_guard(caplog, body):
    with patch('voyagr.services.routing.engines.USE_GRAPHHOPPER_CAMERA_AVOIDANCE', True), \
         patch('voyagr.services.hazards.build_graphhopper_combined_camera_model', return_value={'priority': [{'if': 'in_camera_area_12345', 'multiply_by': '0'}]}), \
         patch('voyagr.services.routing.engines.route_transport.post', return_value=response(body)) as post, \
         patch('voyagr.services.routing.engines.route_transport.get') as get:
        assert route_with_graphhopper(51.512345, -0.123456, 51.623456, -0.234567) is None
    get.assert_not_called()
    assert post.call_count == 1
    assert PRIVATE not in caplog.text + repr([r.__dict__ for r in caplog.records])

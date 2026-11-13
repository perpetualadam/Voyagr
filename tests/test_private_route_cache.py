"""Local Flask + real private cache; provider/production services are never called."""
import json
import threading
from unittest.mock import patch

import pytest
from flask import Flask, jsonify, request, g

from voyagr.services.routing.private_route_cache import (
    COOKIE, RouteCache, _new_scope, _valid_scope, private_route_session, request_cache_key,
)


@pytest.fixture
def cache():
    obj = RouteCache(start_sweeper=False)
    yield obj
    obj.clear()


def test_absolute_expiry_and_mutation_isolation():
    now = [0]
    cache = RouteCache(clock=lambda: now[0], start_sweeper=False, ttl_seconds=9000)
    original = {'routes': [{'geometry': 'private shape'}]}
    cache.set('key', original)
    original['routes'][0]['geometry'] = 'changed input'
    assert cache.get('key')['routes'][0]['geometry'] == 'private shape'
    hit = cache.get('key')
    hit['routes'][0]['geometry'] = 'changed response'
    now[0] = 839
    cache.set('key', {'new': 'must not refresh'})
    assert cache.get('key')['routes'][0]['geometry'] == 'private shape'
    now[0] = 840
    assert cache.get('key') is None
    assert cache.cache == {} and cache.bytes == 0


def test_sweep_physically_removes_untouched_entries_without_read():
    now = [0]
    swept = threading.Event()
    cache = RouteCache(clock=lambda: now[0], sweep_seconds=.01)
    original = cache._sweep
    def sweep():
        original()
        with cache.lock:
            if not cache.cache:
                swept.set()
    cache._sweep = sweep
    try:
        cache.set('unread', {'geometry': 'sensitive'})
        now[0] = 900
        assert swept.wait(1)
        with cache.lock:
            assert not cache.cache and cache.bytes == 0
    finally:
        cache.clear()


def test_count_byte_limits_and_oversized_entry_bypass():
    cache = RouteCache(max_size=2, max_bytes=50, start_sweeper=False)
    cache.set('a', {'x': 'a'*10})
    cache.set('b', {'x': 'b'*10})
    cache.set('c', {'x': 'c'*10})
    assert cache.get('a') is None
    assert cache.bytes <= 50 and len(cache.cache) <= 2
    assert cache.get(53, -1, 54, -2, 'auto', 'car') is None
    assert cache.set(53, -1, 54, -2, 'auto', 'car', {'success':True}) is False
    cache.set('huge', {'x': 'a'*100})
    assert cache.get('huge') is None
    cache.clear()
    assert cache.bytes == 0


def test_keys_hide_locations_and_distinguish_exact_route_inputs():
    app = Flask(__name__)
    data = {'start':'53.51234567,-1.12345678','end':'53.61234567,-1.22345678'}
    with app.test_request_context('/'):
        g.private_route_scope = _new_scope()
        key = request_cache_key(data, 'fuel-a')
        assert len(key) == 64
        assert '53.5123' not in key and '-1.1234' not in key
        assert request_cache_key(dict(data, user_id='not-a-cache-owner'), 'fuel-a') == key
        variants = [dict(data, start='53.51234568,-1.12345678'),
                    dict(data, via_points=[{'lat':53.55,'lon':-1.15}]),
                    dict(data, stops=[{'lat':53.56,'lon':-1.16,'stop_time':15}]),
                    dict(data, departure_time='2026-11-14T09:00:00'),
                    dict(data, time_windows=[{'start':'09:00','end':'10:00'}]),
                    dict(data, avoid_tolls=True), dict(data, optimize_stop_order=True),
                    dict(data, round_trip=True), dict(data, origin_fix={'accuracy':5,'timestamp':123})]
        assert all(request_cache_key(v, 'fuel-a') != key for v in variants)
        assert request_cache_key(data, 'fuel-b') != key
        assert request_cache_key(data, bypass=True) is None
        g.private_route_scope = _new_scope()
        assert request_cache_key(data, 'fuel-a') != key
        g.private_route_scope = 'caller-chosen-scope'
        assert request_cache_key(data) is None


def test_capability_expiry_signature_and_worker_restart_fail_closed():
    with patch('voyagr.services.routing.private_route_cache.time.time', return_value=1000):
        token = _new_scope()
        assert _valid_scope(token)
        assert not _valid_scope(token[:-1] + ('a' if token[-1] != 'a' else 'b'))
    with patch('voyagr.services.routing.private_route_cache.time.time', return_value=1900):
        assert not _valid_scope(token)
    with patch('voyagr.services.routing.private_route_cache.time.time', return_value=1001), \
         patch('voyagr.services.routing.private_route_cache._SECRET', b'new-worker-secret'):
        assert not _valid_scope(token)


def test_real_flask_scopes_are_browser_private_and_cookie_is_not_refreshed(cache):
    app = Flask(__name__)
    count = []
    @app.post('/api/route')
    @private_route_session
    def calculate():
        data = request.get_json()
        key = request_cache_key(data, bypass=bool(data.get('is_reroute') or data.get('force_refresh')))
        hit = cache.get(key)
        if hit is not None:
            return jsonify(hit)
        count.append(1)
        result = {'success':True, 'private_marker':len(count)}
        cache.set(key, result)
        return jsonify(result)
    a, b = app.test_client(), app.test_client()
    first = a.post('/api/route', json={'start':'53,-1'}, base_url='https://localhost')
    cookie = first.headers['Set-Cookie']
    assert all(v in cookie for v in ['Secure','HttpOnly','SameSite=Strict','Max-Age=900','Path=/'])
    assert COOKIE in cookie
    hit = a.post('/api/route', json={'start':'53,-1'}, base_url='https://localhost')
    assert hit.json == first.json and 'Set-Cookie' not in hit.headers
    assert hit.headers['Cache-Control'] == 'private, no-store'
    other = b.post('/api/route', json={'start':'53,-1'}, base_url='https://localhost')
    assert other.json['private_marker'] != first.json['private_marker']
    a.post('/api/route', json={'start':'53,-1','is_reroute':True}, base_url='https://localhost')
    a.post('/api/route', json={'start':'53,-1','force_refresh':True}, base_url='https://localhost')
    assert len(cache.cache) == 2  # reroute/refresh bodies are not retained
    assert len(count) == 4
    b.set_cookie(COOKIE, 'caller-chosen-scope')
    invalid = b.post('/api/route', json={'start':'53,-1'}, base_url='https://localhost')
    assert invalid.json['success'] is True and invalid.json['private_marker'] == 5
    assert 'Set-Cookie' in invalid.headers
    no_cookies = app.test_client(use_cookies=False)
    for marker in (6, 7):
        response = no_cookies.post('/api/route', json={'start':'53,-1'}, base_url='https://localhost')
        assert response.json['success'] is True and response.json['private_marker'] == marker


def test_active_route_endpoint_never_reads_disk_or_reuses_another_browser(caplog, capsys):
    import voyagr_web as web
    from voyagr.services.route_fuel_pricing import resolve_fuel_pricing
    body = {'start':'53.51234567,-1.12345678','end':'53.61234567,-1.22345678','avoid_caz':False}
    token = _new_scope()
    assert web.validate_route_request(body)[0]
    resolved, _, fingerprint = resolve_fuel_pricing(body)
    web.route_cache.clear()
    with web.app.test_request_context('/api/route'):
        g.private_route_scope = token
        key = request_cache_key(resolved, fingerprint)
    web.route_cache.set(key, {'success':True,'private_marker':'browser-a-only','routes':[]})
    a,b = web.app.test_client(), web.app.test_client()
    a.set_cookie(COOKIE, token)
    try:
        with patch.object(web.cost_calculator,'get_cached_route_from_db', side_effect=AssertionError('disk read')) as disk_read, \
             patch.object(web.cost_calculator,'cache_route_to_db', side_effect=AssertionError('disk write')) as disk_write, \
             patch.object(web,'prepare_route_hazards', side_effect=RuntimeError('offline provider boundary')) as prepare:
            own = a.post('/api/route', json=body, base_url='https://localhost')
            assert own.json['private_marker'] == 'browser-a-only'
            assert not {'cached','cache_stats','db_cached'} & own.json.keys()
            prepare.assert_not_called()
            other = b.post('/api/route', json=body, base_url='https://localhost')
            assert other.status_code == 500 and 'private_marker' not in other.json
            prepare.assert_called_once()
            disk_read.assert_not_called()
            disk_write.assert_not_called()
        captured = capsys.readouterr()
        output = captured.out + captured.err + caplog.text
        for value in ['53.51234567','-1.12345678',token,key]:
            assert value not in output
    finally:
        web.route_cache.clear()


def test_invalidation_changes_namespace_even_for_late_inflight_writes():
    from voyagr.services.routing.private_route_cache import route_cache
    app = Flask(__name__)
    with app.test_request_context('/'):
        g.private_route_scope = _new_scope()
        old_key = request_cache_key({'start':'53,-1'})
        route_cache.clear()
        new_key = request_cache_key({'start':'53,-1'})
        assert old_key != new_key
        route_cache.set(old_key, {'success':True, 'outdated_scoring':True})
        assert route_cache.get(new_key) is None
        route_cache.clear()

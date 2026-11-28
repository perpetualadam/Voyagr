"""Actual production cache code in an isolated module/instance; synthetic payloads."""
from types import SimpleNamespace
from flask import Flask, jsonify
from prototypes.graphhopper11.private_complete_cache import PrivateCompleteCache


def fixture_cache():
    clock=[0.0]
    boundary=PrivateCompleteCache(clock=lambda:clock[0],start_sweeper=False)
    app=Flask(__name__);keys=[]
    @app.post('/api/prototype/app-route')
    @boundary.protect
    def route():
        key=boundary.key({'request':'synthetic','cost':20})
        keys.append(key)
        if key and boundary.store.get(key) is None:
            boundary.store.set(key,{'raw':'fixture'})
        return jsonify(success=True,navigation_allowed=False)
    return app,boundary,clock,keys


def test_https_private_capabilities_isolate_browsers_and_do_not_slide_lifetime():
    app,boundary,clock,keys=fixture_cache();a=app.test_client();b=app.test_client()
    first=a.post('/api/prototype/app-route',base_url='https://localhost')
    cookie=first.headers['Set-Cookie']
    assert '__Host-voyagr-gh11-scope=' in cookie
    assert 'Secure' in cookie and 'HttpOnly' in cookie and 'SameSite=Strict' in cookie and 'Path=/' in cookie
    assert 'Domain=' not in cookie
    original=next(iter(boundary.store.cache.values()))[0]
    clock[0]=10
    again=a.post('/api/prototype/app-route',base_url='https://localhost')
    assert keys[-1] == keys[-2] and 'Set-Cookie' not in again.headers
    assert next(iter(boundary.store.cache.values()))[0] == original
    b.post('/api/prototype/app-route',base_url='https://localhost')
    assert keys[-1] != keys[-2] and boundary.store.get_stats()['size'] == 2
    boundary.store.clear()


def test_http_and_missing_request_ownership_bypass_without_insecure_cookie():
    app,boundary,_clock,keys=fixture_cache()
    response=app.test_client().post('/api/prototype/app-route')
    assert response.status_code == 200 and keys == [None]
    assert 'Set-Cookie' not in response.headers and not boundary.store.cache
    assert boundary.key({'request':'outside context'}) is None


def test_expiry_epoch_and_invalid_capability_cannot_reuse_old_entries():
    app,boundary,clock,keys=fixture_cache();client=app.test_client()
    client.post('/api/prototype/app-route',base_url='https://localhost');old=keys[-1]
    clock[0]=31
    assert boundary.store.get(old) is None
    client.post('/api/prototype/app-route',base_url='https://localhost')
    boundary.store.clear()
    client.post('/api/prototype/app-route',base_url='https://localhost')
    assert keys[-1] != old
    previous=keys[-1]
    client.set_cookie(boundary.module.COOKIE,'invalid',domain='localhost')
    response=client.post('/api/prototype/app-route',base_url='https://localhost')
    assert keys[-1] != previous and 'Set-Cookie' in response.headers
    boundary.store.clear()


def test_expired_scope_rotates_without_using_account_identity():
    app,boundary,_clock,keys=fixture_cache();wall=[1000]
    boundary.module.time=SimpleNamespace(time=lambda:wall[0])
    client=app.test_client();client.post('/api/prototype/app-route',base_url='https://localhost');old=keys[-1]
    wall[0]+=901
    response=client.post('/api/prototype/app-route',base_url='https://localhost')
    assert keys[-1] != old and 'Set-Cookie' in response.headers
    other=PrivateCompleteCache(start_sweeper=False)
    token=client.get_cookie(boundary.module.COOKIE).value
    assert not other.module._valid_scope(token)  # Per-app signing secret, no shared singleton.
    boundary.store.clear();other.store.clear()


def test_http_forwarded_header_does_not_enable_cache_and_entry_count_is_bounded():
    app,boundary,_clock,keys=fixture_cache()
    response=app.test_client().post('/api/prototype/app-route',headers={'X-Forwarded-Proto':'https'})
    assert keys[-1] is None and 'Set-Cookie' not in response.headers
    clients=[app.test_client() for _ in range(10)]
    for client in clients:
        assert client.post('/api/prototype/app-route',base_url='https://localhost').status_code==200
    assert boundary.store.get_stats()['size']==8
    assert boundary.store.max_bytes==2*1024*1024
    boundary.store.clear()

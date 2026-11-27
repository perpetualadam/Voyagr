"""Disposable full UK page -> registered GH11 bridge, used only by pytest.

Never run against an operator checkout: the caller supplies a clean source copy
and a synthetic graph. No production route, authentication or configuration is
changed. Every nonessential API and outbound Python HTTP request is refused.
"""
import json
import os
from pathlib import Path
import socket
import sys


def main():
    source, manifest_file, ready_file = map(Path, sys.argv[1:])
    if not source.resolve().is_relative_to(Path(os.environ['GH11_UK_TEST_ROOT']).resolve()):
        raise RuntimeError('Disposable source copy required')
    os.chdir(source)
    sys.path.insert(0, str(source))
    import requests

    def offline(*_args, **_kwargs):
        raise RuntimeError('Outbound HTTP disabled in UK Calculate fixture')

    requests.sessions.Session.send = offline
    socket.socket.connect = offline  # No outbound sockets from this server process.
    from flask import jsonify, request
    from werkzeug.serving import make_server, WSGIRequestHandler
    from voyagr_web import app
    from prototypes.graphhopper11.isolated_app import Refused, create_app

    isolated = create_app(json.loads(manifest_file.read_text()), password='f' * 64)
    bridge = isolated.extensions['gh11_app_request_bridge']
    private_cache = isolated.extensions['gh11_private_cache']
    identities = {key: bridge.bridge.manifest[key]
                  for key in ('graph_version','source_version','policy_version')}
    calls = {'engine': 0, 'validate': 0, 'route': 0, 'refused': 0, 'engine_outages':0, 'accepted': []}
    execute = bridge.bridge._execute

    def counted(*args, **kwargs):
        if request.headers.get('X-GH11-UK-Fault') == 'engine_outage':
            calls['engine_outages'] += 1
            raise Refused('transport_timeout')
        calls['engine'] += 1
        report = execute(*args, **kwargs)
        if request.headers.get('X-GH11-UK-Fault') == 'legacy_version':
            report['engine_version'] = '8.0'
        # Test-only negative control: actual Java output reaches the independent
        # validator with a broken third candidate. No fabricated success result.
        if request.headers.get('X-GH11-UK-Fault') == 'third_metrics' and request.headers.get('X-GH11-UK-Case') == 'matrix_3':
            report['cases'][0]['candidates'][2]['distance_km'] = -1
        if request.headers.get('X-GH11-UK-Fault') == 'last_leg' and (request.headers.get('X-GH11-UK-Case') in ('matrix_via','matrix_mixed') or request.headers.get('X-GH11-UK-Case','').startswith('whole_')):
            indices = report['cases'][0]['candidates'][-1]['waypoint_indices']
            indices[-2] = indices[-1]
        return report

    bridge.bridge._execute = counted
    validate = bridge.bridge.validate

    def counted_validation(*args, **kwargs):
        calls['validate'] += 1
        return validate(*args, **kwargs)

    bridge.bridge.validate = counted_validation

    # Explicit fixture-only use of the actual capability/session implementation.
    # The prototype factory still exposes it only on its own app-route paths.
    @private_cache.module.private_route_session
    def calculate_route():
        if request.headers.get('X-GH11-UK-Test') != 'synthetic-only':
            return jsonify(success=False), 403
        calls['route'] += 1
        try:
            case_id = request.headers.get('X-GH11-UK-Case','detour')
            requested_versions = dict(identities)
            stale_version = request.headers.get('X-GH11-UK-Version')
            if stale_version in requested_versions:
                requested_versions[stale_version] = '0' * 64
            if request.headers.get('X-GH11-UK-Fault') == 'cached_metrics':
                # Mutate only synthetic in-memory raw evidence, retaining TTL.
                # The real independent checker must refuse it without Java fallback.
                store = private_cache.store
                with store.lock:
                    for key,(expires,raw) in list(store.cache.items()):
                        report = json.loads(raw)
                        report['cases'][0]['candidates'][0]['distance_km'] = -1
                        changed = json.dumps(report,separators=(',', ':')).encode()
                        store.cache[key] = (expires,changed)
                        store.bytes += len(changed)-len(raw)
            result = bridge.calculate(case_id, request.get_json(), requested_versions)
            if case_id.startswith('matrix_'):
                calls['accepted'].append(dict(case_id=case_id,
                    app_request=result['app_request_context']['app_request'],
                    settings=result['policy_report']['selected']['app_settings'],
                    binding=result['request_binding'],versions=identities,
                    cache_policy=result['cache_policy'],
                    candidates=len(result['candidates']),
                    legs=[len(row['leg_geometry_ranges']) for row in result['app_preview']['routes']],
                    forbidden=[row['forbidden_traversals'] for row in result['candidates']]))
            return jsonify(result['app_preview'])
        except Refused as error:
            calls['refused'] += 1
            return jsonify(success=False, error='Isolated registered request refused',
                           navigation_allowed=False), (504 if str(error)=='transport_timeout' else 422)

    def dispatch():
        if request.path == '/__lab__/evidence':
            return jsonify(dict(calls,cache=private_cache.store.get_stats()))
        if request.path == '/api/route':
            # Explicit test-only connection; ordinary requests never fall through
            # to GH8/Valhalla/OSRM and no credential is put in generated HTML.
            return calculate_route()
        if request.path.startswith('/api/') and request.path != '/api/config':
            return jsonify(success=False, error='Unavailable in isolated fixture'), 503

    app.before_request_funcs.setdefault(None, []).insert(0, dispatch)

    class QuietHandler(WSGIRequestHandler):
        def log(self, *_args, **_kwargs):
            pass

    tls = None
    if os.environ.get('GH11_UK_TLS_CERT'):
        tls = (os.environ['GH11_UK_TLS_CERT'],os.environ['GH11_UK_TLS_KEY'])
        if not all(Path(path).resolve().is_relative_to(Path(os.environ['GH11_UK_TEST_ROOT']).resolve()) for path in tls):
            raise RuntimeError('Disposable TLS material required')
    server = make_server('127.0.0.1', 0, app, threaded=True, request_handler=QuietHandler,ssl_context=tls)
    ready_file.write_text(json.dumps({'origin': f'{"https" if tls else "http"}://127.0.0.1:{server.server_port}'}))
    try:
        server.serve_forever()
    finally:
        server.server_close()


if __name__ == '__main__':
    main()

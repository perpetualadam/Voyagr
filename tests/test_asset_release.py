"""Executable release identity, integrity and immutable snapshot retention."""
import base64
import hashlib
import json
from pathlib import Path
import re

from voyagr.asset_release import prepare_html, read_asset


def source(tmp_path):
    project = tmp_path / 'project'
    (project / 'static/js').mkdir(parents=True)
    (project / 'static/css').mkdir()
    (project / 'static/js/first.js').write_text('/* prologue */\n"use strict";\nwindow.first = true;')
    (project / 'static/js/second.js').write_text('window.second = window.first;')
    (project / 'static/css/app.css').write_text('body{color:black}')
    return project, tmp_path / 'releases'


def manifest(html):
    return json.loads(re.search(r'id="voyagr-asset-manifest">(.*?)</script>', html).group(1))


def test_release_identity_sri_and_retained_old_snapshot(tmp_path):
    project, store = source(tmp_path)
    html = '<html><head><link rel="stylesheet" href="/static/css/app.css?v=old"><script defer src="/static/js/first.js?v=old"></script><script defer src="/static/js/second.js"></script></head><body></body></html>'
    rendered, release = prepare_html(html, project, store)
    m = manifest(rendered)
    assert len(m['assets']) == 3
    assert not re.search(r'<script[^>]+src="/static/', rendered)
    assert '?v=' not in rendered
    assert rendered.index('VoyagrAssetRelease=') < rendered.index('defer src=')
    for asset in m['assets']:
        raw = read_asset(store, release, asset['sha256'], asset['name'])
        assert raw is not None
        expected = base64.b64encode(hashlib.sha256(raw).digest()).decode()
        assert f'integrity="sha256-{expected}"' in rendered
    first = m['assets'][1]
    original = read_asset(store, release, first['sha256'], first['name'])
    assert original.startswith(b"'use strict';")
    assert prepare_html(html.replace('?v=old', '?v=new'), project, store)[1] == release
    (project / 'static/js/first.js').write_text('window.first = "new";')
    _, next_release = prepare_html(html, project, store)
    assert release != next_release
    assert read_asset(store, release, first['sha256'], first['name']) == original


def test_wrong_identity_or_corrupted_snapshot_never_returns_bytes(tmp_path):
    project, store = source(tmp_path)
    html, release = prepare_html('<head><script defer src="/static/js/first.js"></script></head>', project, store)
    asset = manifest(html)['assets'][0]
    assert read_asset(store, release, '0' * 64, asset['name']) is None
    assert read_asset(store, '../private', asset['sha256'], asset['name']) is None
    assert read_asset(store, release, asset['sha256'], '../secret.js') is None
    (store / release / asset['name']).write_text('stale or corrupt')
    assert read_asset(store, release, asset['sha256'], asset['name']) is None


def test_all_real_navigation_dependencies_are_content_addressed(tmp_path):
    from flask import Flask, render_template
    from voyagr.index_page_context import build_index_template_kwargs
    root = Path(__file__).resolve().parents[1]
    app = Flask(__name__, template_folder=str(root / 'templates'))
    with app.test_request_context('/'):
        html = render_template('index.html', **build_index_template_kwargs())
    html, release = prepare_html(html, root, tmp_path / 'store')
    assets = manifest(html)['assets']
    required = ['avoidance-integrity.js', 'journey-plan.js', 'journey-modes.js',
                'calculate-route-orchestration.js', 'navigation-lifecycle-orchestration.js',
                'route-selection.js', 'offline-navigation.js', 'voyagr-app.js', 'app.js', 'maplibre-gl.js']
    assert all(any(a['name'][4:] == name for a in assets) for name in required)
    assert all(a['url'].startswith(f'/_voyagr/assets/{release}/') for a in assets)
    assert len({a['url'] for a in assets}) == len(assets)
    dynamic = next(a for a in assets if a['source'] == '/static/js/modules/ar-navigation.js')
    assert dynamic['module'] is True
    assert read_asset(tmp_path / 'store', release, dynamic['sha256'], dynamic['name']).startswith(b'/**')
    assert b'VoyagrAssetRelease.enter' not in read_asset(tmp_path / 'store', release, dynamic['sha256'], dynamic['name'])
    assert not re.search(r'<script[^>]+src="/static/', html)


def test_mutable_nginx_assets_revalidate():
    root = Path(__file__).resolve().parents[1]
    for name in ['nginx-voyagr.conf', 'nginx-vibevoyager.org.conf']:
        config = (root / 'deploy' / name).read_text()
        section = config.split('location /static/ {')[1].split('}', 1)[0]
        assert 'immutable' not in section
        assert 'no-cache, max-age=0, must-revalidate' in section
        assert 'proxy_hide_header Cache-Control' in section


def test_existing_worker_snapshot_does_not_mix_files_changed_after_startup(tmp_path):
    from voyagr.asset_release import freeze_project
    project, store = source(tmp_path)
    (project / 'templates').mkdir()
    raw = '<head><script defer src="/static/js/first.js"></script><script defer src="/static/js/second.js"></script></head>'
    (project / 'templates/index.html').write_text(raw)
    (project / 'static/js/modules').mkdir()
    (project / 'static/js/modules/ar-navigation.js').write_text('export const version=1;')
    pinned = freeze_project(project)
    old_html, old_release = prepare_html(raw, project, store, snapshot=pinned)
    (project / 'static/js/first.js').write_text('window.first="different-deployment";')
    (project / 'templates/index.html').write_text('different template')
    assert prepare_html(pinned['template'], project, store, snapshot=pinned) == (old_html, old_release)
    assert prepare_html(raw, project, store)[1] != old_release


def test_repeated_shell_requests_do_not_rewrite_published_release(tmp_path, monkeypatch):
    project, store = source(tmp_path)
    html = '<head><script defer src="/static/js/first.js"></script></head>'
    rendered = prepare_html(html, project, store)
    def unexpected_write(*args, **kwargs):
        raise AssertionError('Published immutable release must not be rewritten')
    monkeypatch.setattr(Path, 'write_bytes', unexpected_write)
    assert prepare_html(html, project, store) == rendered


def test_asset_endpoint_headers_and_wrong_identity(tmp_path, monkeypatch):
    from flask import Flask
    from voyagr.api.core import core_bp
    project, store = source(tmp_path)
    html, release = prepare_html('<head><script defer src="/static/js/first.js"></script></head>', project, store)
    monkeypatch.setenv('VOYAGR_ASSET_RELEASE_DIR', str(store))
    app = Flask(__name__)
    app.register_blueprint(core_bp)
    with app.test_client() as client:
        asset = manifest(html)['assets'][0]
        response = client.get(asset['url'])
        assert response.status_code == 200
        assert hashlib.sha256(response.data).hexdigest() == asset['sha256']
        assert response.headers['Cache-Control'] == 'public, max-age=31536000, immutable'
        assert client.get(asset['url'].replace(asset['sha256'], '0' * 64)).status_code == 404
        missing = client.get(f'/_voyagr/assets/{release}/{"0" * 64}/000-first.js')
        assert missing.headers['Cache-Control'] == 'no-store'


def test_unrecognized_executable_tag_cannot_silently_bypass_pinning(tmp_path):
    import pytest
    project, store = source(tmp_path)
    html = '<head><script defer src="/static/js/first.js"></script><script src=\'/static/js/second.js\'></script></head>'
    with pytest.raises(ValueError, match='Unpinned'):
        prepare_html(html, project, store)


def test_voice_models_are_retained_content_addressed_sidecars(tmp_path):
    project, store = source(tmp_path)
    directory = project / 'static/vendor/picovoice'
    directory.mkdir(parents=True)
    model = directory / 'custom keyword.ppn'
    model.write_bytes(b'public-model-bytes')
    html, release = prepare_html('<head><script defer src="/static/js/first.js"></script></head>', project, store)
    entry = next(a for a in manifest(html)['assets'] if a['source'].endswith('custom keyword.ppn'))
    assert entry['module'] is False
    assert entry['name'].endswith('custom_keyword.ppn')
    assert read_asset(store, release, entry['sha256'], entry['name']) == b'public-model-bytes'


def test_unwritable_release_store_returns_recoverable_no_store_response(tmp_path, monkeypatch):
    from flask import Flask
    from voyagr.api.core import core_bp
    from unittest.mock import patch
    app = Flask(__name__)
    app.register_blueprint(core_bp)
    with patch('voyagr.asset_release.prepare_html', side_effect=OSError('disk unavailable')):
        response = app.test_client().get('/')
    assert response.status_code == 503
    assert response.headers['Cache-Control'] == 'no-store'
    assert b'saved data has not been cleared' in response.data
    assert b'/static/js/' not in response.data

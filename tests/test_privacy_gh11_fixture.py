"""The explicit full-page test fixture exposes only selected public browser assets."""
import importlib.util
from pathlib import Path
from flask import Flask

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('gh11_lab_fixture', ROOT / 'scripts/privacy-http-lab/gh11_fixture.py')
fixture = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fixture)


def test_fixture_registration_is_explicit_and_html_uses_only_lab_asset_paths():
    assert Flask('unregistered').test_client().get('/__lab__/gh11-preview').status_code == 404
    app = Flask(__name__)
    fixture.register_gh11_fixture(app, ROOT)
    response = app.test_client().get('/__lab__/gh11-preview')
    assert response.status_code == 200 and response.headers['Cache-Control'] == 'no-store'
    assert '/__lab__/gh11-assets/gh11-uk-host-boot.js' in response.text
    assert '/strict-assets/' not in response.text and 'src="/prototype-viewer.js"' not in response.text
    assert Flask('independent').test_client().get('/__lab__/gh11-preview').status_code == 404


def test_fixture_asset_allowlist_refuses_data_manifests_jars_and_traversal():
    app = Flask(__name__)
    fixture.register_gh11_fixture(app, ROOT)
    client = app.test_client()
    response = client.get('/__lab__/gh11-assets/gh11-uk-host-boot.js')
    assert response.status_code == 200 and response.headers['Cache-Control'] == 'no-store'
    assert response.data == (ROOT / 'prototypes/graphhopper11/uk_host_boot.js').read_bytes()
    for name in ('.env', 'manifest.json', 'graphhopper-web-11.1.jar', 'voyagr_web.db', '%2e%2e%2f.env'):
        assert client.get('/__lab__/gh11-assets/' + name).status_code == 404

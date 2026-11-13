"""Real Flask gates and temporary SQLite; no production services or data."""
from contextlib import contextmanager
from datetime import datetime
import sqlite3

import pytest
from flask import Flask

from voyagr.api import costs, settings
from voyagr.services.costs import CostCalculator

PATHS = ['/api/cache-statistics', '/api/alternative-route-cache-info', '/api/ml-predictions']
QUERY = '?start_lat=53.5123&start_lon=-1.1234&end_lat=53.6234&end_lon=-1.2345'


@pytest.fixture
def diagnostic_client(tmp_path, monkeypatch):
    db = sqlite3.connect(tmp_path / 'synthetic.db')
    db.execute('CREATE TABLE persistent_route_cache (start_lat REAL,start_lon REAL,end_lat REAL,end_lon REAL,access_count INTEGER,total_cost REAL,distance_km REAL)')
    db.execute('INSERT INTO persistent_route_cache VALUES (53.5123,-1.1234,53.6234,-1.2345,7,2,10)')
    db.execute('CREATE TABLE ml_route_predictions (start_lat REAL,start_lon REAL,end_lat REAL,end_lon REAL,avg_duration_minutes REAL,avg_distance_km REAL,avg_fuel_cost REAL,frequency INTEGER,day_of_week INTEGER,hour_of_day INTEGER)')
    now = datetime.now()
    db.execute('INSERT INTO ml_route_predictions VALUES (53.5123,-1.1234,53.6234,-1.2345,12,10,2,7,?,?)', (now.weekday(), now.hour))
    db.commit()

    @contextmanager
    def connection():
        yield db

    monkeypatch.setattr('voyagr.services.costs.db_connection', connection)
    monkeypatch.setattr(settings, 'db_connection', connection)
    monkeypatch.setattr(costs, '_cost_calculator', CostCalculator())
    app = Flask(__name__)
    app.register_blueprint(costs.costs_bp, url_prefix='/api')
    app.register_blueprint(settings.settings_bp, url_prefix='/api')
    yield app.test_client()
    db.close()


@pytest.mark.parametrize('path', PATHS)
@pytest.mark.parametrize('secret,headers,status', [
    ('', {}, 503),
    ('test-admin', {}, 401),
    ('test-admin', {'X-Voyagr-Admin-Key': 'wrong'}, 401),
    ('test-admin', {'Authorization': 'Bearer not-an-admin-key'}, 401),
])
def test_location_diagnostics_are_not_public(diagnostic_client, monkeypatch, caplog, path, secret, headers, status):
    monkeypatch.setenv('VOYAGR_ADMIN_SECRET', secret)
    response = diagnostic_client.get(path + QUERY, headers=headers)
    assert response.status_code == status
    assert response.json['success'] is False
    for value in ['53.5123', '-1.1234', '53.6234', '-1.2345']:
        assert value not in response.get_data(as_text=True)
        assert value not in caplog.text
    assert response.headers['Cache-Control'] == 'private, no-store'
    assert 'X-Voyagr-Admin-Key' in response.vary


@pytest.mark.parametrize('path', PATHS)
def test_authorized_operator_can_inspect_synthetic_data_without_cache_storage(diagnostic_client, monkeypatch, path):
    monkeypatch.setenv('VOYAGR_ADMIN_SECRET', 'test-admin')
    response = diagnostic_client.get(path + QUERY, headers={'X-Voyagr-Admin-Key': 'test-admin'})
    assert response.status_code == 200
    assert response.json['success'] is True
    if path.endswith('cache-statistics'):
        assert response.json['statistics']['most_accessed_routes'][0]['start'] == '(53.5123, -1.1234)'
    elif path.endswith('ml-predictions'):
        assert response.json['predictions'][0]['start_address'] == '53.5123,-1.1234'
    else:
        assert response.json['cache_info']['cached_alternatives'] == 1
    assert response.headers['Cache-Control'] == 'private, no-store'


def test_normal_cost_estimation_remains_public(diagnostic_client, monkeypatch):
    monkeypatch.setenv('VOYAGR_ADMIN_SECRET', 'test-admin')
    response = diagnostic_client.post('/api/cost-breakdown', json={'distance_km': 10})
    assert response.status_code == 200
    assert response.json['success'] is True

"""Contextual parking search retrieves around the destination; no live authority."""
from unittest.mock import patch

import pytest
import requests
from flask import Flask

from voyagr.api.search import search_bp
from voyagr.utils import request_budget

DESTINATION = [53.5227681, -1.1335312]


def client():
    app = Flask(__name__)
    app.config['TESTING'] = True
    app.register_blueprint(search_bp, url_prefix='/api')
    return app.test_client()


def parking(identity, lat=53.5198586, lon=-1.1346897, name='Civic Quarter Car Park', kind='node', **tags):
    value = {'type': kind, 'id': identity, 'tags': {'amenity': 'parking', 'name': name, **tags}}
    value.update({'lat': lat, 'lon': lon} if kind == 'node' else {'center': {'lat': lat, 'lon': lon}})
    return value


def test_category_query_is_centred_on_destination_and_ranked_before_response_limit():
    far = parking(1, 53.5026045, -1.0434077, 'Old car park')
    # More than the old eight-result pool: closest candidate arrives last.
    elements = [far] + [parking(i+2, 53.51-i*.00001, -1.13, 'Parking '+str(i)) for i in range(12)]
    elements.append(parking(99, access='private', opening_hours='Mo-Fr 08:00-18:00'))
    with patch('overpass_helper.query_overpass', return_value={'success': True, 'elements': elements}) as provider:
        response = client().post('/api/arrival-parking-search', json={'lat': DESTINATION[0], 'lon': DESTINATION[1]})
    assert response.status_code == 200
    payload = response.get_json()
    assert payload['results'][0]['name'] == 'Civic Quarter Car Park'
    assert len(payload['results']) == 10
    assert all(item['name'] != 'Old car park' for item in payload['results'])
    assert payload['results'][0]['access'] == 'private'
    assert not payload['results'][0]['access_verified']
    assert payload['results'][0]['_source'] == 'overpass'
    assert payload['search_context'] == {'version': 1, 'coordinates': DESTINATION, 'radius_m': 2000,
                                         'coverage': 'CANDIDATES_ONLY', 'source': 'overpass'}
    query = provider.call_args.args[0]
    assert 'nwr["amenity"="parking"]' in query
    assert '(around:2000,53.5227681,-1.1335312)' in query
    assert '[timeout:7]' in query and 'out center tags 200' in query
    assert response.headers['Cache-Control'] == 'no-store'


@pytest.mark.parametrize('body', [None, [], {}, {'lat': True, 'lon': -1}, {'lat': '53', 'lon': -1},
    {'lat': 91, 'lon': 0}, {'lat': 0, 'lon': 181}, {'lat': 10**400, 'lon': 0}])
def test_missing_or_invalid_destination_does_not_contact_provider(body):
    with patch('overpass_helper.query_overpass') as provider:
        response = client().post('/api/arrival-parking-search', json=body)
    assert response.status_code == 400
    provider.assert_not_called()


@pytest.mark.parametrize('upstream', [{'success': False, 'elements': []}, {'success': True, 'elements': {}}, None])
def test_provider_failure_is_not_presented_as_valid_empty_results(upstream):
    with patch('overpass_helper.query_overpass', return_value=upstream):
        response = client().post('/api/arrival-parking-search', json={'lat': 53, 'lon': -1})
    assert response.status_code == 503
    assert not response.get_json()['success']
    assert 'results' not in response.get_json()


@pytest.mark.parametrize('error', [requests.Timeout(), request_budget.RoutingDeadlineExceeded()])
def test_provider_deadline_is_a_retryable_search_failure(error):
    with patch('overpass_helper.query_overpass', side_effect=error):
        response = client().post('/api/arrival-parking-search', json={'lat': 53, 'lon': -1})
    assert response.status_code == 503


def test_valid_empty_search_and_zero_coordinate_are_supported():
    with patch('overpass_helper.query_overpass', return_value={'success': True, 'elements': []}):
        response = client().post('/api/arrival-parking-search', json={'lat': 0, 'lon': 0})
    assert response.status_code == 200 and response.get_json()['results'] == []


def test_malformed_and_duplicate_features_cannot_become_arrival_candidates():
    elements = [None, parking(1), parking(1), parking(2, kind='way'), parking(3, kind='relation'),
                parking(4, lat=True), parking(5, lat='not a latitude'), parking(6, lat=91),
                {'type': 'way', 'id': 7, 'tags': {'amenity': 'parking'}}, parking(8, amenity='school')]
    with patch('overpass_helper.query_overpass', return_value={'success': True, 'elements': elements}):
        payload = client().post('/api/arrival-parking-search', json={'lat': DESTINATION[0], 'lon': DESTINATION[1]}).get_json()
    assert {item['osm_id'] for item in payload['results']} == {1, 2, 3}
    assert all(not item['access_verified'] for item in payload['results'])


def test_expired_parent_budget_cannot_be_reset_by_parking_search():
    with request_budget.use_budget(request_budget.WorkBudget(0)), patch('overpass_helper.query_overpass') as provider:
        response = client().post('/api/arrival-parking-search', json={'lat': 53, 'lon': -1})
    assert response.status_code == 503
    provider.assert_not_called()


def test_overpass_provenance_is_retained_as_metadata_without_access_authority():
    from voyagr.services.routing.endpoint_resolution import search_evidence
    evidence = search_evidence({'version': 1, 'coordinates': DESTINATION, 'provider': 'overpass',
                               'semantic_class': 'poi', 'provider_ref': 'way:42', 'access_verified': True}, DESTINATION)
    assert evidence['provider'] == 'overpass'
    assert evidence['authority'] == 'request_metadata_only'
    assert 'access_verified' not in evidence

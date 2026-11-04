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
    elements.append(parking(99, access='yes', opening_hours='Mo-Fr 08:00-18:00'))
    with patch('overpass_helper.query_overpass', return_value={'success': True, 'elements': elements}) as provider:
        response = client().post('/api/arrival-parking-search', json={'lat': DESTINATION[0], 'lon': DESTINATION[1]})
    assert response.status_code == 200
    payload = response.get_json()
    assert payload['results'][0]['name'] == 'Civic Quarter Car Park'
    assert len(payload['results']) == 10
    assert all(item['name'] != 'Old car park' for item in payload['results'])
    assert payload['results'][0]['access'] == 'yes'
    assert not payload['results'][0]['access_verified']
    assert payload['results'][0]['_source'] == 'overpass'
    assert payload['search_context'] == {'version': 1, 'coordinates': DESTINATION, 'radius_m': 2000,
                                         'coverage': 'CANDIDATES_ONLY', 'source': 'overpass', 'ranking_policy': 'reported_access_name_distance_v1'}
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


def test_named_reported_access_is_ranked_before_close_private_candidates_and_limit():
    # Reproduce the deployed result dominated by close, unnamed private areas.
    elements = [parking(i, 53.5230+i*.000001, -1.133, name='', access='private') for i in range(15)]
    elements += [parking(90, name='Named unknown parking'),
                 parking(91, name='Customers car park', access='customers'),
                 parking(92, name='Reported public car park', access='yes')]
    with patch('overpass_helper.query_overpass', return_value={'success': True, 'elements': elements}):
        payload = client().post('/api/arrival-parking-search', json={'lat': DESTINATION[0], 'lon': DESTINATION[1]}).get_json()
    rows = payload['results']
    assert [row['osm_id'] for row in rows[:3]] == [92, 91, 90]
    assert len(rows) == 10
    assert rows[0]['access_category'] == 'general'
    assert rows[1]['access_category'] == 'customers'
    assert rows[2]['access_category'] == 'unknown'
    assert rows[3]['access_category'] == 'restricted'
    assert all(row['access_verified'] is False for row in rows)
    assert all(row['name'] == 'Unnamed parking' for row in rows[3:])


def test_specific_vehicle_and_conditional_restrictions_are_not_promoted_as_general_access():
    elements = [parking(1, access='yes', motor_vehicle='no'),
                parking(2, access='private', motorcar='yes'),
                parking(3, access='yes', **{'access:conditional': 'no @ (Mo-Fr)'}),
                parking(4, access='customers', opening_hours='Mo-Fr 08:00-17:00'),
                parking(5, access='yes')]
    with patch('overpass_helper.query_overpass', return_value={'success': True, 'elements': elements}):
        rows = client().post('/api/arrival-parking-search', json={'lat': DESTINATION[0], 'lon': DESTINATION[1]}).get_json()['results']
    assert [row['osm_id'] for row in rows[:2]] == [5, 4]
    by_id = {row['osm_id']: row for row in rows}
    assert by_id[1]['access_basis'] == 'motor_vehicle'
    assert by_id[1]['access_category'] == 'restricted'
    assert by_id[2]['access_category'] == 'unknown' and by_id[2]['has_conflicting_access']
    assert by_id[3]['access_category'] == 'unknown' and by_id[3]['has_conditional_access']
    assert by_id[3]['reported_access']['access:conditional'] == 'no @ (Mo-Fr)'
    assert by_id[4]['opening_hours'] == 'Mo-Fr 08:00-17:00'
    assert all(not row['access_verified'] for row in rows)


def test_unnamed_general_parking_precedes_unknown_and_restricted_named_parking():
    elements = [parking(1, name='Private parking', access='private'), parking(2, name='Unknown parking'),
                parking(3, name='', access='yes'), parking(4, name='Car park', access='customers')]
    with patch('overpass_helper.query_overpass', return_value={'success': True, 'elements': elements}):
        rows = client().post('/api/arrival-parking-search', json={'lat': DESTINATION[0], 'lon': DESTINATION[1]}).get_json()['results']
    assert [row['osm_id'] for row in rows] == [3, 4, 2, 1]
    assert not rows[0]['has_name'] and not rows[1]['has_name']


def test_unnamed_locations_have_source_based_identifiers_without_invented_streets():
    elements = [parking(1, name=''), parking(2, lat=53.5230, name=''),
                parking(3, name='', **{'addr:street': 'Reported Road'}),
                parking(4, name='Chappell Drive')]
    with patch('overpass_helper.query_overpass', return_value={'success': True, 'elements': elements}):
        rows = client().post('/api/arrival-parking-search', json={'lat': DESTINATION[0], 'lon': DESTINATION[1]}).get_json()['results']
    by_id = {row['osm_id']: row for row in rows}
    assert by_id[1]['name'] == 'Unnamed parking'
    assert by_id[1]['location_label'] == 'Unnamed parking — map point 53.519859, -1.134690'
    assert by_id[2]['location_label'] != by_id[1]['location_label']
    assert 'Reported Road' in by_id[3]['location_label']
    assert 'Reported Road' not in by_id[1]['location_label']
    assert by_id[4]['location_label'] == 'Chappell Drive'
    assert all(row['access_verified'] is False for row in rows)


def map_payload(elements):
    return {'success': True, 'response_state': 'VALID_WITH_DATA' if elements else 'VALID_EMPTY',
            'elements': elements, 'retrieved_at': 1793836800, 'cached': True,
            'dataset_timestamp': '2026-11-04T00:00:00Z', 'source_version': 'test-revision'}


def mapped_entrance():
    return {'type': 'node', 'id': 7, 'lat': 53.5237, 'lon': -1.1307,
            'version': 3, 'timestamp': '2026-10-01T00:00:00Z',
            'tags': {'entrance': 'yes', 'barrier': 'gate', 'access': 'private',
                     'motor_vehicle:conditional': 'yes @ (Mo-Fr 08:00-17:00)', 'name': 'not needed'}}


def mapped_way():
    return {'type': 'way', 'id': 8, 'nodes': [7, 9],
            'geometry': [{'lat': 53.5237, 'lon': -1.1307}, {'lat': 53.5238, 'lon': -1.1308}],
            'tags': {'highway': 'service', 'oneway': 'yes', 'layer': '1'}}


def test_arrival_map_observations_preserve_topology_and_restrictions_without_access_claims():
    with patch('overpass_helper.query_overpass', return_value=map_payload([mapped_entrance(), mapped_way()])) as provider:
        response = client().post('/api/arrival-access-evidence', json={'lat': DESTINATION[0], 'lon': DESTINATION[1],
                                                                    'access_verified': True})
    assert response.status_code == 200 and response.headers['Cache-Control'] == 'no-store'
    record = response.get_json()['evidence']
    assert record['target'] == DESTINATION and record['radius_m'] == 150
    assert record['source_version'] == 'test-revision' and record['cached'] is True
    assert record['retrieved_at'] == 1793836800
    assert record['dataset_timestamp'] == '2026-11-04T00:00:00Z'
    assert record['coverage'] == 'PARTIAL' and record['dataset_coverage'] == 'UNVERIFIED'
    assert record['navigation_authority'] == 'NONE' and record['selection'] == 'NONE'
    assert record['target_association'] == 'NOT_ESTABLISHED'
    assert record['vehicle_access'] == 'UNKNOWN' and record['connector'] == 'NOT_EVALUATED'
    entrance, road = record['observations']
    assert entrance['tags']['access'] == 'private'
    assert entrance['tags']['motor_vehicle:conditional'] == 'yes @ (Mo-Fr 08:00-17:00)'
    assert 'name' not in entrance['tags'] and entrance['osm_version'] == 3
    assert entrance['osm_timestamp'] == '2026-10-01T00:00:00Z'
    assert entrance['access_verified'] is False and road['access_verified'] is False
    assert road['observed_shared_node_ids'] == [7]
    assert road['geometry'] == [[53.5237, -1.1307], [53.5238, -1.1308]]
    query = provider.call_args.args[0]
    assert f'around:150,{DESTINATION[0]},{DESTINATION[1]}' in query
    assert 'out meta geom 201' in query and 'node["entrance"]' in query and 'node["barrier"]' in query
    assert 'way["highway"]' in query and provider.call_args.kwargs['cache_ttl'] == 300


def test_nearby_road_is_not_associated_by_distance_and_empty_is_not_clear_access():
    road = mapped_way();road['nodes'] = [10, 11]
    for elements in ([mapped_entrance(), road], []):
        with patch('overpass_helper.query_overpass', return_value=map_payload(elements)):
            record = client().post('/api/arrival-access-evidence', json={'lat': 53.52, 'lon': -1.13}).get_json()['evidence']
        assert record['vehicle_access'] == 'UNKNOWN' and record['target_association'] == 'NOT_ESTABLISHED'
        if elements:
            assert record['observations'][1]['observed_shared_node_ids'] == []
        else:
            assert record['status'] == 'NO_MAPPED_OBSERVATIONS' and record['coverage'] == 'PARTIAL'


@pytest.mark.parametrize('body', [None, [], {}, {'lat': True, 'lon': -1}, {'lat': 91, 'lon': 0},
                                      {'lat': '53', 'lon': -1}, {'lat': 10**400, 'lon': 0}])
def test_arrival_evidence_invalid_target_does_not_call_provider(body):
    with patch('overpass_helper.query_overpass') as provider:
        response = client().post('/api/arrival-access-evidence', json=body)
    assert response.status_code == 400 and response.headers['Cache-Control'] == 'no-store'
    provider.assert_not_called()


@pytest.mark.parametrize('payload', [None, {'success': False}, map_payload([mapped_entrance()] * 201),
    map_payload([mapped_entrance(), mapped_entrance()]), map_payload([{'type': 'way', 'id': 8, 'tags': {'highway': 'service'}}]),
    map_payload([{**mapped_way(), 'geometry': [None, None]}]),
    map_payload([{**mapped_entrance(), 'lat': True}]),
    map_payload([{**mapped_entrance(), 'id': True}]),
    map_payload([{**mapped_entrance(), 'tags': {'entrance': 'yes', 'access:conditional': 'x' * 501}}]),
    {'success': True, 'response_state': 'VALID_EMPTY', 'elements': [mapped_entrance()]},
    {'success': True, 'response_state': 'PARTIAL', 'elements': []}])
def test_unavailable_truncated_or_malformed_evidence_never_becomes_empty_success(payload):
    with patch('overpass_helper.query_overpass', return_value=payload):
        response = client().post('/api/arrival-access-evidence', json={'lat': 53, 'lon': -1})
    assert response.status_code == 503 and response.get_json()['success'] is False
    assert response.headers['Cache-Control'] == 'no-store'


@pytest.mark.parametrize('error', [requests.Timeout('timeout'), request_budget.RoutingDeadlineExceeded('deadline')])
def test_arrival_evidence_provider_failure_is_unavailable(error):
    with patch('overpass_helper.query_overpass', side_effect=error):
        response = client().post('/api/arrival-access-evidence', json={'lat': 53, 'lon': -1})
    assert response.status_code == 503

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


def mapped_parking():
    return {'type': 'way', 'id': 42, 'version': 2, 'timestamp': '2025-01-01T00:00:00Z',
            'nodes': [7, 20, 21, 7],
            'geometry': [{'lat': 53.5237, 'lon': -1.1307}, {'lat': 53.5238, 'lon': -1.1307},
                         {'lat': 53.5238, 'lon': -1.1308}, {'lat': 53.5237, 'lon': -1.1307}],
            'tags': {'amenity': 'parking', 'access': 'yes'}}


def test_exact_parking_boundary_and_road_junctions_are_observations_not_an_entrance():
    road2 = mapped_way();road2['id'] = 10
    with patch('overpass_helper.query_overpass', return_value=map_payload([mapped_parking(), mapped_way(), road2])) as provider:
        response = client().post('/api/arrival-access-evidence', json={'lat': 53.5237353, 'lon': -1.1307239, 'parking_way_id': 42})
    assert response.status_code == 200
    record = response.get_json()['evidence'];boundary = record['parking_boundary']
    assert boundary['requested_osm_way_id'] == 42 and boundary['observation']['osm_id'] == 42
    assert boundary['status'] == 'CLOSED_WAY_REPORTED' and boundary['association'] == 'REQUESTED_ID_ONLY'
    assert boundary['entrance'] == 'NOT_ESTABLISHED' and boundary['polygon_validity'] == 'NOT_EVALUATED'
    assert boundary['road_junctions'] == [{'node_id': 7, 'way_ids': [8, 10]}, {'node_id': 9, 'way_ids': [8, 10]}]
    assert record['observations'][1]['parking_boundary_shared_node_ids'] == [7]
    assert record['target_association'] == 'NOT_ESTABLISHED' and record['navigation_authority'] == 'NONE'
    assert 'way(42)["amenity"="parking"](around:150,53.5237353,-1.1307239);' in provider.call_args.args[0]


def test_missing_boundary_is_not_substituted_with_a_nearby_road_or_other_parking():
    # A way with the requested ID now tagged as a road is not a parking boundary.
    with patch('overpass_helper.query_overpass', return_value=map_payload([mapped_way()])):
        record = client().post('/api/arrival-access-evidence', json={'lat': 53, 'lon': -1, 'parking_way_id': 8}).get_json()['evidence']
    assert record['parking_boundary']['status'] == 'NOT_RETURNED'
    assert record['parking_boundary']['observation'] is None
    assert record['observations'][0]['parking_boundary_shared_node_ids'] == []


def test_open_parking_way_is_not_reported_as_a_closed_boundary():
    parking = mapped_parking();parking['nodes'] = parking['nodes'][:-1];parking['geometry'] = parking['geometry'][:-1]
    with patch('overpass_helper.query_overpass', return_value=map_payload([parking])):
        record = client().post('/api/arrival-access-evidence', json={'lat': 53, 'lon': -1, 'parking_way_id': 42}).get_json()['evidence']
    assert record['parking_boundary']['status'] == 'OPEN_OR_DEGENERATE_WAY'


@pytest.mark.parametrize('identity', [True, -1, 0, 2**63, '42', '42);out;', [], {}])
def test_invalid_parking_identity_is_rejected_before_acquisition(identity):
    with patch('overpass_helper.query_overpass') as provider:
        response = client().post('/api/arrival-access-evidence', json={'lat': 53, 'lon': -1, 'parking_way_id': identity})
    assert response.status_code == 400
    provider.assert_not_called()


def test_captured_live_source_age_and_road_connections_are_not_freshness_or_access_acceptance():
    import json
    from pathlib import Path
    from voyagr.services.arrival_map_evidence import boundary_topology, timestamp_diagnostics
    captured = json.loads((Path(__file__).parent / 'fixtures/arrival-map-evidence-20261104.json').read_text())['evidence']
    diagnostics = timestamp_diagnostics(captured)
    assert diagnostics['dataset_timestamp_status'] == 'REPORTED'
    assert diagnostics['dataset_age_at_retrieval_seconds'] == pytest.approx(26359594.581, abs=.001)
    assert diagnostics['source_revision_status'] == 'UNKNOWN' and diagnostics['freshness_acceptance'] == 'NOT_EVALUATED'
    assert diagnostics['source_endpoint_class'] == 'UNKNOWN'  # not reported by the old API
    boundary = boundary_topology(captured['observations'], 1462440103)
    assert boundary['status'] == 'NOT_RETURNED'  # this capture did not query the parking boundary
    junction = next(n for n in boundary['road_junctions'] if n['node_id'] == 2750929456)
    assert junction['way_ids'] == [68405280, 269993102]
    assert all(o['access_verified'] is False for o in captured['observations'])
    assert captured['vehicle_access'] == 'UNKNOWN' and boundary['entrance'] == 'NOT_ESTABLISHED'


@pytest.mark.parametrize('stamp,status,age', [(None, 'MISSING', None), ('nonsense', 'INVALID', None),
    ('2026-01-03T21:21:20', 'INVALID', None), ('2026-11-05T00:00:00Z', 'FUTURE_DATASET_TIMESTAMP', -1925.419)])
def test_missing_invalid_and_future_source_dates_do_not_become_fresh(stamp, status, age):
    from voyagr.services.arrival_map_evidence import timestamp_diagnostics
    diagnostics = timestamp_diagnostics({'dataset_timestamp': stamp, 'retrieved_at': 1793834874.581,
                                         'endpoint_class': 'LOCAL', 'source_version': 'reported-revision'})
    assert diagnostics['dataset_timestamp_status'] == status
    assert diagnostics['dataset_age_at_retrieval_seconds'] == age
    assert diagnostics['source_endpoint_class'] == 'LOCAL'
    assert diagnostics['source_revision_status'] == 'REPORTED'
    assert diagnostics['freshness_acceptance'] == 'NOT_EVALUATED'


def test_road_touching_boundary_coordinates_without_shared_ids_is_not_a_topological_connection():
    road = mapped_way();road['nodes'] = [100, 101]
    with patch('overpass_helper.query_overpass', return_value=map_payload([mapped_parking(), road])):
        record = client().post('/api/arrival-access-evidence', json={'lat': 53.5237, 'lon': -1.1307, 'parking_way_id': 42}).get_json()['evidence']
    assert record['observations'][1]['geometry'][0] == record['parking_boundary']['observation']['geometry'][0]
    assert record['observations'][1]['parking_boundary_shared_node_ids'] == []
    assert record['parking_boundary']['entrance'] == 'NOT_ESTABLISHED'

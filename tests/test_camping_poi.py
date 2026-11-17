"""Camping POI category, provenance, bounds and route-side semantics."""
import json
from unittest.mock import patch
import pytest
import requests
from flask import Flask
import overpass_helper as oh
from voyagr.api.search import search_bp
from voyagr.services import camping_poi as service
from voyagr.utils import request_budget as rb


FIXTURE_TAGS = {
    'camping': {'tourism': 'camp_site'}, 'motorhome': {'tourism': 'caravan_site'},
    'drinking_water': {'amenity': 'drinking_water'}, 'toilets': {'amenity': 'toilets'},
    'showers': {'amenity': 'shower'}, 'waste_disposal': {'amenity': 'sanitary_dump_station'},
    'laundry': {'shop': 'laundry'},
}


def client():
    app = Flask(__name__)
    app.register_blueprint(search_bp, url_prefix='/api')
    return app.test_client()


def search(kind='camping', **changes):
    return client().post('/api/poi-search', json={'lat': 53.5, 'lon': -1.2, 'radius': 3000, 'type': kind, **changes})


def element(kind='camping', identity=1, geometry='node', lat=53.5, lon=-1.2, **extra):
    position = {'lat': lat, 'lon': lon}
    return {'type': geometry, 'id': identity,
            **(position if geometry == 'node' else {'center': position}),
            'tags': {**FIXTURE_TAGS[kind], 'name': 'Mapped place', **extra}}


def mapped(rows):
    return {'success': True, 'elements': rows, 'endpoint_class': 'LOCAL', 'dataset_timestamp': '2026-11-16T12:00:00Z'}


@pytest.mark.parametrize('kind', service.CATEGORIES)
def test_each_category_uses_only_bounded_osm_and_keeps_reported_facilities(kind):
    with patch.object(oh, 'query_overpass', return_value=mapped([element(kind, geometry='way',
            fee='yes', access='private', maxheight='2.1 m', seasonal='summer', opening_hours='May-Sep')])) as osm, \
            patch('voyagr.api.search._tomtom_poi_search') as primary:
        response = search(kind)
    data = response.get_json()
    assert response.status_code == 200 and response.headers['Cache-Control'] == 'no-store'
    row = data['results'][0]
    assert data['source'] == 'Overpass' and row['osm_type'] == 'way'
    assert row['access_category'] == 'restricted' and row['fee_category'] == 'paid'
    assert {'label': 'Height restriction', 'value': '2.1 m'} in row['reported_details']
    assert row['opening_hours_verified'] is False and row['overnight_permission_verified'] is False
    assert row['vehicle_suitability_verified'] is False
    assert data['search_context']['source_endpoint_class'] == 'LOCAL'
    assert '[maxsize:2097152]' in osm.call_args.args[0] and 'out center tags 200' in osm.call_args.args[0]
    for key, value in FIXTURE_TAGS[kind].items():
        assert f'["{key}"="{value}"]' in osm.call_args.args[0]
    primary.assert_not_called()


def test_rejects_unrelated_invalid_distant_duplicate_and_non_potable_points():
    rows = [element(identity=1), element(identity=1), element(identity=2, geometry='relation', lat=53.501),
            element(identity=3, lat=54), element(identity=4, lat=True), element(identity=5, tourism='hotel'),
            element(identity=6, tourism=['camp_site']), element(identity=True)]
    with patch.object(oh, 'query_overpass', return_value=mapped(rows)):
        data = search().get_json()
    assert [r['osm_id'] for r in data['results']] == [1, 2]
    rows = [element('drinking_water', drinking_water='no'),
            element('drinking_water', identity=2),
            {'type': 'node', 'id': 3, 'lat': 53.5, 'lon': -1.2, 'tags': {'amenity': 'water_point'}},
            {'type': 'node', 'id': 4, 'lat': 53.5, 'lon': -1.2, 'tags': {'man_made': 'water_tap', 'drinking_water': 'yes'}}]
    with patch.object(oh, 'query_overpass', return_value=mapped(rows)):
        assert [r['osm_id'] for r in search('drinking_water').get_json()['results']] == [2, 4]


def test_parking_is_not_a_campsite_and_general_waste_is_not_a_sanitary_dump():
    assert service.parse_elements([{'type': 'node', 'id': 1, 'lat': 53.5, 'lon': -1.2,
                                   'tags': {'amenity': 'parking', 'motorhome': 'yes'}}], 'motorhome') == []
    rows = service.parse_elements([element('waste_disposal'), element('waste_disposal', identity=2, amenity='waste_disposal')], 'waste_disposal')
    assert 'Sanitary dump' in rows[0]['camping_kind_label']
    assert 'not verified for toilet waste' in rows[1]['camping_kind_label']


@pytest.mark.parametrize('changes', [{'lat': True}, {'lat': '53.5'}, {'lon': 181}, {'lat': float('nan')}, {'radius': True}, {'radius': 5001}])
def test_invalid_input_is_rejected_before_network(changes):
    with patch.object(oh, 'query_overpass') as network:
        assert search(**changes).status_code == 400
    network.assert_not_called()


def test_successful_empty_and_provider_failure_are_distinct():
    with patch.object(oh, 'query_overpass', return_value=mapped([])):
        response = search()
        assert response.status_code == 200 and response.get_json()['results'] == []
    with patch.object(oh, 'query_overpass', return_value={'success': False}), \
            patch('voyagr.api.search._nominatim_poi_fallback') as fallback:
        response = search()
        assert response.status_code == 503 and response.get_json()['search_context']['coverage'] == 'UNKNOWN'
    fallback.assert_not_called()


def test_real_overpass_client_keeps_cache_and_dataset_provenance():
    response = requests.Response()
    response.status_code = 200
    response.headers['Content-Type'] = 'application/json'
    response._content_consumed = True
    response._content = json.dumps({'elements': [element()], 'osm3s': {'timestamp_osm_base': '2026-11-16T12:00:00Z'}}).encode()
    provider = oh.OverpassClient(endpoints=['http://localhost:8080/api/interpreter'], cache=oh.OverpassCache(), max_retries=1)
    with patch.object(oh, 'get_client', return_value=provider), patch.object(rb, 'post', return_value=response) as transport:
        first, second = search().get_json(), search().get_json()
    assert transport.call_count == 1
    assert first['search_context']['dataset_timestamp'] == '2026-11-16T12:00:00Z'
    assert second['search_context']['cached'] is True


@pytest.mark.parametrize('kind', service.CATEGORIES)
def test_along_route_search_batches_samples_without_unrelated_fallback(kind):
    with patch.object(oh, 'query_overpass', return_value=mapped([element(kind, lon=-1.19), element(kind, identity=2, lat=54)])) as osm, \
            patch('voyagr.api.search._tomtom_poi_search') as primary:
        response = client().post('/api/poi-along-route', json={
            'type': kind, 'radius': 1000, 'route_points': [[53.5, -1.2], [53.5, -1.18]]})
    data = response.get_json()
    assert response.status_code == 200 and len(data['results']) == 1
    assert data['results'][0]['distance_kind'] == 'STRAIGHT_LINE_TO_ROUTE'
    assert data['results'][0]['overnight_permission_verified'] is False
    assert data['search_context']['complete'] is False
    assert osm.call_args.args[0].count('(around:') <= 9
    primary.assert_not_called()


def test_failed_along_route_camping_does_not_fall_back_to_generic_fuel_results():
    with patch.object(oh, 'query_overpass', return_value={'success': False}), \
            patch('voyagr.api.search._tomtom_poi_search') as primary, \
            patch('voyagr.api.search._nominatim_poi_fallback') as fallback:
        response = client().post('/api/poi-along-route', json={
            'type': 'camping', 'radius': 1000, 'route_points': [[53.5, -1.2], [53.5, -1.18]]})
    assert response.status_code == 503
    assert response.get_json()['search_context']['coverage'] == 'UNKNOWN'
    primary.assert_not_called()
    fallback.assert_not_called()

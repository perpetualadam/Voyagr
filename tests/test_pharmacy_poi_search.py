"""Pharmacy fallback/category semantics with real shared acquisition and fixture HTTP."""
import json
from unittest.mock import patch

import pytest
import requests
from flask import Flask, jsonify

import overpass_helper as oh
from voyagr.api.search import search_bp
from voyagr.services.pharmacy_poi import search_osm
from voyagr.utils import request_budget as rb


def client():
    app = Flask(__name__)
    app.config['TESTING'] = True
    app.register_blueprint(search_bp, url_prefix='/api')
    return app.test_client()


def search(**kwargs):
    return client().post('/api/poi-search', json={'lat': 53.5, 'lon': -1.2, 'type': 'pharmacy', **kwargs})


def pharmacy(identity=1, kind='node', lat=53.5, lon=-1.2, **tags):
    position = {'lat': lat, 'lon': lon}
    return {'type': kind, 'id': identity, **(position if kind == 'node' else {'center': position}),
            'tags': {'amenity': 'pharmacy', 'name': 'Pharmacy place', 'opening_hours': '24/7', **tags}}


def payload(rows):
    return {'success': True, 'elements': rows, 'endpoint_class': 'LOCAL',
            'dataset_timestamp': '2026-11-04T21:20:21Z'}


def test_usable_primary_stays_first_without_map_query():
    with patch('voyagr.api.search._tomtom_poi_search', return_value=[{'name': 'Primary', 'lat': 53.5, 'lon': -1.2}]), \
            patch.object(oh, 'query_overpass') as osm:
        response = search()
    data = response.get_json()
    assert data['source'] == 'TomTom' and data['results'][0]['name'] == 'Primary'
    assert data['results'][0]['opening_hours_verified'] is False
    assert response.headers['Cache-Control'] == 'no-store'
    osm.assert_not_called()


@pytest.mark.parametrize('primary', [[], None, [{'name': 'Missing position'}], [{'lat': 54, 'lon': -1.2}]])
def test_empty_failed_or_unusable_primary_falls_through(primary):
    with patch('voyagr.api.search._tomtom_poi_search', return_value=primary), \
            patch.object(oh, 'query_overpass', return_value=payload([pharmacy(kind='way')])) as osm:
        data = search().get_json()
    assert data['source'] == 'Overpass' and data['results'][0]['osm_type'] == 'way'
    query = osm.call_args.args[0]
    assert 'nwr["amenity"="pharmacy"]' in query
    assert 'out center tags 200' in query and '[maxsize:2097152]' in query
    assert data['search_context']['coverage'] == 'CANDIDATES_ONLY'


def test_real_local_client_parses_all_pharmacy_element_types_and_preserves_cache_metadata():
    response = requests.Response()
    response.status_code = 200
    response.headers['Content-Type'] = 'application/json'
    response._content_consumed = True
    response._content = json.dumps({'elements': [pharmacy(), pharmacy(2, 'way', lat=53.5001),
        pharmacy(3, 'relation', lat=53.5002, operator='Mapped operator', access='customers')],
        'osm3s': {'timestamp_osm_base': '2026-11-04T21:20:21Z'}}).encode()
    provider = oh.OverpassClient(endpoints=['http://localhost:8080/api/interpreter'], cache=oh.OverpassCache(), max_retries=1)
    with patch('voyagr.api.search._tomtom_poi_search', return_value=[]), \
            patch.object(oh, 'get_client', return_value=provider), patch.object(rb, 'post', return_value=response) as transport:
        first = search().get_json()
        second = search().get_json()
    assert transport.call_count == 1
    assert transport.call_args.args[0] == 'http://localhost:8080/api/interpreter'
    assert [r['amenity'] for r in first['results']] == ['pharmacy', 'pharmacy', 'pharmacy']
    assert first['results'][2]['operator'] == 'Mapped operator'
    assert first['results'][2]['access_verified'] is False
    assert first['results'][2]['access_category'] == 'customers'
    assert first['search_context']['source_endpoint_class'] == 'LOCAL'
    assert second['search_context']['cached'] is True
    assert second['search_context']['retrieved_at'] == first['search_context']['retrieved_at']
    assert second['search_context']['dataset_timestamp'] == '2026-11-04T21:20:21Z'


def test_unrelated_malformed_duplicate_and_distant_records_do_not_displace_candidates():
    rows = [pharmacy(i, lat=54) for i in range(1, 25)] + [pharmacy(40, 'relation', lat=53.5001), pharmacy(41, 'way'),
        pharmacy(41, 'way'), pharmacy(42, lat=True), pharmacy(43, lon=181), pharmacy(44, amenity='fuel'),
        pharmacy(45, amenity=['cafe']), pharmacy(46, amenity='cafe;pub')]
    with patch.object(oh, 'query_overpass', return_value=payload(rows)):
        results = search_osm(53.5, -1.2, 3000, {})
    assert [r['osm_id'] for r in results] == [41, 40]
    assert all(not r['services_verified'] and not r['opening_hours_verified'] for r in results)


def test_mapped_empty_is_success_without_further_provider_call():
    with patch('voyagr.api.search._tomtom_poi_search', return_value=[]), \
            patch.object(oh, 'query_overpass', return_value=payload([])), \
            patch('voyagr.api.search._nominatim_poi_fallback') as fallback:
        data = search().get_json()
    assert data['success'] and data['source'] == 'Overpass' and data['results'] == []
    fallback.assert_not_called()


def test_map_failure_preserves_last_resort_and_failed_search_is_not_false_empty():
    with patch('voyagr.api.search._tomtom_poi_search', return_value=[]), \
            patch.object(oh, 'query_overpass', return_value={'success': False}), \
            patch('voyagr.api.search._nominatim_poi_fallback', side_effect=lambda *a, **kw: jsonify(
                success=True, results=[{'lat': 53.5, 'lon': -1.2, 'name': 'Fallback'}])):
        assert search().get_json()['source'] == 'nominatim'
    with patch('voyagr.api.search._tomtom_poi_search', return_value=[]), \
            patch.object(oh, 'query_overpass', return_value={'success': False}), \
            patch('voyagr.api.search._nominatim_poi_fallback', side_effect=lambda *a, **kw: jsonify(success=True, results=[])):
        response = search()
    assert response.status_code == 503 and response.get_json()['search_context']['coverage'] == 'UNKNOWN'


@pytest.mark.parametrize('bad', [{'lat': True}, {'lat': float('nan')}, {'lon': 181}, {'lat': '53.5'}, {'radius': True}, {'radius': 5001}])
def test_invalid_input_rejected_before_provider(bad):
    with patch('voyagr.api.search._tomtom_poi_search') as primary:
        assert search(**bad).status_code == 400
    primary.assert_not_called()


def test_zero_longitude_valid_and_other_categories_keep_current_policy():
    with patch('voyagr.api.search._tomtom_poi_search', return_value=[]), \
            patch.object(oh, 'query_overpass', return_value=payload([])) as osm:
        assert search(lon=0).get_json()['source'] == 'Overpass'
        osm.reset_mock()
        assert search(type='groceries').get_json()['source'] == 'TomTom'
        osm.assert_not_called()


def test_parent_deadline_blocks_acquisition_and_discards_late_candidates():
    clock = [0.0]
    parent = rb.RoutingBudget(1, clock=lambda: clock[0])
    clock[0] = 2
    with rb.use_budget(parent), patch.object(oh, 'query_overpass') as osm, pytest.raises(rb.RoutingDeadlineExceeded):
        search_osm(53.5, -1.2, 3000, {})
    osm.assert_not_called()
    clock[0] = 0

    def late(*args, **kwargs):
        clock[0] = 2
        return payload([pharmacy()])

    with rb.use_budget(parent), patch.object(oh, 'query_overpass', side_effect=late), pytest.raises(rb.RoutingDeadlineExceeded):
        search_osm(53.5, -1.2, 3000, {})


@pytest.mark.parametrize('lat,lon', [(53.5,0),(54.5973,-5.9301)])
def test_northern_ireland_and_zero_longitude_candidates_are_supported(lat,lon):
    with patch('voyagr.api.search._tomtom_poi_search',return_value=[]), patch.object(oh,'query_overpass',return_value=payload([pharmacy(lat=lat,lon=lon)])):
        data=search(lat=lat,lon=lon).get_json()
    assert data['results'][0]['distance_m']==0 and data['source']=='Overpass'
    assert data['search_context']['services_verified'] is False
    assert data['search_context']['stock_verified'] is False


def test_stated_primary_stock_or_service_claims_do_not_become_verified():
    primary=[{'lat':53.5,'lon':-1.2,'name':'Primary','operator':'x'*1000,'services_verified':True,'stock_verified':True}]
    with patch('voyagr.api.search._tomtom_poi_search',return_value=primary):
        row=search().get_json()['results'][0]
    assert row['services_verified'] is False and row['stock_verified'] is False
    assert row['opening_hours_verified'] is False and row['access_verified'] is False
    assert len(row['operator'])==500


def test_candidates_bounded_and_ranked_after_distance_filtering():
    rows=[pharmacy(i+1,lat=53.5+i*.00001) for i in range(40)]
    with patch.object(oh,'query_overpass',return_value=payload(rows[::-1])):
        found=search_osm(53.5,-1.2,3000,{})
    assert len(found)==15 and [row['osm_id'] for row in found]==list(range(1,16))


@pytest.mark.parametrize('tags',[{'amenity':'clinic'},{'amenity':'chemist'},{'shop':'chemist','amenity':''},{'amenity':'hospital'}])
def test_unrelated_medical_or_general_retail_categories_are_not_pharmacies(tags):
    with patch.object(oh,'query_overpass',return_value=payload([pharmacy(**tags)])):
        assert search_osm(53.5,-1.2,3000,{})==[]

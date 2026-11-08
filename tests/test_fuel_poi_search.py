"""Fuel button acquisition: real parser/transport with controlled provider responses."""
import json
from unittest.mock import patch
import pytest
import requests
from flask import Flask
import overpass_helper as oh
from voyagr.api.search import search_bp
from voyagr.services.fuel_poi import search_osm
from voyagr.utils import request_budget as rb


def client():
    app=Flask(__name__);app.config['TESTING']=True
    app.register_blueprint(search_bp,url_prefix='/api')
    return app.test_client()


def search(**kwargs):
    return client().post('/api/poi-search',json={'lat':53.5,'lon':-1.2,'type':'fuel',**kwargs})


def fuel(identity=1,kind='node',lat=53.5,lon=-1.2,**tags):
    return {'type':kind,'id':identity,**({'lat':lat,'lon':lon} if kind=='node' else {'center':{'lat':lat,'lon':lon}}),
            'tags':{'amenity':'fuel','name':'Station','fuel:diesel':'yes','opening_hours':'24/7',**tags}}


def payload(rows):
    return {'success':True,'elements':rows,'endpoint_class':'LOCAL','dataset_timestamp':'2026-11-04T21:20:21Z'}


def test_usable_primary_preserved_and_filtered_before_fallback():
    with patch('voyagr.api.search._tomtom_poi_search',return_value=[{'name':'Primary','lat':53.5,'lon':-1.2}]),patch.object(oh,'query_overpass') as osm:
        response=search();data=response.get_json()
    assert data['source']=='TomTom' and data['results'][0]['name']=='Primary'
    assert data['results'][0]['access_verified'] is False
    assert response.headers['Cache-Control']=='no-store';osm.assert_not_called()


@pytest.mark.parametrize('primary',[[],None,[{'name':'Missing coordinates'}],[{'lat':54,'lon':-1.2}]])
def test_empty_unavailable_or_unusable_primary_falls_through_to_area_candidates(primary):
    with patch('voyagr.api.search._tomtom_poi_search',return_value=primary),patch.object(oh,'query_overpass',return_value=payload([fuel(kind='way')])) as osm:
        data=search().get_json()
    assert data['source']=='Overpass' and data['results'][0]['osm_type']=='way'
    assert 'nwr["amenity"="fuel"]' in osm.call_args.args[0]
    assert 'out center tags 200' in osm.call_args.args[0]
    assert data['search_context']['coverage']=='CANDIDATES_ONLY'
    assert data['search_context']['dataset_timestamp']=='2026-11-04T21:20:21Z'


def test_real_local_client_center_parser_and_cache_keep_observation_metadata():
    response=requests.Response();response.status_code=200;response._content_consumed=True;response.headers['Content-Type']='application/json'
    response._content=json.dumps({'elements':[fuel(),fuel(2,'way'),fuel(3,'relation')],
                                 'osm3s':{'timestamp_osm_base':'2026-11-04T21:20:21Z'}}).encode()
    provider=oh.OverpassClient(endpoints=['http://localhost:8080/api/interpreter'],cache=oh.OverpassCache(),max_retries=1)
    with patch('voyagr.api.search._tomtom_poi_search',return_value=[]),patch.object(oh,'get_client',return_value=provider),patch.object(rb,'post',return_value=response) as transport:
        first=search().get_json();second=search().get_json()
    assert transport.call_count==1
    assert transport.call_args.args[0]=='http://localhost:8080/api/interpreter'
    # Equal coordinates/name intentionally collapse identical provider candidates.
    assert first['results'][0]['reported_fuels']==['Diesel']
    assert first['search_context']['source_endpoint_class']=='LOCAL'
    assert second['search_context']['cached'] is True
    assert second['search_context']['retrieved_at']==first['search_context']['retrieved_at']


def test_radius_identity_validation_and_ranking_precede_display_cap():
    rows=[fuel(i,lat=54) for i in range(1,25)]+[fuel(40,'relation',lat=53.5001),fuel(41,'way'),fuel(41,'way'),fuel(42,lat=True),fuel(43,lon=181),fuel(44,amenity='parking')]
    with patch.object(oh,'query_overpass',return_value=payload(rows)):
        results=search_osm(53.5,-1.2,3000,{})
    assert [r['osm_id'] for r in results]==[41,40]
    assert all(r['availability_verified'] is False and r['opening_hours_verified'] is False for r in results)


def test_valid_empty_is_not_failed_acquisition():
    with patch('voyagr.api.search._tomtom_poi_search',return_value=[]),patch.object(oh,'query_overpass',return_value=payload([])),patch('voyagr.api.search._nominatim_poi_fallback') as fallback:
        data=search().get_json()
    assert data['success'] and data['results']==[] and data['source']=='Overpass'
    fallback.assert_not_called()


def test_failed_map_acquisition_keeps_existing_last_resort_without_false_empty_claim():
    from flask import jsonify
    with patch('voyagr.api.search._tomtom_poi_search',return_value=[]),patch.object(oh,'query_overpass',return_value={'success':False}),patch('voyagr.api.search._nominatim_poi_fallback',side_effect=lambda *a,**kw:jsonify(success=True,results=[{'name':'Fallback','lat':53.5,'lon':-1.2}])):
        assert search().get_json()['source']=='nominatim'
    with patch('voyagr.api.search._tomtom_poi_search',return_value=[]),patch.object(oh,'query_overpass',return_value={'success':False}),patch('voyagr.api.search._nominatim_poi_fallback',side_effect=lambda *a,**kw:jsonify(success=True,results=[])):
        response=search()
    assert response.status_code==503 and response.get_json()['search_context']['coverage']=='UNKNOWN'


@pytest.mark.parametrize('bad',[{'lat':True},{'lon':181},{'lat':float('nan')},{'lat':'53.5'},{'radius':True},{'radius':5001}])
def test_invalid_requests_do_not_acquire(bad):
    with patch('voyagr.api.search._tomtom_poi_search') as primary:
        assert search(**bad).status_code==400
    primary.assert_not_called()


def test_zero_longitude_valid_and_other_category_empty_policy_unchanged():
    with patch('voyagr.api.search._tomtom_poi_search',return_value=[]),patch.object(oh,'query_overpass',return_value=payload([])) as osm:
        assert search(lon=0).get_json()['source']=='Overpass'
        osm.reset_mock()
        assert search(type='atm').get_json()['source']=='TomTom';osm.assert_not_called()


def test_expired_parent_has_no_transport_and_late_results_are_discarded():
    clock=[0.0];parent=rb.RoutingBudget(1,clock=lambda:clock[0]);clock[0]=2
    with rb.use_budget(parent),patch.object(oh,'query_overpass') as osm,pytest.raises(rb.RoutingDeadlineExceeded):
        search_osm(53.5,-1.2,3000,{})
    osm.assert_not_called()
    clock[0]=0
    def late(*args,**kwargs):
        clock[0]=2
        return payload([fuel()])
    with rb.use_budget(parent),patch.object(oh,'query_overpass',side_effect=late),pytest.raises(rb.RoutingDeadlineExceeded):
        search_osm(53.5,-1.2,3000,{})


def test_real_primary_parser_skips_malformed_entries_without_losing_later_valid_station(monkeypatch):
    monkeypatch.setenv('TOMTOM_API_KEY','fixture-key')
    response=requests.Response();response.status_code=200
    response._content=json.dumps({'results':[None,{'position':{}},{'position':{'lat':True,'lon':0}},
        {'position':{'lat':53.5,'lon':-1.2},'poi':{'name':'Valid'},'address':{}}]}).encode()
    with patch.object(rb,'get',return_value=response),patch.object(oh,'query_overpass') as osm:
        data=search().get_json()
    assert data['source']=='TomTom' and [r['name'] for r in data['results']]==['Valid']
    osm.assert_not_called()

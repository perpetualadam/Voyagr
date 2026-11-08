"""Charging button fallback and real shared Overpass acquisition with fixture HTTP."""
import json
from unittest.mock import patch

import pytest
import requests
from flask import Flask, jsonify
import overpass_helper as oh
from voyagr.api.search import search_bp
from voyagr.services.charging_poi import search_osm, reported_connectors, normalize_rows
from voyagr.utils import request_budget as rb


def search(**changes):
    app = Flask(__name__)
    app.config['TESTING'] = True
    app.register_blueprint(search_bp, url_prefix='/api')
    return app.test_client().post('/api/poi-search', json={'lat':53.5,'lon':-1.2,'type':'charging',**changes})


def station(identity=1, kind='node', lat=53.5, lon=-1.2, **tags):
    point = {'lat':lat,'lon':lon}
    return {'id':identity,'type':kind,**(point if kind=='node' else {'center':point}),
            'tags':{'amenity':'charging_station','name':'Mapped charger','opening_hours':'24/7',**tags}}


def payload(rows):
    return {'success':True,'elements':rows,'endpoint_class':'LOCAL','dataset_timestamp':'2026-11-04T21:20:21Z'}


def test_usable_primary_is_retained_without_map_query():
    with patch('voyagr.api.search._tomtom_poi_search',return_value=[{'name':'Primary','lat':53.5,'lon':-1.2}]), patch.object(oh,'query_overpass') as osm:
        response = search()
    data = response.get_json()
    assert data['source']=='TomTom' and data['results'][0]['name']=='Primary'
    assert not data['results'][0]['availability_verified'] and not data['results'][0]['connector_compatibility_verified']
    assert response.headers['Cache-Control']=='no-store'
    osm.assert_not_called()


@pytest.mark.parametrize('primary',[[],None,[{'name':'No coordinate'}],[{'lat':54,'lon':-1.2}],[{'lat':True,'lon':-1.2}]])
def test_empty_failed_or_unusable_primary_falls_through(primary):
    with patch('voyagr.api.search._tomtom_poi_search',return_value=primary), patch.object(oh,'query_overpass',return_value=payload([station(kind='way')])) as osm:
        data=search().get_json()
    assert data['source']=='Overpass' and data['results'][0]['osm_type']=='way'
    query=osm.call_args.args[0]
    assert 'nwr["amenity"="charging_station"]' in query and 'out center tags 200' in query
    assert '[timeout:7]' in query and '[maxsize:2097152]' in query
    assert data['search_context']['coverage']=='CANDIDATES_ONLY'


def test_real_local_client_parses_nodes_ways_relations_and_retains_original_cache_times():
    response=requests.Response()
    response.status_code=200
    response.headers['Content-Type']='application/json'
    response._content_consumed=True
    response._content=json.dumps({'elements':[station(),station(2,'way',lat=53.5001),station(3,'relation',lat=53.5002,operator='Operator',network='Network',access='customers',**{'socket:type2_combo':'2','socket:type2_combo:output':'150 kW'})],
                                 'osm3s':{'timestamp_osm_base':'2026-11-04T21:20:21Z'}}).encode()
    client=oh.OverpassClient(endpoints=['http://localhost:8080/api/interpreter'],cache=oh.OverpassCache(),max_retries=1)
    with patch('voyagr.api.search._tomtom_poi_search',return_value=[]),patch.object(oh,'get_client',return_value=client),patch.object(rb,'post',return_value=response) as transport:
        first=search().get_json();second=search().get_json()
    assert transport.call_count==1 and transport.call_args.args[0]=='http://localhost:8080/api/interpreter'
    assert [row['osm_type'] for row in first['results']]==['node','way','relation']
    row=first['results'][2]
    assert row['reported_connectors']==[{'type':'type2_combo','count':'2','output':'150 kW'}]
    assert row['operator']=='Operator' and row['network']=='Network' and row['access_category']=='customers'
    assert all(row[key] is False for key in ('availability_verified','connector_compatibility_verified','charging_power_verified','access_verified','opening_hours_verified'))
    assert first['search_context']['source_endpoint_class']=='LOCAL'
    assert second['search_context']['cached'] is True
    assert first['search_context']['retrieved_at']==second['search_context']['retrieved_at']
    assert second['search_context']['dataset_timestamp']=='2026-11-04T21:20:21Z'


def test_malformed_duplicate_wrong_category_and_distant_elements_are_excluded():
    rows=[station(i,lat=54) for i in range(1,25)]+[station(40,'relation',lat=53.5001),station(41,'way'),station(41,'way'),station(42,lat=True),station(43,lon=181),station(44,amenity='fuel'),station(45,amenity=['charging_station']),station(46,amenity='charging_station;parking')]
    with patch.object(oh,'query_overpass',return_value=payload(rows)):
        found=search_osm(53.5,-1.2,3000,{})
    assert [row['osm_id'] for row in found]==[41,40]


@pytest.mark.parametrize('value',['no','0','-1','1000','2;3','2.5',True,3,'²','1'*5000])
def test_invalid_or_absent_socket_counts_do_not_claim_a_connector(value):
    assert reported_connectors({'socket:type2':value,'socket:type2:output':'22 kW'})==[]


def test_positive_sockets_are_reported_without_inventing_output_or_compatibility():
    assert reported_connectors({'socket:type2':'yes','socket:unknown':'4','socket:chademo':'1'})==[
        {'type':'type2','count':'yes','output':''},{'type':'chademo','count':'1','output':''}]
    rows=normalize_rows([{'lat':53.5,'lon':-1.2,'availability_verified':True,'reported_connectors':[{'type':['bad'],'count':'1'},{'type':'type2','count':'2','output':'x'*100}]}],53.5,-1.2,3000,'TomTom')
    assert rows[0]['availability_verified'] is False
    assert len(rows[0]['reported_connectors'][0]['output'])==64


def test_mapped_empty_is_distinct_from_acquisition_failure():
    with patch('voyagr.api.search._tomtom_poi_search',return_value=[]),patch.object(oh,'query_overpass',return_value=payload([])),patch('voyagr.api.search._nominatim_poi_fallback') as fallback:
        data=search().get_json()
    assert data['success'] and data['source']=='Overpass' and data['results']==[]
    fallback.assert_not_called()
    with patch('voyagr.api.search._tomtom_poi_search',return_value=[]),patch.object(oh,'query_overpass',return_value={'success':False}),patch('voyagr.api.search._nominatim_poi_fallback',side_effect=lambda *a,**kw:jsonify(success=True,results=[])):
        response=search()
    assert response.status_code==503 and response.get_json()['search_context']['coverage']=='UNKNOWN'
    assert response.headers['Cache-Control']=='no-store'


def test_nominatim_remains_last_resort_after_map_failure():
    with patch('voyagr.api.search._tomtom_poi_search',return_value=[]),patch.object(oh,'query_overpass',return_value={'success':False}),patch('voyagr.api.search._nominatim_poi_fallback',side_effect=lambda *a,**kw:jsonify(success=True,results=[{'lat':53.5,'lon':-1.2,'name':'Fallback'}])):
        data=search().get_json()
    assert data['source']=='nominatim' and data['results'][0]['reported_connectors']==[]
    assert data['results'][0]['connector_compatibility_verified'] is False


@pytest.mark.parametrize('bad',[{'lat':True},{'lat':float('nan')},{'lat':'53.5'},{'lon':181},{'radius':True},{'radius':5001},{'radius':'3000'},{'radius':0}])
def test_invalid_input_rejected_before_acquisition(bad):
    with patch('voyagr.api.search._tomtom_poi_search') as primary:
        assert search(**bad).status_code==400
    primary.assert_not_called()


@pytest.mark.parametrize('lat,lon',[(53.5,0),(54.5973,-5.9301)])
def test_zero_longitude_and_northern_ireland_candidates_are_supported(lat,lon):
    with patch('voyagr.api.search._tomtom_poi_search',return_value=[]),patch.object(oh,'query_overpass',return_value=payload([station(lat=lat,lon=lon)])):
        data=search(lat=lat,lon=lon).get_json()
    assert data['source']=='Overpass' and data['results'][0]['distance_m']==0


def test_parent_deadline_prevents_acquisition_and_discards_late_results():
    clock=[2.0]
    parent=rb.RoutingBudget(1,clock=lambda:clock[0]);clock[0]=4
    with rb.use_budget(parent),patch.object(oh,'query_overpass') as osm,pytest.raises(rb.RoutingDeadlineExceeded):
        search_osm(53.5,-1.2,3000,{})
    osm.assert_not_called();clock[0]=2
    def late(*args,**kwargs):
        clock[0]=4
        return payload([station()])
    with rb.use_budget(parent),patch.object(oh,'query_overpass',side_effect=late),pytest.raises(rb.RoutingDeadlineExceeded):
        search_osm(53.5,-1.2,3000,{})

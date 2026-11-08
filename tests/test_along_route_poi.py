"""Bounded along-route acquisition and route-relative geometry with fixture transport."""
import json
from unittest.mock import Mock, patch
import pytest
import requests
from flask import Flask, jsonify
import overpass_helper as oh
from voyagr.api.search import search_bp
from voyagr.services import along_route_poi as service
from voyagr.utils import request_budget as rb

ROUTE=[[53.5,-1.2],[53.5,-1.19],[53.5,-1.18]]


def client():
    app=Flask(__name__);app.config['TESTING']=True
    app.register_blueprint(search_bp,url_prefix='/api')
    return app.test_client()


def request(**changes):
    return client().post('/api/poi-along-route',json={'route_points':ROUTE,'type':'fuel','radius':1000,**changes})


def element(identity=1,kind='node',lat=53.5002,lon=-1.19,**tags):
    pos={'lat':lat,'lon':lon}
    return {'type':kind,'id':identity,**(pos if kind=='node' else {'center':pos}),'tags':{'amenity':'fuel','name':'Candidate',**tags}}


def mapped(elements):
    return {'success':True,'elements':elements,'endpoint_class':'LOCAL','dataset_timestamp':'2026-11-04T21:20:21Z'}


def test_primary_uses_at_most_three_distance_samples_and_independent_route_offsets():
    row={'lat':53.5002,'lon':-1.195,'name':'Primary','distance_m':99999}
    with patch('voyagr.api.search._tomtom_poi_search',return_value=[row]) as primary,patch.object(oh,'query_overpass') as osm:
        response=request()
    data=response.get_json()
    assert response.status_code==200 and data['source']=='TomTom' and primary.call_count<=3
    assert len(data['results'])==1 and 15<data['results'][0]['distance_m']<30
    assert data['search_context']['coverage']=='SAMPLED_CANDIDATES_ONLY'
    assert data['search_context']['complete'] is False and response.headers['Cache-Control']=='no-store'
    assert all(call.kwargs['budgeted'] is True for call in primary.call_args_list)
    osm.assert_not_called()


def test_real_shared_client_batches_samples_and_preserves_cache_provenance():
    response=requests.Response();response.status_code=200;response.headers['Content-Type']='application/json'
    response._content_consumed=True
    response._content=json.dumps({'elements':[element(),element(2,'way',lon=-1.185),element(3,'relation',lon=-1.18)],'osm3s':{'timestamp_osm_base':'2026-11-04T21:20:21Z'}}).encode()
    provider=oh.OverpassClient(endpoints=['http://localhost:8080/api/interpreter'],cache=oh.OverpassCache(),max_retries=1)
    with patch('voyagr.api.search._tomtom_poi_search',return_value=[]),patch.object(oh,'get_client',return_value=provider),patch.object(rb,'post',return_value=response) as transport:
        first=request().get_json();second=request().get_json()
    assert transport.call_count==1 and transport.call_args.args[0]=='http://localhost:8080/api/interpreter'
    assert [r['osm_type'] for r in first['results']]==['node','way','relation']
    assert first['search_context']['sample_count']==3 and second['search_context']['cached'] is True
    assert second['search_context']['retrieved_at']==first['search_context']['retrieved_at']
    assert second['search_context']['dataset_timestamp']=='2026-11-04T21:20:21Z'
    assert first['search_context']['source_endpoint_class']=='LOCAL'


@pytest.mark.parametrize('kind,tags,field,value',[
    ('fuel',{'amenity':'fuel','fuel:diesel':'yes'},'reported_fuels',['Diesel']),
    ('food',{'amenity':'cafe','cuisine':'pizza'},'cuisine','pizza'),
    ('charging',{'amenity':'charging_station','socket:type2':'2'},'reported_connectors',[{'type':'type2','count':'2','output':''}]),
    ('parking',{'amenity':'parking','fee':'no'},'fee_category','free'),
    ('groceries',{'shop':'convenience','amenity':''},'shop_kind','convenience'),
    ('pharmacy',{'amenity':'pharmacy'},'type','pharmacy'),
    ('hospital',{'amenity':'clinic'},'type','hospital'),
    ('atm',{'amenity':'bank'},'type','atm'),
    ('supermarket',{'shop':'supermarket','amenity':''},'type','supermarket'),
])
def test_category_semantics_and_reported_details(kind,tags,field,value):
    with patch('voyagr.api.search._tomtom_poi_search',return_value=[]),patch.object(oh,'query_overpass',return_value=mapped([element(**tags)])) as osm:
        data=request(type=kind).get_json()
    row=data['results'][0]
    assert row[field]==value and row['access_verified'] is False and row['detour_verified'] is False
    assert row['opening_hours_verified'] is False and row['stock_verified'] is False
    assert row['emergency_services_verified'] is False and row['availability_verified'] is False
    query=osm.call_args.args[0]
    assert query.count('nwr[')<=3 and 'out center tags 200' in query and '[maxsize:2097152]' in query


def test_sample_spacing_uses_distance_not_vertex_density_and_long_route_gaps_are_explicit():
    points=[[53.5,-1.2],[53.5,-1.19999],[53.5,-1.19998],[53.5,-.2]]
    _,_,_,_,samples=service.prepare({'route_points':points})
    assert samples[1][1]==pytest.approx(-.7,abs=.001)
    with patch('voyagr.api.search._tomtom_poi_search',return_value=[]),patch.object(oh,'query_overpass',return_value=mapped([])) as osm,patch('voyagr.api.search._nominatim_poi_fallback') as last:
        response=request(route_points=points)
    context=response.get_json()['search_context']
    assert context['complete'] is False and context['sample_count']==3
    assert osm.call_count==1 and osm.call_args.args[0].count('nwr[')==3
    last.assert_not_called()


def test_out_of_window_distant_malformed_and_duplicate_elements_are_rejected():
    rows=[element(),element(),element(2,lat=54),element(3,lat=True),element(4,lon=181),element(5,amenity='cafe')]
    with patch('voyagr.api.search._tomtom_poi_search',return_value=[]),patch.object(oh,'query_overpass',return_value=mapped(rows)):
        data=request().get_json()
    assert len(data['results'])==1 and data['results'][0]['osm_id']==1


def test_corridor_distance_rejects_candidates_near_a_sample_but_outside_actual_route_radius():
    # The radius boundary must be checked against the actual geometry, too.
    coords=[[53.5,-1.2],[53.51,-1.2]]
    kind,radius,points,cumulative,samples=service.prepare({'route_points':coords,'radius':100})
    assert service.normalize([{'lat':53.505,'lon':-1.19}],kind,samples,radius,points,cumulative,'TomTom')==[]


def test_mapped_empty_and_acquisition_failure_have_different_outcomes():
    with patch('voyagr.api.search._tomtom_poi_search',return_value=[]),patch.object(oh,'query_overpass',return_value=mapped([])),patch('voyagr.api.search._nominatim_poi_fallback') as last:
        assert request().get_json()['success'] is True
    last.assert_not_called()
    with patch('voyagr.api.search._tomtom_poi_search',return_value=[]),patch.object(oh,'query_overpass',return_value={'success':False}),patch('voyagr.api.search._nominatim_poi_fallback',side_effect=lambda *a,**kw:jsonify(success=True,results=[])) as last:
        result=request()
    assert last.call_count==1 and result.status_code==503 and result.get_json()['search_context']['coverage']=='UNKNOWN'


def test_last_resort_has_truthful_source_and_one_lookup():
    with patch('voyagr.api.search._tomtom_poi_search',return_value=[]),patch.object(oh,'query_overpass',return_value={'success':False}),patch('voyagr.api.search._nominatim_poi_fallback',side_effect=lambda *a,**kw:jsonify(success=True,results=[{'name':'Fallback','lat':53.5,'lon':-1.19}])) as last:
        data=request().get_json()
    assert last.call_count==1 and data['source']=='nominatim'
    assert data['search_context']['sample_count']==1 and data['search_context']['planned_sample_count']==3
    assert data['results'][0]['distance_m']==0


@pytest.mark.parametrize('bad',[{'route_points':[]},{'route_points':[[53.5,-1.2]]},{'route_points':[[True,0],[53.5,0]]},{'route_points':[[53.5,'-1.2'],[53.5,0]]},{'route_points':[[53.5,-1.2]]*8193},{'route_points':[[53.5,-1.2]]*2},{'type':'unknown'},{'radius':True},{'radius':0},{'radius':5001},{'radius':'1000'},{'route_points':[[53.5,179],[53.5,-179]]}])
def test_invalid_requests_rejected_before_any_provider(bad):
    with patch('voyagr.api.search._tomtom_poi_search') as primary,patch.object(oh,'query_overpass') as osm:
        assert request(**bad).status_code==400
    primary.assert_not_called();osm.assert_not_called()


@pytest.mark.parametrize('body',[None,[],True,'text'])
def test_non_object_body_rejected(body):
    assert client().post('/api/poi-along-route',json=body).status_code==400


def test_northern_ireland_and_zero_longitude_are_valid():
    for points in ([[54.5973,-5.9301],[54.6,-5.93]],[[53.5,0],[53.51,0]]):
        with patch('voyagr.api.search._tomtom_poi_search',return_value=[]),patch.object(oh,'query_overpass',return_value=mapped([element(lat=points[0][0],lon=points[0][1])])):
            assert len(request(route_points=points).get_json()['results'])==1


def test_expired_parent_prevents_provider_calls():
    clock=[0.0];parent=rb.RoutingBudget(1,clock=lambda:clock[0]);clock[0]=2
    with rb.use_budget(parent),patch('voyagr.api.search._tomtom_poi_search') as primary,patch.object(oh,'query_overpass') as osm:
        response=request()
    assert response.status_code==503
    primary.assert_not_called();osm.assert_not_called()


def test_late_primary_results_are_discarded_before_map_fallback():
    clock=[0.0];parent=rb.RoutingBudget(100,clock=lambda:clock[0])
    def late(*args,**kwargs):
        clock[0]=6
        return [{'lat':53.5,'lon':-1.2,'name':'Late primary'}]
    with rb.use_budget(parent),patch('voyagr.api.search._tomtom_poi_search',side_effect=late),patch.object(oh,'query_overpass',return_value=mapped([element()])):
        data=request().get_json()
    assert data['source']=='Overpass' and data['results'][0]['name']=='Candidate'


def test_whole_deadline_discards_late_map_results_without_last_resort():
    clock=[0.0];parent=rb.RoutingBudget(100,clock=lambda:clock[0])
    def late(*args,**kwargs):
        clock[0]=21
        return mapped([element()])
    with rb.use_budget(parent),patch('voyagr.api.search._tomtom_poi_search',return_value=[]),patch.object(oh,'query_overpass',side_effect=late),patch('voyagr.api.search._nominatim_poi_fallback') as last:
        response=request()
    assert response.status_code==503 and 'results' not in response.get_json()
    last.assert_not_called()

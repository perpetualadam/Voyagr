"""Traffic-light display endpoints with real acquisition/parser/segment code and fixture transport."""
import json
import time
from unittest.mock import patch
import pytest
import requests
from flask import Flask
import overpass_helper as oh
from voyagr.api.hazards import hazards_bp
from voyagr.services.hazards import fetch_traffic_lights_osm_bbox
from voyagr.utils import request_budget as rb


def client():
    app=Flask(__name__);app.config['TESTING']=True
    app.register_blueprint(hazards_bp,url_prefix='/api')
    return app.test_client()


def payload(elements, **extra):
    return {'success':True,'elements':elements,'response_state':'VALID_WITH_DATA' if elements else 'VALID_EMPTY',
            'dataset_coverage':'UNVERIFIED','retrieved_at':time.time(),'endpoint_class':'LOCAL',
            'dataset_timestamp':'2026-11-04T21:20:21Z','source_version':'fixture-revision',**extra}


def node(identity=1, lat=53.5, lon=-1.19):
    return {'type':'node','id':identity,'lat':lat,'lon':lon,'tags':{'highway':'traffic_signals'}}


def route(coords=None):
    return {'route':{'type':'LineString','coordinates':coords or [[-1.2,53.5],[-1.18,53.5]]}}


def test_sparse_route_uses_segments_and_reports_geographic_only_provenance():
    # Midpoint is ~660m from either vertex, but directly on the route segment.
    with patch.object(oh,'query_overpass',return_value=payload([node(),node(2,53.51,-1.19)])) as query:
        response=client().post('/api/traffic-lights',json=route())
    data=response.get_json();assert response.status_code==200 and data['count']==1
    assert data['lights'][0]['lat']==53.5 and data['lights'][0]['state']=='unknown'
    assert data['coverage']['association']=='GEOGRAPHIC_ONLY'
    assert data['coverage']['endpoint_class']=='LOCAL'
    assert data['coverage']['dataset_timestamp']=='2026-11-04T21:20:21Z'
    assert data['coverage']['status']=='PARTIAL'
    assert query.call_count==1


@pytest.mark.parametrize('elements', [[],[node()]])
def test_viewport_reaches_configured_local_interpreter_and_preserves_observation(elements):
    # Use the real shared client and parser, replacing only outbound HTTP.
    response=requests.Response();response.status_code=200
    response._content=json.dumps({'elements':elements,'osm3s':{'timestamp_osm_base':'2026-11-04T21:20:21Z'}}).encode()
    response._content_consumed=True;response.headers['Content-Type']='application/json'
    provider=oh.OverpassClient(endpoints=['http://localhost:8080/api/interpreter'],cache=oh.OverpassCache(),max_retries=1)
    with patch.object(oh,'get_client',return_value=provider),patch.object(rb,'post',return_value=response) as transport:
        data=client().get('/api/traffic-lights/area?north=53.51&south=53.49&east=-1.18&west=-1.20').get_json()
        cached=client().get('/api/traffic-lights/area?north=53.51&south=53.49&east=-1.18&west=-1.20').get_json()
    assert cached['coverage']['cached'] is True
    assert cached['coverage']['retrieved_at']==data['coverage']['retrieved_at']
    assert transport.call_count==1
    assert data['count']==len(elements)
    assert data['coverage']['endpoint_class']=='LOCAL'
    assert data['coverage']['dataset_timestamp']=='2026-11-04T21:20:21Z'
    assert data['coverage']['response_state']==('VALID_WITH_DATA' if elements else 'VALID_EMPTY')
    assert data['coverage']['status']=='PARTIAL'  # Never infer complete dataset coverage.


@pytest.mark.parametrize('path,body', [('/api/traffic-lights',route()),('/api/traffic-lights/area?north=53.51&south=53.49&east=-1.18&west=-1.20',None)])
def test_provider_failure_is_not_valid_empty(path,body):
    with patch.object(oh,'query_overpass',return_value={'success':False,'coverage_status':'UNKNOWN','response_state':'UNAVAILABLE'}):
        r=client().post(path,json=body) if body else client().get(path)
    data=r.get_json();assert data['coverage']['status']=='UNKNOWN'
    assert data['coverage']['response_state']=='UNAVAILABLE'


@pytest.mark.parametrize('coords', [[[0,0]],[[False,53.5],[-1,54]],[[-1,'53.5'],[-1,54]],[[-181,53],[-1,54]],[[None,53],[-1,54]],[None,[-1,54]],[[0,0]]*10001])
def test_invalid_route_refuses_before_query(coords):
    with patch.object(oh,'query_overpass') as query:
        r=client().post('/api/traffic-lights',json=route(coords))
    assert r.status_code==400;query.assert_not_called()


@pytest.mark.parametrize('bounds',['north=nan&south=53&east=-1&west=-2','north=53&south=54&east=-1&west=-2','north=91&south=53&east=-1&west=-2'])
def test_invalid_viewport_refuses_before_query(bounds):
    with patch.object(oh,'query_overpass') as query:r=client().get('/api/traffic-lights/area?'+bounds)
    assert r.status_code==400;query.assert_not_called()


@pytest.mark.parametrize('path,body',[('/api/traffic-lights',route([[-2,53],[-1,54]])),('/api/traffic-lights/area?north=54&south=53&east=-1&west=-2',None)])
def test_oversize_is_explicitly_not_queried(path,body):
    with patch.object(oh,'query_overpass') as query:r=client().post(path,json=body) if body else client().get(path)
    assert r.get_json()['coverage']=={'status':'PARTIAL','reason':'area_too_large','response_state':'NOT_QUERIED'}
    query.assert_not_called()


def test_display_cap_and_malformed_nodes_preserve_partial_coverage():
    elements=[node(i+1) for i in range(205)]+[node(900,float('nan'),-1.19),node(901,False,-1.19)]
    with patch.object(oh,'query_overpass',return_value=payload(elements)):
        data=client().post('/api/traffic-lights',json=route()).get_json()
    assert data['count']==200 and len(data['lights'])==200
    assert data['coverage']['display_truncated'] is True and data['coverage']['status']=='PARTIAL'


def test_viewport_admission_failure_preserves_unavailable_evidence():
    from voyagr.api import hazards
    from voyagr.utils.hazard_matching import HazardList
    with patch.object(hazards,'_run_osm_area_fetch',return_value=HazardList(coverage={'status':'UNAVAILABLE','reason':'acquisition_busy'})):
        data=client().get('/api/traffic-lights/area?north=53.51&south=53.49&east=-1.18&west=-1.20').get_json()
    assert data['count']==0 and data['coverage']['reason']=='acquisition_busy'

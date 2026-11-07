"""Real shared crossing acquisition, API and mandatory assessment with fixture HTTP."""
import json
import time
from unittest.mock import patch
import pytest
import requests
from flask import Flask, g
import overpass_helper as oh
from voyagr.api.hazards import hazards_bp
from voyagr.services.hazards import fetch_railway_crossings_osm_bbox
from voyagr.utils import request_budget as rb
from voyagr.utils.hazard_matching import HazardDataset

URL='/api/railway-crossings/area?north=53.52&south=53.49&east=-1.18&west=-1.21'


def client():
    app=Flask(__name__);app.config['TESTING']=True;app.register_blueprint(hazards_bp,url_prefix='/api')
    return app.test_client()


def node(identity=1,lat=53.505,lon=-1.195):
    return {'type':'node','id':identity,'lat':lat,'lon':lon,'tags':{'railway':'level_crossing'}}


def payload(elements):
    return {'success':True,'elements':elements,'response_state':'VALID_WITH_DATA' if elements else 'VALID_EMPTY',
            'dataset_coverage':'UNVERIFIED','retrieved_at':time.time(),'endpoint_class':'LOCAL',
            'dataset_timestamp':'2026-11-04T21:20:21Z','source_version':'fixture-revision'}


@pytest.mark.parametrize('elements',[[],[node()]])
def test_local_query_category_provenance_and_cache_survive_api(elements):
    provider=oh.OverpassClient(endpoints=['http://localhost:8080/api/interpreter'],cache=oh.OverpassCache(),max_retries=1)
    response=requests.Response();response.status_code=200
    response._content=json.dumps({'elements':elements,'osm3s':{'timestamp_osm_base':'2026-11-04T21:20:21Z'}}).encode();response._content_consumed=True;response.headers['Content-Type']='application/json'
    with patch.object(oh,'get_client',return_value=provider),patch.object(rb,'post',return_value=response) as transport:
        first=client().get(URL).get_json();second=client().get(URL).get_json()
    assert transport.call_count==1
    query=transport.call_args.kwargs['data']['data']
    assert 'node["railway"="level_crossing"]' in query
    assert '"railway"="crossing"' not in query  # Pedestrian-only nodes are not this category.
    assert first['count']==len(elements) and first['coverage']['endpoint_class']=='LOCAL'
    assert first['coverage']['dataset_timestamp']=='2026-11-04T21:20:21Z'
    assert first['coverage']['response_state']==('VALID_WITH_DATA' if elements else 'VALID_EMPTY')
    assert first['coverage']['status']=='PARTIAL'
    assert second['coverage']['cached'] is True
    assert second['coverage']['retrieved_at']==first['coverage']['retrieved_at']


@pytest.mark.parametrize('params', ['north=nan&south=53&east=-1&west=-2','north=nope&south=53&east=-1&west=-2','north=91&south=53&east=-1&west=-2','north=53&south=54&east=-1&west=-2','north=54&south=53&east=-2&west=-1'])
def test_invalid_viewport_never_queries(params):
    with patch.object(oh,'query_overpass') as query:r=client().get('/api/railway-crossings/area?'+params)
    assert r.status_code==400;query.assert_not_called()


def test_oversized_viewport_is_not_queried_and_never_reported_as_complete_empty():
    with patch.object(oh,'query_overpass') as query:data=client().get('/api/railway-crossings/area?north=54&south=53&east=-1&west=-2').get_json()
    assert data['count']==0 and data['coverage']=={'status':'PARTIAL','reason':'area_too_large','response_state':'NOT_QUERIED'}
    query.assert_not_called()


def test_provider_failure_retains_unknown_instead_of_valid_empty():
    with patch.object(oh,'query_overpass',return_value={'success':False,'coverage_status':'UNKNOWN','response_state':'UNAVAILABLE'}):data=client().get(URL).get_json()
    assert data['count']==0 and data['coverage']['status']=='UNKNOWN' and data['coverage']['response_state']=='UNAVAILABLE'


def test_bad_coordinates_duplicates_and_truncation_cannot_claim_full_coverage():
    elements=[node(),node(),node(2,False),node(3,float('nan')),node(4,91)]+[node(i+10) for i in range(205)]
    with patch.object(oh,'query_overpass',return_value=payload(elements)):
        data=client().get(URL).get_json()
    assert data['count']==196 and data['coverage']['status']=='PARTIAL'
    assert all(p['lat']==53.505 and p['lon']==-1.195 for p in data['railway_crossings'])


@pytest.mark.parametrize('result',[payload([]),payload([node()]),{'success':False,'coverage_status':'UNKNOWN','response_state':'UNAVAILABLE'}])
def test_acquired_crossing_evidence_stays_conservative_for_each_multistop_leg(result):
    from voyagr.services.routing.integrity import assess_response,normalize_requirements
    from voyagr.services.routing.journey_geometry import stitch_legs
    with patch.object(oh,'query_overpass',return_value=result):
        crossings=fetch_railway_crossings_osm_bbox(53.49,53.53,-1.21,-1.17)
    legs=[{'source':'GraphHopper','geometry':[[53.5,-1.2],[53.51,-1.19]]},
          {'source':'Valhalla','geometry':[[53.51,-1.19],[53.52,-1.18]]}]
    requirements=normalize_requirements({'avoid_caz':False,'avoidance_requirements':[{'category':'railway_crossings','enabled':True,'mode':'mandatory'}]})
    assessed=assess_response(dict(stitch_legs(legs),success=True,legs=legs),requirements,HazardDataset({'railway_crossing':crossings}))
    assert assessed['automatic_selection_allowed'] is False
    for leg in assessed['legs']:
        row=next(r for r in leg['avoidance_assessment']['requirements'] if r['category']=='railway_crossings')
        assert row['status']=='UNVERIFIED' and row['coverage'] in ('UNKNOWN','PARTIAL')
        assert leg['avoidance_assessment']['automatic_selection_allowed'] is False


def test_actual_hazard_preparation_retains_crossing_observation_in_snapshot():
    import voyagr_web as web
    from voyagr.services.routing.hazard_prep import HazardPrefs,prepare_route_hazards
    app=Flask(__name__)
    with app.test_request_context('/api/route'),patch.object(web,'fetch_hazards_for_route',return_value={}),patch.object(web,'fetch_tomtom_incidents',return_value={}),patch.object(web,'filter_camera_hazards_by_preferences'),patch.object(oh,'query_overpass',return_value=payload([node()])):
        hazards=prepare_route_hazards(53.5,-1.2,53.51,-1.19,HazardPrefs([],True,False,True,True))
        assert hazards['railway_crossing'][0]['id']=='osm_node_1'
        snapshot=g.route_avoidance_hazards['railway_crossing']
        assert snapshot.coverage['endpoint_class']=='LOCAL' and snapshot.coverage['status']=='PARTIAL'
        assert snapshot.coverage['dataset_timestamp']=='2026-11-04T21:20:21Z'


def test_shared_admission_and_parent_deadline_are_preserved():
    from voyagr.api import hazards
    from voyagr.utils.hazard_matching import HazardList
    with patch.object(hazards,'_run_osm_area_fetch',return_value=HazardList(coverage={'status':'UNAVAILABLE','reason':'acquisition_busy'})):
        assert client().get(URL).get_json()['coverage']['reason']=='acquisition_busy'
    app=Flask(__name__);app.config['TESTING']=True;app.register_blueprint(hazards_bp,url_prefix='/api')
    @app.before_request
    def deadline():g.routing_budget=rb.RoutingBudget(0)
    with patch.object(oh,'query_overpass') as query,pytest.raises(rb.RoutingDeadlineExceeded):app.test_client().get(URL)
    query.assert_not_called()

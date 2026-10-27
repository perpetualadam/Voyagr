"""Actual Flask boundary with deterministic provider/DB fixtures. No live network.

Stage times are inclusive/nested and must not be added. p95 is nearest rank of
20 samples. No browser rendering, production engine or mobile latency claim.
"""
import contextlib
import copy
import io
import json
import logging
import math
import statistics
import sqlite3
import sys
import time
import tracemalloc
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import polyline
import requests
import voyagr_web as vw
from voyagr.services.routing import multidrop as md,journey_geometry as jg,integrity,enrichment
from voyagr.utils import request_budget as rb
from voyagr.services import hazards as hazard_service
from voyagr.services.routing.integrity_api import capture_hazard_snapshot

SAMPLES=20
BASE={'start':'53.52,-1.13','end':'53.534,-1.123','avoid_caz':False,'enable_hazard_avoidance':False,'force_refresh':True}
class Reply:
    status_code=200;text='';headers={}
    def __init__(self,body):self.body=body
    def json(self):return self.body
    def raise_for_status(self):return None

def trip(locations,alternates=False):
    legs=[]
    for a,b in zip(locations,locations[1:]):
        legs.append({'shape':polyline.encode([(a['lat'],a['lon']),(b['lat'],b['lon'])],precision=6),
            'summary':{'length':1,'time':120},'maneuvers':[{'instruction':'Continue','type':8,'begin_shape_index':0,'end_shape_index':1,'length':1,'time':120}]})
    result={'trip':{'legs':legs,'summary':{'length':len(legs),'time':len(legs)*120}}}
    if alternates: result['alternates']=[copy.deepcopy(result)]
    return result

def summary(values):
    values=sorted(values)
    return {'median_ms':round(statistics.median(values),3),'p95_ms':round(values[math.ceil(.95*len(values))-1],3),'max_ms':round(max(values),3)}

def run():
    logging.disable(logging.CRITICAL)
    connection=sqlite3.connect(':memory:')
    connection.execute('CREATE TABLE hazard_preferences (hazard_type TEXT, penalty_seconds INTEGER, proximity_threshold_meters INTEGER, enabled INTEGER)')
    @contextlib.contextmanager
    def preferences_db(): yield connection
    output={'scope':'synthetic actual Flask requests; mocked provider transport/acquisition/cache writes, in-memory default scoring preferences; no network or rendering',
            'samples_per_case':SAMPLES,'stages':'inclusive/nested, not additive','cases':[]}
    cached={'success':True,'routes':[{'geometry':polyline.encode([(53.52,-1.13),(53.534,-1.123)],precision=6),'geometry_precision':6,
             'distance_km':7,'duration_minutes':14,'maneuvers':[],'source':'Valhalla'}]}
    for name in ('single','three_stops','five_stops','alternatives','cached','failover','large_hazards'):
        body=dict(BASE)
        if name in ('three_stops','five_stops'):
            n=3 if name=='three_stops' else 5
            body.update(stops=[{'lat':round(53.522+i*.002,6),'lon':round(-1.129+i*.001,6),'name':str(i)} for i in range(n)],optimize_stop_order=True)
        if name=='cached':body['force_refresh']=False
        if name=='large_hazards': body.update(enable_hazard_avoidance=True,avoid_traffic_lights=False,avoid_railway_crossings=False)
        stages={};calls=[0]
        def measure(label,fn):
            def wrapped(*a,**kw):
                t=time.perf_counter()
                try:return fn(*a,**kw)
                finally:stages.setdefault(label,[]).append((time.perf_counter()-t)*1000)
            return wrapped
        def post(url,json=None,**kw):
            calls[0]+=1
            if name=='failover':raise requests.Timeout('synthetic fault')
            if json and 'sources' in json: return Reply({})  # matrix falls back to real deterministic ordering
            return Reply(trip(json['locations'],name=='alternatives'))
        def get(url,**kw):
            calls[0]+=1
            return Reply({'code':'Ok','routes':[{'distance':7000,'duration':840,'geometry':polyline.encode([(53.52,-1.13),(53.534,-1.123)],precision=5),'legs':[]}]})
        hazards={'camera_speed':[{'lat':53.55+(i%100)*.0001,'lon':-1.2,'id':i} for i in range(10000)]} if name=='large_hazards' else {}
        def acquire(*a,**kw):return capture_hazard_snapshot(copy.deepcopy(hazards))
        with contextlib.ExitStack() as stack:
            patches=[(hazard_service,'db_connection',preferences_db),(vw.route_cache,'get',lambda *a,**kw:copy.deepcopy(cached) if name=='cached' else None),
                (vw.route_cache,'set',lambda *a,**kw:None),(vw.cost_calculator,'get_cached_route_from_db',lambda *a,**kw:None),
                (vw.cost_calculator,'cache_route_to_db',lambda *a,**kw:None),
                (vw,'route_with_graphhopper',lambda *a,**kw:None),(md,'_valhalla_matrix',lambda *a,**kw:None),
                (vw,'prepare_route_hazards',measure('hazard_acquisition_fixture',acquire)),
                (vw,'fetch_hazards_for_route',lambda *a,**kw:copy.deepcopy(hazards)),
                (vw,'fetch_tomtom_incidents',lambda *a,**kw:{}),
                (vw,'get_traffic_duration_multiplier',lambda *a,**kw:(1,'fixture')),
                (rb.requests,'post',measure('provider_fixture',post)),(rb.requests,'get',measure('provider_fixture',get)),
                (vw,'parse_route_request',measure('parsing',vw.parse_route_request)),
                (jg,'decode_geometry',measure('geometry_decoding',jg.decode_geometry)),
                (jg,'stitch_legs',measure('geometry_stitching',jg.stitch_legs)),
                (integrity,'assess_route',measure('avoidance_assessment',integrity.assess_route)),
                (vw,'apply_valhalla_route_enrichment',measure('ranking_enrichment',vw.apply_valhalla_route_enrichment)),
                (vw.app.json,'dumps',measure('serialization',vw.app.json.dumps))]
            for target,attr,value in patches:stack.enter_context(patch.object(target,attr,value))
            client=vw.app.test_client();samples=[]
            for _ in range(SAMPLES):
                started=time.perf_counter();rv=client.post('/api/route',json=body,environ_overrides={'REMOTE_ADDR':'127.0.0.'+str(10+len(output['cases']))});samples.append((time.perf_counter()-started)*1000)
                if rv.status_code!=200 or not rv.json.get('success'):raise RuntimeError(f'{name}: fixture request failed: {rv.status_code}')
                if name.endswith('stops'):
                    assert len(jg.decode_geometry(rv.json['geometry']))==len(body['stops'])+2
            tracemalloc.start();client.post('/api/route',json=body,environ_overrides={'REMOTE_ADDR':'127.0.0.'+str(10+len(output['cases']))});_,peak=tracemalloc.get_traced_memory();tracemalloc.stop()
        output['cases'].append({'name':name,'request_boundary':summary(samples),'peak_traced_mib':round(peak/1048576,3),
            'mocked_provider_calls_including_memory_sample':calls[0],
            'stage_call_distributions':{label:dict(summary(values),calls=len(values)) for label,values in stages.items()}})
    return output

if __name__=='__main__':
    with contextlib.redirect_stdout(io.StringIO()),contextlib.redirect_stderr(io.StringIO()):result=run()
    print(json.dumps(result,indent=2))

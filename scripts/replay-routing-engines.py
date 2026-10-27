"""Loopback-only routing discovery and graph-fixture replay; never probes production.

Operator must supply graph-derived request/oracle fixtures before enforcement can
be verified. HTTP 200, metadata or mocked tests never establish enforcement.
"""
import argparse
import json
import sys
from pathlib import Path
from urllib.parse import urlparse
import requests
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from voyagr.services.routing.journey_geometry import decode_geometry,IncompleteJourney
from voyagr.utils.geometry import point_in_polygon


def intersects_forbidden(coords,polygons):
    def cross(a,b,c): return (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0])
    def on(a,b,p): return abs(cross(a,b,p))<1e-12 and min(a[0],b[0])<=p[0]<=max(a[0],b[0]) and min(a[1],b[1])<=p[1]<=max(a[1],b[1])
    def intersects(a,b,c,d):
        x,y,z,w=cross(a,b,c),cross(a,b,d),cross(c,d,a),cross(c,d,b)
        return (x*y<0 and z*w<0) or on(a,b,c) or on(a,b,d) or on(c,d,a) or on(c,d,b)
    for polygon in polygons:
        if len(polygon)<3: raise ValueError('Invalid fixture polygon')
        if any(point_in_polygon(*p,polygon) for p in coords): return True
        if any(intersects(a,b,c,d) for a,b in zip(coords,coords[1:]) for c,d in zip(polygon,polygon[1:]+polygon[:1])): return True
    return False


def loopback(url):
    p=urlparse(url)
    if p.scheme not in ('http','https') or p.hostname not in ('127.0.0.1','localhost','::1') or p.username or p.password:
        raise ValueError('Only credential-free loopback provider URLs are permitted')
    return url.rstrip('/')


def run(manifest):
    output={'execution_status':'REAL_ENGINE_EXECUTION_NOT_TESTED','providers':{},'cases':[]}
    for engine,config in manifest['providers'].items():
        base=loopback(config['url']);available=False
        try:
            rv=requests.get(base+config['metadata_path'],timeout=(.5,1),allow_redirects=False)
            available=rv.status_code==200
            metadata=rv.json() if available else {}
            # Preserve useful build/graph declarations, not arbitrary response credentials.
            safe={k:metadata[k] for k in ('version','build_date','import_date','data_date','graph_date','profiles','encoded_values') if k in metadata}
        except (requests.RequestException,ValueError): safe={}
        output['providers'][engine]={'available':available,'installed_metadata':safe,'enforcement':'UNVERIFIED'}
        for case in manifest['cases']:
            result={'engine':engine,'case':case['name'],'status':'NOT_TESTED'}
            fixture=case.get('providers',{}).get(engine)
            if available and manifest.get('graph_fixture_verified') and fixture:
                try:
                    path=fixture['path']
                    if not path.startswith('/') or path.startswith('//') or '://' in path: raise ValueError('Invalid fixture path')
                    url=base+path
                    rv=requests.request(fixture.get('method','POST'),url,json=fixture.get('json'),params=fixture.get('params'),timeout=(2,10),allow_redirects=False)
                    body=rv.json()
                    if fixture.get('expect_no_route'):
                        no_route=rv.status_code in (400,404) or body.get('code')=='NoRoute' or body.get('error_code') in (442,443)
                        result['status']='NO_ROUTE_OBSERVED' if no_route else 'FAILED_EXPECTED_NO_ROUTE'
                    else:
                        if rv.status_code!=200: raise ValueError('Provider error')
                        if engine=='Valhalla':
                            from voyagr.services.routing.journey_geometry import stitch_legs
                            geometry=stitch_legs([{'geometry':l.get('shape'),'geometry_precision':6} for l in body['trip']['legs']])['geometry'];precision=6
                        elif engine=='GraphHopper': geometry=body['paths'][0]['points'];precision=5
                        else: geometry=body['routes'][0]['geometry'];precision=fixture.get('precision',5)
                        coords=decode_geometry(geometry,precision)
                        polygons=fixture.get('forbidden_polygons',[])
                        if polygons:
                            result['status']='FAILED_GEOMETRY_INTERSECTION' if intersects_forbidden(coords,polygons) else 'PASSED_FIXTURE_GEOMETRY_CHECK'
                        else: result['status']='GEOMETRY_VALID_ENFORCEMENT_UNVERIFIED'
                except (requests.RequestException,ValueError,KeyError,IndexError,IncompleteJourney): result['status']='FAILED_REQUEST_OR_GEOMETRY'
            elif available: result['status']='BLOCKED_GRAPH_FIXTURE_REQUIRED'
            output['cases'].append(result)
    if any(c['status'] not in ('NOT_TESTED','BLOCKED_GRAPH_FIXTURE_REQUIRED') for c in output['cases']): output['execution_status']='REAL_ENGINE_EXECUTION_PERFORMED_REVIEW_CASE_RESULTS'
    return output

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--manifest',default='scripts/fixtures/routing-engine-replay.json')
    args=parser.parse_args()
    result=run(json.loads(Path(args.manifest).read_text()))
    print(json.dumps(result,indent=2))
    sys.exit(1 if any(c['status'].startswith('FAILED') for c in result['cases']) else 0)

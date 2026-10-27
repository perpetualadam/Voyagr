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
    if p.scheme not in ('http','https') or p.hostname not in ('127.0.0.1','localhost','::1') or p.username or p.password or p.path not in ('','/') or p.query or p.fragment:
        raise ValueError('Only credential-free loopback provider origins are permitted')
    return url.rstrip('/')


def provider_path(engine,path,metadata=False):
    if not isinstance(path,str) or '?' in path or '#' in path or '..' in path or '%' in path or not path.startswith('/') or path.startswith('//'):
        raise ValueError('Invalid read-only provider path')
    if metadata and (engine,path) in (('Valhalla','/status'),('GraphHopper','/info')):return path
    if engine=='OSRM' and path.startswith('/route/v1/driving/'):return path
    if not metadata and engine in ('Valhalla','GraphHopper') and path=='/route':return path
    raise ValueError('Only documented read-only routing/metadata paths are allowed')


def bounded_request(method,url,**kwargs):
    if method not in ('GET','POST'):raise ValueError('Only routing GET/POST allowed')
    # Never inherit proxy/netrc credentials or follow a redirect outside isolation.
    with requests.Session() as session:
        session.trust_env=False
        with session.request(method,url,timeout=(2,10),allow_redirects=False,stream=True,**kwargs) as response:
            chunks=[];size=0
            for chunk in response.iter_content(65536):
                size+=len(chunk)
                if size>2*1024*1024:raise ValueError('Provider response exceeds replay cap')
                chunks.append(chunk)
            return response.status_code,json.loads(b''.join(chunks))


def is_no_route_response(engine,status,body):
    if not isinstance(body,dict):return False
    if engine=='Valhalla':return status in (400,404) and body.get('error_code') in (442,443)
    if engine=='OSRM':return status in (200,400) and body.get('code')=='NoRoute'
    hints=body.get('hints',[])
    return status in (400,404) and isinstance(hints,list) and any(isinstance(h,dict) and h.get('details')=='com.graphhopper.util.exceptions.ConnectionNotFoundException' for h in hints)


def safe_metadata(metadata):
    safe={k:metadata[k] for k in ('version','build_date','import_date','data_date','graph_date','graph_revision') if isinstance(metadata.get(k),str) and len(metadata[k])<=256}
    if isinstance(metadata.get('profiles'),list):
        safe['profiles']=[p if isinstance(p,str) else {k:p[k] for k in ('name','vehicle','weighting','turn_costs') if isinstance(p.get(k),(str,bool))} for p in metadata['profiles'][:64] if isinstance(p,(str,dict))]
    if isinstance(metadata.get('encoded_values'),list):
        safe['encoded_values']=[p if isinstance(p,str) else p['name'] for p in metadata['encoded_values'][:1000] if isinstance(p,str) or isinstance(p,dict) and isinstance(p.get('name'),str)]
    return safe


def reviewed_oracle(fixture):
    import re
    evidence=fixture.get('oracle',{})
    return isinstance(evidence,dict) and evidence.get('reviewed') is True and isinstance(evidence.get('source_sha256'),str) and re.fullmatch('[0-9a-f]{64}',evidence['source_sha256']) and all(isinstance(evidence.get(k),str) and evidence[k].strip() for k in ('engine_version','graph_revision','profile'))


def geometries(engine,body,fixture):
    if engine=='Valhalla':
        from voyagr.services.routing.journey_geometry import stitch_legs
        geometry=stitch_legs([{'geometry':l.get('shape'),'geometry_precision':6} for l in body['trip']['legs']])['geometry']
        return [decode_geometry(geometry,6)]
    if engine=='GraphHopper':return [decode_geometry(p['points'],5) for p in body['paths']]
    return [decode_geometry(r['geometry'],fixture.get('precision',5)) for r in body['routes']]


def waypoint_order_matches(coords,waypoints,tolerance):
    from voyagr.utils.road_matching import project
    previous=-1
    for point in waypoints:
        candidates=[(distance,i+t) for i,(a,b) in enumerate(zip(coords,coords[1:])) for t,distance,_ in [project(point,a,b)] if i+t>=previous]
        if not candidates:return False
        distance,progress=min(candidates)
        if distance>tolerance:return False
        previous=progress
    return True


def run(manifest,*,approved_local_services=False):
    output={'execution_status':'REAL_ENGINE_EXECUTION_NOT_TESTED','providers':{},'cases':[],'routing_requests_attempted':0}
    if len(manifest.get('providers',{}))>3 or len(manifest.get('cases',[]))*len(manifest.get('providers',{}))>36:raise ValueError('Oversized replay manifest')
    for engine,config in manifest['providers'].items():
        base=loopback(config['url']);path=provider_path(engine,config['metadata_path'],metadata=True);available=False;safe={}
        if approved_local_services:
            try:
                status,metadata=bounded_request('GET',base+path)
                available=status==200 and isinstance(metadata,dict)
                if available:
                    # Scalar build declarations only; arbitrary nested metadata may contain secrets.
                    safe=safe_metadata(metadata)
            except (requests.RequestException,ValueError):pass
        output['providers'][engine]={'available':available,'installed_metadata':safe,'enforcement':'UNVERIFIED','access_approved':approved_local_services}
        for case in manifest['cases']:
            result={'engine':engine,'case':case['name'],'status':'NOT_TESTED'}
            fixture=case.get('providers',{}).get(engine)
            if available and manifest.get('graph_fixture_verified') and fixture and reviewed_oracle(fixture):
                try:
                    if safe.get('version')!=fixture['oracle']['engine_version']:
                        result['status']='BLOCKED_INSTALLED_VERSION_MISMATCH_OR_UNKNOWN';output['cases'].append(result);continue
                    if safe.get('graph_revision') is not None and safe['graph_revision']!=fixture['oracle']['graph_revision']:
                        result['status']='BLOCKED_GRAPH_REVISION_MISMATCH';output['cases'].append(result);continue
                    path=provider_path(engine,fixture['path']);method=fixture.get('method','POST').upper()
                    if engine=='OSRM' and method!='GET':raise ValueError('OSRM replay must use GET')
                    if len(json.dumps({'json':fixture.get('json'),'params':fixture.get('params')}))>65536:raise ValueError('Fixture request exceeds cap')
                    output['routing_requests_attempted']+=1
                    status,body=bounded_request(method,base+path,json=fixture.get('json'),params=fixture.get('params'))
                    if fixture.get('expect_no_route'):
                        result['status']='NO_ROUTE_OBSERVED' if is_no_route_response(engine,status,body) else 'FAILED_EXPECTED_NO_ROUTE'
                    else:
                        if status!=200:raise ValueError('Provider error')
                        routes=geometries(engine,body,fixture)
                        if not routes or len(routes)<fixture.get('minimum_routes',1):raise ValueError('Missing expected alternatives')
                        polygons=fixture.get('forbidden_polygons',[])
                        if any(intersects_forbidden(coords,polygons) for coords in routes):result['status']='FAILED_GEOMETRY_INTERSECTION'
                        elif any(not waypoint_order_matches(coords,fixture.get('required_waypoints',[]),fixture.get('waypoint_tolerance_m',15)) for coords in routes):result['status']='FAILED_WAYPOINT_ORDER'
                        else:result['status']='PASSED_FIXTURE_GEOMETRY_CHECK' if polygons else 'GEOMETRY_VALID_ENFORCEMENT_UNVERIFIED'
                        result['routes_checked']=len(routes)
                except (requests.RequestException,ValueError,KeyError,IndexError,TypeError,IncompleteJourney):result['status']='FAILED_REQUEST_OR_GEOMETRY'
            elif available:result['status']='BLOCKED_REVIEWED_GRAPH_FIXTURE_REQUIRED'
            output['cases'].append(result)
    if output['routing_requests_attempted']:output['execution_status']='REAL_ENGINE_EXECUTION_PERFORMED_REVIEW_CASE_RESULTS'
    return output

if __name__=='__main__':
    from voyagr.utils.road_evidence import read_bounded
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--manifest',default='scripts/fixtures/routing-engine-replay.json')
    parser.add_argument('--approved-local-services',action='store_true',help='Only for explicitly approved isolated local engines')
    args=parser.parse_args()
    result=run(json.loads(read_bounded(args.manifest)),approved_local_services=args.approved_local_services)
    print(json.dumps(result,indent=2))
    sys.exit(1 if any(c['status'].startswith('FAILED') for c in result['cases']) else 0)

"""Selected-route warning scan: whole geometry queried, never complete map claims."""
import math
import time
from voyagr.services.routing.journey_geometry import decode_geometry, geometry_binding
from voyagr.utils.hazard_matching import SegmentIndex, segment_distance
from voyagr.utils.camera_buckets import normalize_camera_hazard_bucket
from voyagr.utils import request_budget as rb

MAX_POINTS = 100000
MAX_QUERY_POINTS = 12000
MAX_RECORDS = 5000
KINDS = ('traffic_light','railway_crossing')


def prepare(data):
    if not isinstance(data,dict): raise ValueError('A route object is required')
    geometry = data.get('geometry')
    if isinstance(geometry,str) and len(geometry)>524288: raise ValueError('Route geometry is too large')
    if isinstance(geometry,list) and len(geometry)>MAX_POINTS: raise ValueError('Too many route points')
    points = decode_geometry(geometry,data.get('geometry_precision',6))
    if len(points)>MAX_POINTS or any(abs(p[0])>85 for p in points): raise ValueError('Unsupported route extent')
    if any(abs(b[1]-a[1])>180 for a,b in zip(points,points[1:])): raise ValueError('Dateline-crossing route unsupported')
    return points,geometry_binding({'geometry':points,'geometry_precision':6})


def simplify_chunk(points):
    """25 m RDP, retaining intermediate vertices on chords longer than 1 km."""
    keep={0,len(points)-1};stack=[(0,len(points)-1)]
    while stack:
        rb.check_budget()
        start,end=stack.pop()
        if end-start<2: continue
        a,b=points[start],points[end]
        span=math.hypot((b[0]-a[0])*110574,(b[1]-a[1])*111320*math.cos(math.radians(a[0])))
        if span>1000:
            split=(start+end)//2
        else:
            error,split=max((segment_distance(*points[i],a,b),i) for i in range(start+1,end))
            if error<=25: continue
        keep.add(split);stack.extend(((start,split),(split,end)))
    return [points[i] for i in sorted(keep)]


def build_queries(points):
    chunks=[];total=0
    for start in range(0,len(points)-1,255):
        chunk=simplify_chunk(points[start:start+256]);total+=len(chunk)
        if total>MAX_QUERY_POINTS: raise ValueError('Route exceeds bounded query detail')
        chunks.append(','.join(f'{lat:.7f},{lon:.7f}' for lat,lon in chunk))
    queries=[];clauses=[]
    header='[out:json][timeout:7][maxsize:2097152];('
    footer=f');out body {MAX_RECORDS+1};'
    for coordinates in chunks:
        for selector in ('["highway"="traffic_signals"]','["railway"="level_crossing"]'):
            clause=f'node{selector}(around:200,{coordinates});'
            if len((header+''.join(clauses)+clause+footer).encode())>60000:
                queries.append(header+''.join(clauses)+footer);clauses=[]
            clauses.append(clause)
    if clauses:queries.append(header+''.join(clauses)+footer)
    if len(queries)>12:raise ValueError('Route exceeds bounded query detail')
    return queries


def scan(points,binding):
    from overpass_helper import query_overpass
    from voyagr.models import get_db_connection,return_db_connection
    parent=rb.current_budget()
    context={'geometry_binding':binding,'query_scope':'SELECTED_ROUTE_CORRIDOR','corridor_m':150,
             'road_association_verified':False,'dataset_completeness_verified':False}
    coverage={kind:{**context,'status':'UNKNOWN','route_scan':'NOT_QUERIED'} for kind in (*KINDS,'cameras')}
    results=[];index=None
    def result():return {'success':True,'geometry_binding':binding,'hazards':results,'warning_coverage':coverage}
    with rb.use_budget(rb.WorkBudget(8,parent=parent)) as budget:
        index=SegmentIndex(points,max_cells=100000,check=rb.check_budget)
        # Camera acquisition is local and independent of Overpass availability.
        connection=None
        try:
            connection=get_db_connection();cursor=connection.cursor()
            dx=150/(111320*max(.05,math.cos(math.radians(max(abs(p[0]) for p in points)))))
            cursor.execute('SELECT lat,lon,type,description FROM cameras WHERE lat BETWEEN ? AND ? AND lon BETWEEN ? AND ? LIMIT 50001',
                           (max(-90,min(p[0] for p in points)-.002),min(90,max(p[0] for p in points)+.002),
                            max(-180,min(p[1] for p in points)-dx),min(180,max(p[1] for p in points)+dx)))
            cameras=cursor.fetchall();seen_cameras=set()
            for number,(lat,lon,kind,description) in enumerate(cameras[:50000]):
                if number%100==0:budget.check()
                if any(type(v) not in (float,int) or not math.isfinite(v) for v in (lat,lon)) or abs(lat)>90 or abs(lon)>180:continue
                canonical=normalize_camera_hazard_bucket(kind)
                key=(lat,lon,canonical)
                if key in seen_cameras:continue
                if any(d<=150 for d,_ in index.nearby(lat,lon,150)):
                    if len(results)>=MAX_RECORDS:break
                    seen_cameras.add(key)
                    results.append({'lat':lat,'lon':lon,'type':canonical,'description':description or '',
                                    'source':'Mapped camera database'})
            limited=len(cameras)>50000 or len(results)>=MAX_RECORDS
            coverage['cameras']={**context,'status':'PARTIAL' if limited else 'AVAILABLE',
                                 'route_scan':'LIMITED' if limited else 'ALL_SEGMENTS_QUERIED',
                                 'reason':'database_snapshot_age_unverified','retrieved_at':time.time()}
        except rb.RoutingDeadlineExceeded:
            if parent is not None:parent.check()
            results.clear();coverage['cameras']['reason']='deadline'
        except Exception:
            coverage['cameras']['reason']='camera_database_unavailable'
        finally:
            if connection is not None:return_db_connection(connection)
        reason='provider_unavailable';sources=[];completed=0;limited=False;malformed=False;seen=set();queries=[]
        try:
            queries=build_queries(points)
            for query in queries:
                budget.check()
                payload=query_overpass(query,cache_ttl=300)
                budget.check()
                if (not isinstance(payload,dict) or payload.get('success') is not True or
                        not isinstance(payload.get('elements'),list) or 'remark' in payload or 'error' in payload):
                    continue
                pending=[];pending_keys=set()
                limited=limited or len(payload['elements'])>MAX_RECORDS
                stamp=payload.get('retrieved_at')
                for number,element in enumerate(payload['elements'][:MAX_RECORDS]):
                    if number%100==0:budget.check()
                    if not isinstance(element,dict):malformed=True;continue
                    tags=element.get('tags');lat,lon=element.get('lat'),element.get('lon')
                    if (element.get('type')!='node' or type(element.get('id')) is not int or element['id']<=0 or not isinstance(tags,dict)
                        or any(type(v) not in (float,int) or not math.isfinite(v) for v in (lat,lon)) or abs(lat)>90 or abs(lon)>180):
                        malformed=True;continue
                    kinds=[]
                    if tags.get('highway')=='traffic_signals':kinds.append('traffic_light')
                    if tags.get('railway')=='level_crossing':kinds.append('railway_crossing')
                    if not kinds:malformed=True;continue
                    if not any(d<=150 for d,_ in index.nearby(lat,lon,150)):continue
                    for kind in kinds:
                        key=(kind,element['id'])
                        if key in seen or key in pending_keys:continue
                        if len(results)+len(pending)>=MAX_RECORDS:limited=True;break
                        pending_keys.add(key)
                        pending.append({'id':f"osm_node_{element['id']}",'lat':lat,'lon':lon,'type':kind,
                                        'source':'Overpass OSM','observed_at_ms':stamp*1000 if type(stamp) in (float,int) and math.isfinite(stamp) else None})
                budget.check()
                results.extend(pending);seen.update(pending_keys);completed+=1;sources.append(payload)
                if limited:break
        except ValueError:reason='geometry_limit'
        except rb.RoutingDeadlineExceeded:
            if parent is not None:parent.check()
            reason='deadline'
        now=time.time();stamps=[source.get('retrieved_at') for source in sources]
        valid=bool(stamps) and all(type(stamp) in (float,int) and math.isfinite(stamp) and stamp<=now for stamp in stamps)
        fresh=valid and all(now-stamp<=300 for stamp in stamps)
        all_parts=bool(queries) and completed==len(queries) and not limited and not malformed
        state=('AVAILABLE' if all_parts else 'PARTIAL') if fresh else 'STALE' if valid else 'UNKNOWN'
        for kind in KINDS:
            coverage[kind]={**context,'status':state,
                'route_scan':'ALL_SEGMENTS_QUERIED' if all_parts else 'LIMITED' if completed else 'NOT_QUERIED',
                'reason':'result_limit' if limited else 'malformed_records' if malformed else 'mapped_records_only' if all_parts else reason,
                'parts_completed':completed,'parts_total':len(queries),
                'retrieved_at':min(stamps) if valid else None,
                'dataset_timestamp':sources[0].get('dataset_timestamp') if sources else None,
                'endpoint_class':sources[0].get('endpoint_class','UNKNOWN') if sources else 'UNKNOWN'}
    return result()

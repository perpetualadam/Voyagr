"""Version 1 source-linked directional matching. PROBABLE is not surveyed truth.

Source files are operator-reviewed inputs, never supplied by request parameters.
Python and browser implementations share fixtures and the same conservative policy.
"""
import math
from voyagr.utils.navigation_evidence import lane_evidence, legal_speed_evidence

VERSION=1
SOURCE_TTL_MS=86400000
FIX_TTL_MS=15000
CELL=.002


def finite(v):
    return isinstance(v,(int,float)) and not isinstance(v,bool) and math.isfinite(v)


def identity(road):
    return {k:road.get(k) for k in ('segment_id','osm_way_id','graph_edge_id','graph_provider','carriageway_id')}


def same_road(a,b):
    if a.get('osm_way_id') is not None and b.get('osm_way_id') is not None:
        return str(a['osm_way_id'])==str(b['osm_way_id'])
    return (a.get('graph_edge_id') is not None and b.get('graph_edge_id') is not None
            and bool(a.get('graph_provider')) and a.get('graph_provider')==b.get('graph_provider')
            and str(a['graph_edge_id'])==str(b['graph_edge_id']))


def bearing(a,b):
    return math.degrees(math.atan2((b[1]-a[1])*math.cos(math.radians(a[0])),b[0]-a[0]))%360


def distance(a,b):
    return math.hypot((b[1]-a[1])*111320*math.cos(math.radians(a[0])),(b[0]-a[0])*110574)


def project(p,a,b):
    x=111320*math.cos(math.radians(p[0]));y=110574
    ax=(a[1]-p[1])*x;ay=(a[0]-p[0])*y;dx=(b[1]-a[1])*x;dy=(b[0]-a[0])*y
    t=max(0,min(1,-(ax*dx+ay*dy)/(dx*dx+dy*dy))) if dx or dy else 0
    return t,math.hypot(ax+t*dx,ay+t*dy),[a[0]+t*(b[0]-a[0]),a[1]+t*(b[1]-a[1])]


class RoadIndex:
    """Bounded grid of source segments; no network in the GPS hot path."""
    def __init__(self,dataset):
        self.dataset=dataset if isinstance(dataset,dict) else {}
        self.grid={};self.segments=[];self.invalid=False;refs=0;graph_ids={}
        restrictions=self.dataset.get('restrictions',[])
        if not isinstance(restrictions,list) or len(restrictions)>10000 or any(not isinstance(r,dict) for r in restrictions):self.invalid=True;return
        roads=self.dataset.get('roads',[])
        if not isinstance(roads,list) or len(roads)>20000: self.invalid=True;return
        for ri,road in enumerate(roads):
            if not isinstance(road,dict) or not isinstance(road.get('tags',{}),dict): self.invalid=True;continue
            if any(not isinstance(k,str) or not isinstance(v,str) for k,v in road.get('tags',{}).items()):self.invalid=True;continue
            key=(road.get('graph_provider'),str(road.get('graph_edge_id')))
            if all(v is not None for v in key) and road.get('graph_edge_id') is not None:
                if key in graph_ids and graph_ids[key]!=road.get('osm_way_id'):self.invalid=True;continue
                graph_ids[key]=road.get('osm_way_id')
            g=road.get('geometry');nodes=road.get('node_ids') or []
            if not isinstance(g,list) or not 2<=len(g)<=20000 or any(not isinstance(p,list) or len(p)!=2 or not all(finite(v) for v in p) or abs(p[0])>90 or abs(p[1])>180 for p in g):
                self.invalid=True;continue
            if nodes and (not isinstance(nodes,list) or len(nodes)!=len(g)):self.invalid=True;continue
            along=0
            for i,(a,b) in enumerate(zip(g,g[1:])):
                length=distance(a,b)
                if length<=0:continue
                x0,x1=sorted((math.floor(a[1]/CELL),math.floor(b[1]/CELL)));y0,y1=sorted((math.floor(a[0]/CELL),math.floor(b[0]/CELL)))
                cells=(x1-x0+1)*(y1-y0+1)
                if cells>1000 or refs+cells>200000:self.invalid=True;return
                refs+=cells
                if len(self.segments)>=100000:self.invalid=True;return
                idx=len(self.segments);self.segments.append(dict(road=road,road_index=ri,segment=i,a=a,b=b,along=along,length=length));along+=length
                for x in range(x0,x1+1):
                    for y in range(y0,y1+1):self.grid.setdefault((x,y),[]).append(idx)

    def nearby(self,p,radius):
        dx=radius/(111320*max(.05,math.cos(math.radians(p[0]))));dy=radius/110574;ids=set()
        for x in range(math.floor((p[1]-dx)/CELL),math.floor((p[1]+dx)/CELL)+1):
            for y in range(math.floor((p[0]-dy)/CELL),math.floor((p[0]+dy)/CELL)+1):ids.update(self.grid.get((x,y),()))
        return [self.segments[i] for i in sorted(ids)]


def match_position(position,index,*,previous=None,now,route_generation=0,active_route_id=None,vehicle='car'):
    d=index.dataset;c=position.get('coords',{});stamp=position.get('timestamp')
    result=dict(schema_version=VERSION,segment_id=None,osm_way_id=None,graph_edge_id=None,graph_provider=None,
        carriageway_id=None,route_segment_index=None,direction=None,matched_coordinate=None,distance_m=None,
        gps_accuracy_m=c.get('accuracy'),heading_difference_deg=None,confidence='NONE',data_source=d.get('source'),
        source_revision=d.get('revision'),source_acquired_at_ms=d.get('acquired_at_ms'),evidence_status='UNMATCHED',
        active_route_id=active_route_id,route_generation=route_generation,match_timestamp_ms=stamp,
        attributes_allowed=False,source_link_verified=False,reason='Insufficient evidence',node_ids=[])
    def outcome(state,reason):return dict(result,evidence_status=state,reason=reason)
    if not all(finite(v) for v in (c.get('latitude'),c.get('longitude'),c.get('accuracy'),stamp,now)) or abs(c['latitude'])>90 or abs(c['longitude'])>180 or not 0<=c['accuracy']<=35:return outcome('UNMATCHED','Invalid or inaccurate GPS')
    if not -1000<=now-stamp<=FIX_TTL_MS:return outcome('STALE','GPS age outside policy')
    if previous and finite(previous.get('match_timestamp_ms')) and stamp<=previous['match_timestamp_ms']:return outcome('STALE','Out-of-order GPS')
    if d.get('schema_version')!=VERSION or index.invalid or not d.get('source') or not d.get('revision'):return outcome('UNMATCHED','Invalid source context')
    acquired=d.get('acquired_at_ms')
    if not finite(acquired) or not 0<=now-acquired<=SOURCE_TTL_MS:return outcome('STALE','Road source age outside policy')
    p=[c['latitude'],c['longitude']];bounds=d.get('bounds')
    if not isinstance(bounds,list) or len(bounds)!=4 or not all(finite(v) for v in bounds) or not bounds[0]<=p[0]<=bounds[2] or not bounds[1]<=p[1]<=bounds[3]:return outcome('UNMATCHED','Outside source coverage')
    qualified=finite(c.get('heading')) and 0<=c['heading']<360 and finite(c.get('speed')) and 3<=c['speed']<=80 and c['accuracy']<=15 and (c.get('headingAccuracy') is None or finite(c['headingAccuracy']) and 0<=c['headingAccuracy']<=30)
    candidates=[]
    for segment in index.nearby(p,max(12,c['accuracy'])):
        t,dist,coord=project(p,segment['a'],segment['b'])
        if dist>max(12,c['accuracy']):continue
        road=segment['road'];tags=road.get('tags',{});one=str(tags.get('oneway','')).lower()
        dirs=['backward'] if one=='-1' else ['forward'] if one in ('yes','1','true') or tags.get('junction')=='roundabout' and one not in ('no','0','false') else ['forward','backward']
        for direction in dirs:
            travel=(bearing(segment['a'],segment['b'])+(180 if direction=='backward' else 0))%360
            delta=abs((travel-c.get('heading',0)+180)%360-180) if qualified else None
            if qualified and delta>45:continue
            candidates.append(dict(segment,coordinate=coord,distance=dist,direction=direction,delta=delta,progress=segment['along']+t*segment['length']))
    if not candidates:return outcome('UNMATCHED','No direction-compatible road candidate')
    # Adjacent pieces of one source way are one hypothesis; distant self-overlaps are not.
    groups=[]
    for candidate in sorted(candidates,key=lambda x:(x['road_index'],x['direction'],x['segment'])):
        if groups and candidate['road_index']==groups[-1][-1]['road_index'] and candidate['direction']==groups[-1][-1]['direction'] and candidate['segment']<=groups[-1][-1]['segment']+1:groups[-1].append(candidate)
        else:groups.append([candidate])
    if len(groups)!=1:return outcome('AMBIGUOUS','Multiple road/direction hypotheses remain')
    best=min(groups[0],key=lambda x:x['distance']);road=best['road'];nodes=road.get('node_ids') or []
    prev=previous if previous and previous.get('source_revision')==d['revision'] and previous.get('route_generation')==route_generation else None
    gap=(stamp-prev['match_timestamp_ms'])/1000 if prev and finite(prev.get('match_timestamp_ms')) else None
    continuous=prev is not None and gap is not None and 0<gap<=15 and prev.get('evidence_status')=='PROBABLE'
    if continuous:
        if not same_road(prev,road):
            shared=set(str(n) for n in prev.get('node_ids',[])) & set(str(n) for n in nodes)
            if not shared:return outcome('AMBIGUOUS','Transition lacks source connectivity')
            previous_road=next((r for r in d.get('roads',[]) if same_road(prev,r)),None)
            def node_offset(r,node):
                total=0
                for i,n in enumerate(r.get('node_ids',[])):
                    if str(n)==node:return total
                    if i+1<len(r['geometry']):total+=distance(r['geometry'][i],r['geometry'][i+1])
                return float('inf')
            cost=min((abs(node_offset(previous_road,n)-prev.get('along_road_m',0))+abs(node_offset(road,n)-best['progress']) for n in shared),default=float('inf')) if previous_road else float('inf')
            if cost>max(10,c.get('speed') if finite(c.get('speed')) else 0)*gap+2*c['accuracy']+20:return outcome('AMBIGUOUS','Connectivity exists only beyond plausible travel distance')
            for restriction in d.get('restrictions',[]):
                if str(restriction.get('from_way'))==str(prev.get('osm_way_id')) and str(restriction.get('via_node')) in shared:
                    target=str(road.get('osm_way_id'));kind=restriction.get('restriction','')
                    if kind.startswith('no_') and str(restriction.get('to_way'))==target or kind.startswith('only_') and str(restriction.get('to_way'))!=target:return outcome('AMBIGUOUS','Source turn restriction conflicts')
        if prev.get('matched_coordinate') and distance(prev['matched_coordinate'],best['coordinate'])>max(10,c.get('speed') if finite(c.get('speed')) else 0)*gap+2*c['accuracy']+20:return outcome('AMBIGUOUS','Implausible transition distance')
        if same_road(prev,road) and prev.get('direction')!=best['direction']:continuous=False
    ids=identity(road);linked=ids['osm_way_id'] is not None or ids['graph_edge_id'] is not None and bool(ids['graph_provider'])
    access=road.get('tags',{});allowed=access.get('access') not in ('no','private') and access.get('motor_vehicle') not in ('no','private') and access.get('motorcar' if vehicle=='car' else 'motorcycle') not in ('no','private') and not any('conditional' in k for k in access) and vehicle in ('car','motorcycle')
    result.update(ids,evidence_status='PROBABLE',confidence='HIGH' if qualified and continuous else 'LOW',direction=best['direction'],
        matched_coordinate=best['coordinate'],distance_m=best['distance'],heading_difference_deg=best['delta'],
        source_link_verified=linked,node_ids=nodes,source_road_index=best['road_index'],source_segment_index=best['segment'],
        along_road_m=best['progress'],reason='Unique source hypothesis; probabilistic position, not surveyed truth',
        attributes_allowed=bool(qualified and continuous and linked and allowed and d.get('coverage')=='COMPLETE' and not any(r.get('unsupported') for r in d.get('restrictions',[])) and all(distance(p,[p[0],bound])>max(12,c['accuracy']) for bound in (bounds[1],bounds[3])) and all(distance(p,[bound,p[1]])>max(12,c['accuracy']) for bound in (bounds[0],bounds[2]))))
    return result


def attribute_bundle(road,match,*,vehicle='car',now):
    from voyagr.utils.navigation_evidence import TURNS
    allowed=match.get('attributes_allowed') is True and match.get('evidence_status')=='PROBABLE'
    context=dict(road_matched=allowed,direction=match.get('direction'))
    lanes={m:lane_evidence(road.get('tags',{}),**context,maneuver=m,vehicle=vehicle) for m in TURNS}
    for evidence in lanes.values():
        if evidence['evidence_state']=='EXPLICIT':
            evidence.update(has_turn_lanes=True,source='matched_directional_source',source_revision=match.get('source_revision'),osm_way_id=road.get('osm_way_id'),direction=match.get('direction'))
    return {'speed':legal_speed_evidence(road.get('tags',{}),**context,vehicle=vehicle,jurisdiction=road.get('jurisdiction'),
                observed_at=(match.get('source_acquired_at_ms') or 0)/1000,now=now/1000),'lanes':lanes}


def hazard_association(match,hazard,now):
    """Never clear an uncertain/stale hazard or compare IDs from different namespaces."""
    stamp=hazard.get('observed_at_ms')
    if match.get('evidence_status')!='PROBABLE' or not match.get('attributes_allowed') or not finite(match.get('match_timestamp_ms')) or not 0<=now-match['match_timestamp_ms']<=FIX_TTL_MS or not finite(stamp) or not 0<=now-stamp<=600000:return 'POSSIBLE'
    until=hazard.get('valid_until')
    if until is not None and (not finite(until) or until<now/1000):return 'POSSIBLE'
    if hazard.get('average_speed_section_id') is not None and hazard['average_speed_section_id']!=match.get('average_speed_section_id'):return 'POSSIBLE'
    uncertainty=hazard.get('position_uncertainty_m',20)
    if not finite(uncertainty) or not 0<=uncertainty<=35:return 'POSSIBLE'
    comparable=match.get('osm_way_id') is not None and hazard.get('osm_way_id') is not None or match.get('graph_edge_id') is not None and hazard.get('graph_edge_id') is not None and bool(match.get('graph_provider')) and match.get('graph_provider')==hazard.get('graph_provider')
    if not comparable:return 'POSSIBLE'
    if not same_road(match,hazard):return 'UNRELATED'
    if match.get('carriageway_id') is not None and hazard.get('carriageway_id') is not None and match['carriageway_id']!=hazard['carriageway_id']:return 'UNRELATED'
    direction=hazard.get('direction')
    if direction in ('forward','backward') and match.get('direction') in ('forward','backward') and direction!=match['direction']:return 'UNRELATED'
    if direction=='both' or direction==match.get('direction'):return 'APPLICABLE'
    return 'POSSIBLE'

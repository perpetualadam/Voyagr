"""Fixture/source validation, never angle-based exit numbering or surveyed truth.

Not a replacement routing engine. Missing source connectivity/access/restrictions
returns UNVERIFIED. Consumers must not promote this to a deployed graph claim.
"""
from voyagr.utils.road_matching import SOURCE_TTL_MS, finite


def eligible_outbound(road,node,vehicle):
    tags=road.get('tags',{});nodes=road.get('node_ids',[])
    if not nodes or node not in nodes:return False
    if any('conditional' in k for k in tags):return None
    if tags.get('access') in ('no','private') or tags.get('motor_vehicle') in ('no','private') or tags.get('highway') in ('footway','path','cycleway','steps','pedestrian'):return False
    if vehicle not in ('car','motorcycle'):return None
    one=str(tags.get('oneway','')).lower()
    if one in ('yes','1','true'):return nodes[0]==nodes[-1] or node!=nodes[-1]
    if one=='-1':return node!=nodes[0]
    return True


def validate_roundabout(dataset,node_path,exit_way_id,provider_exit_count,*,now,vehicle='car'):
    unknown={'status':'UNVERIFIED','exit_count':None,'instruction':'Follow the roundabout exit signs'}
    age=dataset.get('acquired_at_ms')
    if dataset.get('coverage')!='COMPLETE' or not finite(age) or not 0<=now-age<=SOURCE_TTL_MS or len(node_path)<2:return unknown
    roads=dataset.get('roads',[]);ring=[r for r in roads if r.get('tags',{}).get('junction') in ('roundabout','circular')]
    # Every travelled link must exist in a traversable directed ring way.
    for a,b in zip(node_path,node_path[1:]):
        if not any(eligible_outbound(r,a,vehicle) is True and any(x==a and y==b for x,y in zip(r.get('node_ids',[]),r.get('node_ids',[])[1:])) for r in ring):return unknown
    if any(r.get('unsupported') for r in dataset.get('restrictions',[])):return unknown
    count=0
    for node in node_path[1:]:
        exits=[]
        for r in roads:
            if r in ring:continue
            allowed=eligible_outbound(r,node,vehicle)
            if allowed is None:return unknown
            if not allowed:continue
            if any(str(t.get('via_node'))==str(node) and str(t.get('to_way'))==str(r.get('osm_way_id')) for t in dataset.get('restrictions',[])):return unknown
            exits.append(r)
        ids={r.get('osm_way_id') for r in exits}
        if None in ids or len(ids)>1:return unknown  # multiple distinct outlets at one node need richer junction topology
        if ids:count+=1
        if node==node_path[-1] and str(exit_way_id) not in {str(x) for x in ids}:return unknown
    if not count:return unknown
    valid=isinstance(provider_exit_count,int) and not isinstance(provider_exit_count,bool) and provider_exit_count==count
    return dict(unknown,status='VERIFIED_AGAINST_SOURCE' if valid else 'CONFLICTING',exit_count=count if valid else None,
                source_revision=dataset.get('revision'),reason='Directed traversable source branches, not angles or surveyed truth')

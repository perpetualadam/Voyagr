"""Read-only schema/provenance QC. Valid mapped evidence is not surveyed truth."""
import json
import math
import re
import time
from pathlib import Path
from voyagr.utils.road_matching import RoadIndex,finite,SOURCE_TTL_MS

MAX_SOURCE_BYTES=4*1024*1024
MAX_EVIDENCE_BYTES=10*1024*1024


def read_bounded(path,limit=MAX_SOURCE_BYTES):
    with Path(path).open('rb') as handle:raw=handle.read(limit+1)
    if len(raw)>limit:raise ValueError('Input exceeds bounded evidence size')
    return raw


def write_new_json(path,value,limit=MAX_EVIDENCE_BYTES):
    raw=(json.dumps(value,indent=2,allow_nan=False)+'\n').encode('utf-8')
    if len(raw)>limit:raise ValueError('Output exceeds bounded evidence size')
    # Exclusive creation prevents overwriting source files or live configuration.
    with Path(path).open('xb') as handle:handle.write(raw)


def validate_evidence(data,now=None,index=None):
    now=time.time()*1000 if now is None else now
    errors=[];warnings=[]
    result={'schema_version':1,'source_state':'SOURCE_UNAVAILABLE' if data is None else 'SOURCE_CONFLICTING','valid':False,'errors':errors,'warnings':warnings,'coverage':'UNKNOWN',
            'hazard_coverage':'UNKNOWN','attribute_eligible':False,'surveyed_truth':False}
    if not isinstance(data,dict):errors.append('Evidence must be an object');return result
    if data.get('schema_version')!=1:errors.append('Unsupported evidence schema')
    for name in ('source','revision'):
        if not isinstance(data.get(name),str) or not data[name].strip():errors.append('Missing '+name)
    bounds=data.get('bounds')
    valid_bounds=isinstance(bounds,list) and len(bounds)==4 and all(finite(v) for v in bounds) and -90<=bounds[0]<bounds[2]<=90 and -180<=bounds[1]<bounds[3]<=180
    if not valid_bounds:errors.append('Invalid lat/lon coverage bounds')
    if data.get('coordinate_order','lat,lon')!='lat,lon':errors.append('Unsupported coordinate order')
    coverage=data.get('coverage','UNKNOWN');result['coverage']=coverage
    if coverage not in ('COMPLETE','PARTIAL','UNKNOWN'):errors.append('Invalid coverage status')
    if coverage!='COMPLETE':warnings.append('Coverage is incomplete; absence is not proof of no road or hazard')
    acquired=data.get('acquired_at_ms');fresh=finite(acquired) and 0<=now-acquired<=SOURCE_TTL_MS
    if not finite(acquired) or acquired<=0 or acquired>now:errors.append('Invalid/future source observation time')
    elif not fresh:warnings.append('STALE source observation')
    source_data=data.get('source_data_at_ms')
    if source_data is not None:
        if not finite(source_data) or source_data>now:errors.append('Invalid source data timestamp')
        elif not fresh or now-source_data>SOURCE_TTL_MS:fresh=False;warnings.append('STALE source snapshot')
    if data.get('source_kind')=='SYNTHETIC':warnings.append('Synthetic evidence is not a live authority')
    if data.get('source_kind')=='OSM_EXTRACT':
        if not data.get('attribution') or data.get('licence')!='ODbL-1.0':errors.append('OSM attribution/licence missing')
    digest=data.get('source_sha256')
    if digest is not None and (not isinstance(digest,str) or not re.fullmatch('[0-9a-f]{64}',digest)):errors.append('Invalid source digest')
    try:
        idx=index or RoadIndex(data)
        if idx.invalid:errors.append('Invalid geometry, identifiers, node references or conflicting connectivity')
    except (TypeError,ValueError,KeyError,OverflowError):errors.append('Malformed road graph')
    roads=data.get('roads',[])
    if not isinstance(roads,list):return result
    ways={str(r['osm_way_id']) for r in roads if isinstance(r,dict) and r.get('osm_way_id') is not None}
    nodes={str(n) for r in roads if isinstance(r,dict) and isinstance(r.get('node_ids'),list) for n in r['node_ids']}
    unsupported=False
    for road in roads:
        if not isinstance(road,dict):continue
        tags=road.get('tags',{})
        if not isinstance(tags,dict) or any(not isinstance(k,str) or not isinstance(v,str) for k,v in tags.items()):continue
        one=tags.get('oneway')
        if one not in (None,'yes','no','1','0','true','false','-1','reversible','alternating'):errors.append('Unknown one-way encoding')
        if one in ('reversible','alternating') or any('conditional' in k for k in tags):warnings.append('Conditional direction/access requires independent applicability');unsupported=True
        if tags.get('bridge')=='yes' and tags.get('tunnel')=='yes':errors.append('Conflicting bridge/tunnel attributes')
        if 'layer' in tags:
            try:
                if not math.isfinite(float(tags['layer'])):raise ValueError()
            except (ValueError,TypeError):errors.append('Invalid road layer')
        for direction in ('forward','backward'):
            count=tags.get('lanes:'+direction);turns=tags.get('turn:lanes:'+direction)
            if count and turns and (not count.isdigit() or int(count)!=len(turns.split('|'))):warnings.append('Lane count/turn tokens disagree');unsupported=True
        if road.get('osm_way_id') is None and road.get('graph_edge_id') is None:warnings.append('Source road lacks stable identifier');unsupported=True
    for restriction in data.get('restrictions',[]) if isinstance(data.get('restrictions',[]),list) else []:
        if not isinstance(restriction,dict):continue
        if restriction.get('unsupported'):unsupported=True;warnings.append('Unsupported restriction retained');continue
        kind=restriction.get('restriction')
        if not isinstance(kind,str) or not kind.startswith(('no_','only_')):errors.append('Invalid restriction encoding')
        if str(restriction.get('from_way')) not in ways or str(restriction.get('to_way')) not in ways or str(restriction.get('via_node')) not in nodes:
            errors.append('Restriction has unresolved way/node references')
    result['valid']=not errors
    result['attribute_eligible']=not errors and fresh and coverage=='COMPLETE' and not unsupported and data.get('source_kind') in ('OSM_EXTRACT','REVIEWED_PROVIDER')
    result['source_state']=('SOURCE_CONFLICTING' if errors else 'SOURCE_STALE' if not fresh else 'SOURCE_VALIDATED' if result['attribute_eligible'] else 'SOURCE_PARTIAL')
    result['road_count']=len(roads)
    result['errors']=list(dict.fromkeys(errors));result['warnings']=list(dict.fromkeys(warnings))
    return result

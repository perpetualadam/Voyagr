"""Read-only operator-reviewed road evidence. No live OSM/API calls or request paths."""
import copy
import hashlib
import json
import os
import threading
import time
from voyagr.utils.road_matching import RoadIndex, attribute_bundle, SOURCE_TTL_MS, finite

_lock=threading.Lock()
_cache=None


def load_context():
    global _cache
    path=os.environ.get('VOYAGR_ROAD_EVIDENCE_FILE')
    if not path:return None
    try:
        stat=os.stat(path)
        if stat.st_size>10*1024*1024:return None
        key=(path,stat.st_mtime_ns,stat.st_size)
        with _lock:
            if _cache and _cache[0]==key:return _cache[1]
            with open(path,'rb') as f:raw=f.read(10*1024*1024+1)
            if len(raw)>10*1024*1024:return None
            context=json.loads(raw)
            if not isinstance(context,dict):return None
            bounds=context.get('bounds')
            if not isinstance(bounds,list) or len(bounds)!=4 or not all(finite(v) for v in bounds) or not (-90<=bounds[0]<bounds[2]<=90 and -180<=bounds[1]<bounds[3]<=180) or not finite(context.get('acquired_at_ms')):return None
            if any(r.get('jurisdiction') is not None and not isinstance(r['jurisdiction'],str) for r in context.get('roads',[]) if isinstance(r,dict)):return None
            index=RoadIndex(context)
            from voyagr.utils.road_evidence import validate_evidence
            quality=validate_evidence(context,index=index)
            if not quality['valid']:return None
            if not quality['attribute_eligible']:context=dict(context,coverage='PARTIAL')
            if index.invalid or context.get('schema_version')!=1 or context.get('source_kind') not in ('OSM_EXTRACT','REVIEWED_PROVIDER'):return None
            # Revision binds the complete trusted source input, not frontend IDs.
            context=copy.deepcopy(context);context['revision']=hashlib.sha256(raw).hexdigest()
            _cache=(key,context)
            return context
    except (OSError,ValueError,TypeError,KeyError):return None


def local_context(lat,lon,vehicle='car',now=None):
    now=time.time()*1000 if now is None else now
    context=load_context()
    if context is None:return None
    bounds=context.get('bounds',[]);acquired=context.get('acquired_at_ms')
    if len(bounds)!=4 or not isinstance(acquired,(int,float)) or not 0<=now-acquired<=SOURCE_TTL_MS:return None
    if not bounds[0]<=lat<=bounds[2] or not bounds[1]<=lon<=bounds[3]:return None
    # Return a bounded 0.01° tile including whole intersecting ways. Border coverage
    # shrinks 50m; crossing it triggers a new context request rather than false absence.
    south=max(bounds[0],lat-.005);west=max(bounds[1],lon-.005)
    north=min(bounds[2],lat+.005);east=min(bounds[3],lon+.005)
    roads=[]
    for road in context['roads']:
        g=road['geometry']
        if max(p[0] for p in g)<south or min(p[0] for p in g)>north or max(p[1] for p in g)<west or min(p[1] for p in g)>east:continue
        item=copy.deepcopy(road);item['attribute_bundles']={}
        for direction in ('forward','backward'):
            match=dict(attributes_allowed=True,evidence_status='PROBABLE',direction=direction,source_acquired_at_ms=acquired)
            item['attribute_bundles'][direction]=dict(attribute_bundle(road,match,vehicle=vehicle,now=now),vehicle=vehicle)
        roads.append(item)
        if len(roads)>1000:return None
    result=dict(context,roads=roads,bounds=[south,west,north,east],vehicle=vehicle,served_at_ms=now)
    if len(json.dumps(result))>2*1024*1024:return None
    return result

"""Bounded mapped warning observations, independent of avoidance preferences."""
import copy
import math
from voyagr.utils import request_budget as rb
from voyagr.utils.hazard_matching import HazardDataset, HazardList

MAX_AREAS = 4
AREA_SPAN = 0.30
WARNING_CORRIDOR_M = 150
KINDS = ('traffic_light', 'railway_crossing')


def is_mapped_warning_kind(kind):
    return isinstance(kind,str) and (kind in KINDS or kind == 'camera' or kind.startswith('camera_'))


def planning_areas(points):
    """Cover small planning bounds, or sample bounded areas across all visit segments."""
    if (not points or any(len(p)!=2 or any(type(v) not in (int,float) or not math.isfinite(v) for v in p)
                          or abs(p[0])>90 or abs(p[1])>180 for p in points)
            or any(abs(b[1]-a[1])>180 for a,b in zip(points,points[1:]))):
        return []
    south, north = min(p[0] for p in points), max(p[0] for p in points)
    west, east = min(p[1] for p in points), max(p[1] for p in points)
    if north-south <= AREA_SPAN-.004 and east-west <= AREA_SPAN-.004:
        return [(max(-90,south-.002), min(90,north+.002), max(-180,west-.002), min(180,east+.002))]
    lengths = [math.hypot(b[0]-a[0], b[1]-a[1]) for a,b in zip(points,points[1:])]
    total = sum(lengths)
    if not total:
        return []
    result = []
    for index in range(MAX_AREAS):
        remaining = total*index/(MAX_AREAS-1)
        for i,length in enumerate(lengths):
            if remaining <= length or i == len(lengths)-1:
                fraction = min(1,remaining/length) if length else 0
                lat = points[i][0]+fraction*(points[i+1][0]-points[i][0])
                lon = points[i][1]+fraction*(points[i+1][1]-points[i][1])
                box = (max(-90,lat-.15),min(90,lat+.15),max(-180,lon-.15),min(180,lon+.15))
                if box not in result:
                    result.append(box)
                break
            remaining -= length
    return result


def collect(points, cameras):
    """At most eight Overpass calls under one eight-second child budget, no backlog."""
    from voyagr.services import hazards as service
    found = HazardDataset({key:copy.deepcopy(rows) for key,rows in cameras.items()
                           if key == 'camera' or key.startswith('camera_')})
    areas = planning_areas(points)
    for kind in KINDS:
        found[kind] = HazardList(coverage={'status':'UNKNOWN','source':'Overpass OSM'})
    parent = rb.current_budget()
    with rb.use_budget(rb.WorkBudget(8, parent=parent)) as budget:
        for kind, fetch in (('traffic_light',service.fetch_traffic_lights_osm_bbox),
                            ('railway_crossing',service.fetch_railway_crossings_osm_bbox)):
            rows, seen, acquired = found[kind], set(), 0
            coverages = []
            for area in areas:
                try:
                    budget.check()
                    data = fetch(*area)
                    budget.check()
                except rb.RoutingDeadlineExceeded:
                    if parent is not None:
                        parent.check()
                    if budget.remaining() > 0:
                        raise
                    break
                except Exception:
                    coverages.append({'status':'UNKNOWN'})
                    continue
                item_coverage = getattr(data,'coverage',{'status':'UNKNOWN'})
                if data or item_coverage.get('status') in ('AVAILABLE','PARTIAL','STALE'):
                    acquired += 1
                coverages.append(item_coverage)
                for row in data:
                    if not isinstance(row,dict): continue
                    identity = (row.get('id'),row.get('lat'),row.get('lon'))
                    if identity in seen: continue
                    seen.add(identity)
                    rows.append({**row,'type':kind})
            # One acquired area retains its original geographic coverage. A sampled
            # union must never certify the gaps between its areas as complete.
            status = coverages[0].get('status','UNKNOWN') if len(areas)==len(coverages)==acquired==1 else 'PARTIAL' if acquired else 'UNKNOWN'
            if any(c.get('status')=='STALE' for c in coverages):
                status = 'STALE'
            rows.coverage = {**(coverages[0] if len(areas)==len(coverages)==1 else {}), 'status':status,
                             'source':'Overpass OSM','reason':'bounded_planning_areas',
                             'planned_area_count':len(areas),'acquired_area_count':acquired,
                             'areas':areas,'area_coverage':coverages,
                             'retrieved_at':min((c['retrieved_at'] for c in coverages if isinstance(c.get('retrieved_at'),(int,float))),default=None)}
    return found


def attach(avoidance, observations):
    result = HazardDataset(avoidance, coverage=getattr(avoidance,'coverage',{}))
    result.warning_observations = copy.deepcopy(observations)
    return result


def coverage(hazards):
    observations = getattr(hazards, 'warning_observations', {})
    return {kind:copy.deepcopy(getattr(observations.get(kind), 'coverage', {'status':'UNKNOWN'}))
            for kind in KINDS}

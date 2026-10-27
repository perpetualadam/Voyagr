"""Validated journey geometry; never fill missing roads with straight-line connectors."""
import copy
import math
import polyline
from voyagr.utils.geometry import get_distance_between_points

class IncompleteJourney(ValueError):
    pass


def decode_geometry(geometry, precision=6):
    if precision not in (5,6): raise IncompleteJourney('Unsupported geometry precision')
    try:
        if isinstance(geometry,str): points=polyline.decode(geometry,precision=precision)
        elif isinstance(geometry,dict):
            kind=geometry.get('type')
            raw=geometry.get('coordinates')
            if kind=='MultiLineString':
                points=[]
                for line in raw:
                    part=decode_geometry({'type':'LineString','coordinates':line},precision)
                    if points and distance(points[-1],part[0])>2: raise IncompleteJourney('Disconnected MultiLineString')
                    points.extend(part[1:] if points else part)
            elif kind=='LineString': points=[(p[1],p[0]) for p in raw]
            else: raise IncompleteJourney('Unsupported geometry type')
        elif isinstance(geometry,list): points=[tuple(p) for p in geometry]
        else: raise IncompleteJourney('Missing leg geometry')
        if len(points)<2 or any(len(p)!=2 or any(isinstance(v,bool) or not isinstance(v,(int,float)) or not math.isfinite(v) for v in p) or abs(p[0])>90 or abs(p[1])>180 for p in points):
            raise IncompleteJourney('Invalid geometry coordinates')
        if all(p==points[0] for p in points): raise IncompleteJourney('Degenerate leg geometry')
        return points
    except (TypeError,IndexError,KeyError,ValueError,OverflowError) as error:
        raise IncompleteJourney('Invalid or missing leg geometry') from error


def distance(a,b):
    return get_distance_between_points(*a,*b)


def geometry_binding(route):
    """FNV-1a over quantized vertices: consistency checksum, not authentication."""
    try: coords=decode_geometry(route.get('geometry'),route.get('geometry_precision',6))
    except IncompleteJourney: return None
    h=2166136261
    for lat,lon in coords:
        for byte in f'{math.floor(lat*1e6+.5)},{math.floor(lon*1e6+.5)};'.encode('ascii'):
            h=((h^byte)*16777619)&0xffffffff
    return f'{h:08x}'


def stitch_legs(legs):
    if not isinstance(legs,list) or not legs: raise IncompleteJourney('No journey legs')
    coords=[];maneuvers=[];ranges=[]
    for n,leg in enumerate(legs):
        points=decode_geometry(leg.get('geometry'),leg.get('geometry_precision',6))
        for field,point in (('from',points[0]),('to',points[-1])):
            waypoint=leg.get(field)
            if waypoint is not None and distance(point,(waypoint['lat'],waypoint['lon']))>75:
                raise IncompleteJourney('Leg endpoint does not match its waypoint')
        if coords and distance(coords[-1],points[0])>2: raise IncompleteJourney('Disconnected journey legs')
        offset=len(coords)-1 if coords else 0
        coords.extend(points[1:] if coords else points)
        ranges.append({'leg_index':n,'begin_shape_index':offset,'end_shape_index':len(coords)-1,
                       'stop':copy.deepcopy(leg.get('stop')),'waypoint':copy.deepcopy(leg.get('to'))})
        for maneuver in leg.get('maneuvers',[]) or []:
            m=copy.deepcopy(maneuver)
            for field in ('begin_shape_index','end_shape_index'):
                i=m.get(field)
                if i is not None:
                    if isinstance(i,bool) or not isinstance(i,int) or not 0<=i<len(points): raise IncompleteJourney('Invalid maneuver shape index')
                    m[field]=offset+i
            m['leg_index']=n
            if n<len(legs)-1 and m.get('type') in (4,5,6): m['intermediate_arrival']=True
            maneuvers.append(m)
    return {'geometry':polyline.encode(coords,precision=6),'geometry_precision':6,
            'maneuvers':maneuvers,'leg_geometry_ranges':ranges,'geometry_complete':True}


def valhalla_journey(trip,length_in_meters=False):
    """Normalize only multi-leg trips, preserving existing single-leg responses."""
    raw=trip.get('legs',[]) or []
    if len(raw)<2: return None
    from voyagr.services.routing.maneuvers import extract_valhalla_maneuvers
    legs=[{'geometry':l.get('shape'),'geometry_precision':6,
           'maneuvers':extract_valhalla_maneuvers({'legs':[l]},length_in_meters=length_in_meters),
           'distance_km':l.get('summary',{}).get('length',0),
           'duration_minutes':l.get('summary',{}).get('time',0)/60,'source':'Valhalla'} for l in raw]
    return dict(stitch_legs(legs),legs=legs)


def visits_in_order(route,waypoints):
    """Conservative geometric visit check; does not prove stop service/road legality."""
    from voyagr.utils.hazard_matching import SegmentIndex
    try:
        points=decode_geometry(route.get('geometry'),route.get('geometry_precision',6))
        index=SegmentIndex(points);previous=-1
        lengths=[0]
        for a,b in zip(points,points[1:]): lengths.append(lengths[-1]+distance(a,b))
        for waypoint in waypoints:
            lat,lon=float(waypoint['lat']),float(waypoint['lon'])
            candidates=[]
            for d,i in index.nearby(lat,lon,75):
                if d>75: continue
                a,b=points[i],points[i+1]
                scale=math.cos(math.radians(lat))
                dx,dy=(b[1]-a[1])*scale,b[0]-a[0]
                t=max(0,min(1,((lon-a[1])*scale*dx+(lat-a[0])*dy)/(dx*dx+dy*dy))) if dx or dy else 0
                along=lengths[i]+t*(lengths[i+1]-lengths[i])
                if along>=previous-2: candidates.append(along)
            if not candidates: return False
            previous=min(candidates)
        return True
    except (IncompleteJourney,TypeError,ValueError,KeyError,OverflowError): return False

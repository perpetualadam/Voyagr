"""Bounded fuel-location candidates; no opening/stock/access or entrance authority."""
import math
from voyagr.services.arrival_map_evidence import point
from voyagr.services.arrival_parking import reported_access
from voyagr.services.routing.journey_geometry import distance
from voyagr.utils import request_budget as rb

FUELS={'diesel':'Diesel','octane_95':'Petrol 95','octane_98':'Petrol 98','e10':'E10','e5':'E5','lpg':'LPG','adblue':'AdBlue'}


def normalize_rows(rows, lat, lon, radius, source):
    """Check provider coordinates/radius independently before selection is offered."""
    found=[];seen=set()
    for row in (rows if isinstance(rows,list) else [])[:200]:
        if not isinstance(row,dict):continue
        try:
            if isinstance(row.get('lat'),bool) or isinstance(row.get('lon'),bool):continue
            position=point([float(row['lat']),float(row['lon'])])
        except (KeyError,TypeError,ValueError,OverflowError):continue
        if position is None:continue
        metres=distance([lat,lon],position)
        if not math.isfinite(metres) or metres>radius:continue
        key=(position[0],position[1],str(row.get('name','')))
        if key in seen:continue
        seen.add(key)
        def text(key,default=''):
            value=row.get(key);return value[:500] if isinstance(value,str) else default
        found.append({**row,'lat':position[0],'lon':position[1],'name':text('name','Unnamed fuel station'),
                      'brand':text('brand'),'address':text('address'),'opening_hours':text('opening_hours'),
                      'distance_m':round(metres,1),'type':'fuel','amenity':'fuel','source':source,
                      'availability_verified':False,'opening_hours_verified':False,'access_verified':False})
    return sorted(found,key=lambda r:r['distance_m'])[:15]


def search_osm(lat,lon,radius,metadata):
    from overpass_helper import query_overpass
    query=f'''[out:json][timeout:7][maxsize:2097152];
      nwr["amenity"="fuel"](around:{radius},{lat},{lon});out center tags 200;'''
    parent=rb.current_budget()
    try:
        with rb.use_budget(rb.WorkBudget(12,parent=parent)) as budget:
            budget.check();result=query_overpass(query,cache_ttl=300);budget.check()
    except rb.RoutingDeadlineExceeded:
        if parent is not None:parent.check()
        return None
    if not isinstance(result,dict) or result.get('success') is not True or not isinstance(result.get('elements'),list):return None
    metadata.update({'source_endpoint_class':result.get('endpoint_class','UNKNOWN'),
                     'dataset_timestamp':result.get('dataset_timestamp'),'source_version':result.get('source_version','unknown'),
                     'retrieved_at':result.get('retrieved_at'),'response_state':result.get('response_state','UNKNOWN'),
                     'cached':result.get('cached') is True})
    candidates=[];seen=set()
    for element in result['elements'][:200]:
        if not isinstance(element,dict) or element.get('type') not in ('node','way','relation') or type(element.get('id')) is not int or element['id']<=0:continue
        tags=element.get('tags');position=element if element['type']=='node' else element.get('center')
        if not isinstance(tags,dict) or tags.get('amenity')!='fuel' or not isinstance(position,dict):continue
        coordinates=point([position.get('lat'),position.get('lon')])
        identity=(element['type'],element['id'])
        if coordinates is None or identity in seen:continue
        seen.add(identity)
        def text(key,default=''):
            value=tags.get(key);return value[:500] if isinstance(value,str) else default
        fuels=[label for key,label in FUELS.items() if text('fuel:'+key).strip().lower()=='yes']
        candidates.append({'lat':coordinates[0],'lon':coordinates[1],'name':text('name',text('brand','Unnamed fuel station')),
                           'brand':text('brand'),'address':', '.join(filter(None,[text('addr:street'),text('addr:city')])),
                           'opening_hours':text('opening_hours'),'reported_fuels':fuels,'osm_type':identity[0],'osm_id':identity[1],
                           **reported_access(tags)})
    return normalize_rows(candidates,lat,lon,radius,'Overpass')

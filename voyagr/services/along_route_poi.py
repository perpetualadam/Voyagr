"""Sampled route-side candidates; no detour, entrance or live-navigation authority."""
import bisect
import math

from voyagr.services.arrival_map_evidence import point
from voyagr.services.arrival_parking import reported_access, reported_fee
from voyagr.services.charging_poi import reported_connectors
from voyagr.services.fuel_poi import FUELS
from voyagr.services.routing.journey_geometry import distance
from voyagr.utils.hazard_matching import segment_distance
from voyagr.utils import request_budget as rb

MAX_POINTS = 8192
MAX_SAMPLES = 3
CATEGORIES = {
    'fuel': ('amenity', ('fuel',)),
    'food': ('amenity', ('restaurant', 'fast_food', 'cafe')),
    'charging': ('amenity', ('charging_station',)),
    'parking': ('amenity', ('parking',)),
    'groceries': ('shop', ('supermarket', 'greengrocer', 'convenience')),
    'pharmacy': ('amenity', ('pharmacy',)),
    'hospital': ('amenity', ('hospital', 'clinic')),
    'atm': ('amenity', ('atm', 'bank')),
    'supermarket': ('shop', ('supermarket',)),
}


def text(record, key, default=''):
    value = record.get(key)
    return value[:500] if isinstance(value, str) else default


def prepare(data):
    if not isinstance(data, dict):
        raise ValueError('A JSON object is required')
    kind, radius, raw = data.get('type', 'fuel'), data.get('radius', 1000), data.get('route_points')
    if not isinstance(kind, str) or kind not in CATEGORIES:
        raise ValueError('Unsupported along-route category')
    if type(radius) is not int or not 1 <= radius <= 5000:
        raise ValueError('Radius must be an integer from 1 to 5000 metres')
    if not isinstance(raw, list) or not 2 <= len(raw) <= MAX_POINTS:
        raise ValueError('Route must contain 2 to 8192 valid points')
    coords = []
    for item in raw:
        values = [item.get('lat'), item.get('lon')] if isinstance(item, dict) else item
        position = point(values)
        if position is None:
            raise ValueError('Invalid route coordinate')
        if coords and abs(position[1] - coords[-1][1]) > 180:
            raise ValueError('Dateline-crossing route segments are unsupported')
        coords.append(position)
    cumulative = [0.0]
    for a, b in zip(coords, coords[1:]):
        cumulative.append(cumulative[-1] + distance(a, b))
    if cumulative[-1] <= 0:
        raise ValueError('Route must have positive length')
    samples = []
    for sample_index in range(MAX_SAMPLES):
        target = cumulative[-1] * sample_index / (MAX_SAMPLES-1)
        index = max(1, min(len(coords)-1, bisect.bisect_left(cumulative, target)))
        length = cumulative[index] - cumulative[index-1]
        fraction = (target-cumulative[index-1]) / length if length else 0
        a, b = coords[index-1], coords[index]
        sample = [a[0] + fraction*(b[0]-a[0]), a[1] + fraction*(b[1]-a[1])]
        if sample not in samples:
            samples.append(sample)
    return kind, radius, coords, cumulative, samples


def query_for(kind, samples, radius):
    key, values = CATEGORIES[kind]
    selector = f'["{key}"~"^({"|".join(values)})$"]'
    parts = [f'nwr{selector}(around:{radius},{lat},{lon});' for lat, lon in samples]
    return '[out:json][timeout:7][maxsize:2097152];(' + ''.join(parts) + ');out center tags 200;'


def parse_elements(elements, kind):
    key, values = CATEGORIES[kind]
    found, seen = [], set()
    for element in elements[:200]:
        if not isinstance(element, dict) or element.get('type') not in ('node','way','relation') or type(element.get('id')) is not int or element['id'] <= 0:
            continue
        tags = element.get('tags')
        position = element if element['type']=='node' else element.get('center')
        if not isinstance(tags, dict) or not isinstance(tags.get(key), str) or tags[key] not in values or not isinstance(position, dict):
            continue
        coords = point([position.get('lat'), position.get('lon')])
        identity = (element['type'], element['id'])
        if coords is None or identity in seen:
            continue
        seen.add(identity)
        row = {'lat':coords[0], 'lon':coords[1], 'name':text(tags,'name',text(tags,'brand','Unnamed location')),
               'brand':text(tags,'brand'), 'address':', '.join(filter(None,[text(tags,'addr:street'),text(tags,'addr:city')])),
               'opening_hours':text(tags,'opening_hours'), 'operator':text(tags,'operator'), 'network':text(tags,'network'),
               'osm_type':identity[0], 'osm_id':identity[1], **reported_access(tags)}
        if kind=='fuel':
            row['reported_fuels']=[label for fuel,label in FUELS.items() if text(tags,'fuel:'+fuel).strip().lower()=='yes']
        if kind=='food': row['cuisine']=text(tags,'cuisine')
        if kind=='charging': row['reported_connectors']=reported_connectors(tags)
        if kind=='groceries': row['shop_kind']=tags[key]
        if kind=='hospital': row['facility_kind']=tags[key]
        if kind=='parking': row.update(parking_type=text(tags,'parking','unknown'), **reported_fee(tags))
        found.append(row)
    return found


def route_match(position, coords, cumulative):
    best = (math.inf, 0.0)
    scale_x = 111320 * math.cos(math.radians(position[0]))
    for index, (a,b) in enumerate(zip(coords,coords[1:])):
        if index % 256 == 0: rb.check_budget()
        offset = segment_distance(*position, a, b)
        if offset < best[0]:
            ax, ay = (a[1]-position[1])*scale_x, (a[0]-position[0])*110574
            dx, dy = (b[1]-a[1])*scale_x, (b[0]-a[0])*110574
            t = max(0, min(1, -(ax*dx+ay*dy)/(dx*dx+dy*dy))) if dx or dy else 0
            best = (offset, cumulative[index]+t*(cumulative[index+1]-cumulative[index]))
    return best


def normalize(rows, kind, samples, radius, coords, cumulative, source):
    found, seen = [], set()
    for row in (rows if isinstance(rows,list) else [])[:200]:
        rb.check_budget()
        if not isinstance(row,dict): continue
        position = point([row.get('lat'),row.get('lon')])
        if position is None or not any(distance(sample,position)<=radius for sample in samples): continue
        offset, progress = route_match(position,coords,cumulative)
        if offset > radius: continue
        identity = (*position,text(row,'name'))
        if identity in seen: continue
        seen.add(identity)
        result = {**row, 'lat':position[0], 'lon':position[1], 'name':text(row,'name','Unnamed location'),
                  **{key:text(row,key) for key in ('brand','address','opening_hours','operator','network','cuisine')},
                  'type':kind, 'source':source, 'distance_m':round(offset,1), 'route_position_m':round(progress,1),
                  'distance_kind':'STRAIGHT_LINE_TO_ROUTE', 'opening_hours_verified':False, 'access_verified':False,
                  'detour_verified':False, 'entrance_verified':False, 'availability_verified':False,
                  'services_verified':False, 'stock_verified':False, 'emergency_services_verified':False,
                  'connector_compatibility_verified':False, 'charging_power_verified':False, 'dietary_suitability_verified':False}
        if source!='Overpass':
            result.update(shop_kind='unknown', facility_kind='unknown', reported_connectors=[], reported_fuels=[])
            if kind=='parking': result.update(reported_fee({}))
        found.append(result)
    return sorted(found,key=lambda row:(row['route_position_m'],row['distance_m']))[:20]


def search(data, primary, last_resort):
    from overpass_helper import query_overpass
    kind,radius,coords,cumulative,samples = prepare(data)
    context = {'coverage':'SAMPLED_CANDIDATES_ONLY','complete':False,'radius_m':radius,'sample_points':samples,
               'sample_count':len(samples),'planned_sample_count':len(samples),'route_point_count':len(coords),'route_length_m':round(cumulative[-1],1),
               'distance_kind':'STRAIGHT_LINE_TO_ROUTE','detour_verified':False,'entrance_verified':False}
    parent = rb.current_budget()
    with rb.use_budget(rb.WorkBudget(20,parent=parent)) as whole:
        gathered, attempted = [], []
        try:
            with rb.use_budget(rb.WorkBudget(5,parent=whole)):
                for sample in samples:
                    rb.check_budget()
                    attempted.append(sample)
                    rows = primary(*sample,kind,radius,budgeted=True)
                    rb.check_budget()
                    gathered.extend(normalize(rows,kind,[sample],radius,coords,cumulative,'TomTom'))
        except rb.RoutingDeadlineExceeded:
            whole.check()
        if gathered:
            rows=normalize(gathered,kind,samples,radius,coords,cumulative,'TomTom')
            context.update(sample_points=attempted, sample_count=len(attempted))
            whole.check()
            return {'success':True,'type':kind,'results':rows,'source':'TomTom','search_context':context},200
        mapped = None
        try:
            with rb.use_budget(rb.WorkBudget(12,parent=whole)):
                rb.check_budget()
                mapped=query_overpass(query_for(kind,samples,radius),cache_ttl=300)
                rb.check_budget()
        except rb.RoutingDeadlineExceeded:
            whole.check()
        if isinstance(mapped,dict) and mapped.get('success') is True and isinstance(mapped.get('elements'),list):
            context.update({key:mapped.get(key) for key in ('dataset_timestamp','source_version','retrieved_at','response_state','cached')})
            context['source_endpoint_class']=mapped.get('endpoint_class','UNKNOWN')
            rows=normalize(parse_elements(mapped['elements'],kind),kind,samples,radius,coords,cumulative,'Overpass')
            whole.check()
            return {'success':True,'type':kind,'results':rows,'source':'Overpass','search_context':context},200
        try:
            with rb.use_budget(rb.WorkBudget(3,parent=whole)):
                rb.check_budget()
                fallback=last_resort(*samples[1 if len(samples)>1 else 0],kind,radius,budgeted=True).get_json()
                rb.check_budget()
                rows=normalize(fallback.get('results') if isinstance(fallback,dict) and fallback.get('success') is True else [],kind,[samples[1 if len(samples)>1 else 0]],radius,coords,cumulative,'nominatim')
            if rows:
                context.update(sample_points=[samples[1 if len(samples)>1 else 0]], sample_count=1)
                whole.check()
                return {'success':True,'type':kind,'results':rows,'source':'nominatim','search_context':context},200
        except rb.RoutingDeadlineExceeded:
            whole.check()
    return {'success':False,'type':kind,'error':'Along-route search temporarily unavailable',
            'search_context':{**context,'coverage':'UNKNOWN'}},503

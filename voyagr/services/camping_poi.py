"""Mapped camping/service candidates; reported tags do not grant overnight permission."""
from voyagr.services.arrival_map_evidence import point
from voyagr.services.arrival_parking import reported_access, reported_fee
from voyagr.services.routing.journey_geometry import distance
from voyagr.utils import request_budget as rb

# Each tuple is an alternative; each dictionary is a conjunction of exact tags.
CATEGORIES = {
    'camping': ({'tourism': 'camp_site'},),
    'motorhome': ({'tourism': 'caravan_site'},),
    'drinking_water': ({'amenity': 'drinking_water'},
                       {'man_made': 'water_tap', 'drinking_water': 'yes'},
                       {'amenity': 'water_point', 'drinking_water': 'yes'}),
    'toilets': ({'amenity': 'toilets'},),
    'showers': ({'amenity': 'shower'}, {'shower': 'yes'}),
    'waste_disposal': ({'amenity': 'sanitary_dump_station'}, {'amenity': 'waste_disposal'},
                       {'sanitary_dump_station': 'yes'}),
    'laundry': ({'shop': 'laundry'},),
}
LABELS = {'camping': 'Campsite', 'motorhome': 'Motorhome / caravan site',
          'drinking_water': 'Drinking water', 'toilets': 'Toilets', 'showers': 'Showers',
          'waste_disposal': 'Waste disposal', 'laundry': 'Laundry'}
DETAILS = {'tents': 'Tents', 'caravans': 'Caravans', 'motorhome': 'Motorhomes',
           'drinking_water': 'Drinking water', 'toilets': 'Toilets', 'shower': 'Showers',
           'sanitary_dump_station': 'Sanitary disposal',
           'sanitary_dump_station:chemical_toilet': 'Chemical-toilet waste',
           'sanitary_dump_station:grey_water': 'Greywater',
           'sanitary_dump_station:black_water': 'Blackwater', 'power_supply': 'Power supply',
           'electricity': 'Electricity', 'maxheight': 'Height restriction', 'maxwidth': 'Width restriction',
           'maxlength': 'Length restriction', 'maxweight': 'Weight restriction',
           'seasonal': 'Seasonal', 'opening_hours': 'Opening hours', 'fee': 'Fee',
           'charge': 'Charge', 'fee:conditional': 'Conditional fee', 'maxstay': 'Maximum stay',
           'access': 'Access', 'access:conditional': 'Conditional access',
           'motor_vehicle': 'Motor-vehicle access', 'motor_vehicle:conditional': 'Conditional vehicle access',
           'overnight': 'Overnight', 'overnight_parking': 'Overnight parking', 'camping': 'Camping'}


def text(tags, key, default=''):
    value = tags.get(key)
    return value[:500] if isinstance(value, str) else default


def query_for(kind, samples, radius):
    parts = []
    for lat, lon in samples:
        for tags in CATEGORIES[kind]:
            selector = ''.join(f'["{key}"="{value}"]' for key, value in tags.items())
            parts.append(f'nwr{selector}(around:{radius},{lat},{lon});')
    return '[out:json][timeout:7][maxsize:2097152];(' + ''.join(parts) + ');out center tags 200;'


def parse_elements(elements, kind):
    rows, seen = [], set()
    for element in elements[:200]:
        if (not isinstance(element, dict) or element.get('type') not in ('node', 'way', 'relation')
                or type(element.get('id')) is not int or element['id'] <= 0):
            continue
        tags = element.get('tags')
        position = element if element['type'] == 'node' else element.get('center')
        if not isinstance(tags, dict) or not isinstance(position, dict):
            continue
        if not any(all(tags.get(k) == v for k, v in pattern.items()) for pattern in CATEGORIES[kind]):
            continue
        if kind == 'drinking_water' and text(tags, 'drinking_water').lower() == 'no':
            continue
        coordinates = point([position.get('lat'), position.get('lon')])
        identity = (element['type'], element['id'])
        if coordinates is None or identity in seen:
            continue
        seen.add(identity)
        label = ('Sanitary dump station — check accepted waste' if tags.get('amenity') == 'sanitary_dump_station' or tags.get('sanitary_dump_station') == 'yes'
                 else 'General waste disposal — not verified for toilet waste' if kind == 'waste_disposal'
                 else LABELS[kind])
        rows.append({'lat': coordinates[0], 'lon': coordinates[1], 'type': kind, 'source': 'Overpass',
                     'name': text(tags, 'name', LABELS[kind]), 'camping_kind_label': label,
                     'operator': text(tags, 'operator'), 'opening_hours': text(tags, 'opening_hours'),
                     'address': ', '.join(filter(None, [text(tags, 'addr:street'), text(tags, 'addr:city')])),
                     'osm_type': identity[0], 'osm_id': identity[1],
                     'reported_details': [{'label': label, 'value': text(tags, key)}
                                          for key, label in DETAILS.items() if text(tags, key)],
                     'overnight_permission_verified': False, 'vehicle_suitability_verified': False,
                     'availability_verified': False, 'opening_hours_verified': False, 'access_verified': False,
                     **reported_access(tags), **reported_fee(tags)})
    return rows


def acquire(kind, samples, radius, metadata):
    from overpass_helper import query_overpass
    parent = rb.current_budget()
    try:
        with rb.use_budget(rb.WorkBudget(12, parent=parent)):
            rb.check_budget()
            result = query_overpass(query_for(kind, samples, radius), cache_ttl=300)
            rb.check_budget()
    except rb.RoutingDeadlineExceeded:
        if parent is not None:
            parent.check()
        return None
    if not isinstance(result, dict) or result.get('success') is not True or not isinstance(result.get('elements'), list):
        return None
    metadata.update({key: result.get(key) for key in
                     ('dataset_timestamp', 'retrieved_at', 'response_state', 'source_version', 'cached')})
    metadata['source_endpoint_class'] = result.get('endpoint_class', 'UNKNOWN')
    return parse_elements(result['elements'], kind)


def nearby(data):
    kind, radius = data['type'], data.get('radius', 3000)
    position = point([data.get('lat'), data.get('lon')])
    if position is None or type(radius) is not int or not 1 <= radius <= 5000:
        raise ValueError('Invalid camping search coordinates or radius')
    context = {'coverage': 'CANDIDATES_ONLY', 'coordinates': position, 'radius_m': radius,
               'distance_kind': 'STRAIGHT_LINE', 'overnight_permission_verified': False,
               'vehicle_suitability_verified': False}
    rows = acquire(kind, [position], radius, context)
    if rows is None:
        return {'success': False, 'type': kind, 'error': 'Camping map search temporarily unavailable',
                'search_context': {**context, 'coverage': 'UNKNOWN'}}, 503
    found = []
    for row in rows:
        metres = distance(position, [row['lat'], row['lon']])
        if metres <= radius:
            found.append({**row, 'distance_m': round(metres, 1)})
    return {'success': True, 'type': kind, 'source': 'Overpass',
            'results': sorted(found, key=lambda row: row['distance_m'])[:15], 'search_context': context}, 200

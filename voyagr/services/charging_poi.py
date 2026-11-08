"""Bounded mapped charging candidates; no live availability or compatibility claims."""
import math

from voyagr.services.arrival_map_evidence import point
from voyagr.services.arrival_parking import reported_access
from voyagr.services.routing.journey_geometry import distance
from voyagr.utils import request_budget as rb

CONNECTORS = {
    'type2': 'Type 2', 'type2_combo': 'CCS2', 'chademo': 'CHAdeMO',
    'type1': 'Type 1', 'type1_combo': 'CCS1',
    'tesla_supercharger': 'Tesla Supercharger', 'tesla_destination': 'Tesla Destination',
    'bs1363': 'UK 3-pin', 'schuko': 'Schuko',
}


def reported_connectors(tags):
    found = []
    for kind in CONNECTORS:
        count = text(tags, 'socket:' + kind)
        if count != 'yes' and not (count.isascii() and count.isdigit() and len(count) <= 3 and 1 <= int(count) <= 999):
            continue
        found.append({'type': kind, 'count': count,
                      'output': text(tags, 'socket:' + kind + ':output')[:64]})
    return found


def normalize_connectors(rows):
    # Also bound structured fields before they reach the browser, regardless of source.
    found, seen = [], set()
    for row in (rows if isinstance(rows, list) else [])[:12]:
        if not isinstance(row, dict):
            continue
        kind, count = row.get('type'), row.get('count')
        if not isinstance(kind, str) or kind not in CONNECTORS or kind in seen or not isinstance(count, str):
            continue
        if count != 'yes' and not (count.isascii() and count.isdigit() and len(count) <= 3 and 1 <= int(count) <= 999):
            continue
        seen.add(kind)
        found.append({'type': kind, 'count': count, 'output': text(row, 'output')[:64]})
    return found


def text(data, key, default=''):
    value = data.get(key)
    return value[:500] if isinstance(value, str) else default


def normalize_rows(rows, lat, lon, radius, source):
    """Validate candidates independently of provider-supplied distances."""
    found, seen = [], set()
    for row in (rows if isinstance(rows, list) else [])[:200]:
        if not isinstance(row, dict):
            continue
        try:
            if isinstance(row.get('lat'), bool) or isinstance(row.get('lon'), bool):
                continue
            position = point([float(row['lat']), float(row['lon'])])
        except (KeyError, TypeError, ValueError, OverflowError):
            continue
        if position is None:
            continue
        metres = distance([lat, lon], position)
        if not math.isfinite(metres) or metres > radius:
            continue
        identity = (position[0], position[1], text(row, 'name'))
        if identity in seen:
            continue
        seen.add(identity)
        found.append({
            **row, 'lat': position[0], 'lon': position[1],
            'name': text(row, 'name', 'Unnamed charging location'),
            'brand': text(row, 'brand'), 'address': text(row, 'address'),
            'opening_hours': text(row, 'opening_hours'),
            'operator': text(row, 'operator'), 'network': text(row, 'network'),
            'reported_connectors': normalize_connectors(row.get('reported_connectors')), 'distance_m': round(metres, 1),
            'type': 'charging', 'source': source,
            'opening_hours_verified': False, 'access_verified': False,
            'availability_verified': False, 'connector_compatibility_verified': False,
            'charging_power_verified': False,
        })
    return sorted(found, key=lambda row: row['distance_m'])[:15]


def search_osm(lat, lon, radius, metadata):
    from overpass_helper import query_overpass
    # Preserve the existing amenity meaning; do not guess chargers from parking.
    query = f'''[out:json][timeout:7][maxsize:2097152];
      nwr["amenity"="charging_station"](around:{radius},{lat},{lon});out center tags 200;'''
    parent = rb.current_budget()
    try:
        with rb.use_budget(rb.WorkBudget(12, parent=parent)) as budget:
            budget.check()
            result = query_overpass(query, cache_ttl=300)
            budget.check()
    except rb.RoutingDeadlineExceeded:
        if parent is not None:
            parent.check()
        return None
    if (not isinstance(result, dict) or result.get('success') is not True or
            not isinstance(result.get('elements'), list)):
        return None
    metadata.update({
        'source_endpoint_class': result.get('endpoint_class', 'UNKNOWN'),
        'dataset_timestamp': result.get('dataset_timestamp'),
        'source_version': result.get('source_version', 'unknown'),
        'retrieved_at': result.get('retrieved_at'),
        'response_state': result.get('response_state', 'UNKNOWN'),
        'cached': result.get('cached') is True,
    })
    candidates, seen = [], set()
    for element in result['elements'][:200]:
        if (not isinstance(element, dict) or element.get('type') not in ('node', 'way', 'relation') or
                type(element.get('id')) is not int or element['id'] <= 0):
            continue
        tags = element.get('tags')
        position = element if element['type'] == 'node' else element.get('center')
        if (not isinstance(tags, dict) or not isinstance(tags.get('amenity'), str) or
                tags['amenity'] != 'charging_station' or
                not isinstance(position, dict)):
            continue
        coordinates = point([position.get('lat'), position.get('lon')])
        identity = (element['type'], element['id'])
        if coordinates is None or identity in seen:
            continue
        seen.add(identity)
        candidates.append({
            'lat': coordinates[0], 'lon': coordinates[1],
            'name': text(tags, 'name', text(tags, 'brand', 'Unnamed charging location')),
            'brand': text(tags, 'brand'),
            'address': ', '.join(filter(None, [text(tags, 'addr:street'), text(tags, 'addr:city')])),
            'opening_hours': text(tags, 'opening_hours'),
            'operator': text(tags, 'operator'), 'network': text(tags, 'network'),
            'reported_connectors': reported_connectors(tags),
            'amenity': tags['amenity'], 'osm_type': identity[0], 'osm_id': identity[1],
            **reported_access(tags),
        })
    return normalize_rows(candidates, lat, lon, radius, 'Overpass')

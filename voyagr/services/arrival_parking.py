"""Bounded parking candidate retrieval; no entrance or navigation authority."""
import math
import requests

from voyagr.utils import request_budget
from voyagr.services.routing.journey_geometry import distance as geodesic_distance

RADIUS_M = 2000



ACCESS_KEYS = ('access', 'vehicle', 'motor_vehicle', 'motorcar')
GENERAL_ACCESS = {'yes', 'public', 'permissive', 'designated'}
RESTRICTED_ACCESS = {'no', 'private', 'permit', 'permit_holder', 'permit_holders',
                     'destination', 'delivery', 'agricultural', 'forestry'}


def reported_access(tags):
    """Presentation categories from reported tags, never validated vehicle permission."""
    reported = {key: value.strip()[:160] for key in
                (*ACCESS_KEYS, *(key + ':conditional' for key in ACCESS_KEYS))
                if isinstance((value := tags.get(key)), str) and value.strip()}
    basis = next((key for key in reversed(ACCESS_KEYS) if reported.get(key)), None)
    value = reported.get(basis, '').lower()
    category = ('general' if value in GENERAL_ACCESS else 'customers' if value == 'customers'
                else 'restricted' if value in RESTRICTED_ACCESS else 'unknown')
    conditional = any(reported.get(key + ':conditional') for key in ACCESS_KEYS)
    conflict = category in ('general', 'customers') and any(
        reported.get(key, '').lower() in RESTRICTED_ACCESS for key in ACCESS_KEYS if key != basis)
    if (conditional or conflict) and category != 'restricted':
        category = 'unknown'
    return {'reported_access': reported, 'access_basis': basis, 'access_category': category,
            'has_conditional_access': conditional, 'has_conflicting_access': conflict}


def shortlist_key(item):
    category = item['access_category']
    # Named general/customer candidates first; restrictions remain visible further down.
    tier = ({'general': 0, 'customers': 1} if item['has_name'] else
            {'general': 2, 'customers': 3}).get(category)
    if tier is None:
        tier = (4 if item['has_name'] else 5) if category == 'unknown' else (6 if item['has_name'] else 7)
    return tier, item['distance_m'], item['osm_type'], item['osm_id']


def search_near_destination(lat, lon):
    """Retrieve a local category set before ranking, using existing provider policy."""
    from overpass_helper import query_overpass
    query = f'''[out:json][timeout:7][maxsize:2097152];
      nwr["amenity"="parking"](around:{RADIUS_M},{lat},{lon});
      out center tags 200;'''
    try:
        budget = request_budget.WorkBudget(12, parent=request_budget.current_budget())
        with request_budget.use_budget(budget):
            budget.check()
            result = query_overpass(query, cache_ttl=300)
            budget.check()
    except (request_budget.RoutingDeadlineExceeded, requests.RequestException):
        return None
    if not isinstance(result, dict) or result.get('success') is not True or not isinstance(result.get('elements'), list):
        return None
    candidates = []
    seen = set()
    for element in result['elements'][:200]:
        if not isinstance(element, dict):
            continue
        tags = element.get('tags')
        if not isinstance(tags, dict) or tags.get('amenity') != 'parking':
            continue
        position = element if element.get('type') == 'node' else element.get('center')
        if not isinstance(position, dict):
            continue
        try:
            if any(isinstance(position.get(k), bool) for k in ('lat', 'lon')):
                continue
            point = float(position['lat']), float(position['lon'])
        except (TypeError, ValueError, KeyError, OverflowError):
            continue
        if not all(math.isfinite(n) for n in point) or abs(point[0]) > 90 or abs(point[1]) > 180:
            continue
        distance = geodesic_distance((lat, lon), point)
        identity = element.get('type'), element.get('id')
        if element.get('type') not in ('node', 'way', 'relation') or type(element.get('id')) is not int:
            continue
        if distance > RADIUS_M or identity in seen:
            continue
        seen.add(identity)
        def text(key, default='', limit=160):
            value = tags.get(key)
            return value[:limit] if isinstance(value, str) else default
        raw_name = text('name').strip()
        name = raw_name or 'Unnamed parking'
        has_name = bool(raw_name) and raw_name.casefold() not in {'parking', 'car park', 'carpark', 'unnamed parking', 'unnamed car park'}
        road = text('addr:street').strip()
        location_label = name if has_name else f"{name} — {road[:50] + '; ' if road else ''}map point {point[0]:.6f}, {point[1]:.6f}"
        candidates.append({'name': name, 'location_label': location_label, 'display_name': ', '.join(x for x in (name, road) if x),
                           'lat': str(point[0]), 'lon': str(point[1]), 'type': 'parking', 'class': 'amenity',
                           'osm_type': element['type'], 'osm_id': element['id'], '_source': 'overpass',
                           'address': {'road': road}, 'distance_m': round(distance, 1),
                           'access': text('access', limit=64), 'opening_hours': text('opening_hours'),
                           'has_name': has_name, **reported_access(tags), 'access_verified': False})
    return sorted(candidates, key=shortlist_key)

"""Bounded parking candidate retrieval; no entrance or navigation authority."""
import math
import requests

from voyagr.utils import request_budget
from voyagr.services.routing.journey_geometry import distance as geodesic_distance

RADIUS_M = 2000


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
        name = text('name', 'Unnamed parking')
        road = text('addr:street')
        candidates.append({'name': name, 'display_name': ', '.join(x for x in (name, road) if x),
                           'lat': str(point[0]), 'lon': str(point[1]), 'type': 'parking', 'class': 'amenity',
                           'osm_type': element['type'], 'osm_id': element['id'], '_source': 'overpass',
                           'address': {'road': road}, 'distance_m': round(distance, 1),
                           'access': text('access', limit=64), 'opening_hours': text('opening_hours'),
                           'access_verified': False})
    return sorted(candidates, key=lambda item: (item['distance_m'], item['osm_type'], item['osm_id']))

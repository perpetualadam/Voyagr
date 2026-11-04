"""Read-only mapped observations near a target; never an arrival/access verdict."""
import math

import requests

from voyagr.utils import request_budget

RADIUS_M = 150
MAX_ELEMENTS = 200
TAG_KEYS = ('entrance', 'barrier', 'highway', 'service', 'access', 'vehicle',
            'motor_vehicle', 'motorcar', 'oneway', 'junction', 'layer', 'level',
            'bridge', 'tunnel', 'opening_hours', 'maxheight', 'maxwidth',
            'maxweight', 'locked', 'foot', 'bicycle')
TAG_KEYS += tuple(key + ':conditional' for key in TAG_KEYS)


def point(value):
    if not isinstance(value, (list, tuple)) or len(value) != 2:
        return None
    if not all(isinstance(n, (int, float)) and not isinstance(n, bool)
               and -bound <= n <= bound for n, bound in zip(value, (90, 180))):
        return None
    return list(value)


def _positive_int(value):
    return type(value) is int and value > 0


def _observation(element):
    if not isinstance(element, dict) or not _positive_int(element.get('id')):
        raise ValueError('invalid observation identity')
    kind = element.get('type')
    tags = element.get('tags', {})
    if (not isinstance(tags, dict) or not all(isinstance(k, str) and isinstance(v, str) for k, v in tags.items())
            or any(len(v) > 500 for k, v in tags.items() if k in TAG_KEYS)):
        raise ValueError('invalid tags')
    if kind == 'node' and ('entrance' in tags or 'barrier' in tags):
        coordinates = point([element.get('lat'), element.get('lon')])
        if coordinates is None:
            raise ValueError('invalid node coordinates')
        extra = {'coordinates': coordinates}
    elif kind == 'way' and 'highway' in tags:
        nodes, geometry = element.get('nodes'), element.get('geometry')
        if (not isinstance(nodes, list) or not 2 <= len(nodes) <= 2000 or
                not all(_positive_int(n) for n in nodes) or
                not isinstance(geometry, list) or len(geometry) != len(nodes)):
            raise ValueError('incomplete way')
        points = [point([p.get('lat'), p.get('lon')]) if isinstance(p, dict) else None for p in geometry]
        if any(p is None for p in points):
            raise ValueError('incomplete geometry')
        extra = {'node_ids': nodes, 'geometry': points}
    else:
        raise ValueError('unexpected observation type')
    return {'osm_type': kind, 'osm_id': element['id'],
            'osm_version': element.get('version') if _positive_int(element.get('version')) else None,
            'osm_timestamp': element.get('timestamp') if isinstance(element.get('timestamp'), str) else None,
            'tags': {k: v for k, v in tags.items() if k in TAG_KEYS},
            'access_verified': False, **extra}


def collect(target):
    from overpass_helper import query_overpass
    lat, lon = target
    query = f'''[out:json][timeout:7][maxsize:2097152];
    (node["entrance"](around:{RADIUS_M},{lat},{lon});
     node["barrier"](around:{RADIUS_M},{lat},{lon});
     way["highway"](around:{RADIUS_M},{lat},{lon}););
    out meta geom {MAX_ELEMENTS + 1};'''
    try:
        budget = request_budget.WorkBudget(12, parent=request_budget.current_budget())
        with request_budget.use_budget(budget):
            budget.check()
            result = query_overpass(query, cache_ttl=300)
            budget.check()
        if (not isinstance(result, dict) or result.get('success') is not True or
                result.get('response_state') not in ('VALID_EMPTY', 'VALID_WITH_DATA') or
                not isinstance(result.get('elements'), list) or len(result['elements']) > MAX_ELEMENTS):
            return None
        if (result['response_state'] == 'VALID_EMPTY') != (not result['elements']):
            return None
        observations = [_observation(e) for e in result['elements']]
        identities = [(e['osm_type'], e['osm_id']) for e in observations]
        if len(set(identities)) != len(identities):
            return None
    except (requests.RequestException, ValueError, TypeError, OverflowError):
        return None
    # Exact shared OSM IDs report topology only, never vehicle traversability.
    nodes = {o['osm_id'] for o in observations if o['osm_type'] == 'node'}
    for observation in observations:
        if observation['osm_type'] == 'way':
            observation['observed_shared_node_ids'] = sorted(nodes.intersection(observation['node_ids']))
    retrieved = result.get('retrieved_at')
    return {'version': 1, 'target': list(target), 'radius_m': RADIUS_M,
            'source': 'overpass', 'coverage': 'PARTIAL', 'dataset_coverage': 'UNVERIFIED',
            'dataset_timestamp': result.get('dataset_timestamp'), 'source_version': result.get('source_version'),
            'retrieved_at': retrieved if isinstance(retrieved, (int, float)) and not isinstance(retrieved, bool) and math.isfinite(retrieved) else None,
            'cached': result.get('cached') is True, 'observations': observations,
            'status': 'OBSERVATIONS_ONLY' if observations else 'NO_MAPPED_OBSERVATIONS',
            'navigation_authority': 'NONE', 'selection': 'NONE', 'vehicle_access': 'UNKNOWN',
            'target_association': 'NOT_ESTABLISHED', 'connector': 'NOT_EVALUATED',
            'stopping': 'NOT_EVALUATED', 'freshness': 'NOT_EVALUATED'}

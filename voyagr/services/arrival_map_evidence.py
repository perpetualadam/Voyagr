"""Read-only mapped observations near a target; never an arrival/access verdict."""
import math
from datetime import datetime

import requests

from voyagr.utils import request_budget

RADIUS_M = 150
MAX_ELEMENTS = 200
TAG_KEYS = ('amenity', 'parking', 'entrance', 'barrier', 'highway', 'service', 'access', 'vehicle',
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


def _observation(element, parking_way_id=None):
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
    elif kind == 'way' and ('highway' in tags or element['id'] == parking_way_id and tags.get('amenity') == 'parking'):
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


def timestamp_diagnostics(result):
    """Describe reported source age, never decide acceptable freshness."""
    stamp = result.get('dataset_timestamp')
    retrieved = result.get('retrieved_at')
    valid_retrieval = (isinstance(retrieved, (int, float)) and not isinstance(retrieved, bool)
                       and math.isfinite(retrieved))
    status, age = 'MISSING', None
    source_time = None
    if stamp is not None:
        try:
            parsed = datetime.fromisoformat(stamp.replace('Z', '+00:00'))
            if parsed.tzinfo is None:
                raise ValueError('timezone missing')
            source_time = parsed.timestamp()
            status = 'REPORTED'
            if valid_retrieval:
                age = round(retrieved - source_time, 3)
                if age < 0:
                    status = 'FUTURE_DATASET_TIMESTAMP'
        except (ValueError, TypeError, AttributeError, OverflowError):
            status = 'INVALID'
    return {'timestamp_basis': 'provider_timestamp_osm_base',
            'dataset_timestamp_status': status, 'dataset_age_at_retrieval_seconds': age,
            'source_revision_status': 'UNKNOWN' if result.get('source_version') in (None, '', 'unknown') else 'REPORTED',
            'source_endpoint_class': result.get('endpoint_class') if result.get('endpoint_class') in ('LOCAL', 'PUBLIC') else 'UNKNOWN',
            'freshness_acceptance': 'NOT_EVALUATED'}


def boundary_topology(observations, parking_way_id):
    """Exact shared IDs only; no entrance selection or geometric access inference."""
    boundary = next((o for o in observations if o['osm_type'] == 'way' and o['osm_id'] == parking_way_id
                     and o['tags'].get('amenity') == 'parking'), None)
    roads = [o for o in observations if o['osm_type'] == 'way' and o is not boundary and 'highway' in o['tags']]
    boundary_nodes = set(boundary['node_ids']) if boundary else set()
    by_node = {}
    for road in roads:
        for node in set(road['node_ids']):
            by_node.setdefault(node, set()).add(road['osm_id'])
    for road in roads:
        road['parking_boundary_shared_node_ids'] = sorted(boundary_nodes.intersection(road['node_ids']))
    junctions = [{'node_id': node, 'way_ids': sorted(ways)} for node, ways in sorted(by_node.items()) if len(ways) > 1]
    closed = bool(boundary and len(boundary['node_ids']) >= 4 and
                  boundary['node_ids'][0] == boundary['node_ids'][-1] and
                  boundary['geometry'][0] == boundary['geometry'][-1] and
                  len(set(boundary['node_ids'])) >= 3)
    return {'requested_osm_way_id': parking_way_id, 'observation': boundary,
            'status': 'NOT_REQUESTED' if parking_way_id is None else 'NOT_RETURNED' if boundary is None else
                      'CLOSED_WAY_REPORTED' if closed else 'OPEN_OR_DEGENERATE_WAY',
            'association': 'REQUESTED_ID_ONLY' if parking_way_id is not None else 'NOT_REQUESTED',
            'road_junctions': junctions, 'entrance': 'NOT_ESTABLISHED',
            'polygon_validity': 'NOT_EVALUATED', 'vehicle_access': 'UNKNOWN'}


def collect(target, parking_way_id=None):
    from overpass_helper import query_overpass
    target = point(target)
    if target is None or parking_way_id is not None and (not _positive_int(parking_way_id) or parking_way_id > 2**63 - 1):
        return None
    lat, lon = target
    parking_query = (f'way({parking_way_id})["amenity"="parking"](around:{RADIUS_M},{lat},{lon});'
                     if parking_way_id is not None else '')
    query = f'''[out:json][timeout:7][maxsize:2097152];
    (node["entrance"](around:{RADIUS_M},{lat},{lon});
     node["barrier"](around:{RADIUS_M},{lat},{lon});
     way["highway"](around:{RADIUS_M},{lat},{lon});{parking_query});
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
        observations = [_observation(e, parking_way_id) for e in result['elements']]
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
    boundary = boundary_topology(observations, parking_way_id)
    retrieved = result.get('retrieved_at')
    return {'version': 1, 'target': list(target), 'radius_m': RADIUS_M,
            'source': 'overpass', 'coverage': 'PARTIAL', 'dataset_coverage': 'UNVERIFIED',
            'dataset_timestamp': result.get('dataset_timestamp'), 'source_version': result.get('source_version'),
            'retrieved_at': retrieved if isinstance(retrieved, (int, float)) and not isinstance(retrieved, bool) and math.isfinite(retrieved) else None,
            'cached': result.get('cached') is True, 'observations': observations,
            'parking_boundary': boundary, 'source_diagnostics': timestamp_diagnostics(result),
            'status': 'OBSERVATIONS_ONLY' if observations else 'NO_MAPPED_OBSERVATIONS',
            'navigation_authority': 'NONE', 'selection': 'NONE', 'vehicle_access': 'UNKNOWN',
            'target_association': 'NOT_ESTABLISHED', 'connector': 'NOT_EVALUATED',
            'stopping': 'NOT_EVALUATED', 'freshness': 'NOT_EVALUATED'}

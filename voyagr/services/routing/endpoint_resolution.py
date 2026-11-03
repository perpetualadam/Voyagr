"""Additive planning evidence. Nothing here grants navigation or property access."""
import math

from voyagr.services.routing.journey_geometry import decode_geometry, distance, IncompleteJourney
from voyagr.services.routing.origin_integrity import coordinate, CONTINUITY_M

SEMANTIC_CLASSES = {'locality', 'address', 'poi', 'road', 'unknown'}
PROVIDERS = {'nominatim', 'tomtom', 'unknown'}


def search_evidence(value, requested):
    """Bound untrusted search metadata and bind it to the actual request point."""
    if not isinstance(value, dict) or type(value.get('version')) is not int or value.get('version') != 1:
        return None
    point = coordinate(value.get('coordinates'))
    if not point or not requested or point != tuple(requested):
        return None
    out = {'version': 1, 'authority': 'request_metadata_only', 'coordinates': list(point),
           'semantic_class': value.get('semantic_class') if isinstance(value.get('semantic_class'), str) and value['semantic_class'] in SEMANTIC_CLASSES else 'unknown',
           'provider': value.get('provider') if isinstance(value.get('provider'), str) and value['provider'] in PROVIDERS else 'unknown'}
    ref = value.get('provider_ref')
    if isinstance(ref, str) and len(ref) <= 128:
        out['provider_ref'] = ref
    bounds = value.get('bounds')
    if (isinstance(bounds, list) and len(bounds) == 4 and
            all(isinstance(n, (int, float)) and not isinstance(n, bool) and math.isfinite(n) for n in bounds) and
            -90 <= bounds[0] <= bounds[2] <= 90 and -180 <= bounds[1] <= bounds[3] <= 180):
        out['bounds'] = bounds[:]
    entries = value.get('entry_points')
    if isinstance(entries, list):
        out['entry_points'] = []
        for entry in entries[:8]:
            if not isinstance(entry, dict):
                continue
            position = coordinate(entry.get('coordinates'))
            if position:
                item = {'coordinates': list(position)}
                if isinstance(entry.get('type'), str):
                    item['type'] = entry['type'][:40]
                out['entry_points'].append(item)
    return out


def _native(route):
    if 'provider_snapped_waypoints' not in route:
        return None, False
    try:
        precision = route.get('provider_snap_precision', 5)
        if precision not in (5, 6):
            return None, True
        return decode_geometry(route['provider_snapped_waypoints'], precision), False
    except (IncompleteJourney, TypeError, ValueError, OverflowError):
        return None, True


def _endpoint(requested, anchor, native, malformed, provider):
    point = coordinate(requested.get('coordinates'))
    evidence = search_evidence(requested.get('search_evidence'), point)
    original = {'coordinates': list(point) if point else None, 'kind': requested.get('kind', 'unknown')}
    if requested.get('source_kind'):
        original['source_kind'] = requested['source_kind']
    if evidence:
        original['search_evidence'] = evidence
    out = {'requested': original,
           'routing_anchor': {'coordinates': list(anchor) if anchor else None, 'provider': provider},
           'offset_m': round(distance(point, anchor), 3) if point and anchor else None,
           'anchor_evidence': 'MISSING', 'access_evidence': 'UNKNOWN',
           'planning_disposition': 'UNAVAILABLE'}
    if not point or not anchor:
        return out
    out['anchor_evidence'] = ('MISMATCH' if malformed else 'GEOMETRY_ONLY' if native is None else
                              'NATIVE_SNAP_CONSISTENT' if distance(native, anchor) <= CONTINUITY_M else 'MISMATCH')
    if native is not None:
        out['routing_anchor']['native_coordinates'] = list(native)
    bounds = evidence.get('bounds') if evidence else None
    locality = (requested.get('kind') == 'searched' and evidence and evidence['semantic_class'] == 'locality'
                and bounds and bounds[0] <= point[0] <= bounds[2] and bounds[1] <= point[1] <= bounds[3]
                and bounds[0] <= anchor[0] <= bounds[2] and bounds[1] <= anchor[1] <= bounds[3])
    out['planning_disposition'] = ('ROAD_SNAPPED' if out['anchor_evidence'] == 'NATIVE_SNAP_CONSISTENT'
                                   and (distance(point, anchor) <= CONTINUITY_M or locality) else 'REVIEW_REQUIRED')
    return out


def resolve_endpoints(route, context):
    """Recompute from route geometry, native snaps and canonical ordered request context."""
    assessment = route.get('avoidance_assessment') or {}
    out = {'version': 1, 'authority': 'planning_evidence_only', 'navigation_authority': 'NONE',
           'geometry_binding': assessment.get('geometry_binding'), 'checked_at': assessment.get('checked_at'),
           'planning_disposition': 'NO_VALID_GEOMETRY', 'origin': None, 'destination': None, 'stops': []}
    try:
        points = decode_geometry(route.get('geometry'), route.get('geometry_precision', 6))
    except (IncompleteJourney, TypeError, ValueError, OverflowError):
        return out
    if route.get('geometry_complete') is False or assessment.get('geometry_valid') is not True:
        return out
    provider = str(route.get('source') or 'Unknown')[:40]
    native, malformed = _native(route)
    out['origin'] = _endpoint(context['origin'], points[0], native[0] if native else None, malformed, provider)
    out['destination'] = _endpoint(context['destination'], points[-1], native[-1] if native else None, malformed, provider)
    stops = context.get('ordered_stops') or []
    ranges = route.get('leg_geometry_ranges')
    valid_ranges = (isinstance(ranges, list) and len(ranges) == len(stops) + 1 and
                    all(isinstance(r, dict) and all(isinstance(r.get(k), int) and not isinstance(r[k], bool)
                        for k in ('begin_shape_index', 'end_shape_index')) and
                        0 <= r['begin_shape_index'] < r['end_shape_index'] < len(points) and
                        r['begin_shape_index'] == (0 if i == 0 else ranges[i-1]['end_shape_index'])
                        for i, r in enumerate(ranges)) and ranges[-1]['end_shape_index'] == len(points)-1)
    legs = route.get('legs')
    for i, stop in enumerate(stops):
        anchor = points[ranges[i]['end_shape_index']] if valid_ranges else None
        stop_native = native[i+1] if native and len(native) == len(stops)+2 else None
        stop_malformed = malformed
        if stop_native is None and isinstance(legs, list) and len(legs) == len(stops)+1 and isinstance(legs[i], dict):
            leg_native, leg_malformed = _native(legs[i])
            stop_native = leg_native[-1] if leg_native else None
            stop_malformed = stop_malformed or leg_malformed
        entry = _endpoint(stop, anchor, stop_native, stop_malformed, provider)
        entry['original_index'] = stop.get('original_index', i)
        out['stops'].append(entry)
    records = [out['origin'], *out['stops'], out['destination']]
    out['planning_disposition'] = ('ROAD_SNAPPED' if all(e['planning_disposition'] == 'ROAD_SNAPPED' for e in records)
                                   else 'REVIEW_REQUIRED')
    return out

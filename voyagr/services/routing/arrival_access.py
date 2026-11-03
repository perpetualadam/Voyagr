"""Arrival-reference correspondence, never legal-access or connector authority."""
from voyagr.services.routing.journey_geometry import distance
from voyagr.services.routing.origin_integrity import CONTINUITY_M


def assess_arrival(endpoint):
    """Evaluate sanitized references against this alternative's own routing anchor.

    Geocoder references arrive via untrusted request metadata. Even exact coordinate
    agreement establishes correspondence only, not vehicle access or a driven path.
    Do not rank entrances or invent a connector from straight-line distances.
    """
    evidence = endpoint['requested'].get('search_evidence') or {}
    anchor = endpoint['routing_anchor']['coordinates']
    requested = endpoint['requested']['coordinates']
    bounds = evidence.get('bounds')
    candidates = []
    seen = set()
    for reference in evidence.get('entry_points') or []:
        point = reference['coordinates']
        key = tuple(point)
        if key in seen:
            continue
        seen.add(key)
        within = (bounds[0] <= point[0] <= bounds[2] and bounds[1] <= point[1] <= bounds[3]) if bounds else None
        candidate = {
            'coordinates': point[:],
            'source': evidence.get('provider', 'unknown'),
            'source_authority': 'request_metadata_only',
            'within_declared_bounds': within,
            'distance_to_requested_m': round(distance(point, requested), 3) if requested else None,
            'distance_to_routing_anchor_m': round(distance(point, anchor), 3) if anchor else None,
        }
        if reference.get('type'):
            candidate['type'] = reference['type']
        if evidence.get('provider_ref'):
            candidate['provider_ref'] = evidence['provider_ref']
        candidates.append(candidate)

    if not candidates:
        status = 'NO_REFERENCE'
    elif len(candidates) > 1:
        status = 'AMBIGUOUS_REFERENCES'
    elif candidates[0]['within_declared_bounds'] is False:
        status = 'REFERENCE_OUTSIDE_DECLARED_BOUNDS'
    elif endpoint['anchor_evidence'] != 'NATIVE_SNAP_CONSISTENT':
        status = 'UNCORROBORATED_ANCHOR'
    elif anchor and distance(candidates[0]['coordinates'], anchor) <= CONTINUITY_M:
        status = 'ANCHOR_ALIGNED_REFERENCE'
    else:
        status = 'DIFFERENT_ROUTING_ANCHOR'
    return {
        'version': 1,
        'policy': 'arrival-reference-correspondence-v1',
        'authority': 'planning_evidence_only',
        'navigation_authority': 'NONE',
        'status': status,
        'selection': 'NONE',
        'vehicle_access': 'UNKNOWN',
        'connector': 'NOT_EVALUATED',
        'candidates': candidates,
    }

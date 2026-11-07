"""Versioned planning intent. No declaration is vehicle/access verification."""
MODES = {'place', 'roadside', 'vehicle_entrance'}


def _point(value):
    if not isinstance(value, (list, tuple)) or len(value) != 2:
        return None
    if not all(isinstance(n, (int, float)) and not isinstance(n, bool) and -bound <= n <= bound
               for n, bound in zip(value, (90, 180))):
        return None
    return list(value)


def normalize_intent(value, target, round_trip=False):
    result = {'version': 1, 'mode': 'place', 'status': 'DEFAULT', 'target': target,
              'authority': 'request_metadata_only', 'navigation_authority': 'NONE'}
    if value is None:
        return result
    if (not isinstance(value, dict) or type(value.get('version')) is not int or value['version'] != 1
            or not isinstance(value.get('mode'), str) or value['mode'] not in MODES
            or round_trip and value['mode'] != 'place'):
        result.update(mode='unknown', status='UNSUPPORTED')
    elif _point(value.get('target')) is None or _point(value.get('target')) != target:
        result.update(mode='unknown', status='TARGET_MISMATCH')
    else:
        result.update(mode=value['mode'], status='DECLARED')
    return result


def planning_policy(intent, endpoint, binding, checked_at):
    mode = intent['mode']
    reference = (endpoint.get('arrival_access') or {}).get('status', 'NO_REFERENCE')
    if mode == 'unknown':
        status = 'INTENT_REQUIRES_REVIEW'
    elif mode == 'roadside':
        status = 'ROADSIDE_SUITABILITY_UNVERIFIED'
    elif mode == 'vehicle_entrance':
        status = 'ENTRANCE_REFERENCE_MISSING' if reference == 'NO_REFERENCE' else 'ENTRANCE_ACCESS_UNVERIFIED'
    else:
        status = 'PLACE_ACCESS_UNRESOLVED'
    return {'version': 1, 'policy': 'planning-arrival-intent-v1', 'mode': mode, 'status': status,
            'authority': 'planning_evidence_only', 'navigation_authority': 'NONE',
            'geometry_binding': binding, 'checked_at': checked_at,
            'target': intent['target'], 'route_endpoint': endpoint['routing_anchor']['coordinates'],
            'reference_status': reference, 'stopping': 'NOT_EVALUATED',
            'vehicle_access': 'UNKNOWN', 'connector': 'NOT_EVALUATED'}


def restrict_preview_only(result, intent):
    """Keep non-default/unsupported intents from inheriting legacy live eligibility."""
    if intent['mode'] == 'place' and intent['status'] in ('DEFAULT', 'DECLARED'):
        return
    routes = result.get('routes') if isinstance(result.get('routes'), list) else [result]
    for item in [*routes, result]:
        item['automatic_selection_allowed'] = False
        item['navigation_outcome'] = 'REFUSED'
        assessment = item.get('avoidance_assessment')
        if isinstance(assessment, dict):
            assessment['automatic_selection_allowed'] = False
            assessment['arrival_intent_navigation_allowed'] = False
    warning = result.get('routing_warning')
    result['routing_warning'] = ((warning + ' ') if isinstance(warning, str) and warning else '') + (
        'The selected arrival intent is preview only; live roadside/entrance validation is unavailable.')

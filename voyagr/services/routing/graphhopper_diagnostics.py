"""Bounded categorical diagnostics. Provider strings never enter log records."""
import json
import re

MAX_BODY_BYTES = 16384
MAX_MESSAGE_CHARS = 1024
MAX_HINTS = 4
# Fixed vocabulary only: never emit arbitrary parameter, profile or area IDs.
SAFE_NAMES = frozenset({
    'profile', 'custom_model', 'ch.disable', 'lm.disable', 'details', 'points',
    'point', 'priority', 'speed', 'distance_influence', 'areas', 'max_speed',
    'lanes', 'road_class', 'road_environment', 'road_access', 'toll', 'surface',
    'car_access', 'car_average_speed',
})
TYPES = {
    'java.lang.IllegalArgumentException': 'invalid_argument',
    'java.lang.IllegalStateException': 'invalid_state',
    'com.fasterxml.jackson.core.JsonParseException': 'json_parse_error',
    'com.fasterxml.jackson.databind.exc.UnrecognizedPropertyException': 'unknown_property',
    'com.fasterxml.jackson.databind.exc.MismatchedInputException': 'json_input_mismatch',
}


def summarise_graphhopper_error(response):
    """Inspect at most 16 KiB of an already-buffered response; no raw snippets."""
    result = {'body_state': 'unavailable', 'categories': [], 'error_types': [], 'names': []}
    try:
        raw = response.content
        if not isinstance(raw, bytes):
            return result
        if len(raw) > MAX_BODY_BYTES:
            result['body_state'] = 'oversized'
            return result
        data = json.loads(raw)
    except (ValueError, UnicodeError, RecursionError):
        result['body_state'] = 'malformed_json'
        return result
    except Exception:
        # Diagnostics must never alter fallback, including response access errors.
        return result
    if not isinstance(data, dict):
        result['body_state'] = 'unexpected_json'
        return result
    result['body_state'] = 'json'
    hints = data.get('hints')
    entries = [data] + (hints[:MAX_HINTS] if isinstance(hints, list) else [])
    categories, types, names = set(), set(), set()
    for entry in entries:
        if not isinstance(entry, dict):
            continue
        detail = entry.get('details')
        if isinstance(detail, str) and detail in TYPES:
            types.add(TYPES[detail])
        message = entry.get('message')
        if not isinstance(message, str):
            continue
        message = message[:MAX_MESSAGE_CHARS].lower()
        if any(s in message for s in ('cannot parse', 'deserialize', 'malformed json', 'unrecognized field', 'unexpected character')):
            categories.add('request_json_invalid')
        if any(s in message for s in ('encoded value', 'encoded_value', 'encodedvalue')):
            categories.add('encoded_value_error')
        if 'profile' in message and any(s in message for s in ('not found', 'unknown', 'not support', 'incompatib', 'does not exist', 'cannot', 'custom')):
            categories.add('profile_error')
        if any(s in message for s in ('cannot compile', 'condition', 'expression', 'custom_model', 'custom model')):
            categories.add('custom_model_error')
        if any(s in message for s in ('unknown parameter', 'unsupported parameter', 'invalid parameter')):
            categories.add('parameter_error')
        for name in SAFE_NAMES:
            if re.search(r'(?<![a-z0-9_.])' + re.escape(name) + r'(?![a-z0-9_.])', message):
                names.add(name)
    result.update(categories=sorted(categories) or ['unclassified_http_error'],
                  error_types=sorted(types), names=sorted(names)[:8])
    return result


def log_graphhopper_error(logger, response, stage):
    # All arguments reaching the logger are constants, bounded enums or HTTP status.
    if stage not in ('post_custom_model', 'get_point', 'get_points', 'post_default'):
        stage = 'unknown'
    status = response.status_code
    if type(status) is not int or not 100 <= status <= 599:
        status = 0
    diagnostic = summarise_graphhopper_error(response)
    logger.warning('[GRAPHHOPPER] validation_error stage=%s http_status=%s diagnostic=%s',
                   stage, status, json.dumps(diagnostic, sort_keys=True))

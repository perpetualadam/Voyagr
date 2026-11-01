"""Request provenance for inspection, never GPS authentication or route permission."""
import copy
import math
from voyagr.utils.validation import validate_coordinates

KINDS = {'gps', 'searched', 'map', 'coordinates', 'saved', 'unknown'}


def _point(value):
    if isinstance(value, dict):
        value = [value.get('lat'), value.get('lon')]
    if not isinstance(value, (list, tuple)) or len(value) != 2:
        return None
    if any(isinstance(v, bool) or not isinstance(v, (int, float)) or not math.isfinite(v) for v in value):
        return None
    return list(value) if abs(value[0]) <= 90 and abs(value[1]) <= 180 else None


def _kind(value):
    return value if isinstance(value, str) and value in KINDS else 'unknown'


def context_for_plan(raw, ordered_visits):
    declared = raw.get('journey_context')
    declared = declared if isinstance(declared, dict) else {}

    def endpoint(field):
        item = declared.get(field)
        item = item if isinstance(item, dict) else {}
        value = raw.get('start' if field == 'origin' else 'end', '')
        if field == 'destination' and raw.get('round_trip'):
            value = raw.get('start', '')
        return {'kind': _kind(item.get('kind')),
                'coordinates': _point(validate_coordinates(value)),
                **({'source_kind': _kind(item.get('source_kind'))} if _kind(item.get('source_kind')) != 'unknown' else {})}

    requested = list(raw.get('via_points') or []) + list(raw.get('stops') or [])
    stops = []
    for index, visit in enumerate(ordered_visits or []):
        point = _point(visit)
        matches = [v for v in requested if _point(v) == point and point is not None]
        # Ambiguous coincident visits must not borrow another stop's provenance.
        indexed = [v for v in matches if isinstance(v, dict) and isinstance(visit, dict)
                   and 'original_index' in visit and v.get('original_index') == visit['original_index']]
        source = indexed[0] if len(indexed) == 1 else matches[0] if len(matches) == 1 else {}
        kind = source.get('provenance') if isinstance(source, dict) else None
        stop = visit if isinstance(visit, dict) else {}
        stops.append({'coordinates': point, 'kind': _kind(kind),
                      **({'source_kind': _kind(source.get('source_kind'))} if isinstance(source, dict) and _kind(source.get('source_kind')) != 'unknown' else {}),
                      'name': str(stop.get('name') or 'Journey stop')[:120],
                      'duration_minutes': stop.get('duration', stop.get('duration_minutes', 0)),
                      'original_index': stop.get('original_index', index)})
    return {'version': 1, 'purpose': 'live_gps' if declared.get('purpose') == 'live_gps' else 'planning',
            'authority': 'request_metadata_only', 'origin': endpoint('origin'),
            'destination': endpoint('destination'), 'ordered_stops': copy.deepcopy(stops)}

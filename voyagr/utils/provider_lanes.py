"""Normalize provider lane protocols without synthesizing route permissions."""

VALHALLA_BITS = {
    1: 'none', 2: 'through', 4: 'sharp_left', 8: 'left', 16: 'slight_left',
    32: 'slight_right', 64: 'right', 128: 'sharp_right', 256: 'reverse',
    512: 'merge_to_left', 1024: 'merge_to_right',
}
TOKENS = set(VALHALLA_BITS.values())


def _mask(value):
    if isinstance(value, bool) or not isinstance(value, int) or not 0 <= value <= 2047:
        raise ValueError('Invalid lane mask')
    return [token for bit, token in VALHALLA_BITS.items() if value & bit]


def _tokens(values):
    if not isinstance(values, list) or len(values) > 11:
        raise ValueError('Invalid lane indications')
    out = []
    for value in values:
        if not isinstance(value, str):
            raise ValueError('Invalid lane indication')
        token = value.replace(' ', '_')
        token = {'straight': 'through', 'uturn': 'reverse'}.get(token, token)
        if token not in TOKENS or token in out:
            raise ValueError('Unknown/duplicate lane indication')
        out.append(token)
    return out


def normalize_provider_lanes(lanes, provider):
    """Keep left-to-right order, valid routes and preferred routes distinct."""
    if not isinstance(lanes, list) or not 2 <= len(lanes) <= 12:
        return None
    result = []
    try:
        for lane in lanes:
            if not isinstance(lane, dict) or lane.get('evidence_state') == 'INFERRED':
                return None
            numeric = provider == 'Valhalla' and isinstance(lane.get('directions'), int) and not isinstance(lane['directions'], bool)
            if numeric:
                directions = _mask(lane['directions'])
                active_mask, valid_mask = lane.get('active', 0), lane.get('valid', 0)
                active_dirs, valid_dirs = _mask(active_mask), _mask(valid_mask)
                if (active_mask | valid_mask) & ~lane['directions']:
                    return None
                if 'valid' in lane and active_mask & ~valid_mask:
                    return None
                active = bool(active_mask & ~1)
                valid = bool((active_mask | valid_mask) & ~1)
            else:
                directions = _tokens(lane.get('directions', lane.get('indications', lane.get('valid_indications', []))))
                raw_valid = lane.get('valid', lane.get('active', False))
                raw_active = lane.get('active', raw_valid if provider == 'OSRM' else False)
                if not isinstance(raw_valid, bool) or not isinstance(raw_active, bool):
                    return None
                if raw_active and not raw_valid:
                    return None
                active, valid = raw_active, raw_valid
                selected = lane.get('valid_indications', directions)
                if 'valid_indication' in lane:
                    selected = [lane['valid_indication']]
                valid_dirs = _tokens(selected) if valid else []
                active_dirs = _tokens(lane.get('active_indications', selected)) if active else []
                if not set(active_dirs).issubset(directions) or not set(valid_dirs).issubset(directions):
                    return None
            result.append(dict(active=active, valid=valid, directions=directions,
                               preferred=active if provider != 'OSRM' or 'active' in lane else False,
                               valid_indications=valid_dirs, active_indications=active_dirs,
                               evidence_state='PROVIDER',
                               access=lane.get('access'), vehicle_allowed=lane.get('vehicle_allowed'),
                               bus_only=lane.get('bus_only', False)))
        return result
    except (TypeError, ValueError):
        return None

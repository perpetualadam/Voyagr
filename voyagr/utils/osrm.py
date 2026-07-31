"""OSRM step -> Valhalla maneuver translation for TBT and speed widget."""

from __future__ import annotations

import re
from typing import Any, Dict, List, Optional, Sequence, Tuple

from voyagr.utils.geometry import get_distance_between_points

# OSRM maneuver (type, modifier) -> Valhalla maneuver.type (subset used by Voyagr UI).
OSRM_MANEUVER_TO_VALHALLA = {
    ('depart', None): 1,
    ('arrive', None): 4,
    ('continue', None): 8,
    ('new name', None): 8,
    ('notification', None): 8,
    ('turn', 'left'): 15,
    ('turn', 'sharp left'): 14,
    ('turn', 'slight left'): 16,
    ('turn', 'right'): 10,
    ('turn', 'sharp right'): 11,
    ('turn', 'slight right'): 9,
    ('turn', 'uturn'): 13,
    ('fork', 'left'): 15,
    ('fork', 'slight left'): 16,
    ('fork', 'right'): 10,
    ('fork', 'slight right'): 9,
    ('end of road', 'left'): 15,
    ('end of road', 'right'): 10,
    ('merge', None): 25,
    ('merge', 'slight left'): 24,
    ('merge', 'slight right'): 23,
    ('on ramp', None): 20,
    ('on ramp', 'slight left'): 20,
    ('on ramp', 'slight right'): 20,
    ('on ramp', 'left'): 20,
    ('on ramp', 'right'): 20,
    ('off ramp', None): 20,
    ('off ramp', 'slight left'): 21,
    ('off ramp', 'slight right'): 20,
    ('off ramp', 'left'): 21,
    ('off ramp', 'right'): 20,
    ('roundabout', None): 26,
    ('rotary', None): 26,
    ('roundabout turn', None): 26,
    ('exit roundabout', None): 27,
}

DEFAULT_VALHALLA_TYPE = 8


def osrm_maneuver_type(maneuver_type: str, modifier: Optional[str]) -> int:
    """Map an OSRM maneuver type/modifier pair to a Valhalla maneuver type."""
    key = (str(maneuver_type or 'continue').lower(), modifier.lower() if modifier else None)
    return OSRM_MANEUVER_TO_VALHALLA.get(key, DEFAULT_VALHALLA_TYPE)


def infer_road_class_from_names(
    ref: Optional[str],
    street_names: Optional[Sequence[str]] = None,
) -> Optional[str]:
    """
    Infer a Valhalla-style road_class from UK-style refs (M1, A40, B1234) or street names.
    """
    candidates: List[str] = []
    if ref:
        candidates.append(str(ref).strip())
    if street_names:
        candidates.extend(str(n).strip() for n in street_names if n)

    for raw in candidates:
        upper = raw.upper()
        if not upper:
            continue
        if upper.startswith('M') and re.match(r'^M\d', upper):
            return 'motorway'
        if 'MOTORWAY' in upper:
            return 'motorway'
        if re.match(r'^A\d', upper):
            return 'primary'
        if re.match(r'^B\d', upper):
            return 'secondary'
    return None


def nearest_shape_index(
    coords: Sequence[Tuple[float, float]],
    lon: float,
    lat: float,
) -> int:
    """Find the nearest polyline vertex index to a lon/lat point."""
    if not coords:
        return 0
    best_i = 0
    best_d = float('inf')
    for i, (c_lat, c_lon) in enumerate(coords):
        d = get_distance_between_points(lat, lon, c_lat, c_lon)
        if d < best_d:
            best_d = d
            best_i = i
    return best_i


def parse_osrm_maxspeed_kmh(entry: Any) -> Optional[int]:
    """Parse an OSRM maxspeed annotation entry to km/h (converted to mph on maneuvers)."""
    if not entry or not isinstance(entry, dict):
        return None
    if entry.get('unknown'):
        return None
    speed = entry.get('speed')
    if not isinstance(speed, (int, float)) or speed <= 0:
        return None
    unit = str(entry.get('unit', 'km/h')).lower()
    if 'mph' in unit:
        return round(float(speed) * 1.60934)
    return round(float(speed))


def _leg_maxspeed_segments(leg: Dict[str, Any]) -> List[Optional[int]]:
    annot = leg.get('annotation') or leg.get('annotations') or {}
    out: List[Optional[int]] = []
    for entry in annot.get('maxspeed') or []:
        out.append(parse_osrm_maxspeed_kmh(entry))
    return out


def _speed_limit_at_index(maxspeed_segments: Sequence[Optional[int]], shape_idx: int) -> Optional[int]:
    if not maxspeed_segments or shape_idx < 0:
        return None
    if shape_idx < len(maxspeed_segments):
        return maxspeed_segments[shape_idx]
    if maxspeed_segments:
        return maxspeed_segments[-1]
    return None


def osrm_step_instruction(step: Dict[str, Any], maneuver: Dict[str, Any]) -> str:
    """Build a short instruction string from an OSRM step."""
    name = (step.get('name') or '').strip()
    ref = (step.get('ref') or '').strip()
    label = ref or name
    m_type = str(maneuver.get('type') or '').lower()
    modifier = maneuver.get('modifier')

    if m_type == 'depart':
        return f'Head {" ".join(str(x) for x in [modifier, label] if x)}'.strip() or 'Head north'
    if m_type == 'arrive':
        return 'You have arrived at your destination'
    if m_type in ('roundabout', 'rotary'):
        return f'Enter the roundabout{" onto " + label if label else ""}'.strip()
    if m_type == 'exit roundabout':
        return f'Exit the roundabout{" onto " + label if label else ""}'.strip()
    if modifier and label:
        return f'{modifier.capitalize()} onto {label}'
    if modifier:
        return modifier.capitalize()
    if label:
        return f'Continue on {label}'
    return 'Continue'


def build_osrm_maneuvers(
    route: Dict[str, Any],
    route_coords: Sequence[Tuple[float, float]],
) -> List[Dict[str, Any]]:
    """
    Convert OSRM legs/steps into Valhalla-style maneuver dicts for TBT and speed widget.

    ``route_coords`` is the decoded route geometry (precision 5, lat/lon tuples).
    """
    if not route_coords:
        return []

    legs = route.get('legs') or []
    if not legs:
        return []

    maxspeed_segments: List[Optional[int]] = []
    for leg in legs:
        maxspeed_segments.extend(_leg_maxspeed_segments(leg))

    maneuvers: List[Dict[str, Any]] = []
    for leg in legs:
        for step in leg.get('steps') or []:
            maneuver_raw = step.get('maneuver') or {}
            loc = maneuver_raw.get('location')
            if loc and len(loc) >= 2:
                begin_idx = nearest_shape_index(route_coords, float(loc[0]), float(loc[1]))
            else:
                begin_idx = 0

            m_type = maneuver_raw.get('type', 'continue')
            modifier = maneuver_raw.get('modifier')
            valhalla_type = osrm_maneuver_type(m_type, modifier)

            name = (step.get('name') or '').strip()
            ref = (step.get('ref') or '').strip()
            street_names = [n for n in (ref, name) if n]
            instruction = osrm_step_instruction(step, maneuver_raw)

            maneuver: Dict[str, Any] = {
                'instruction': instruction,
                'verbal_pre_transition_instruction': instruction,
                'distance': float(step.get('distance', 0) or 0) / 1000.0,
                'time': float(step.get('duration', 0) or 0),
                'type': valhalla_type,
                'street_name': name or ref,
                'street_names': street_names,
                'begin_street_names': street_names,
                'begin_shape_index': begin_idx,
                'end_shape_index': begin_idx,
            }

            road_class = infer_road_class_from_names(ref, street_names)
            if road_class:
                maneuver['road_class'] = road_class

            sl_kmh = _speed_limit_at_index(maxspeed_segments, begin_idx)
            if sl_kmh is not None:
                # Store mph (same convention as GraphHopper maneuvers) so the
                # widget does not treat 70 km/h as 70 mph.
                mph = int(round(float(sl_kmh) * 0.621371))
                if mph > 0:
                    maneuver['speed_limit'] = mph

            maneuvers.append(maneuver)

    for i, maneuver in enumerate(maneuvers):
        if i + 1 < len(maneuvers):
            maneuver['end_shape_index'] = maneuvers[i + 1]['begin_shape_index']
        else:
            maneuver['end_shape_index'] = max(0, len(route_coords) - 1)

    return maneuvers

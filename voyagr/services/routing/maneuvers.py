"""
Valhalla turn-by-turn maneuver helpers.

Pure normalisation of Valhalla leg maneuvers into the Voyagr API JSON shape, plus
a small helper to extract all maneuvers from a Valhalla ``trip``. Extracted from
``voyagr_web`` (where the per-maneuver converter lived and the leg/maneuver loop
was duplicated ~6 times) so it can be unit-tested offline and reused.
"""

from __future__ import annotations

from typing import Any, Dict, List

from voyagr.utils.osrm import infer_road_class_from_names


def valhalla_maneuver_dict(maneuver: Dict[str, Any], length_in_meters: bool = False) -> Dict[str, Any]:
    """
    Normalize a Valhalla leg maneuver for the Voyagr API JSON.
    See Valhalla turn-by-turn reference: instruction, verbal_transition_alert_instruction,
    verbal_pre_transition_instruction, verbal_post_transition_instruction, street_names, length, etc.
    """
    sn = maneuver.get('street_names') or []
    length = maneuver.get('length', 0)
    if length_in_meters:
        length = float(length) * 1000.0
    out: Dict[str, Any] = {
        'instruction': maneuver.get('instruction', ''),
        'verbal_transition_alert_instruction': maneuver.get('verbal_transition_alert_instruction', ''),
        'verbal_pre_transition_instruction': maneuver.get('verbal_pre_transition_instruction', ''),
        'verbal_post_transition_instruction': maneuver.get('verbal_post_transition_instruction', ''),
        'distance': length,
        'time': maneuver.get('time', 0),
        'type': maneuver.get('type', 0),
        'street_name': sn[0] if sn else '',
        'street_names': sn,
        'begin_street_names': maneuver.get('begin_street_names', []),
        'begin_shape_index': maneuver.get('begin_shape_index', 0),
        'end_shape_index': maneuver.get('end_shape_index', 0),
        'speed_limit': maneuver.get('speed_limit'),
    }
    mt = maneuver.get('type', 0)
    rc = maneuver.get('roundabout_exit_count')
    if rc is not None and mt in (26, 27):
        try:
            out['roundabout_exit_count'] = int(rc)
        except (TypeError, ValueError):
            out['roundabout_exit_count'] = 0
    lanes = maneuver.get('lanes')
    if lanes:
        out['lanes'] = lanes
    rc = infer_road_class_from_names(
        None,
        maneuver.get('begin_street_names') or maneuver.get('street_names') or [],
    )
    if rc:
        out['road_class'] = rc
    return out


def extract_valhalla_maneuvers(trip: Dict[str, Any], length_in_meters: bool = False) -> List[Dict[str, Any]]:
    """
    Collect normalized maneuvers from every leg of a Valhalla ``trip`` dict.

    Mirrors the previous inline ``for leg in trip['legs']: for m in leg['maneuvers']``
    loop exactly (legs/maneuvers missing → empty list).
    """
    maneuvers: List[Dict[str, Any]] = []
    for leg in (trip or {}).get('legs', []) or []:
        if 'maneuvers' in leg:
            for m in leg['maneuvers']:
                maneuvers.append(valhalla_maneuver_dict(m, length_in_meters=length_in_meters))
    return maneuvers

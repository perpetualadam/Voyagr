"""
Standard Voyagr route-entry builders.

``build_valhalla_route_entry``  — primary/alternate/retry Valhalla routes.
``build_graphhopper_optimised_route_entry`` — ⚡ Optimised (GraphHopper) route.

Dependencies are already-extracted service modules (geometry, hazards, maneuvers,
GraphHopper utils); the cost calculator instance is injected so both builders are
testable offline.  Moving ``build_graphhopper_optimised_route_entry`` here breaks
the circular ``enrichment.py → voyagr_web`` import.
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

import polyline as _polyline_module

from voyagr.utils.geometry import decode_route_geometry
from voyagr.utils.graphhopper import GH_SIGN_TO_VALHALLA, remap_shape_index_after_reencode
from voyagr.utils.lane_maneuvers import attach_lanes_to_graphhopper_maneuver
from voyagr.utils.osrm import infer_road_class_from_names
from voyagr.services.hazards import get_hazards_on_route, score_route_by_hazards
from voyagr.services.routing.maneuvers import extract_valhalla_maneuvers

logger = logging.getLogger('voyagr_web')


def maneuvers_from_graphhopper_route(graphhopper_route: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Convert GraphHopper instructions + max_speed details into Valhalla-shaped maneuvers.

    Long GraphHopper "continue" instructions often span several posted-limit zones.
    When ``details.max_speed`` changes inside an instruction interval we emit synthetic
    Continue (type 8) maneuvers at each change so the active-edge speed limit tracks
    the snapped shape index instead of sticking to the limit at the instruction start
    (e.g. 70 mph NSL leaking into a following 30 mph zone).
    """
    gh_geometry = graphhopper_route.get('geometry', '')
    if not gh_geometry:
        return []

    gh_coords = _polyline_module.decode(gh_geometry, precision=5)
    gh_geometry_p6 = _polyline_module.encode(gh_coords, precision=6)
    gh_coords_p6 = _polyline_module.decode(gh_geometry_p6, precision=6)

    gh_max_speed_segments: List = []
    try:
        details = graphhopper_route.get('details') or {}
        for seg in (details.get('max_speed') or []):
            if isinstance(seg, list) and len(seg) >= 3:
                frm, to, val = seg[0], seg[1], seg[2]
                if isinstance(val, (int, float)) and val > 0:
                    gh_max_speed_segments.append((int(frm), int(to), float(val)))
    except Exception:
        gh_max_speed_segments = []

    def _speed_limit_kmh(point_idx: int) -> Optional[int]:
        for frm, to, val in gh_max_speed_segments:
            if frm <= point_idx < to:
                return round(val)
        return None

    def _speed_changes_inside(begin_src: int, end_src: int) -> List[tuple]:
        """Return (src_idx, kmh) for max_speed segment starts strictly inside the interval."""
        changes = []
        for frm, _to, val in gh_max_speed_segments:
            if begin_src < frm < end_src:
                changes.append((frm, round(val)))
        changes.sort(key=lambda item: item[0])
        return changes

    def _exit_count(instr: Dict[str, Any]) -> int:
        for key in ('exit_number', 'roundabout_exit_count', 'exited'):
            raw = instr.get(key)
            if raw is None:
                continue
            try:
                n = int(raw)
            except (TypeError, ValueError):
                continue
            if n > 0:
                return n
        return 0

    gh_maneuvers: List[Dict[str, Any]] = []
    for instr in graphhopper_route.get('instructions', []):
        sign = instr.get('sign', 0)
        valhalla_type = GH_SIGN_TO_VALHALLA.get(sign, 8)
        interval = instr.get('interval') or [0, 0]
        begin_src = interval[0] if interval else 0
        end_src = interval[1] if len(interval) > 1 else begin_src
        begin_idx = remap_shape_index_after_reencode(gh_coords, gh_coords_p6, begin_src)
        end_idx = remap_shape_index_after_reencode(gh_coords, gh_coords_p6, end_src)
        instr_text = instr.get('text', '')
        street_label = instr.get('street_name', '') or ''
        street_names = [street_label] if street_label else []
        gh_rc = infer_road_class_from_names(street_label, street_names)
        exit_count = _exit_count(instr)

        maneuver: Dict[str, Any] = {
            'instruction': instr_text,
            'verbal_pre_transition_instruction': instr_text,
            'distance': instr.get('distance', 0) / 1000.0,
            'time': instr.get('time', 0) / 1000.0,
            'type': valhalla_type,
            'street_names': street_names,
            'begin_shape_index': begin_idx,
            'end_shape_index': end_idx,
        }
        sl_kmh = _speed_limit_kmh(begin_src)
        if sl_kmh is not None:
            maneuver['speed_limit'] = sl_kmh
        if gh_rc:
            maneuver['road_class'] = gh_rc
        if exit_count > 0 and valhalla_type in (26, 27):
            maneuver['roundabout_exit_count'] = exit_count
        attach_lanes_to_graphhopper_maneuver(
            maneuver,
            instr,
            valhalla_type=valhalla_type,
            path_details=graphhopper_route.get('details') or {},
            shape_index_src=begin_src,
        )
        gh_maneuvers.append(maneuver)

        # Synthetic continues at posted-limit changes inside this instruction.
        for change_src, change_kmh in _speed_changes_inside(begin_src, end_src):
            change_idx = remap_shape_index_after_reencode(gh_coords, gh_coords_p6, change_src)
            if change_idx <= begin_idx:
                continue
            speed_maneuver: Dict[str, Any] = {
                'instruction': '',
                'verbal_pre_transition_instruction': '',
                'distance': 0,
                'time': 0,
                'type': 8,  # Continue — skipped by turn detection
                'street_names': street_names,
                'begin_shape_index': change_idx,
                'end_shape_index': end_idx,
                'speed_limit': change_kmh,
            }
            if gh_rc:
                speed_maneuver['road_class'] = gh_rc
            gh_maneuvers.append(speed_maneuver)

    return gh_maneuvers


def _first_leg_shape(trip: Dict[str, Any]) -> Optional[str]:
    for leg in (trip or {}).get('legs', []) or []:
        if 'shape' in leg:
            return leg['shape']
    return None


def build_valhalla_route_entry(
    *,
    trip: Dict[str, Any],
    name: str,
    route_id: int,
    traffic_multiplier: float,
    hazards: Dict[str, Any],
    cost_calculator: Any,
    vehicle_type: str,
    fuel_efficiency: float,
    fuel_price: float,
    energy_efficiency: float,
    electricity_price: float,
    include_tolls: bool,
    include_caz: bool,
    caz_exempt: bool,
    include_traffic_fields: bool = False,
    traffic_level: str = 'N/A',
    maneuver_length_in_meters: bool = False,
) -> Dict[str, Any]:
    """
    Build one standard route dict from a Valhalla ``trip``.

    Mirrors the previous inline construction exactly: km distance, traffic-adjusted
    duration (``base * traffic_multiplier``), cost calculator with decoded coords,
    hazard scoring on the encoded geometry, and normalized maneuvers. When
    ``include_traffic_fields`` is set (the primary route), the base duration and
    traffic metadata are included too.
    """
    summary = (trip or {}).get('summary', {}) or {}
    distance_km = summary.get('length', 0)
    base_time_minutes = summary.get('time', 0) / 60
    time_minutes = base_time_minutes * traffic_multiplier

    geometry = _first_leg_shape(trip)
    route_coords = decode_route_geometry(geometry, precision=6)

    costs = cost_calculator.calculate_costs(
        distance_km, vehicle_type, fuel_efficiency, fuel_price,
        energy_efficiency, electricity_price, include_tolls, include_caz, caz_exempt,
        route_coords=route_coords,
    )

    hazard_penalty = 0
    hazard_count = 0
    hazards_list = []
    if hazards:
        hazard_penalty, hazard_count = score_route_by_hazards(geometry, hazards)
        hazards_list = get_hazards_on_route(geometry, hazards)

    maneuvers = extract_valhalla_maneuvers(trip, length_in_meters=maneuver_length_in_meters)

    entry: Dict[str, Any] = {
        'id': route_id,
        'name': name,
        'distance_km': round(distance_km, 2),
        'duration_minutes': round(time_minutes, 0),
        'fuel_cost': round(costs['fuel_cost'], 2),
        'fuel_litres': round(costs['fuel_litres'], 2),
        'toll_cost': round(costs['toll_cost'], 2),
        'caz_cost': round(costs['caz_cost'], 2),
        'caz_details': costs.get('caz_details', {}),
        'geometry': geometry,
        'geometry_precision': 6,
        'hazard_penalty_seconds': round(hazard_penalty, 0),
        'hazard_count': hazard_count,
        'hazards': hazards_list,
        'maneuvers': maneuvers,
        'source': 'Valhalla',
    }
    if include_traffic_fields:
        entry['base_duration_minutes'] = round(base_time_minutes, 0)
        entry['traffic_multiplier'] = round(traffic_multiplier, 2)
        entry['traffic_level'] = traffic_level
    return entry


def build_graphhopper_optimised_route_entry(
    graphhopper_route: Dict[str, Any],
    hazards: Dict[str, List[Dict[str, Any]]],
    cost_calculator: Any,
    *,
    vehicle_type: str,
    fuel_efficiency: float,
    fuel_price: float,
    energy_efficiency: float,
    electricity_price: float,
    include_tolls: bool,
    include_caz: bool,
    caz_exempt: bool,
    traffic_multiplier: float = 1.0,
    traffic_level: str = 'N/A',
    include_traffic_fields: bool = False,
) -> Optional[Dict[str, Any]]:
    """
    Turn a successful ``route_with_graphhopper()`` result into the same route-dict
    shape used by ``/api/route`` (⚡ Optimised, maneuvers, costs, hazards along geometry).

    Moved here from ``voyagr_web`` to break the circular
    ``enrichment.py → voyagr_web.build_graphhopper_optimised_route_entry`` dependency.
    Behaviour is identical; all helpers are imported from existing service modules.
    """
    if not graphhopper_route or not graphhopper_route.get('success'):
        return None
    try:
        gh_distance_km = graphhopper_route.get('distance_km', 0)
        gh_duration_min = graphhopper_route.get('duration_seconds', 0) / 60
        gh_geometry = graphhopper_route.get('geometry', '')
        if not gh_geometry:
            return None

        gh_coords = _polyline_module.decode(gh_geometry, precision=5)
        gh_geometry_p6 = _polyline_module.encode(gh_coords, precision=6)
        gh_coords_p6 = _polyline_module.decode(gh_geometry_p6, precision=6)

        gh_costs = cost_calculator.calculate_costs(
            gh_distance_km, vehicle_type, fuel_efficiency, fuel_price,
            energy_efficiency, electricity_price, include_tolls, include_caz, caz_exempt,
            route_coords=gh_coords,
        )

        gh_hazard_penalty, gh_hazard_count = score_route_by_hazards(gh_coords, hazards)
        gh_hazards_list = get_hazards_on_route(gh_coords, hazards)
        base_duration_min = gh_duration_min
        gh_duration_min = gh_duration_min * traffic_multiplier

        gh_maneuvers = maneuvers_from_graphhopper_route(graphhopper_route)

        entry: Dict[str, Any] = {
            'id': 0,
            'name': '⚡ Optimised',
            'distance_km': round(gh_distance_km, 2),
            'duration_minutes': round(gh_duration_min, 0),
            'fuel_cost': round(gh_costs['fuel_cost'], 2),
            'fuel_litres': round(gh_costs['fuel_litres'], 2),
            'toll_cost': round(gh_costs['toll_cost'], 2),
            'caz_cost': round(gh_costs['caz_cost'], 2),
            'geometry': gh_geometry_p6,
            'geometry_precision': 6,
            'hazard_penalty_seconds': round(gh_hazard_penalty, 0),
            'hazard_count': gh_hazard_count,
            'hazards': gh_hazards_list,
            'maneuvers': gh_maneuvers,
            'source': 'GraphHopper',
        }
        # Only set camera_exclusions_applied when cameras were actually in the custom model
        if graphhopper_route.get('camera_avoidance'):
            entry['camera_exclusions_applied'] = True
        if include_traffic_fields:
            entry['base_duration_minutes'] = round(base_duration_min, 0)
            entry['traffic_multiplier'] = round(traffic_multiplier, 2)
            entry['traffic_level'] = traffic_level
        return entry
    except Exception as e:
        logger.warning(f"[GRAPHHOPPER] build_graphhopper_optimised_route_entry failed: {e}")
        return None

"""
Build a standard Voyagr route entry from a Valhalla ``trip``.

The primary /api/route success path constructed the "Fastest" route and each
alternate with the same cost + hazard + maneuver computation and the same output
shape (only the main route also carries traffic-adjustment fields). That ~40-line
pattern was duplicated; it lives here as a single pure helper so it can be unit
tested offline and reused.

Dependencies are the already-extracted service modules (geometry, hazards,
maneuvers); the cost calculator instance is injected by the caller, matching the
monolith's behaviour exactly (same rounding, same field set).
"""

from __future__ import annotations

from typing import Any, Dict, Optional

from voyagr.utils.geometry import decode_route_geometry
from voyagr.services.hazards import get_hazards_on_route, score_route_by_hazards
from voyagr.services.routing.maneuvers import extract_valhalla_maneuvers


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

    maneuvers = extract_valhalla_maneuvers(trip, length_in_meters=False)

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

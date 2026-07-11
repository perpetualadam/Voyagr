"""
OSRM fallback route building for /api/route.

When both the local Valhalla and GraphHopper engines fail, ``calculate_route``
falls back to a public OSRM service. This module extracts the pure-ish core:
turning an OSRM ``/route`` JSON response into Voyagr's standard list of route
dicts (cost estimate, hazard scoring, maneuvers).

The HTTP request, response envelope, DB caching and ``jsonify`` remain in the
monolith. Monolith-only helpers (cost/hazard functions) are reached through a
lazy ``import voyagr_web`` to avoid an import cycle at module load, matching the
pattern used by the other routing service modules.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any, Dict, List

from voyagr.utils.geometry import decode_route_geometry
from voyagr.utils.osrm import build_osrm_maneuvers

logger = logging.getLogger('voyagr_web')


@dataclass
class OsrmRouteContext:
    """Cost/hazard parameters needed to turn OSRM routes into standard entries."""

    hazards: Dict[str, List[Dict[str, Any]]]
    vehicle_type: str
    fuel_efficiency: float
    fuel_price: float
    energy_efficiency: float
    electricity_price: float
    include_tolls: bool
    include_caz: bool
    caz_exempt: bool


def _osrm_route_name(idx: int) -> str:
    """Route label by OSRM alternative index (mirrors previous inline logic)."""
    if idx == 0:
        return 'Fastest'
    if idx == 1:
        return 'Shortest'
    if idx == 2:
        return 'Balanced'
    return f'Alternative {idx}'


def build_osrm_routes(
    route_data: Dict[str, Any],
    ctx: OsrmRouteContext,
) -> List[Dict[str, Any]]:
    """
    Convert an OSRM ``/route`` JSON response into Voyagr's standard route dicts.

    Processes up to the first 4 alternatives. Mirrors the previous inline logic
    exactly, including the inline fuel-cost estimate (not via cost_calculator),
    passing the *encoded* geometry to the hazard scorers, and decoding at OSRM's
    precision 5 for maneuver shape indices.
    """
    import voyagr_web as vw

    routes: List[Dict[str, Any]] = []

    for idx, route in enumerate(route_data.get('routes', [])[:4]):
        distance = route.get('distance', 0)
        duration = route.get('duration', 0)

        distance_km = distance / 1000
        time_min = duration / 60

        route_geometry = route.get('geometry', None)
        route_coords = decode_route_geometry(route_geometry)

        fuel_cost = 0
        fuel_litres = 0  # litres for petrol/diesel, kWh for electric
        toll_cost = 0
        caz_cost = 0

        if ctx.vehicle_type == 'electric':
            fuel_litres = (distance_km / 100) * ctx.energy_efficiency  # kWh
            fuel_cost = fuel_litres * ctx.electricity_price
        else:
            fuel_litres = (distance_km / 100) * ctx.fuel_efficiency  # litres
            fuel_cost = fuel_litres * ctx.fuel_price

        if ctx.include_tolls:
            toll_cost = vw.calculate_toll_cost(distance_km, 'motorway', route_coords=route_coords)

        if ctx.include_caz and not ctx.caz_exempt:
            caz_cost, _caz_details = vw.calculate_caz_cost(
                distance_km, ctx.vehicle_type, ctx.caz_exempt, route_coords=route_coords
            )

        route_type = _osrm_route_name(idx)

        hazard_penalty = 0
        hazard_count = 0
        hazards_list: List[Dict[str, Any]] = []
        if ctx.hazards:
            hazard_penalty, hazard_count = vw.score_route_by_hazards(route_geometry, ctx.hazards)
            hazards_list = vw.get_hazards_on_route(route_geometry, ctx.hazards)
            logger.info(
                f"[HAZARDS] OSRM route {idx+1}: penalty={hazard_penalty:.0f}s, "
                f"count={hazard_count}, hazards_list={len(hazards_list)}"
            )

        osrm_maneuvers = build_osrm_maneuvers(route, route_coords)

        routes.append({
            'id': idx + 1,
            'name': route_type,
            'distance_km': round(distance_km, 2),
            'duration_minutes': round(time_min, 0),
            'fuel_cost': round(fuel_cost, 2),
            'fuel_litres': round(fuel_litres, 2),
            'toll_cost': round(toll_cost, 2),
            'caz_cost': round(caz_cost, 2),
            'geometry': route_geometry,
            'geometry_precision': 5,
            'hazard_penalty_seconds': round(hazard_penalty, 0),
            'hazard_count': hazard_count,
            'hazards': hazards_list,
            'maneuvers': osrm_maneuvers,
            'source': 'OSRM',
        })

    return routes

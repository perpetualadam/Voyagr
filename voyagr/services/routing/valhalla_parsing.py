"""
Valhalla JSON -> standard Voyagr route parsers.

``valhalla_route_json_to_standard_routes`` parses a full Valhalla ``/route``
response (``trip`` + optional ``alternates``) into the list of route-option dicts
used by ``/api/route``.

``valhalla_trip_json_to_std_route_entry`` builds a single ``/api/route``-style
route dict from a Valhalla JSON body containing ``trip``/``legs`` (e.g. the
``auto_shorter`` shortest-route fetch).

Both were previously defined inline in ``voyagr_web`` and are moved here verbatim
(behaviour unchanged) to shrink the monolith. All dependencies are already-extracted
service modules; the cost calculator instance and hazards dict are injected so the
parsers stay testable offline. ``route_entries.build_valhalla_route_entry`` is a
related-but-distinct builder (it applies a traffic multiplier and scores hazards on
the encoded geometry), so these parsers are kept separate rather than merged.
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

try:
    import polyline
except ImportError:  # pragma: no cover - optional dependency guard mirrors voyagr_web
    polyline = None  # type: ignore

from voyagr.utils.geometry import decode_route_geometry
from voyagr.services.hazards import get_hazards_on_route, score_route_by_hazards
from voyagr.services.routing.maneuvers import extract_valhalla_maneuvers, valhalla_maneuver_dict
from voyagr.services.routing.engines import get_traffic_duration_multiplier

logger = logging.getLogger('voyagr_web')


def valhalla_route_json_to_standard_routes(
    route_data: Dict[str, Any],
    *,
    valhalla_costing: str,
    start_lat: float,
    start_lon: float,
    hazards: Dict[str, List[Dict[str, Any]]],
    cost_calculator: Any,
    vehicle_type: str,
    fuel_efficiency: float,
    fuel_price: float,
    energy_efficiency: float,
    electricity_price: float,
    include_tolls: bool,
    include_caz: bool,
    caz_exempt: bool,
) -> List[Dict[str, Any]]:
    """
    Parse a Valhalla /route JSON body (with 'trip') into the route option dicts used by /api/route.
    Used for the primary success path recovery duplicate and for baseline Valhalla after hazard-heavy failure.
    """
    routes: List[Dict[str, Any]] = []
    if 'trip' not in route_data or 'legs' not in route_data['trip']:
        return routes

    distance = route_data['trip']['summary']['length']
    duration_seconds = route_data['trip']['summary']['time']
    distance_km = distance
    base_time_minutes = duration_seconds / 60

    route_geometry = None
    for leg in route_data['trip']['legs']:
        if 'shape' in leg:
            route_geometry = leg['shape']
            break

    if valhalla_costing == 'auto':
        traffic_multiplier, traffic_level = get_traffic_duration_multiplier(start_lat, start_lon)
        time_minutes = base_time_minutes * traffic_multiplier
    else:
        traffic_multiplier, traffic_level = 1.0, 'N/A'
        time_minutes = base_time_minutes

    route_coords = decode_route_geometry(route_geometry, precision=6)
    costs = cost_calculator.calculate_costs(
        distance_km, vehicle_type, fuel_efficiency, fuel_price,
        energy_efficiency, electricity_price, include_tolls, include_caz, caz_exempt,
        route_coords=route_coords,
    )
    hazard_penalty = 0
    hazard_count = 0
    hazards_list: List[Dict[str, Any]] = []
    if hazards:
        hazard_penalty, hazard_count = score_route_by_hazards(route_geometry, hazards)
        hazards_list = get_hazards_on_route(route_geometry, hazards)

    maneuvers = extract_valhalla_maneuvers(route_data['trip'], length_in_meters=False)

    routes.append({
        'id': 1,
        'name': 'Fastest',
        'distance_km': round(distance_km, 2),
        'duration_minutes': round(time_minutes, 0),
        'base_duration_minutes': round(base_time_minutes, 0),
        'traffic_multiplier': round(traffic_multiplier, 2),
        'traffic_level': traffic_level,
        'fuel_cost': round(costs['fuel_cost'], 2),
        'fuel_litres': round(costs['fuel_litres'], 2),
        'toll_cost': round(costs['toll_cost'], 2),
        'caz_cost': round(costs['caz_cost'], 2),
        'caz_details': costs.get('caz_details', {}),
        'geometry': route_geometry,
        'geometry_precision': 6,
        'hazard_penalty_seconds': round(hazard_penalty, 0),
        'hazard_count': hazard_count,
        'hazards': hazards_list,
        'maneuvers': maneuvers,
        'source': 'Valhalla',
    })

    if 'alternates' in route_data:
        for idx, alt_route in enumerate(route_data['alternates'][:3]):
            if 'trip' not in alt_route or 'summary' not in alt_route['trip']:
                continue
            alt_distance = alt_route['trip']['summary']['length']
            alt_duration_seconds = alt_route['trip']['summary']['time']
            alt_distance_km = alt_distance
            alt_base_time_minutes = alt_duration_seconds / 60
            alt_time_minutes = alt_base_time_minutes * traffic_multiplier

            alt_geometry = None
            alt_maneuvers = []
            if 'legs' in alt_route['trip']:
                for leg in alt_route['trip']['legs']:
                    if 'shape' in leg and alt_geometry is None:
                        alt_geometry = leg['shape']
                    if 'maneuvers' in leg:
                        for m in leg['maneuvers']:
                            alt_maneuvers.append(valhalla_maneuver_dict(m, length_in_meters=False))

            alt_route_coords = decode_route_geometry(alt_geometry, precision=6)
            alt_costs = cost_calculator.calculate_costs(
                alt_distance_km, vehicle_type, fuel_efficiency, fuel_price,
                energy_efficiency, electricity_price, include_tolls, include_caz, caz_exempt,
                route_coords=alt_route_coords,
            )
            alt_hazard_penalty = 0
            alt_hazard_count = 0
            alt_hazards_list: List[Dict[str, Any]] = []
            if hazards:
                alt_hazard_penalty, alt_hazard_count = score_route_by_hazards(alt_geometry, hazards)
                alt_hazards_list = get_hazards_on_route(alt_geometry, hazards)

            route_names = ['Alternate', 'Balanced', 'Alternative']
            routes.append({
                'id': idx + 2,
                'name': route_names[idx] if idx < len(route_names) else f'Alternative {idx}',
                'distance_km': round(alt_distance_km, 2),
                'duration_minutes': round(alt_time_minutes, 0),
                'fuel_cost': round(alt_costs['fuel_cost'], 2),
                'fuel_litres': round(alt_costs['fuel_litres'], 2),
                'toll_cost': round(alt_costs['toll_cost'], 2),
                'caz_cost': round(alt_costs['caz_cost'], 2),
                'caz_details': alt_costs.get('caz_details', {}),
                'geometry': alt_geometry,
                'geometry_precision': 6,
                'hazard_penalty_seconds': round(alt_hazard_penalty, 0),
                'hazard_count': alt_hazard_count,
                'hazards': alt_hazards_list,
                'maneuvers': alt_maneuvers,
                'source': 'Valhalla',
            })

    return routes


def valhalla_trip_json_to_std_route_entry(
    name: str,
    trip_json: Dict[str, Any],
    route_id: int,
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
) -> Optional[Dict[str, Any]]:
    """Build a single /api/route-style route dict from Valhalla JSON containing trip+legs (e.g. auto_shorter)."""
    if 'trip' not in trip_json or 'legs' not in trip_json['trip']:
        return None
    legs = trip_json['trip']['legs']
    if not legs or 'shape' not in legs[0]:
        return None
    sh_geom = legs[0]['shape']
    sh_dist = trip_json['trip']['summary']['length']
    sh_time = trip_json['trip']['summary']['time']
    if not polyline:
        return None
    coords = polyline.decode(sh_geom, precision=6)
    penalty, haz_count = score_route_by_hazards(coords, hazards)
    hazards_list = get_hazards_on_route(coords, hazards)
    costs = cost_calculator.calculate_costs(
        sh_dist, vehicle_type, fuel_efficiency, fuel_price,
        energy_efficiency, electricity_price, include_tolls, include_caz, caz_exempt,
        route_coords=coords,
    )
    route_maneuvers = extract_valhalla_maneuvers({'legs': legs}, length_in_meters=True)

    return {
        'id': route_id,
        'name': name,
        'distance_km': round(sh_dist, 2),
        'duration_minutes': round(sh_time / 60, 0),
        'fuel_cost': round(costs['fuel_cost'], 2),
        'fuel_litres': round(costs['fuel_litres'], 2),
        'toll_cost': round(costs['toll_cost'], 2),
        'caz_cost': round(costs['caz_cost'], 2),
        'caz_details': costs.get('caz_details', {}),
        'geometry': sh_geom,
        'geometry_precision': 6,
        'hazard_penalty_seconds': round(penalty, 0),
        'hazard_count': haz_count,
        'hazards': hazards_list,
        'maneuvers': route_maneuvers,
        'source': 'Valhalla',
    }

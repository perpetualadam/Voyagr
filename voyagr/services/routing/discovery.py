"""
Distinct Valhalla route-type discovery for /api/route.

``append_distinct_valhalla_route_types`` adds 🌿 Scenic, 🛤️ Quiet, and
⚡ Optimised Discovery options to the route list for car (``auto``) requests
with hazard avoidance, when fewer than three distinct routes were found so far.
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

try:
    import polyline
except ImportError:  # pragma: no cover
    polyline = None  # type: ignore

import requests

from voyagr.services.hazards import build_valhalla_exclude_locations
from voyagr.services.routing.orchestrator import (
    build_valhalla_discovery_payload,
    find_baseline_cameras_on_route,
)
from voyagr.services.routing.route_entries import build_valhalla_route_entry
from voyagr.services.routing.route_variety import should_append_distinct_valhalla_route_types
from voyagr.services.routing.optimised_route import (
    QUIET_ROUTE_NAME,
    SCENIC_ROUTE_NAME,
    _append_preference_route_if_distinct,
    _preference_variety_fetch_order,
    routes_are_distinct,
)

logger = logging.getLogger('voyagr_web')


def append_distinct_valhalla_route_types(
    routes: List[Dict[str, Any]],
    *,
    valhalla_costing: str,
    enable_hazard_avoidance: bool,
    url: str,
    headers: Dict[str, str],
    route_locations: List[Dict[str, Any]],
    has_waypoints: bool,
    start_lat: float,
    start_lon: float,
    end_lat: float,
    end_lon: float,
    route_bbox: Dict[str, float],
    route_geometry: Optional[str],
    hazard_count: int,
    hazards: Dict[str, List[Dict[str, Any]]],
    cost_calculator: Any,
    avoid_cameras: bool,
    vehicle_type: str,
    fuel_efficiency: float,
    fuel_price: float,
    energy_efficiency: float,
    electricity_price: float,
    include_tolls: bool,
    include_caz: bool,
    caz_exempt: bool,
    prefer_scenic: bool = False,
    prefer_quiet: bool = False,
    avoid_tolls: bool = False,
    avoid_motorways: bool = False,
    avoid_ferries: bool = False,
    avoid_unpaved: bool = False,
) -> List[Dict[str, Any]]:
    """Add 🌿 Scenic, 🛤️ Quiet, and ⚡ Optimised Discovery routes (auto + hazard avoidance)."""
    if not should_append_distinct_valhalla_route_types(
        routes,
        valhalla_costing=valhalla_costing,
        enable_hazard_avoidance=enable_hazard_avoidance,
    ):
        return routes

    logger.info(
        '[VALHALLA] Standard routing: Adding distinct route types (%d routes so far)',
        len(routes),
    )

    alt_exclude: List[Dict[str, Any]] = []
    if hazards:
        try:
            alt_exclude = build_valhalla_exclude_locations(
                hazards, route_bbox=route_bbox, max_hazards=50,
                start_lat=start_lat, start_lon=start_lon,
                end_lat=end_lat, end_lon=end_lon,
            )
        except Exception as e:
            logger.warning('[VALHALLA] Failed to build alt exclude_locations: %s', e)

    pref_locs = route_locations if has_waypoints else [
        {'lat': start_lat, 'lon': start_lon},
        {'lat': end_lat, 'lon': end_lon},
    ]

    for name, p_scenic, p_quiet in _preference_variety_fetch_order(
        user_prefer_scenic=prefer_scenic,
        user_prefer_quiet=prefer_quiet,
    ):
        try:
            routes = _append_preference_route_if_distinct(
                routes,
                name=name,
                prefer_scenic=p_scenic,
                prefer_quiet=p_quiet,
                url=url,
                headers=headers,
                locs=pref_locs,
                exclude=alt_exclude,
                enable_hazard_avoidance=enable_hazard_avoidance,
                avoid_tolls=avoid_tolls,
                avoid_motorways=avoid_motorways,
                avoid_ferries=avoid_ferries,
                avoid_unpaved=avoid_unpaved,
                hazards=hazards,
                cost_calculator=cost_calculator,
                vehicle_type=vehicle_type,
                fuel_efficiency=fuel_efficiency,
                fuel_price=fuel_price,
                energy_efficiency=energy_efficiency,
                electricity_price=electricity_price,
                include_tolls=include_tolls,
                include_caz=include_caz,
                caz_exempt=caz_exempt,
            )
        except Exception as e:
            logger.warning('[VALHALLA] %s route failed: %s', name, e)

    next_route_id = max((int(r.get('id') or 0) for r in routes), default=0) + 1

    # Optimised Discovery (aggressive camera avoidance)
    try:
        if route_geometry:
            baseline_coords = polyline.decode(route_geometry, precision=6)
            baseline_cameras = find_baseline_cameras_on_route(baseline_coords, alt_exclude)

            if baseline_cameras:
                disc_payload = build_valhalla_discovery_payload(
                    start_lat=start_lat, start_lon=start_lon,
                    end_lat=end_lat, end_lon=end_lon,
                    exclude_locations=baseline_cameras[:50],
                )
                disc_response = requests.post(url, json=disc_payload, timeout=10, headers=headers)
                if disc_response.status_code == 200:
                    disc_data = disc_response.json()
                    if 'trip' in disc_data and 'legs' in disc_data['trip']:
                        disc_dist = disc_data['trip']['summary']['length']
                        route_entry = build_valhalla_route_entry(
                            trip=disc_data['trip'],
                            name='⚡ Optimised Discovery',
                            route_id=next_route_id,
                            traffic_multiplier=1.0,
                            maneuver_length_in_meters=True,
                            hazards=hazards,
                            cost_calculator=cost_calculator,
                            vehicle_type=vehicle_type,
                            fuel_efficiency=fuel_efficiency,
                            fuel_price=fuel_price,
                            energy_efficiency=energy_efficiency,
                            electricity_price=electricity_price,
                            include_tolls=include_tolls,
                            include_caz=include_caz,
                            caz_exempt=caz_exempt,
                        )
                        if route_entry['hazard_count'] < hazard_count:
                            route_entry['camera_exclusions_applied'] = True
                            if all(routes_are_distinct(route_entry, existing) for existing in routes):
                                routes.append(route_entry)
                                logger.info(
                                    '[VALHALLA] Added Optimised Discovery route: %.1fkm, %d cameras',
                                    disc_dist, route_entry['hazard_count'],
                                )
                            else:
                                logger.info(
                                    '[VALHALLA] Optimised Discovery too similar to existing options — skipped'
                                )
    except Exception as e:
        logger.warning('[VALHALLA] Optimised route failed: %s', e)

    logger.info('[VALHALLA] Final route count: %d', len(routes))
    return routes

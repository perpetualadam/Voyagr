"""
Post-Valhalla route enrichment: GraphHopper Optimised merge, ensure_* pipeline,
camera proximity annotation, and hazard-penalty reordering.

Consolidates logic that was duplicated across the primary Valhalla success path,
the Valhalla retry path, and the GraphHopper+Valhalla recovery path in
``voyagr_web.calculate_route``.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any, Dict, List, Optional

from voyagr.services.routing.optimised_route import (
    annotate_routes_camera_proximity,
    baseline_camera_hazard_count,
    graphhopper_qualifies_as_optimised,
    is_primary_optimised_route,
)

logger = logging.getLogger('voyagr_web')


@dataclass
class RouteEnrichmentContext:
    """Shared inputs for the post-Valhalla enrichment pipeline."""

    url: str
    headers: Dict[str, str]
    route_locations: List[Dict[str, Any]]
    has_waypoints: bool
    start_lat: float
    start_lon: float
    end_lat: float
    end_lon: float
    route_bbox: Dict[str, float]
    hazards: Dict[str, List[Dict[str, Any]]]
    enable_hazard_avoidance: bool
    avoid_cameras: bool
    graphhopper_route: Optional[Dict[str, Any]]
    cost_calculator: Any
    vehicle_type: str
    fuel_efficiency: float
    fuel_price: float
    energy_efficiency: float
    electricity_price: float
    include_tolls: bool
    include_caz: bool
    caz_exempt: bool
    traffic_multiplier: float = 1.0
    max_detour: int = 20


def _ensure_kwargs(ctx: RouteEnrichmentContext) -> Dict[str, Any]:
    """Common kwargs shared by all three ensure_* helpers.

    Note: ``graphhopper_route`` is intentionally NOT included — only
    ``ensure_optimised_camera_avoiding_route`` accepts it (scenic/shortest do not).
    """
    return {
        'url': ctx.url,
        'headers': ctx.headers,
        'route_locations': ctx.route_locations,
        'has_waypoints': ctx.has_waypoints,
        'start_lat': ctx.start_lat,
        'start_lon': ctx.start_lon,
        'end_lat': ctx.end_lat,
        'end_lon': ctx.end_lon,
        'route_bbox': ctx.route_bbox,
        'hazards': ctx.hazards,
        'enable_hazard_avoidance': ctx.enable_hazard_avoidance,
        'avoid_cameras': ctx.avoid_cameras,
        'cost_calculator': ctx.cost_calculator,
        'vehicle_type': ctx.vehicle_type,
        'fuel_efficiency': ctx.fuel_efficiency,
        'fuel_price': ctx.fuel_price,
        'energy_efficiency': ctx.energy_efficiency,
        'electricity_price': ctx.electricity_price,
        'include_tolls': ctx.include_tolls,
        'include_caz': ctx.include_caz,
        'caz_exempt': ctx.caz_exempt,
    }


def merge_graphhopper_optimised_route(
    routes: List[Dict[str, Any]],
    ctx: RouteEnrichmentContext,
    *,
    log_label: str = 'primary',
) -> List[Dict[str, Any]]:
    """
    Insert GraphHopper ⚡ Optimised when the custom model qualifies, replacing any
    weaker Valhalla Optimised duplicate.
    """
    from voyagr.services.routing.route_entries import build_graphhopper_optimised_route_entry

    gh = ctx.graphhopper_route
    if not (gh and gh.get('success') and ctx.enable_hazard_avoidance):
        if gh and gh.get('success') and ctx.avoid_cameras:
            logger.warning(
                '[GRAPHHOPPER] Skipping unfiltered route as Optimised '
                '(custom model not applied); will use Valhalla exclude_locations'
            )
        return routes

    if not graphhopper_qualifies_as_optimised(gh, avoid_cameras=ctx.avoid_cameras):
        return routes

    try:
        gh_route_entry = build_graphhopper_optimised_route_entry(
            gh,
            ctx.hazards,
            ctx.cost_calculator,
            vehicle_type=ctx.vehicle_type,
            fuel_efficiency=ctx.fuel_efficiency,
            fuel_price=ctx.fuel_price,
            energy_efficiency=ctx.energy_efficiency,
            electricity_price=ctx.electricity_price,
            include_tolls=ctx.include_tolls,
            include_caz=ctx.include_caz,
            caz_exempt=ctx.caz_exempt,
            traffic_multiplier=ctx.traffic_multiplier,
        )
        if not gh_route_entry:
            return routes

        gh_hazard_count = gh_route_entry.get('hazard_count', 0)
        gh_distance_km = gh_route_entry.get('distance_km', 0)
        if log_label == 'primary':
            logger.info(
                '[GRAPHHOPPER] Converted %d instructions to maneuvers',
                len(gh_route_entry.get('maneuvers', [])),
            )

        gh_baseline = baseline_camera_hazard_count(routes)
        if gh_hazard_count > gh_baseline:
            logger.warning(
                '[GRAPHHOPPER] Skipping Optimised (%s): %d cameras vs baseline %d '
                '(Valhalla exclusions work better)',
                log_label, gh_hazard_count, gh_baseline,
            )
            return routes

        routes = [r for r in routes if not is_primary_optimised_route(r)]
        routes.insert(0, gh_route_entry)
        if log_label == 'retry':
            logger.info(
                '[GRAPHHOPPER] Added Optimised route to retry: %.1fkm, %d cameras',
                gh_distance_km, gh_hazard_count,
            )
        else:
            logger.info(
                '[GRAPHHOPPER] Added Optimised route (replaced Valhalla Optimised): '
                '%.1fkm, %d cameras',
                gh_distance_km, gh_hazard_count,
            )
    except Exception as e:
        logger.warning('[GRAPHHOPPER] Failed to add GraphHopper route (%s): %s', log_label, e)

    return routes


def apply_valhalla_route_enrichment(
    routes: List[Dict[str, Any]],
    ctx: RouteEnrichmentContext,
    *,
    merge_graphhopper: bool = True,
    log_label: str = 'primary',
) -> List[Dict[str, Any]]:
    """
    Full post-Valhalla enrichment: optional GH Optimised, ensure Optimised/Scenic/Shortest,
    camera proximity scores, hazard-penalty reorder + id renumber.
    """
    from voyagr.services.routing.route_variety import finalize_route_variety
    import voyagr_web as vw

    ensure_kw = _ensure_kwargs(ctx)

    if merge_graphhopper:
        routes = merge_graphhopper_optimised_route(routes, ctx, log_label=log_label)

    # Only ensure_optimised_* takes graphhopper_route; scenic/shortest do not.
    routes = vw.ensure_optimised_camera_avoiding_route(
        routes, graphhopper_route=ctx.graphhopper_route, **ensure_kw
    )
    routes = vw.ensure_scenic_valhalla_route(routes, **ensure_kw)
    routes = vw.ensure_shortest_respects_camera_avoidance(routes, **ensure_kw)
    routes = annotate_routes_camera_proximity(routes, ctx.hazards)

    if ctx.enable_hazard_avoidance and ctx.hazards:
        routes_sorted = sorted(
            routes,
            key=lambda r: (r.get('hazard_penalty_seconds', 0), r.get('duration_minutes', 0)),
        )
        print('[HAZARDS] Routes reordered by hazard penalty:')
        for idx, route in enumerate(routes_sorted):
            print(
                f"  Route {idx+1}: {route['name']} - Hazard penalty: "
                f"{route.get('hazard_penalty_seconds', 0):.0f}s, "
                f"Count: {route.get('hazard_count', 0)}"
            )
        routes = routes_sorted
        for idx, route in enumerate(routes):
            route['id'] = idx + 1

    routes = finalize_route_variety(routes, max_detour_percent=ctx.max_detour)
    return routes

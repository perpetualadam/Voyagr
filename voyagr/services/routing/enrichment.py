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
    traffic_level: str = 'N/A'
    max_detour: int = 20
    valhalla_costing: str = 'auto'
    prefer_scenic: bool = False
    prefer_quiet: bool = False
    avoid_tolls: bool = False
    avoid_motorways: bool = False
    avoid_ferries: bool = False
    avoid_unpaved: bool = False
    route_optimization: str = 'fastest'


def _ensure_kwargs(ctx: RouteEnrichmentContext) -> Dict[str, Any]:
    """Common kwargs shared by all three ensure_* helpers.

    Note: ``graphhopper_route`` is intentionally NOT included — only
    ``ensure_optimised_camera_avoiding_route`` accepts it (scenic/quiet do not).
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


def _variety_kwargs(ctx: RouteEnrichmentContext) -> Dict[str, Any]:
    """Kwargs for ensure_costing_preference_variety_routes (extends shared ensure kwargs)."""
    return {
        **_ensure_kwargs(ctx),
        'valhalla_costing': ctx.valhalla_costing,
        'prefer_scenic': ctx.prefer_scenic,
        'prefer_quiet': ctx.prefer_quiet,
        'avoid_tolls': ctx.avoid_tolls,
        'avoid_motorways': ctx.avoid_motorways,
        'avoid_ferries': ctx.avoid_ferries,
        'avoid_unpaved': ctx.avoid_unpaved,
        'route_optimization': ctx.route_optimization,
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
    if not (gh and gh.get('success')):
        return routes

    if ctx.has_waypoints:
        logger.info('[GRAPHHOPPER] Skipping Optimised merge — route has via-points/stops (GH is A→B only)')
        return routes

    if not graphhopper_qualifies_as_optimised(gh, avoid_cameras=ctx.avoid_cameras):
        if ctx.avoid_cameras:
            logger.warning(
                '[GRAPHHOPPER] Skipping unfiltered route as Optimised '
                '(custom model not applied); will use Valhalla exclude_locations'
            )
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
            traffic_level=ctx.traffic_level,
            include_traffic_fields=(log_label == 'primary'),
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
                '[GRAPHHOPPER] Optimised (%s) has %d cameras vs baseline %d — '
                'keeping as primary option anyway',
                log_label, gh_hazard_count, gh_baseline,
            )
            gh_route_entry['routing_preferences_limited'] = True

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
    Full post-Valhalla enrichment: optional GH Optimised, ensure Optimised,
    ensure Scenic/Quiet preference routes, camera proximity scores,
    hazard-penalty reorder + id renumber.
    """
    from voyagr.services.routing.route_variety import finalize_route_variety, pin_optimised_route_first
    import voyagr_web as vw

    ensure_kw = _ensure_kwargs(ctx)

    if merge_graphhopper:
        routes = merge_graphhopper_optimised_route(routes, ctx, log_label=log_label)

    # Only ensure_optimised_* takes graphhopper_route.
    routes = vw.ensure_optimised_camera_avoiding_route(
        routes, graphhopper_route=ctx.graphhopper_route, **ensure_kw
    )
    routes = vw.ensure_costing_preference_variety_routes(routes, **_variety_kwargs(ctx))
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

    routes = pin_optimised_route_first(routes)
    routes = finalize_route_variety(routes, max_detour_percent=ctx.max_detour)
    return routes

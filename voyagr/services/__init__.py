"""
Business logic services for Voyagr.

Contains:
- costs: Cost calculation and route caching
- hazards: Hazard detection and avoidance
- routing: Routing engine integrations
"""

from voyagr.services.costs import (
    RouteCache,
    CostCalculator,
    calculate_fuel_cost,
    calculate_energy_cost,
    calculate_toll_cost,
    calculate_caz_cost,
    check_route_in_caz,
    invalidate_hazard_cache,
    invalidate_route_cache,
    route_cache,
    cost_calculator,
)

from voyagr.services.hazards import (
    fetch_hazards_for_route,
    fetch_tomtom_incidents,
    merge_hazards_with_tomtom_incidents,
    build_graphhopper_custom_model,
    build_valhalla_exclude_locations,
    build_graphhopper_camera_avoidance_model,
    get_hazards_on_route,
    score_route_by_hazards,
    CAMERA_AREAS_DATA,
    load_camera_areas,
)

from voyagr.services.routing import (
    FallbackChainOptimizer,
    ParallelRoutingEngine,
    get_traffic_duration_multiplier,
    route_with_graphhopper,
    fallback_optimizer,
    optimize_stop_order,
    build_multidrop_route,
)

__all__ = [
    # Cost module
    'RouteCache',
    'CostCalculator',
    'calculate_fuel_cost',
    'calculate_energy_cost',
    'calculate_toll_cost',
    'calculate_caz_cost',
    'check_route_in_caz',
    'invalidate_hazard_cache',
    'invalidate_route_cache',
    'route_cache',
    'cost_calculator',
    # Hazards module
    'fetch_hazards_for_route',
    'fetch_tomtom_incidents',
    'merge_hazards_with_tomtom_incidents',
    'build_graphhopper_custom_model',
    'build_valhalla_exclude_locations',
    'build_graphhopper_camera_avoidance_model',
    'get_hazards_on_route',
    'score_route_by_hazards',
    'CAMERA_AREAS_DATA',
    'load_camera_areas',
    # Routing module
    'FallbackChainOptimizer',
    'ParallelRoutingEngine',
    'get_traffic_duration_multiplier',
    'route_with_graphhopper',
    'fallback_optimizer',
    'optimize_stop_order',
    'build_multidrop_route',
]


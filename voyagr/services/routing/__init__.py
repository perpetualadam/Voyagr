"""
Routing services for Voyagr.

Contains:
- engines: Routing engine management and fallback chain
- multidrop: Multi-drop route optimization (TSP, 2-opt)
"""

from voyagr.services.routing.engines import (
    FallbackChainOptimizer,
    ParallelRoutingEngine,
    get_traffic_duration_multiplier,
    route_with_graphhopper,
    fallback_optimizer,
)

from voyagr.services.routing.multidrop import (
    optimize_stop_order,
    build_multidrop_route,
)

__all__ = [
    'FallbackChainOptimizer',
    'ParallelRoutingEngine',
    'get_traffic_duration_multiplier',
    'route_with_graphhopper',
    'fallback_optimizer',
    'optimize_stop_order',
    'build_multidrop_route',
]


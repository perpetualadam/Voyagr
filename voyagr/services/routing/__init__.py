"""
Routing services for Voyagr.

Contains:
- graphhopper: GraphHopper routing engine
- valhalla: Valhalla routing engine
- osrm: OSRM routing engine
- engines: Routing engine management and fallback chain
"""

from voyagr.services.routing.engines import (
    FallbackChainOptimizer,
    ParallelRoutingEngine,
    get_traffic_duration_multiplier,
    route_with_graphhopper,
    fallback_optimizer,
)

__all__ = [
    'FallbackChainOptimizer',
    'ParallelRoutingEngine',
    'get_traffic_duration_multiplier',
    'route_with_graphhopper',
    'fallback_optimizer',
]


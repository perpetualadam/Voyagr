"""
Custom Routing Engine for Voyagr
UK-only, fast routing using Dijkstra + Contraction Hierarchies
Phase 2: Added A* heuristic, CH, and K-shortest paths
"""

from .graph import RoadNetwork
from .dijkstra import Router
from .osm_parser import OSMParser
from .instructions import InstructionGenerator
from .costs import CostCalculator
from .cache import RouteCache
from .profiler import RouterProfiler
from .contraction_hierarchies import ContractionHierarchies
from .k_shortest_paths import KShortestPaths

__version__ = "0.2.0"
__all__ = [
    'RoadNetwork',
    'Router',
    'OSMParser',
    'InstructionGenerator',
    'CostCalculator',
    'RouteCache',
    'RouterProfiler',
    'ContractionHierarchies',
    'KShortestPaths'
]


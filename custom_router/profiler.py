"""
Performance profiler for custom router
Identifies bottlenecks and measures optimization impact
"""

import time
import psutil
import os
from typing import Dict, List, Tuple
from .graph import RoadNetwork
from .dijkstra import Router

class RouterProfiler:
    """Profile router performance."""
    
    def __init__(self, graph: RoadNetwork):
        self.graph = graph
        self.router = Router(graph)
        self.results = []
    
    def profile_route(self, start_lat: float, start_lon: float,
                     end_lat: float, end_lon: float) -> Dict:
        """Profile a single route calculation."""
        process = psutil.Process(os.getpid())
        
        # Memory before
        mem_before = process.memory_info().rss / 1024 / 1024  # MB
        
        # Time the route
        start_time = time.time()
        route = self.router.route(start_lat, start_lon, end_lat, end_lon)
        elapsed = (time.time() - start_time) * 1000  # ms
        
        # Memory after
        mem_after = process.memory_info().rss / 1024 / 1024  # MB
        
        if not route:
            return None
        
        result = {
            'distance_km': route.get('distance_km', 0),
            'time_ms': elapsed,
            'memory_mb': mem_after - mem_before,
            'nodes_explored': self.router.stats.get('nodes_explored', 0),
            'iterations': self.router.stats.get('iterations', 0),
        }
        
        self.results.append(result)
        return result
    
    def profile_batch(self, routes: List[Tuple]) -> Dict:
        """Profile multiple routes."""
        print(f"\n[Profiler] Testing {len(routes)} routes...")
        
        times = []
        for i, (start_lat, start_lon, end_lat, end_lon) in enumerate(routes):
            result = self.profile_route(start_lat, start_lon, end_lat, end_lon)
            if result:
                times.append(result['time_ms'])
                print(f"  Route {i+1}: {result['time_ms']:.0f}ms, "
                      f"{result['distance_km']:.1f}km, "
                      f"nodes: {result['nodes_explored']}")
        
        return {
            'avg_time_ms': sum(times) / len(times) if times else 0,
            'min_time_ms': min(times) if times else 0,
            'max_time_ms': max(times) if times else 0,
            'total_routes': len(routes),
        }
    
    def get_summary(self) -> Dict:
        """Get profiling summary."""
        if not self.results:
            return {}
        
        times = [r['time_ms'] for r in self.results]
        distances = [r['distance_km'] for r in self.results]
        
        return {
            'avg_time_ms': sum(times) / len(times),
            'min_time_ms': min(times),
            'max_time_ms': max(times),
            'avg_distance_km': sum(distances) / len(distances),
            'total_routes': len(self.results),
        }


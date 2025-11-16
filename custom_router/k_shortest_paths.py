"""
K-Shortest Paths algorithm for alternative routes
Phase 2: Provides 3-4 route options like GraphHopper
"""

import heapq
from typing import List, Dict, Tuple, Optional
from .graph import RoadNetwork
from .dijkstra import Router

class KShortestPaths:
    """Find K shortest paths between two nodes."""
    
    def __init__(self, router: Router):
        self.router = router
        self.graph = router.graph
    
    def find_k_paths(self, start_lat: float, start_lon: float,
                     end_lat: float, end_lon: float,
                     k: int = 4) -> List[Dict]:
        """
        Find K shortest paths using Yen's algorithm.
        Returns list of routes sorted by distance.
        """
        # Find nearest nodes
        start_node = self.graph.find_nearest_node(start_lat, start_lon)
        end_node = self.graph.find_nearest_node(end_lat, end_lon)
        
        if not start_node or not end_node:
            return []
        
        # Find first shortest path
        first_path = self.router.dijkstra(start_node, end_node)
        if not first_path:
            return []
        
        paths = [first_path]
        candidates = []
        
        # Find K-1 alternative paths
        for k_iter in range(1, k):
            # For each edge in the previous path
            for i in range(len(first_path) - 1):
                # Remove edge and find alternative
                spur_node = first_path[i]
                root_path = first_path[:i+1]
                
                # Find shortest path from spur_node avoiding root_path
                alt_path = self._find_spur_path(spur_node, end_node, root_path)
                
                if alt_path:
                    full_path = root_path[:-1] + alt_path
                    candidates.append(full_path)
            
            if not candidates:
                break
            
            # Get best candidate
            candidates.sort(key=lambda p: self._path_distance(p))
            best_path = candidates.pop(0)
            paths.append(best_path)
        
        # Convert paths to route data
        routes = []
        for path in paths:
            route_data = self.router.extract_route_data(path)
            routes.append(route_data)
        
        return routes
    
    def _find_spur_path(self, start_node: int, end_node: int,
                       forbidden_path: List[int]) -> Optional[List[int]]:
        """Find shortest path avoiding forbidden path."""
        # Temporarily remove forbidden edges
        removed_edges = []
        for i in range(len(forbidden_path) - 1):
            from_node = forbidden_path[i]
            to_node = forbidden_path[i + 1]
            
            if from_node in self.graph.edges:
                # Find and remove edge
                for j, (neighbor, dist, speed, way_id) in enumerate(self.graph.edges[from_node]):
                    if neighbor == to_node:
                        removed_edges.append((from_node, j, self.graph.edges[from_node][j]))
                        self.graph.edges[from_node].pop(j)
                        break
        
        # Find alternative path
        alt_path = self.router.dijkstra(start_node, end_node)
        
        # Restore edges
        for from_node, idx, edge in removed_edges:
            self.graph.edges[from_node].insert(idx, edge)
        
        return alt_path
    
    def _path_distance(self, path: List[int]) -> float:
        """Calculate total distance of path."""
        total = 0
        for i in range(len(path) - 1):
            from_node = path[i]
            to_node = path[i + 1]
            
            if from_node in self.graph.edges:
                for neighbor, dist, speed, way_id in self.graph.edges[from_node]:
                    if neighbor == to_node:
                        total += dist
                        break
        
        return total


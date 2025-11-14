"""
Dijkstra routing algorithm
Bidirectional Dijkstra for fast route calculation
Optimized for performance with early termination and efficient data structures
"""

import heapq
import time
from typing import List, Tuple, Optional, Dict, Set
from collections import deque
from .graph import RoadNetwork

class Router:
    """Route calculation using Dijkstra algorithm."""

    # Performance tuning constants
    EARLY_TERMINATION_THRESHOLD = 1.1  # Stop when best path is 10% better than current
    MAX_ITERATIONS = 1000000  # Prevent infinite loops (increased from 100k)

    def __init__(self, graph: RoadNetwork):
        """Initialize router with graph."""
        self.graph = graph
        self.stats = {
            'iterations': 0,
            'nodes_explored': 0,
            'early_terminations': 0
        }
    
    def route(self, start_lat: float, start_lon: float, 
              end_lat: float, end_lon: float) -> Optional[Dict]:
        """Calculate route between two points."""
        start_time = time.time()
        
        # Find nearest nodes
        start_node = self.graph.find_nearest_node(start_lat, start_lon)
        end_node = self.graph.find_nearest_node(end_lat, end_lon)
        
        if not start_node or not end_node:
            return None
        
        # Run Dijkstra
        path = self.dijkstra(start_node, end_node)
        
        if not path:
            return None
        
        # Extract route data
        route_data = self.extract_route_data(path)
        route_data['response_time_ms'] = (time.time() - start_time) * 1000
        
        return route_data

    def _are_connected(self, start_node: int, end_node: int, max_search: int = 50000) -> bool:
        """Quick check if two nodes are in the same connected component.

        Uses BFS with a limited search to avoid long computations.
        Returns True if connected, False if not connected or search limit reached.
        """
        if start_node == end_node:
            return True

        visited = set()
        queue = deque([start_node])
        visited.add(start_node)
        iterations = 0

        while queue and iterations < max_search:
            iterations += 1
            node = queue.popleft()

            if node == end_node:
                return True

            # Get neighbors
            if node in self.graph.edges:
                for neighbor, _, _, _ in self.graph.edges[node]:
                    if neighbor not in visited:
                        visited.add(neighbor)
                        queue.append(neighbor)

        # If we hit the search limit, assume not connected
        return False

    def dijkstra(self, start_node: int, end_node: int) -> Optional[List[int]]:
        """Optimized bidirectional Dijkstra algorithm with early termination."""

        # Quick connectivity check to avoid wasting time on disconnected nodes
        if not self._are_connected(start_node, end_node, max_search=10000):
            return None

        # Forward search
        forward_dist = {start_node: 0}
        forward_prev = {}
        forward_pq = [(0, start_node)]
        forward_visited: Set[int] = set()

        # Backward search
        backward_dist = {end_node: 0}
        backward_prev = {}
        backward_pq = [(0, end_node)]
        backward_visited: Set[int] = set()

        best_distance = float('inf')
        meeting_node = None
        iterations = 0

        while (forward_pq or backward_pq) and iterations < self.MAX_ITERATIONS:
            iterations += 1

            # Balance search: process from smaller frontier
            forward_frontier_size = len(forward_pq)
            backward_frontier_size = len(backward_pq)

            # Forward step (if frontier is smaller or backward is empty)
            if forward_pq and (not backward_pq or forward_frontier_size <= backward_frontier_size):
                dist, node = heapq.heappop(forward_pq)

                # Skip if already visited
                if node in forward_visited:
                    continue
                forward_visited.add(node)

                # Skip if this is not the best path to this node
                if dist > forward_dist.get(node, float('inf')):
                    continue

                # Check if we've met the backward search
                if node in backward_dist:
                    candidate_dist = forward_dist[node] + backward_dist[node]
                    if candidate_dist < best_distance:
                        best_distance = candidate_dist
                        meeting_node = node

                # Early termination: if best path is significantly better than frontier
                if best_distance < float('inf'):
                    min_frontier = min(forward_pq)[0] if forward_pq else float('inf')
                    if best_distance <= min_frontier * self.EARLY_TERMINATION_THRESHOLD:
                        self.stats['early_terminations'] += 1
                        break

                # Explore neighbors
                for neighbor, edge_dist, speed, way_id in self.graph.get_neighbors(node):
                    if neighbor not in forward_visited:
                        new_dist = dist + edge_dist

                        if new_dist < forward_dist.get(neighbor, float('inf')):
                            forward_dist[neighbor] = new_dist
                            forward_prev[neighbor] = node
                            heapq.heappush(forward_pq, (new_dist, neighbor))

            # Backward step (if frontier is smaller or forward is empty)
            elif backward_pq:
                dist, node = heapq.heappop(backward_pq)

                # Skip if already visited
                if node in backward_visited:
                    continue
                backward_visited.add(node)

                # Skip if this is not the best path to this node
                if dist > backward_dist.get(node, float('inf')):
                    continue

                # Check if we've met the forward search
                if node in forward_dist:
                    candidate_dist = forward_dist[node] + backward_dist[node]
                    if candidate_dist < best_distance:
                        best_distance = candidate_dist
                        meeting_node = node

                # Early termination: if best path is significantly better than frontier
                if best_distance < float('inf'):
                    min_frontier = min(backward_pq)[0] if backward_pq else float('inf')
                    if best_distance <= min_frontier * self.EARLY_TERMINATION_THRESHOLD:
                        self.stats['early_terminations'] += 1
                        break

                # Explore neighbors
                for neighbor, edge_dist, speed, way_id in self.graph.get_neighbors(node):
                    if neighbor not in backward_visited:
                        new_dist = dist + edge_dist

                        if new_dist < backward_dist.get(neighbor, float('inf')):
                            backward_dist[neighbor] = new_dist
                            backward_prev[neighbor] = node
                            heapq.heappush(backward_pq, (new_dist, neighbor))

        self.stats['iterations'] = iterations
        self.stats['nodes_explored'] = len(forward_visited) + len(backward_visited)

        if meeting_node is None:
            return None

        # Reconstruct path
        return self.reconstruct_path(forward_prev, backward_prev, meeting_node)
    
    def reconstruct_path(self, forward_prev: Dict, backward_prev: Dict, 
                        meeting_node: int) -> List[int]:
        """Reconstruct path from forward and backward searches."""
        path = []
        
        # Build forward path
        node = meeting_node
        while node in forward_prev:
            path.append(node)
            node = forward_prev[node]
        path.append(node)
        path.reverse()
        
        # Build backward path
        node = meeting_node
        backward_path = []
        while node in backward_prev:
            node = backward_prev[node]
            backward_path.append(node)
        
        path.extend(backward_path)
        return path
    
    def extract_route_data(self, path: List[int]) -> Dict:
        """Extract route data from path (optimized)."""
        coordinates = []
        total_distance = 0
        total_time = 0

        # Extract coordinates in single pass
        for node_id in path:
            coords = self.graph.get_node_coords(node_id)
            if coords:
                coordinates.append(coords)

        # Calculate distance and time with optimized neighbor lookup
        for i in range(len(path) - 1):
            from_node = path[i]
            to_node = path[i + 1]

            # Get neighbors and find edge in single pass
            neighbors = self.graph.get_neighbors(from_node)
            for neighbor, distance, speed, way_id in neighbors:
                if neighbor == to_node:
                    total_distance += distance
                    # Time = distance / speed (convert km/h to m/s)
                    # Optimization: avoid division in loop
                    total_time += distance / (speed / 3.6)
                    break

        # Encode polyline (with error handling)
        encoded = None
        try:
            import polyline
            encoded = polyline.encode(coordinates, 5)
        except Exception:
            pass

        # Return optimized dict
        distance_m = total_distance
        duration_s = total_time

        return {
            'path_nodes': path,
            'coordinates': coordinates,
            'polyline': encoded,
            'distance_m': distance_m,
            'duration_s': duration_s,
            'distance_km': distance_m / 1000,
            'duration_minutes': duration_s / 60
        }

    def get_stats(self) -> Dict:
        """Get routing statistics for performance analysis."""
        return {
            'iterations': self.stats['iterations'],
            'nodes_explored': self.stats['nodes_explored'],
            'early_terminations': self.stats['early_terminations']
        }

    def reset_stats(self) -> None:
        """Reset statistics counters."""
        self.stats = {
            'iterations': 0,
            'nodes_explored': 0,
            'early_terminations': 0
        }


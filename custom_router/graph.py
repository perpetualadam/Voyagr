"""
Road network graph data structure
In-memory representation for fast routing
"""

import sqlite3
import math
from typing import Dict, List, Tuple, Optional
from collections import defaultdict

class RoadNetwork:
    """In-memory road network graph."""
    
    def __init__(self, db_file: str):
        """Initialize road network from database."""
        self.db_file = db_file
        self.nodes = {}  # node_id -> (lat, lon)
        self.edges = defaultdict(list)  # node_id -> [(neighbor_id, distance_m, speed_kmh, way_id)]
        self.ways = {}  # way_id -> {name, highway, speed_limit}
        self.turn_restrictions = {}  # (from_way, to_way) -> restriction_type
        
        self.load_from_database()
    
    def load_from_database(self):
        """Load graph from SQLite database."""
        print("[Graph] Loading from database...")

        try:
            conn = sqlite3.connect(self.db_file)
            cursor = conn.cursor()

            # Load nodes
            print("[Graph] Loading nodes...")
            cursor.execute('SELECT id, lat, lon FROM nodes')
            for node_id, lat, lon in cursor.fetchall():
                self.nodes[node_id] = (lat, lon)

            # Load ways
            print("[Graph] Loading ways...")
            cursor.execute('SELECT id, name, highway, speed_limit_kmh FROM ways')
            for way_id, name, highway, speed_limit in cursor.fetchall():
                self.ways[way_id] = {
                    'name': name,
                    'highway': highway,
                    'speed_limit': speed_limit
                }

            # Load edges (optimized batch loading)
            print("[Graph] Loading edges...")
            cursor.execute('SELECT from_node_id, to_node_id, distance_m, speed_limit_kmh, way_id FROM edges')

            # Batch load edges for better performance
            batch_size = 100000
            edge_count = 0
            while True:
                rows = cursor.fetchmany(batch_size)
                if not rows:
                    break
                for from_node, to_node, distance, speed_limit, way_id in rows:
                    self.edges[from_node].append((to_node, distance, speed_limit, way_id))
                    edge_count += 1
                print(f"[Graph] Loaded {edge_count:,} edges...")

            print(f"[Graph] Loaded {edge_count:,} edges total")

            # Load turn restrictions
            print("[Graph] Loading turn restrictions...")
            cursor.execute('SELECT from_way_id, to_way_id, restriction_type FROM turn_restrictions')
            for from_way, to_way, restriction in cursor.fetchall():
                self.turn_restrictions[(from_way, to_way)] = restriction

            conn.close()

            print(f"[Graph] Loaded: {len(self.nodes)} nodes, {len(self.ways)} ways, {edge_count} edges")
        except Exception as e:
            print(f"[Graph] Load error: {e}")
    
    def build_edges_from_ways(self, ways: Dict):
        """Build edge list from ways."""
        print("[Graph] Building edges from ways...")
        
        edge_count = 0
        for way_id, way_data in ways.items():
            nodes = way_data['nodes']
            speed_limit = way_data['speed_limit']
            oneway = way_data.get('oneway', False)
            
            # Create edges between consecutive nodes
            for i in range(len(nodes) - 1):
                from_node = nodes[i]
                to_node = nodes[i + 1]
                
                if from_node not in self.nodes or to_node not in self.nodes:
                    continue
                
                # Calculate distance
                distance = self.haversine_distance(
                    self.nodes[from_node],
                    self.nodes[to_node]
                )
                
                # Add forward edge
                self.edges[from_node].append((to_node, distance, speed_limit, way_id))
                edge_count += 1
                
                # Add reverse edge (if not oneway)
                if not oneway:
                    self.edges[to_node].append((from_node, distance, speed_limit, way_id))
                    edge_count += 1
        
        print(f"[Graph] Built {edge_count} edges")
    
    @staticmethod
    def haversine_distance(coord1: Tuple[float, float], coord2: Tuple[float, float]) -> float:
        """Calculate distance between two coordinates in meters."""
        lat1, lon1 = coord1
        lat2, lon2 = coord2
        
        R = 6371000  # Earth radius in meters
        
        phi1 = math.radians(lat1)
        phi2 = math.radians(lat2)
        delta_phi = math.radians(lat2 - lat1)
        delta_lambda = math.radians(lon2 - lon1)
        
        a = math.sin(delta_phi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2) ** 2
        c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
        
        return R * c
    
    def get_neighbors(self, node_id: int) -> List[Tuple[int, float, int, int]]:
        """Get neighbors of a node."""
        return self.edges.get(node_id, [])
    
    def get_node_coords(self, node_id: int) -> Optional[Tuple[float, float]]:
        """Get coordinates of a node."""
        return self.nodes.get(node_id)
    
    def get_way_info(self, way_id: int) -> Optional[Dict]:
        """Get information about a way."""
        return self.ways.get(way_id)
    
    def find_nearest_node(self, lat: float, lon: float, search_radius_m: float = 5000) -> Optional[int]:
        """Find nearest node to coordinates."""
        min_distance = float('inf')
        nearest_node = None

        for node_id, (node_lat, node_lon) in self.nodes.items():
            distance = self.haversine_distance((lat, lon), (node_lat, node_lon))
            if distance < min_distance:
                min_distance = distance
                nearest_node = node_id

        # Return nearest node if within search radius
        if min_distance <= search_radius_m:
            return nearest_node

        return None
    
    def get_statistics(self) -> Dict:
        """Get graph statistics."""
        total_edges = sum(len(neighbors) for neighbors in self.edges.values())
        
        return {
            'nodes': len(self.nodes),
            'edges': total_edges,
            'ways': len(self.ways),
            'turn_restrictions': len(self.turn_restrictions)
        }


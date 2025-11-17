"""
Road network graph data structure
In-memory representation for fast routing
"""

import sqlite3
import math
import gc
import traceback
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

        # Phase 4: Component caching
        self.components = {}  # node_id -> component_id
        self.component_analyzer = None

        self.load_from_database()
    
    def load_from_database(self):
        """Load graph from SQLite database with eager edge loading."""
        print("[Graph] Loading from database...")

        try:
            conn = sqlite3.connect(self.db_file)
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()

            # Load nodes
            print("[Graph] Loading nodes...")
            cursor.execute('SELECT id, lat, lon FROM nodes')
            node_count = 0
            for row in cursor.fetchall():
                self.nodes[row['id']] = (row['lat'], row['lon'])
                node_count += 1
            print(f"[Graph] Loaded {node_count:,} nodes")

            # Load ways
            print("[Graph] Loading ways...")
            cursor.execute('SELECT id, name, highway, speed_limit_kmh FROM ways')
            way_count = 0
            for row in cursor.fetchall():
                self.ways[row['id']] = {
                    'name': row['name'],
                    'highway': row['highway'],
                    'speed_limit': row['speed_limit_kmh']
                }
                way_count += 1
            print(f"[Graph] Loaded {way_count:,} ways")

            # Load edges with BATCH LOADING for component analysis
            # Pre-load all edges into memory for fast component detection
            print("[Graph] Loading edges (batch loading for component analysis)...")
            edge_count = 0
            batch_size = 5000000
            offset = 0

            try:
                while True:
                    cursor.execute(
                        'SELECT from_node_id, to_node_id, distance_m, speed_limit_kmh, way_id '
                        'FROM edges LIMIT ? OFFSET ?',
                        (batch_size, offset)
                    )

                    rows = cursor.fetchall()
                    if not rows:
                        break

                    for row in rows:
                        from_node = row['from_node_id']
                        to_node = row['to_node_id']
                        distance = row['distance_m']
                        speed_limit = row['speed_limit_kmh']
                        way_id = row['way_id']

                        self.edges[from_node].append((to_node, distance, speed_limit, way_id))
                        edge_count += 1

                    offset += batch_size
                    print(f"[Graph] Loaded {edge_count:,} edges...")

                    # Force garbage collection between batches
                    gc.collect()

            except Exception as e:
                print(f"[Graph] Error loading edges at {edge_count:,}: {e}")
                traceback.print_exc()

            print(f"[Graph] Loaded {edge_count:,} edges")

            # Load turn restrictions
            print("[Graph] Loading turn restrictions...")
            cursor.execute('SELECT from_way_id, to_way_id, restriction_type FROM turn_restrictions')
            restriction_count = 0
            for row in cursor.fetchall():
                self.turn_restrictions[(row['from_way_id'], row['to_way_id'])] = row['restriction_type']
                restriction_count += 1
            print(f"[Graph] Loaded {restriction_count:,} turn restrictions")

            conn.close()

            print(f"[Graph] Loaded: {node_count:,} nodes, {way_count:,} ways, {edge_count:,} edges (eager)")
        except Exception as e:
            print(f"[Graph] Load error: {e}")

    def get_neighbors(self, node_id: int):
        """Get neighbors of a node."""
        return self.edges.get(node_id, [])
    
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

    # Phase 4: Component caching methods
    def set_component_analyzer(self, analyzer):
        """Set component analyzer for this graph."""
        self.component_analyzer = analyzer
        self.components = analyzer.components

    def is_connected(self, node1: int, node2: int) -> bool:
        """Check if two nodes are in same component (O(1))."""
        if not self.component_analyzer:
            return True  # Assume connected if no analyzer
        return self.component_analyzer.is_connected(node1, node2)

    def get_component_id(self, node_id: int) -> int:
        """Get component ID for a node."""
        if not self.component_analyzer:
            return -1
        return self.component_analyzer.get_component_id(node_id)

    def is_in_main_component(self, node_id: int) -> bool:
        """Check if node is in main component."""
        if not self.component_analyzer:
            return True  # Assume in main if no analyzer
        return self.component_analyzer.is_in_main_component(node_id)


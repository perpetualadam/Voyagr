"""
Road network graph data structure
In-memory representation for fast routing
"""

import sqlite3
import math
import gc
import traceback
import threading
from typing import Dict, List, Tuple, Optional
from collections import defaultdict

try:
    import numpy as np
    HAS_NUMPY = True
except ImportError:
    HAS_NUMPY = False

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

        # Spatial indexing for fast nearest node lookup (grid-based)
        self.spatial_grid = {}  # (grid_x, grid_y) -> [node_ids]
        self.grid_size_deg = 0.01  # Grid cell size in degrees (~1.1km at equator) - finer grid for faster lookup
        self.earth_radius_km = 6371.0  # Earth radius in kilometers

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

            # Build spatial grid index for fast nearest node lookup
            if node_count > 0:
                print("[Graph] Building spatial grid index...")
                self._build_spatial_grid()
                print("[Graph] Spatial grid index built successfully")

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

            # Load edges in background thread for component analysis
            # This allows app to start immediately while edges load in background
            print("[Graph] Edges will be loaded in background for component analysis...")
            self._edges_loaded = False
            self._load_edges_background()

            # Load turn restrictions
            print("[Graph] Loading turn restrictions...")
            cursor.execute('SELECT from_way_id, to_way_id, restriction_type FROM turn_restrictions')
            restriction_count = 0
            for row in cursor.fetchall():
                self.turn_restrictions[(row['from_way_id'], row['to_way_id'])] = row['restriction_type']
                restriction_count += 1
            print(f"[Graph] Loaded {restriction_count:,} turn restrictions")

            conn.close()

            print(f"[Graph] Loaded: {node_count:,} nodes, {way_count:,} ways (edges loaded on-demand)")
        except Exception as e:
            print(f"[Graph] Load error: {e}")

    def get_neighbors(self, node_id: int):
        """Get neighbors of a node. Loads edges on-demand if not cached."""
        # If edges not loaded yet, wait for background loading to complete
        if not self._edges_loaded:
            # Wait for edges to load in background (max 30 seconds)
            import time
            start_wait = time.time()
            while not self._edges_loaded and (time.time() - start_wait) < 30:
                time.sleep(0.1)

        return self.edges.get(node_id, [])

    def _load_edges_for_node(self, node_id: int):
        """Load edges for a specific node from database."""
        try:
            conn = sqlite3.connect(self.db_file)
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()

            # Load outgoing edges for this node
            cursor.execute(
                'SELECT from_node_id, to_node_id, distance_m, speed_limit_kmh, way_id '
                'FROM edges WHERE from_node_id = ?',
                (node_id,)
            )

            for row in cursor.fetchall():
                from_node = row['from_node_id']
                to_node = row['to_node_id']
                distance = row['distance_m']
                speed_limit = row['speed_limit_kmh']
                way_id = row['way_id']

                self.edges[from_node].append((to_node, distance, speed_limit, way_id))

            conn.close()
        except Exception as e:
            print(f"[Graph] Error loading edges for node {node_id}: {e}")
    
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

    def _build_spatial_grid(self) -> None:
        """Build spatial grid index for fast nearest node lookup.

        Divides the UK into grid cells and indexes nodes by cell.
        This enables O(1) cell lookup + O(k) search where k is nodes per cell.
        """
        if not self.nodes:
            return

        # Build grid
        for node_id, (lat, lon) in self.nodes.items():
            # Calculate grid cell coordinates
            grid_x = int(lon / self.grid_size_deg)
            grid_y = int(lat / self.grid_size_deg)
            grid_key = (grid_x, grid_y)

            # Add node to grid cell
            if grid_key not in self.spatial_grid:
                self.spatial_grid[grid_key] = []
            self.spatial_grid[grid_key].append(node_id)

    def _load_edges_background(self) -> None:
        """Load edges in background thread."""
        def load_edges():
            import sys
            try:
                conn = sqlite3.connect(self.db_file)
                conn.row_factory = sqlite3.Row
                cursor = conn.cursor()

                msg = "[Graph] Loading edges in background..."
                print(msg, file=sys.stderr, flush=True)
                edge_count = 0
                batch_size = 5000000
                offset = 0

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
                    msg = f"[Graph] Loaded {edge_count:,} edges in background..."
                    print(msg, file=sys.stderr, flush=True)
                    gc.collect()

                conn.close()
                self._edges_loaded = True
                msg = f"[Graph] ✅ Background edge loading complete: {edge_count:,} edges"
                print(msg, file=sys.stderr, flush=True)
            except Exception as e:
                msg = f"[Graph] Error loading edges in background: {e}"
                print(msg, file=sys.stderr, flush=True)
                traceback.print_exc()

        # Start background thread
        thread = threading.Thread(target=load_edges, daemon=True)
        thread.start()

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
        """Find nearest node using spatial grid index.

        Uses grid-based spatial indexing for fast O(1) cell lookup + O(k) search.
        Optimized to search only nearby cells and expand if needed.
        """
        if not self.spatial_grid:
            # Fallback to brute force if grid not built
            min_distance = float('inf')
            nearest_node = None

            for node_id, (node_lat, node_lon) in self.nodes.items():
                distance = self.haversine_distance((lat, lon), (node_lat, node_lon))
                if distance < min_distance:
                    min_distance = distance
                    nearest_node = node_id

            if min_distance <= search_radius_m:
                return nearest_node
            return None

        # Calculate grid cells to search
        grid_x = int(lon / self.grid_size_deg)
        grid_y = int(lat / self.grid_size_deg)

        # Start with small search radius and expand if needed
        min_distance = float('inf')
        nearest_node = None

        # Search in expanding rings: 1 cell, then 2 cells, then 3 cells, etc.
        for search_cells in range(1, 10):  # Max 10 cells radius
            for dx in range(-search_cells, search_cells + 1):
                for dy in range(-search_cells, search_cells + 1):
                    # Only check cells on the perimeter of current search radius
                    if abs(dx) != search_cells and abs(dy) != search_cells:
                        continue

                    cell_key = (grid_x + dx, grid_y + dy)
                    if cell_key not in self.spatial_grid:
                        continue

                    # Check all nodes in this cell
                    for node_id in self.spatial_grid[cell_key]:
                        node_lat, node_lon = self.nodes[node_id]
                        distance = self.haversine_distance((lat, lon), (node_lat, node_lon))

                        if distance < min_distance:
                            min_distance = distance
                            nearest_node = node_id

            # If we found a node, we can stop expanding
            if nearest_node is not None:
                break

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


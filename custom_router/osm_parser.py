"""
OSM (OpenStreetMap) data parser
Downloads and processes UK PBF file to extract road network
"""

import os
import subprocess
import json
from typing import Dict, List, Tuple
import sqlite3

class OSMParser:
    """Parse OSM data and extract road network."""
    
    # Drivable road types
    DRIVABLE_ROADS = {
        'motorway', 'trunk', 'primary', 'secondary', 'tertiary',
        'unclassified', 'residential', 'service', 'living_street',
        'motorway_link', 'trunk_link', 'primary_link', 'secondary_link'
    }
    
    # Speed limits by road type (km/h)
    DEFAULT_SPEEDS = {
        'motorway': 120,
        'trunk': 100,
        'primary': 90,
        'secondary': 80,
        'tertiary': 60,
        'unclassified': 50,
        'residential': 30,
        'service': 20,
        'living_street': 10
    }
    
    def __init__(self, data_dir: str = 'data'):
        """Initialize OSM parser."""
        self.data_dir = data_dir
        self.pbf_file = os.path.join(data_dir, 'uk_data.pbf')
        self.db_file = os.path.join(data_dir, 'uk_router.db')
        
        os.makedirs(data_dir, exist_ok=True)
    
    def download_uk_data(self) -> bool:
        """Download UK OSM data from Geofabrik."""
        print("[OSM] Downloading UK data from Geofabrik...")
        
        url = "https://download.geofabrik.de/europe/great-britain-latest.osm.pbf"
        
        try:
            # Use wget or curl to download
            cmd = f"curl -L -o {self.pbf_file} {url}"
            result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
            
            if result.returncode == 0 and os.path.exists(self.pbf_file):
                size_gb = os.path.getsize(self.pbf_file) / (1024**3)
                print(f"[OSM] Downloaded successfully: {size_gb:.2f} GB")
                return True
            else:
                print(f"[OSM] Download failed: {result.stderr}")
                return False
        except Exception as e:
            print(f"[OSM] Download error: {e}")
            return False
    
    def parse_pbf(self) -> Tuple[Dict, Dict, List]:
        """Parse PBF file and extract nodes, ways, turn restrictions."""
        print("[OSM] Parsing PBF file...")

        if not os.path.exists(self.pbf_file):
            print(f"[OSM] PBF file not found: {self.pbf_file}")
            return {}, {}, []

        try:
            import osmium
        except ImportError:
            print("[OSM] Installing osmium...")
            subprocess.run("pip install osmium", shell=True)
            import osmium

        # Two-pass approach:
        # Pass 1: Collect all ways and their node references
        # Pass 2: Only store nodes that are referenced by ways

        print("[OSM] PASS 1: Collecting ways and node references...")
        ways = {}
        turn_restrictions = []
        referenced_node_ids = set()
        way_count = 0

        # Store references to parent class attributes for inner class
        drivable_roads = self.DRIVABLE_ROADS
        default_speeds = self.DEFAULT_SPEEDS

        class WayCollector(osmium.SimpleHandler):
            def way(self, w):
                """Collect ways and their node references."""
                nonlocal way_count
                # Check if it's a drivable road
                highway = w.tags.get('highway', '')
                if highway not in drivable_roads:
                    return

                # Extract way data
                node_refs = [nd.ref for nd in w.nodes]

                # Get speed limit with proper handling
                maxspeed_str = w.tags.get('maxspeed', '')
                if maxspeed_str:
                    try:
                        speed_limit = int(maxspeed_str)
                    except (ValueError, TypeError):
                        speed_limit = default_speeds.get(highway, 50)
                else:
                    speed_limit = default_speeds.get(highway, 50)

                way_data = {
                    'name': w.tags.get('name', 'Unnamed'),
                    'highway': highway,
                    'speed_limit': speed_limit,
                    'nodes': node_refs,
                    'oneway': w.tags.get('oneway', '') in ('yes', '1', 'true'),
                    'toll': w.tags.get('toll', '') in ('yes', '1', 'true')
                }
                ways[w.id] = way_data
                referenced_node_ids.update(node_refs)
                way_count += 1

                # Print progress every 10k ways
                if way_count % 10000 == 0:
                    print(f"[OSM] Collected {way_count:,} ways, {len(referenced_node_ids):,} unique nodes...")

            def relation(self, r):
                """Process relation (turn restrictions)."""
                if r.tags.get('type') != 'restriction':
                    return

                # Extract turn restriction
                restriction_type = r.tags.get('restriction', '')
                from_way = None
                to_way = None

                for member in r.members:
                    if member.role == 'from':
                        from_way = member.ref
                    elif member.role == 'to':
                        to_way = member.ref

                if from_way and to_way:
                    turn_restrictions.append({
                        'from_way': from_way,
                        'to_way': to_way,
                        'restriction': restriction_type
                    })

        collector = WayCollector()
        collector.apply_file(self.pbf_file)

        print(f"[OSM] PASS 1 Complete: {len(ways)} ways, {len(referenced_node_ids)} unique nodes needed")

        # Pass 2: Only collect nodes that are referenced by ways
        print("[OSM] PASS 2: Collecting only referenced nodes...")
        nodes = {}
        node_count = 0

        class NodeCollector(osmium.SimpleHandler):
            def node(self, n):
                """Only collect nodes that are referenced by ways."""
                nonlocal node_count
                if n.id not in referenced_node_ids:
                    return

                nodes[n.id] = {
                    'lat': n.lat,
                    'lon': n.lon,
                    'elevation': None
                }
                node_count += 1

                # Print progress every 100k nodes
                if node_count % 100000 == 0:
                    print(f"[OSM] Collected {node_count:,} nodes...")

        node_collector = NodeCollector()
        node_collector.apply_file(self.pbf_file)

        print(f"[OSM] PASS 2 Complete: {len(nodes)} nodes collected")
        print(f"[OSM] Parsed: {len(nodes)} nodes, {len(ways)} ways, {len(turn_restrictions)} restrictions")
        return nodes, ways, turn_restrictions
    
    def create_database(self, nodes: Dict, ways: Dict, turn_restrictions: List) -> bool:
        """Create SQLite database with road network."""
        print("[OSM] Creating database...")
        
        try:
            conn = sqlite3.connect(self.db_file)
            cursor = conn.cursor()
            
            # Create nodes table
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS nodes (
                    id INTEGER PRIMARY KEY,
                    lat REAL NOT NULL,
                    lon REAL NOT NULL,
                    elevation REAL
                )
            ''')
            
            # Create edges table
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS edges (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    from_node_id INTEGER NOT NULL,
                    to_node_id INTEGER NOT NULL,
                    distance_m REAL NOT NULL,
                    speed_limit_kmh INTEGER,
                    way_id INTEGER,
                    road_type TEXT,
                    oneway INTEGER DEFAULT 0,
                    toll INTEGER DEFAULT 0,
                    FOREIGN KEY(from_node_id) REFERENCES nodes(id),
                    FOREIGN KEY(to_node_id) REFERENCES nodes(id)
                )
            ''')
            
            # Create ways table
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS ways (
                    id INTEGER PRIMARY KEY,
                    name TEXT,
                    highway TEXT,
                    speed_limit_kmh INTEGER
                )
            ''')
            
            # Create turn restrictions table
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS turn_restrictions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    from_way_id INTEGER,
                    to_way_id INTEGER,
                    restriction_type TEXT
                )
            ''')
            
            # Insert nodes using batch inserts (much faster)
            print("[OSM] Inserting nodes...")
            node_data_list = [(nid, nd['lat'], nd['lon'], nd.get('elevation'))
                             for nid, nd in nodes.items()]
            cursor.executemany('''
                INSERT OR IGNORE INTO nodes (id, lat, lon, elevation)
                VALUES (?, ?, ?, ?)
            ''', node_data_list)
            print(f"[OSM] Inserted {len(node_data_list)} nodes")

            # Insert ways using batch inserts
            print("[OSM] Inserting ways...")
            way_data_list = [(wid, wd['name'], wd['highway'], wd['speed_limit'])
                            for wid, wd in ways.items()]
            cursor.executemany('''
                INSERT OR IGNORE INTO ways (id, name, highway, speed_limit_kmh)
                VALUES (?, ?, ?, ?)
            ''', way_data_list)
            print(f"[OSM] Inserted {len(way_data_list)} ways")

            # Insert turn restrictions using batch inserts
            print("[OSM] Inserting turn restrictions...")
            restriction_data_list = [(r['from_way'], r['to_way'], r['restriction'])
                                    for r in turn_restrictions]
            if restriction_data_list:
                cursor.executemany('''
                    INSERT INTO turn_restrictions (from_way_id, to_way_id, restriction_type)
                    VALUES (?, ?, ?)
                ''', restriction_data_list)
                print(f"[OSM] Inserted {len(restriction_data_list)} turn restrictions")

            # Create indexes
            print("[OSM] Creating indexes...")
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_nodes_latlon ON nodes(lat, lon)')
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_edges_from ON edges(from_node_id)')
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_edges_to ON edges(to_node_id)')

            conn.commit()
            conn.close()
            
            print(f"[OSM] Database created: {self.db_file}")
            return True
        except Exception as e:
            print(f"[OSM] Database creation error: {e}")
            return False


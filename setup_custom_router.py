#!/usr/bin/env python3
"""
Setup script for custom routing engine
Downloads UK OSM data and builds the routing database
"""

import os
import sys
import time
from custom_router.osm_parser import OSMParser
from custom_router.graph import RoadNetwork
from custom_router.dijkstra import Router
from custom_router.instructions import InstructionGenerator
from custom_router.cache import RouteCache

def main():
    """Main setup function."""
    print("=" * 60)
    print("CUSTOM ROUTING ENGINE - SETUP")
    print("=" * 60)
    
    data_dir = 'data'
    
    # Step 1: Download OSM data
    print("\n[STEP 1] Downloading UK OSM data...")
    parser = OSMParser(data_dir)
    
    if not os.path.exists(parser.pbf_file):
        print("Downloading UK data from Geofabrik (this may take 10-30 minutes)...")
        if not parser.download_uk_data():
            print("ERROR: Failed to download OSM data")
            return False
    else:
        print(f"OSM data already exists: {parser.pbf_file}")
    
    # Step 2: Parse OSM data
    print("\n[STEP 2] Parsing OSM data...")
    print("This may take 5-15 minutes depending on your system...")
    
    nodes, ways, turn_restrictions = parser.parse_pbf()
    
    if not nodes or not ways:
        print("ERROR: Failed to parse OSM data")
        return False
    
    # Step 3: Create database
    print("\n[STEP 3] Creating routing database...")
    if not parser.create_database(nodes, ways, turn_restrictions):
        print("ERROR: Failed to create database")
        return False
    
    # Step 4: Load graph and build edges
    print("\n[STEP 4] Building road network graph...")
    graph = RoadNetwork(parser.db_file)
    graph.build_edges_from_ways(ways)

    # Save edges to database using batch inserts (much faster)
    print("[STEP 4] Saving edges to database...")
    import sqlite3
    conn = sqlite3.connect(parser.db_file)
    cursor = conn.cursor()

    # Collect all edges into a list for batch insert
    # IMPORTANT: build_edges_from_ways already creates bidirectional edges for non-oneway roads
    edge_data_list = []
    for from_node, neighbors in graph.edges.items():
        for to_node, distance, speed_limit, way_id in neighbors:
            edge_data_list.append((from_node, to_node, distance, speed_limit, way_id))

    # Batch insert edges
    print(f"[STEP 4] Inserting {len(edge_data_list):,} edges...")
    cursor.executemany('''
        INSERT INTO edges (from_node_id, to_node_id, distance_m, speed_limit_kmh, way_id)
        VALUES (?, ?, ?, ?, ?)
    ''', edge_data_list)

    conn.commit()
    conn.close()
    print(f"[STEP 4] Saved {len(edge_data_list):,} edges to database")

    # Verify bidirectional edges were created
    print("[STEP 4] Verifying bidirectional edges...")
    conn = sqlite3.connect(parser.db_file)
    cursor = conn.cursor()
    cursor.execute('SELECT COUNT(*) FROM edges')
    total_edges = cursor.fetchone()[0]
    cursor.execute('''
        SELECT COUNT(*) FROM edges e1
        WHERE EXISTS (
            SELECT 1 FROM edges e2
            WHERE e1.from_node_id = e2.to_node_id
            AND e1.to_node_id = e2.from_node_id
            LIMIT 1
        )
        LIMIT 1000
    ''')
    bidirectional = cursor.fetchone()[0]
    conn.close()
    print(f"  Total edges: {total_edges:,}")
    print(f"  Bidirectional edges (sample): {bidirectional:,}")

    stats = graph.get_statistics()
    print(f"Graph statistics:")
    print(f"  - Nodes: {stats['nodes']:,}")
    print(f"  - Edges: {stats['edges']:,}")
    print(f"  - Ways: {stats['ways']:,}")
    print(f"  - Turn restrictions: {stats['turn_restrictions']:,}")
    
    # Step 5: Test routing
    print("\n[STEP 5] Testing routing engine...")
    router = Router(graph)
    instruction_gen = InstructionGenerator(graph)
    cache = RouteCache()

    # Test route: London to Manchester
    print("\nTest route: London (51.5074, -0.1278) to Manchester (53.4808, -2.2426)")

    # Find nearest nodes first
    start_node = graph.find_nearest_node(51.5074, -0.1278)
    end_node = graph.find_nearest_node(53.4808, -2.2426)

    if not start_node or not end_node:
        print(f"✗ Could not find nodes near test coordinates")
        print(f"  Start node: {start_node}, End node: {end_node}")
        print(f"  Total nodes in graph: {len(graph.nodes)}")
        # Don't fail - database is still valid
        print("  (Database is still valid, routing test skipped)")
    else:
        start_time = time.time()
        route = router.route(51.5074, -0.1278, 53.4808, -2.2426)
        elapsed = time.time() - start_time

        if route:
            print(f"✓ Route calculated in {route['response_time_ms']:.1f}ms")
            print(f"  - Distance: {route['distance_km']:.1f} km")
            print(f"  - Duration: {route['duration_minutes']:.1f} minutes")

            # Generate instructions
            instructions = instruction_gen.generate(route['path_nodes'])
            print(f"  - Turn instructions: {len(instructions)}")

            if instructions:
                print("\n  First 5 instructions:")
                for i, instr in enumerate(instructions[:5]):
                    print(f"    {i+1}. {instr['instruction']} ({instr['distance_m']:.0f}m)")
        else:
            print("✗ Route calculation failed")
            print(f"  (Database is still valid, routing test failed)")
            # Don't fail - database is still valid
    
    print("\n" + "=" * 60)
    print("SETUP COMPLETE!")
    print("=" * 60)
    print(f"\nDatabase location: {parser.db_file}")
    print(f"Database size: {os.path.getsize(parser.db_file) / (1024**3):.2f} GB")
    print("\nYou can now use the custom router in voyagr_web.py")
    
    return True

if __name__ == '__main__':
    success = main()
    sys.exit(0 if success else 1)


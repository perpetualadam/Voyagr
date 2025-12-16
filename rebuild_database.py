#!/usr/bin/env python3
"""
Rebuild UK Router Database with oneway=-1 Fix
This script rebuilds the database with proper handling of:
- oneway=yes (forward only)
- oneway=-1 (reverse only) ← THE CRITICAL FIX
- oneway=no (bidirectional)
"""

import os
import sys
import time
import sqlite3
from custom_router.osm_parser import OSMParser
from custom_router.graph import RoadNetwork

def backup_existing_database(db_file: str) -> bool:
    """Backup existing database before rebuilding."""
    if not os.path.exists(db_file):
        print(f"[Backup] No existing database found at {db_file}")
        return True
    
    backup_file = db_file + '.backup'
    print(f"[Backup] Creating backup: {backup_file}")
    
    try:
        import shutil
        shutil.copy2(db_file, backup_file)
        size_gb = os.path.getsize(backup_file) / (1024**3)
        print(f"[Backup] ✅ Backup created: {size_gb:.2f} GB")
        return True
    except Exception as e:
        print(f"[Backup] ❌ Backup failed: {e}")
        return False

def rebuild_database():
    """Rebuild database with oneway=-1 fix."""
    print("=" * 70)
    print("REBUILD UK ROUTER DATABASE WITH ONEWAY=-1 FIX")
    print("=" * 70)
    
    data_dir = 'data'
    db_file = os.path.join(data_dir, 'uk_router.db')
    pbf_file = os.path.join(data_dir, 'uk_data.pbf')
    
    # Check if PBF file exists
    if not os.path.exists(pbf_file):
        print(f"\n[Error] PBF file not found: {pbf_file}")
        print("Please ensure great-britain-latest.osm.pbf is downloaded first.")
        return False
    
    pbf_size_gb = os.path.getsize(pbf_file) / (1024**3)
    print(f"\n[1] PBF file found: {pbf_size_gb:.2f} GB")
    
    # Backup existing database
    print(f"\n[2] Backing up existing database...")
    if not backup_existing_database(db_file):
        response = input("Backup failed. Continue anyway? (yes/no): ")
        if response.lower() != 'yes':
            print("Rebuild cancelled.")
            return False
    
    # Delete old database
    if os.path.exists(db_file):
        print(f"\n[3] Deleting old database...")
        try:
            os.remove(db_file)
            print("✅ Old database deleted")
        except Exception as e:
            print(f"❌ Failed to delete old database: {e}")
            return False
    
    # Parse PBF and build new database
    print(f"\n[4] Parsing PBF file with oneway=-1 fix...")
    print("This will take 10-30 minutes depending on your system.")
    print("Progress will be shown below:\n")
    
    parser = OSMParser(data_dir=data_dir)
    
    start_time = time.time()
    nodes, ways, turn_restrictions = parser.parse_pbf()
    parse_elapsed = time.time() - start_time
    
    print(f"\n✅ PBF parsing complete in {parse_elapsed/60:.1f} minutes")
    print(f"   Nodes: {len(nodes):,}")
    print(f"   Ways: {len(ways):,}")
    print(f"   Turn restrictions: {len(turn_restrictions):,}")
    
    # Create database schema and save nodes/ways/restrictions
    print(f"\n[5] Creating database schema...")
    start_time = time.time()
    if not parser.create_database(nodes, ways, turn_restrictions):
        print("❌ Database creation failed")
        return False
    schema_elapsed = time.time() - start_time

    print(f"✅ Database schema created in {schema_elapsed/60:.1f} minutes")

    # Build edges from ways (with oneway=-1 fix applied)
    print(f"\n[6] Building edges from ways (with oneway=-1 fix)...")
    start_time = time.time()

    # Create a minimal graph object just for edge building (don't load from database)
    from collections import defaultdict
    from custom_router.graph import RoadNetwork

    # Create empty graph structure
    graph_edges = defaultdict(list)

    # Build edges using the same logic as RoadNetwork.build_edges_from_ways()
    edge_count = 0
    for way_id, way_data in ways.items():
        way_nodes = way_data['nodes']
        speed_limit = way_data['speed_limit']
        oneway = way_data.get('oneway', 'no')

        # Create edges between consecutive nodes
        for i in range(len(way_nodes) - 1):
            from_node = way_nodes[i]
            to_node = way_nodes[i + 1]

            if from_node not in nodes or to_node not in nodes:
                continue

            # Calculate distance using Haversine
            from_lat, from_lon = nodes[from_node]['lat'], nodes[from_node]['lon']
            to_lat, to_lon = nodes[to_node]['lat'], nodes[to_node]['lon']
            distance = RoadNetwork.haversine_distance((from_lat, from_lon), (to_lat, to_lon))

            # Handle three oneway cases (THE FIX!)
            if oneway == 'yes':
                # Forward edge only
                graph_edges[from_node].append((to_node, distance, speed_limit, way_id))
                edge_count += 1
            elif oneway == 'reverse':
                # Reverse edge only (oneway=-1 in OSM) - THE CRITICAL FIX!
                graph_edges[to_node].append((from_node, distance, speed_limit, way_id))
                edge_count += 1
            else:
                # Bidirectional (default for most roads)
                graph_edges[from_node].append((to_node, distance, speed_limit, way_id))
                graph_edges[to_node].append((from_node, distance, speed_limit, way_id))
                edge_count += 2

        # Progress reporting
        if way_id % 100000 == 0:
            print(f"   Processed {way_id:,} ways, {edge_count:,} edges built...")

    edge_build_elapsed = time.time() - start_time

    print(f"✅ Edges built in {edge_build_elapsed/60:.1f} minutes")
    print(f"   Total edges: {edge_count:,}")

    # Save edges to database using batch inserts
    print(f"\n[7] Saving edges to database...")
    start_time = time.time()

    conn = sqlite3.connect(db_file)
    cursor = conn.cursor()

    # Collect all edges into a list for batch insert
    edge_data_list = []
    for from_node, neighbors in graph_edges.items():
        for to_node, distance, speed_limit, way_id in neighbors:
            edge_data_list.append((from_node, to_node, distance, speed_limit, way_id))

    print(f"   Inserting {len(edge_data_list):,} edges...")

    # Insert in batches to avoid memory issues
    batch_size = 100000
    for i in range(0, len(edge_data_list), batch_size):
        batch = edge_data_list[i:i+batch_size]
        cursor.executemany('''
            INSERT INTO edges (from_node_id, to_node_id, distance_m, speed_limit_kmh, way_id)
            VALUES (?, ?, ?, ?, ?)
        ''', batch)
        conn.commit()
        print(f"   Inserted {min(i+batch_size, len(edge_data_list)):,}/{len(edge_data_list):,} edges...")

    conn.close()
    edge_save_elapsed = time.time() - start_time

    print(f"✅ Edges saved in {edge_save_elapsed/60:.1f} minutes")
    
    # Verify database
    print(f"\n[8] Verifying database...")
    try:
        conn = sqlite3.connect(db_file)
        cursor = conn.cursor()

        cursor.execute('SELECT COUNT(*) FROM nodes')
        node_count = cursor.fetchone()[0]

        cursor.execute('SELECT COUNT(*) FROM edges')
        edge_count = cursor.fetchone()[0]

        cursor.execute('SELECT COUNT(*) FROM ways')
        way_count = cursor.fetchone()[0]

        cursor.execute('SELECT COUNT(*) FROM turn_restrictions')
        restriction_count = cursor.fetchone()[0]

        conn.close()

        db_size_gb = os.path.getsize(db_file) / (1024**3)

        print(f"✅ Database verification complete:")
        print(f"   Database size: {db_size_gb:.2f} GB")
        print(f"   Nodes: {node_count:,}")
        print(f"   Edges: {edge_count:,}")
        print(f"   Ways: {way_count:,}")
        print(f"   Turn restrictions: {restriction_count:,}")

        total_elapsed = parse_elapsed + schema_elapsed + edge_build_elapsed + edge_save_elapsed
        print(f"\n✅ REBUILD COMPLETE in {total_elapsed/60:.1f} minutes")

        return True

    except Exception as e:
        print(f"❌ Database verification failed: {e}")
        return False

if __name__ == '__main__':
    print("\n⚠️  WARNING: This will delete and rebuild the entire database!")
    print("Make sure you have:")
    print("  1. At least 15 GB free disk space")
    print("  2. 30-60 minutes of time")
    print("  3. The great-britain-latest.osm.pbf file in data/")
    
    response = input("\nContinue with rebuild? (yes/no): ")
    if response.lower() != 'yes':
        print("Rebuild cancelled.")
        sys.exit(0)
    
    success = rebuild_database()
    
    if success:
        print("\n" + "=" * 70)
        print("NEXT STEPS:")
        print("=" * 70)
        print("1. Run: python test_bulletproof_routing.py")
        print("2. Check if London→Oxford routing works")
        print("3. Verify component count is low (1-10 instead of 127K+)")
        print("=" * 70)
        sys.exit(0)
    else:
        print("\n❌ Rebuild failed. Check errors above.")
        sys.exit(1)


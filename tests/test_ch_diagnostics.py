#!/usr/bin/env python3
"""
CH Diagnostics - Detailed CH analysis and troubleshooting
"""

import sys
import os
import sqlite3
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from custom_router.graph import RoadNetwork
from custom_router.dijkstra import Router

def check_database():
    """Check database integrity and CH data."""
    print("\n" + "="*80)
    print("DATABASE DIAGNOSTICS")
    print("="*80)
    
    try:
        conn = sqlite3.connect('data/uk_router.db')
        cursor = conn.cursor()
        
        # Check tables
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
        tables = [row[0] for row in cursor.fetchall()]
        print(f"\nTables: {', '.join(tables)}")
        
        # Check nodes
        cursor.execute("SELECT COUNT(*) FROM nodes")
        node_count = cursor.fetchone()[0]
        print(f"Total Nodes: {node_count:,}")
        
        # Check edges
        cursor.execute("SELECT COUNT(*) FROM edges")
        edge_count = cursor.fetchone()[0]
        print(f"Total Edges: {edge_count:,}")
        
        # Check CH data
        if 'ch_node_order' in tables:
            cursor.execute("SELECT COUNT(*) FROM ch_node_order")
            ch_nodes = cursor.fetchone()[0]
            print(f"CH Nodes: {ch_nodes:,}")
            
            cursor.execute("SELECT COUNT(*) FROM ch_shortcuts")
            ch_shortcuts = cursor.fetchone()[0]
            print(f"CH Shortcuts: {ch_shortcuts:,}")
            
            cursor.execute("SELECT MIN(order_id), MAX(order_id) FROM ch_node_order")
            min_level, max_level = cursor.fetchone()
            print(f"CH Levels: {max_level - min_level + 1}")
            
            # Check shortcut distribution
            cursor.execute("""
                SELECT COUNT(*) FROM ch_shortcuts 
                WHERE from_node IS NOT NULL AND to_node IS NOT NULL
            """)
            valid_shortcuts = cursor.fetchone()[0]
            print(f"Valid Shortcuts: {valid_shortcuts:,}")
        else:
            print("CH tables not found!")
        
        conn.close()
        return True
    except Exception as e:
        print(f"ERROR: {e}")
        return False

def check_graph_loading(graph=None):
    """Check graph loading and node availability."""
    print("\n" + "="*80)
    print("GRAPH LOADING DIAGNOSTICS")
    print("="*80)

    try:
        if graph is None:
            print("\nLoading graph...")
            start = time.time()
            graph = RoadNetwork('data/uk_router.db')
            load_time = time.time() - start

            print(f"Graph loaded in {load_time:.2f}s")
        else:
            print("\nUsing existing graph instance")

        print(f"Nodes in memory: {len(graph.nodes):,}")
        print(f"Edges in memory: {sum(len(e) for e in graph.edges.values()):,}")

        # Check specific nodes
        test_coords = [
            ('London', 51.5074, -0.1278),
            ('Oxford', 51.7520, -1.2577),
            ('Manchester', 53.4808, -2.2426),
        ]

        print("\nTesting node lookup:")
        for name, lat, lon in test_coords:
            node = graph.find_nearest_node(lat, lon)
            if node:
                print(f"  {name}: Found node {node}")
            else:
                print(f"  {name}: NO NODE FOUND")

        return True, graph
    except Exception as e:
        print(f"ERROR: {e}")
        return False, None

def check_ch_router(graph=None):
    """Check CH router initialization and availability."""
    print("\n" + "="*80)
    print("CH ROUTER DIAGNOSTICS")
    print("="*80)

    try:
        print("\nInitializing router...")
        if graph is None:
            graph = RoadNetwork('data/uk_router.db')

        router = Router(graph, use_ch=True, db_file='data/uk_router.db')

        print(f"CH Available: {router.ch_available}")
        print(f"CH Levels Loaded: {len(router.ch_levels):,}")
        print(f"Use CH: {router.use_ch}")

        if router.ch_available:
            print("\nCH Status: READY")

            # Test a simple route
            print("\nTesting simple route (London to Oxford)...")
            start = time.time()
            route = router.route(51.5074, -0.1278, 51.7520, -1.2577)
            elapsed = time.time() - start

            if route:
                print(f"  Route found in {elapsed*1000:.1f}ms")
                print(f"  Distance: {route.get('distance', 0)/1000:.1f} km")
                print(f"  Duration: {route.get('duration', 0):.0f}s")
            else:
                print(f"  No route found in {elapsed*1000:.1f}ms")
        else:
            print("\nCH Status: NOT AVAILABLE")

        return True
    except Exception as e:
        print(f"ERROR: {e}")
        import traceback
        traceback.print_exc()
        return False

def check_memory():
    """Check memory usage."""
    print("\n" + "="*80)
    print("MEMORY DIAGNOSTICS")
    print("="*80)
    
    try:
        import psutil
        process = psutil.Process()
        
        mem_info = process.memory_info()
        print(f"\nProcess Memory:")
        print(f"  RSS (Resident): {mem_info.rss / 1024 / 1024:.1f} MB")
        print(f"  VMS (Virtual): {mem_info.vms / 1024 / 1024:.1f} MB")
        
        # System memory
        vm = psutil.virtual_memory()
        print(f"\nSystem Memory:")
        print(f"  Total: {vm.total / 1024 / 1024 / 1024:.1f} GB")
        print(f"  Available: {vm.available / 1024 / 1024 / 1024:.1f} GB")
        print(f"  Used: {vm.used / 1024 / 1024 / 1024:.1f} GB ({vm.percent}%)")
        
        return True
    except ImportError:
        print("psutil not installed - skipping memory diagnostics")
        return True
    except Exception as e:
        print(f"ERROR: {e}")
        return False

if __name__ == "__main__":
    print("\n" + "="*80)
    print("CH DIAGNOSTICS SUITE")
    print("="*80)

    all_ok = True
    graph = None

    # Run all diagnostics
    all_ok &= check_database()

    # Load graph once and reuse it
    graph_ok, graph = check_graph_loading()
    all_ok &= graph_ok

    # Pass graph to router check to avoid reloading
    if graph:
        all_ok &= check_ch_router(graph)
    else:
        all_ok &= check_ch_router()

    all_ok &= check_memory()

    print("\n" + "="*80)
    if all_ok:
        print("DIAGNOSTICS COMPLETE - ALL SYSTEMS OK")
    else:
        print("DIAGNOSTICS COMPLETE - SOME ISSUES FOUND")
    print("="*80 + "\n")

    sys.exit(0 if all_ok else 1)


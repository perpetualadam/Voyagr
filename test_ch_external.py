#!/usr/bin/env python3
"""
External CH Testing Script - Test Contraction Hierarchies without loading full graph
Runs fast CH routing tests using pre-built CH index from database
"""

import sys
import os
import time
import sqlite3
from typing import List, Tuple

# Add project to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from custom_router.graph import RoadNetwork
from custom_router.dijkstra import Router

# Real UK test coordinates (London, Oxford, Manchester, etc.)
TEST_ROUTES = [
    {
        'name': 'London to Oxford',
        'start': (51.5074, -0.1278),  # London
        'end': (51.7520, -1.2577),    # Oxford
        'expected_km': 90,
    },
    {
        'name': 'London to Manchester',
        'start': (51.5074, -0.1278),  # London
        'end': (53.4808, -2.2426),    # Manchester
        'expected_km': 330,
    },
    {
        'name': 'Oxford to Birmingham',
        'start': (51.7520, -1.2577),  # Oxford
        'end': (52.5086, -1.8755),    # Birmingham
        'expected_km': 80,
    },
    {
        'name': 'Manchester to Leeds',
        'start': (53.4808, -2.2426),  # Manchester
        'end': (53.8008, -1.5491),    # Leeds
        'expected_km': 50,
    },
    {
        'name': 'Bristol to Cardiff',
        'start': (51.4545, -2.5879),  # Bristol
        'end': (51.4816, -3.1791),    # Cardiff
        'expected_km': 50,
    },
]

def check_ch_index():
    """Verify CH index exists in database."""
    print("\n" + "="*80)
    print("CHECKING CH INDEX")
    print("="*80)
    
    try:
        conn = sqlite3.connect('data/uk_router.db')
        cursor = conn.cursor()
        
        # Check CH tables
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='ch_node_order'")
        if not cursor.fetchone():
            print("ERROR: CH tables not found!")
            return False
        
        cursor.execute("SELECT COUNT(*) FROM ch_node_order")
        ch_nodes = cursor.fetchone()[0]
        
        cursor.execute("SELECT COUNT(*) FROM ch_shortcuts")
        ch_shortcuts = cursor.fetchone()[0]
        
        cursor.execute("SELECT MIN(order_id), MAX(order_id) FROM ch_node_order")
        min_level, max_level = cursor.fetchone()
        
        print(f"CH Nodes: {ch_nodes:,}")
        print(f"CH Shortcuts: {ch_shortcuts:,}")
        print(f"CH Levels: {max_level - min_level + 1}")
        print(f"Status: READY")
        
        conn.close()
        return True
    except Exception as e:
        print(f"ERROR: {e}")
        return False

def test_ch_routing():
    """Test CH routing with real UK coordinates."""
    print("\n" + "="*80)
    print("TESTING CH ROUTING")
    print("="*80)

    # Load graph (without edges - CH doesn't need them)
    print("\nLoading graph structure...")
    graph = RoadNetwork('data/uk_router.db')

    # Create router with CH enabled
    print("Initializing router with CH...")
    print("NOTE: Edges loading in background - CH uses pre-computed shortcuts")
    router = Router(graph, use_ch=True, db_file='data/uk_router.db')

    if not router.ch_available:
        print("ERROR: CH not available!")
        return False

    print(f"CH Available: YES ({len(router.ch_levels):,} nodes)")
    print("CH Shortcuts: YES (pre-computed paths ready)")
    
    # Test routes
    results = []
    for route_test in TEST_ROUTES:
        print(f"\n[TEST] {route_test['name']}")
        print(f"  Start: {route_test['start']}")
        print(f"  End: {route_test['end']}")
        
        start_time = time.time()
        try:
            route = router.route(
                route_test['start'][0], route_test['start'][1],
                route_test['end'][0], route_test['end'][1]
            )
            elapsed = time.time() - start_time
            
            if route:
                distance_km = route.get('distance', 0) / 1000
                duration_s = route.get('duration', 0)
                print(f"  Result: OK")
                print(f"  Distance: {distance_km:.1f} km (expected ~{route_test['expected_km']} km)")
                print(f"  Duration: {duration_s:.0f}s")
                print(f"  Time: {elapsed*1000:.1f}ms")
                results.append((route_test['name'], True, elapsed))
            else:
                print(f"  Result: NO ROUTE FOUND")
                print(f"  Time: {elapsed*1000:.1f}ms")
                results.append((route_test['name'], False, elapsed))
        except Exception as e:
            elapsed = time.time() - start_time
            print(f"  Result: ERROR - {e}")
            print(f"  Time: {elapsed*1000:.1f}ms")
            results.append((route_test['name'], False, elapsed))
    
    # Summary
    print("\n" + "="*80)
    print("TEST SUMMARY")
    print("="*80)
    passed = sum(1 for _, success, _ in results if success)
    total = len(results)
    print(f"Passed: {passed}/{total}")
    print(f"Average Time: {sum(t for _, _, t in results)/len(results)*1000:.1f}ms")
    
    for name, success, elapsed in results:
        status = "PASS" if success else "FAIL"
        print(f"  {status}: {name} ({elapsed*1000:.1f}ms)")
    
    return passed == total

if __name__ == "__main__":
    print("\n" + "="*80)
    print("EXTERNAL CH TESTING SUITE")
    print("="*80)
    
    # Check CH index
    if not check_ch_index():
        print("\nERROR: CH index check failed!")
        sys.exit(1)
    
    # Test routing
    if not test_ch_routing():
        print("\nWARNING: Some tests failed")
        sys.exit(1)
    
    print("\n" + "="*80)
    print("ALL TESTS PASSED")
    print("="*80 + "\n")
    sys.exit(0)


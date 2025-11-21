#!/usr/bin/env python3
"""Test CH routing with actual UK routes and compare with Dijkstra."""

import time
import sys
from custom_router.graph import RoadNetwork
from custom_router.dijkstra import Router

# Test routes (real UK coordinates)
TEST_ROUTES = [
    {"name": "London to Oxford", "start": (51.5074, -0.1278), "end": (51.7520, -1.2577)},
    {"name": "Manchester to Liverpool", "start": (53.4808, -2.2426), "end": (53.4084, -2.9916)},
    {"name": "Birmingham to Coventry", "start": (52.5086, -1.8853), "end": (52.4062, -1.5197)},
    {"name": "Leeds to Sheffield", "start": (53.8008, -1.5491), "end": (53.3808, -1.4701)},
    {"name": "Bristol to Bath", "start": (51.4545, -2.5879), "end": (51.3896, -2.3599)},
]

def find_nearest_node(graph, lat, lon):
    """Find nearest node to given coordinates."""
    best_node = None
    best_dist = float('inf')
    
    for node_id, (node_lat, node_lon) in graph.nodes.items():
        dist = ((node_lat - lat) ** 2 + (node_lon - lon) ** 2) ** 0.5
        if dist < best_dist:
            best_dist = dist
            best_node = node_id
    
    return best_node

def test_ch_routing():
    """Test CH routing with actual routes."""
    print("[TEST] Loading graph...")
    graph = RoadNetwork('data/uk_router.db')
    
    print("[TEST] Creating router with CH enabled...")
    router_ch = Router(graph, use_ch=True, db_file='data/uk_router.db')
    
    print("[TEST] Creating router with Dijkstra only...")
    router_dijkstra = Router(graph, use_ch=False, db_file='data/uk_router.db')
    
    print("\n" + "="*80)
    print("CONTRACTION HIERARCHIES ROUTING TEST")
    print("="*80 + "\n")
    
    for route in TEST_ROUTES:
        print(f"Route: {route['name']}")
        print(f"  Start: {route['start']}")
        print(f"  End: {route['end']}")
        
        start_node = find_nearest_node(graph, route['start'][0], route['start'][1])
        end_node = find_nearest_node(graph, route['end'][0], route['end'][1])
        
        if not start_node or not end_node:
            print("  ERROR: Could not find nodes\n")
            continue
        
        print(f"  Start node: {start_node}, End node: {end_node}")
        
        # Get coordinates for routing
        start_lat, start_lon = route['start']
        end_lat, end_lon = route['end']

        # Test CH routing
        print("  Testing CH routing...")
        start_time = time.time()
        try:
            ch_result = router_ch.route(start_lat, start_lon, end_lat, end_lon)
            ch_time = time.time() - start_time
            if ch_result and 'distance' in ch_result:
                print(f"    CH Distance: {ch_result['distance']:.1f}m in {ch_time*1000:.2f}ms")
            else:
                print(f"    CH Error: {ch_result}")
                ch_result = None
        except Exception as e:
            print(f"    CH Error: {e}")
            ch_result = None
            ch_time = None

        # Test Dijkstra routing
        print("  Testing Dijkstra routing...")
        start_time = time.time()
        try:
            dijkstra_result = router_dijkstra.route(start_lat, start_lon, end_lat, end_lon)
            dijkstra_time = time.time() - start_time
            if dijkstra_result and 'distance' in dijkstra_result:
                print(f"    Dijkstra Distance: {dijkstra_result['distance']:.1f}m in {dijkstra_time*1000:.2f}ms")
            else:
                print(f"    Dijkstra Error: {dijkstra_result}")
                dijkstra_result = None
        except Exception as e:
            print(f"    Dijkstra Error: {e}")
            dijkstra_result = None
            dijkstra_time = None

        # Compare results
        if ch_result and dijkstra_result and 'distance' in ch_result and 'distance' in dijkstra_result:
            ch_dist = ch_result['distance']
            dijkstra_dist = dijkstra_result['distance']
            diff = abs(ch_dist - dijkstra_dist)
            speedup = dijkstra_time / ch_time if ch_time > 0 else 0
            print(f"  Comparison:")
            print(f"    Distance difference: {diff:.1f}m ({diff/dijkstra_dist*100:.2f}%)")
            print(f"    Speedup: {speedup:.1f}x")
        
        print()

if __name__ == "__main__":
    test_ch_routing()


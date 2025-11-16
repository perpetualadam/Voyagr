#!/usr/bin/env python3
"""
Simple connectivity test - check if nodes are connected
"""

import sys
import time
from custom_router.graph import RoadNetwork
from custom_router.dijkstra import Router

print("[SETUP] Loading graph...")
start = time.time()
graph = RoadNetwork('data/uk_router.db')
print(f"✓ Graph loaded in {time.time()-start:.1f}s")

router = Router(graph)

# ============================================================================
# Test 1: Check if London nodes are connected
# ============================================================================
print("\n" + "="*70)
print("TEST 1: London Connectivity")
print("="*70)

# Use the nodes we found earlier
london_node = 1239525667
oxford_node = 213435
manchester_node = 12407862771

print(f"\nTesting London → Oxford (nodes {london_node} → {oxford_node})...")
start = time.time()
route = router.route(51.5074, -0.1278, 51.752, -1.2577)
elapsed = time.time() - start

if route:
    print(f"✓ Route found: {route['distance_km']:.1f}km in {elapsed*1000:.0f}ms")
else:
    print(f"✗ Route not found in {elapsed*1000:.0f}ms")

# ============================================================================
# Test 2: Check node degrees
# ============================================================================
print("\n" + "="*70)
print("TEST 2: Node Degree Analysis")
print("="*70)

test_nodes = [london_node, oxford_node, manchester_node]
for node_id in test_nodes:
    neighbors = graph.get_neighbors(node_id)
    degree = len(neighbors)
    lat, lon = graph.nodes[node_id]
    print(f"\nNode {node_id} at ({lat:.4f}, {lon:.4f})")
    print(f"  Degree: {degree}")
    if degree > 0:
        for i, (nbr, dist, speed, way_id) in enumerate(neighbors[:3]):
            nbr_lat, nbr_lon = graph.nodes[nbr]
            print(f"    → {nbr} at ({nbr_lat:.4f}, {nbr_lon:.4f}) - {dist:.0f}m")

# ============================================================================
# Test 3: Check if we can reach from London to nearby nodes
# ============================================================================
print("\n" + "="*70)
print("TEST 3: Reachability from London")
print("="*70)

print(f"\nStarting from London node {london_node}...")
neighbors = graph.get_neighbors(london_node)
print(f"Direct neighbors: {len(neighbors)}")

if neighbors:
    # Try to route to first neighbor
    nbr_id, dist, speed, way_id = neighbors[0]
    nbr_lat, nbr_lon = graph.nodes[nbr_id]
    
    print(f"\nTrying to route to neighbor {nbr_id}...")
    start = time.time()
    route = router.route(51.5074, -0.1278, nbr_lat, nbr_lon)
    elapsed = time.time() - start
    
    if route:
        print(f"✓ Route found: {route['distance_km']:.1f}km in {elapsed*1000:.0f}ms")
    else:
        print(f"✗ Route not found in {elapsed*1000:.0f}ms")

# ============================================================================
# Test 4: Check connectivity of first 100 nodes
# ============================================================================
print("\n" + "="*70)
print("TEST 4: Sample Connectivity Check")
print("="*70)

node_list = list(graph.nodes.keys())[:100]
connected_count = 0
isolated_count = 0

for node_id in node_list:
    neighbors = graph.get_neighbors(node_id)
    if len(neighbors) > 0:
        connected_count += 1
    else:
        isolated_count += 1

print(f"\nSample of 100 nodes:")
print(f"  Connected: {connected_count}")
print(f"  Isolated: {isolated_count}")
print(f"  Connectivity: {100*connected_count/100:.1f}%")

print("\n" + "="*70)
print("CONNECTIVITY TEST COMPLETE")
print("="*70)


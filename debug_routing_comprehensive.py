#!/usr/bin/env python3
"""
Comprehensive routing debug script
Steps 1-5: Nearest node, snapping, real nodes, connectivity
"""

import sys
import random
import time
from custom_router.graph import RoadNetwork
from custom_router.dijkstra import Router

# Load graph
print("[SETUP] Loading graph...")
start = time.time()
graph = RoadNetwork('data/uk_router.db')
print(f"✓ Graph loaded in {time.time()-start:.1f}s")
print(f"  Nodes: {len(graph.nodes):,}")
print(f"  Ways: {len(graph.ways):,}")

router = Router(graph)

# ============================================================================
# STEP 1: Debug Nearest Node Finding
# ============================================================================
print("\n" + "="*70)
print("STEP 1: Debug Nearest Node Finding")
print("="*70)

def debug_nearest(lat, lon, radius_km=0.5, label=""):
    """Debug nearest node finding."""
    print(f"\n{label} ({lat}, {lon})")
    
    node_id = graph.find_nearest_node(lat, lon, search_radius_m=radius_km*1000)
    
    if node_id is None:
        print(f"  ❌ No node within {radius_km} km")
        return None
    
    # Show distance
    node_lat, node_lon = graph.nodes[node_id]
    dist = graph.haversine_distance((lat, lon), (node_lat, node_lon))
    print(f"  ✓ Nearest node {node_id} – {dist:.1f} m away")
    
    # Show degree (neighbors)
    neighbors = graph.get_neighbors(node_id)
    degree = len(neighbors)
    print(f"  Degree = {degree}")
    
    if degree == 0:
        print(f"  ⚠️  ISOLATED NODE - no edges!")
    else:
        # Show first 3 neighbors
        for i, (nbr_id, dist_m, speed, way_id) in enumerate(neighbors[:3]):
            print(f"    → Node {nbr_id} ({dist_m:.0f}m, {speed}km/h)")
    
    return node_id

# Test coordinates from test_phase3.py
test_pairs = [
    ((51.5074, -0.1278), (51.5200, -0.1000), "London short"),
    ((51.5074, -0.1278), (51.7520, -1.2577), "London to Oxford"),
    ((51.5074, -0.1278), (53.4808, -2.2426), "London to Manchester"),
]

for src, dst, label in test_pairs:
    print(f"\n{label}:")
    debug_nearest(src[0], src[1], radius_km=5.0, label="  SRC")
    debug_nearest(dst[0], dst[1], radius_km=5.0, label="  DST")

# ============================================================================
# STEP 2: Snap Coordinates to Roads
# ============================================================================
print("\n" + "="*70)
print("STEP 2: Snap Coordinates to Roads")
print("="*70)

def snap_to_nearest_node(lat, lon, max_radius_m=500):
    """Snap coordinates to nearest road node."""
    node_id = graph.find_nearest_node(lat, lon, search_radius_m=max_radius_m)
    
    if node_id is None:
        return None
    
    node_lat, node_lon = graph.nodes[node_id]
    dist = graph.haversine_distance((lat, lon), (node_lat, node_lon))
    print(f"  ✓ Snapped {dist:.0f}m to node {node_id}")
    
    return (node_lat, node_lon)

print("\nSnapping test coordinates...")
for src, dst, label in test_pairs:
    print(f"\n{label}:")
    src_snapped = snap_to_nearest_node(src[0], src[1], max_radius_m=5000)
    dst_snapped = snap_to_nearest_node(dst[0], dst[1], max_radius_m=5000)

# ============================================================================
# STEP 4: Test with Real OSM Nodes
# ============================================================================
print("\n" + "="*70)
print("STEP 4: Test with Real OSM Nodes")
print("="*70)

print("\nTesting with random real nodes...")
node_ids = list(graph.nodes.keys())

for attempt in range(3):
    src_node_id = random.choice(node_ids)
    dst_node_id = random.choice(node_ids)
    
    src_lat, src_lon = graph.nodes[src_node_id]
    dst_lat, dst_lon = graph.nodes[dst_node_id]
    
    print(f"\nAttempt {attempt+1}:")
    print(f"  Source: Node {src_node_id} at ({src_lat:.4f}, {src_lon:.4f})")
    print(f"  Dest:   Node {dst_node_id} at ({dst_lat:.4f}, {dst_lon:.4f})")
    
    start = time.time()
    route = router.route(src_lat, src_lon, dst_lat, dst_lon)
    elapsed = time.time() - start
    
    if route:
        print(f"  ✓ Route found: {route['distance_km']:.1f}km in {elapsed*1000:.0f}ms")
        break
    else:
        print(f"  ✗ Route not found in {elapsed*1000:.0f}ms")

# ============================================================================
# STEP 5: Check Connectivity
# ============================================================================
print("\n" + "="*70)
print("STEP 5: Check Connectivity")
print("="*70)

print("\nAnalyzing graph connectivity...")
nodes_with_edges = sum(1 for node_id in graph.nodes 
                       if len(graph.get_neighbors(node_id)) > 0)
print(f"  Nodes with edges: {nodes_with_edges:,} / {len(graph.nodes):,}")
print(f"  Connectivity: {100 * nodes_with_edges / len(graph.nodes):.1f}%")

# Find isolated nodes
isolated = [nid for nid in list(graph.nodes.keys())[:100000] 
            if len(graph.get_neighbors(nid)) == 0]
print(f"  Isolated nodes (sample): {len(isolated):,}")

print("\n" + "="*70)
print("DEBUG COMPLETE")
print("="*70)


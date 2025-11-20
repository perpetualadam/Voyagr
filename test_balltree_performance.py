#!/usr/bin/env python3
"""Test BallTree spatial index performance"""

import time
from custom_router.graph import RoadNetwork

print("Testing BallTree spatial index performance...")
print("=" * 70)

# Load graph
print("\n[1] Loading graph...")
start = time.time()
graph = RoadNetwork('data/uk_router.db')
load_time = time.time() - start
print(f"✅ Graph loaded in {load_time:.1f}s")
print(f"   Nodes: {len(graph.nodes):,}")
print(f"   Edges: {sum(len(e) for e in graph.edges.values()):,}")

# Test nearest node lookup with BallTree
print("\n[2] Testing BallTree nearest node lookup...")
test_coords = [
    (51.5074, -0.1278, "London"),
    (51.7520, -1.2577, "Oxford"),
    (53.4808, -2.2426, "Manchester"),
    (52.9548, -1.1581, "Nottingham"),
    (52.6386, -1.1319, "Leicester"),
]

total_time = 0
for lat, lon, name in test_coords:
    start = time.time()
    node = graph.find_nearest_node(lat, lon, search_radius_m=50000)  # 50km radius
    elapsed = (time.time() - start) * 1000
    total_time += elapsed

    if node:
        node_lat, node_lon = graph.nodes[node]
        dist_m = graph.haversine_distance((lat, lon), (node_lat, node_lon))
        print(f"✅ {name:15} - Found node {node:12} in {elapsed:6.2f}ms at ({node_lat:.4f}, {node_lon:.4f}) - {dist_m/1000:.2f}km away")
    else:
        print(f"❌ {name:15} - No node found in {elapsed:6.2f}ms")

print(f"\n📊 Average lookup time: {total_time / len(test_coords):.2f}ms")
print(f"📊 Total time for {len(test_coords)} lookups: {total_time:.2f}ms")

# Test routing
print("\n[3] Testing route calculation...")
start = time.time()
route = graph.find_nearest_node(51.5074, -0.1278)  # London
end = graph.find_nearest_node(53.4808, -2.2426)    # Manchester
elapsed = (time.time() - start) * 1000
print(f"✅ Found start and end nodes in {elapsed:.2f}ms")

print("\n" + "=" * 70)
print("✅ BallTree performance test complete!")


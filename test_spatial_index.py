#!/usr/bin/env python3
"""Test spatial index performance"""

import time
from custom_router.graph import RoadNetwork

print("Testing spatial index...")
start = time.time()

# Load graph
graph = RoadNetwork('data/uk_router.db')
load_time = time.time() - start
print(f"✅ Graph loaded in {load_time:.1f}s")

# Test nearest node lookup
print("\nTesting nearest node lookup...")
test_coords = [
    (51.5074, -0.1278, "London"),
    (51.7520, -1.2577, "Oxford"),
    (53.4808, -2.2426, "Manchester"),
]

for lat, lon, name in test_coords:
    start = time.time()
    node = graph.find_nearest_node(lat, lon)
    elapsed = (time.time() - start) * 1000
    
    if node:
        node_lat, node_lon = graph.nodes[node]
        print(f"✅ {name}: Found node {node} in {elapsed:.1f}ms at ({node_lat:.4f}, {node_lon:.4f})")
    else:
        print(f"❌ {name}: No node found in {elapsed:.1f}ms")

print("\n✅ Spatial index test complete!")


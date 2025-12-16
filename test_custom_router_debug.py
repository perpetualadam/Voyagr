#!/usr/bin/env python3
"""Debug custom router routing issue"""

import time
from custom_router.graph import RoadNetwork
from custom_router.dijkstra import Router
from custom_router.component_analyzer import ComponentAnalyzer

# Test coordinates from the app
start_lat, start_lon = 53.5527719, -1.4827755  # Barnsley area
end_lat, end_lon = 53.505844, -1.1575225  # Sheffield area

print("="*70)
print("CUSTOM ROUTER DEBUG TEST")
print("="*70)

# Load graph
print("\n[1] Loading graph...")
start = time.time()
graph = RoadNetwork('data/uk_router.db')
print(f"✓ Loaded in {time.time()-start:.1f}s")
print(f"  Nodes: {len(graph.nodes):,}")
print(f"  Edges: {sum(len(e) for e in graph.edges.values()):,}")

# Initialize router
print("\n[2] Initializing router...")
router = Router(graph, use_ch=True, db_file='data/uk_router.db')
print(f"✓ CH available: {router.ch_available}")

# Find nearest nodes
print(f"\n[3] Finding nearest nodes...")
start_node = graph.find_nearest_node(start_lat, start_lon)
end_node = graph.find_nearest_node(end_lat, end_lon)
print(f"✓ Start node: {start_node} at ({start_lat}, {start_lon})")
print(f"✓ End node: {end_node} at ({end_lat}, {end_lon})")

if not start_node or not end_node:
    print("✗ Could not find nodes!")
    exit(1)

# Check connectivity
print(f"\n[4] Checking connectivity...")
if graph.component_analyzer:
    start_comp = graph.get_component_id(start_node)
    end_comp = graph.get_component_id(end_node)
    print(f"✓ Start component: {start_comp}")
    print(f"✓ End component: {end_comp}")
    print(f"✓ Same component: {start_comp == end_comp}")
else:
    print("⚠️  No component analyzer - assuming connected")

# Check if nodes have neighbors
print(f"\n[4b] Checking node neighbors...")
start_neighbors = graph.get_neighbors(start_node)
end_neighbors = graph.get_neighbors(end_node)
print(f"✓ Start node neighbors: {len(start_neighbors)}")
print(f"✓ End node neighbors: {len(end_neighbors)}")
if len(start_neighbors) == 0:
    print("✗ Start node has NO neighbors!")
if len(end_neighbors) == 0:
    print("✗ End node has NO neighbors!")

# Try routing
print(f"\n[5] Attempting route...")
start = time.time()
route = router.route(start_lat, start_lon, end_lat, end_lon)
elapsed = time.time() - start

if route:
    if 'error' in route:
        print(f"✗ Route error: {route.get('reason', route.get('error'))}")
    else:
        print(f"✓ Route found in {elapsed*1000:.0f}ms")
        print(f"  Distance: {route.get('distance_km', 0):.1f} km")
        print(f"  Duration: {route.get('duration_minutes', 0):.0f} min")
else:
    print(f"✗ No route found in {elapsed*1000:.0f}ms")

print("\n" + "="*70)


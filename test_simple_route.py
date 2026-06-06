"""
Simple route test - debug why routes are failing
"""

# --- Windows console UTF-8 (auto-added) ---
import sys as _vsys
if _vsys.platform == "win32":
    try:
        _vsys.stdout.reconfigure(encoding="utf-8", errors="replace")
        _vsys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

import time
from custom_router.graph import RoadNetwork
from custom_router.dijkstra import Router

print("[TEST] Loading graph...")
start = time.time()
graph = RoadNetwork('data/uk_router.db')
print(f"✅ Graph loaded in {time.time()-start:.1f}s")

print("\n[TEST] Initializing router...")
router = Router(graph, use_ch=False)
print("✅ Router initialized")

# Test London to Oxford
print("\n[TEST] Testing London to Oxford...")
print("  Start: (51.5074, -0.1278)")
print("  End: (51.7520, -1.2577)")

# Find nearest nodes
start_node = graph.find_nearest_node(51.5074, -0.1278)
end_node = graph.find_nearest_node(51.7520, -1.2577)
print(f"  Start node: {start_node}")
print(f"  End node: {end_node}")

# Check if nodes have neighbors
start_neighbors = graph.get_neighbors(start_node)
end_neighbors = graph.get_neighbors(end_node)
print(f"  Start node neighbors: {len(start_neighbors)}")
print(f"  End node neighbors: {len(end_neighbors)}")

# Check connectivity
is_connected = graph.is_connected(start_node, end_node)
print(f"  Connected: {is_connected}")

# Try routing
print("\n[TEST] Calculating route...")
start_time = time.time()
route = router.route(51.5074, -0.1278, 51.7520, -1.2577)
elapsed = time.time() - start_time

if route:
    print(f"✅ Route found in {elapsed:.2f}s")
    print(f"   Distance: {route.get('distance_m', 0) / 1000:.1f} km")
    print(f"   Duration: {route.get('duration_s', 0) / 60:.1f} min")
    if 'error' in route:
        print(f"   Error: {route['error']}")
        print(f"   Reason: {route.get('reason', '')}")
else:
    print(f"❌ No route found in {elapsed:.2f}s")
    print(f"   Router returned None")


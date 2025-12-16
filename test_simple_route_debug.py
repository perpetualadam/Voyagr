"""
Test simple route with detailed debugging
"""
import time
from custom_router.graph import RoadNetwork
from custom_router.dijkstra import Router
from custom_router.component_analyzer import ComponentAnalyzer

print("=" * 70)
print("SIMPLE ROUTE TEST WITH DEBUGGING")
print("=" * 70)

# Load graph
print("\n[1] Loading graph...")
start = time.time()
graph = RoadNetwork('data/uk_router.db')
print(f"✓ Loaded in {time.time() - start:.1f}s")
print(f"  Nodes: {len(graph.nodes):,}")
print(f"  Edges: {sum(len(e) for e in graph.edges.values()):,}")

# Initialize component analyzer
print("\n[2] Analyzing components...")
start = time.time()
analyzer = ComponentAnalyzer(graph)
analyzer.analyze_full()
graph.set_component_analyzer(analyzer)
print(f"✓ Analysis complete in {time.time() - start:.1f}s")
print(f"  Main component: {analyzer.main_component_size:,} nodes")

# Initialize router WITHOUT CH
print("\n[3] Initializing router (NO CH)...")
start = time.time()
router = Router(graph, use_ch=False, db_file='data/uk_router.db')
print(f"✓ Router ready in {time.time() - start:.1f}s")

# Test route
print("\n[4] Testing London-Oxford route...")
start_lat, start_lon = 51.5074, -0.1278  # London
end_lat, end_lon = 51.7520, -1.2577      # Oxford

print(f"  Start: ({start_lat}, {start_lon})")
print(f"  End: ({end_lat}, {end_lon})")

# Find nearest nodes
print("\n[5] Finding nearest nodes...")
start_node = graph.find_nearest_node(start_lat, start_lon)
end_node = graph.find_nearest_node(end_lat, end_lon)
print(f"  Start node: {start_node}")
print(f"  End node: {end_node}")

# Check connectivity
print("\n[6] Checking connectivity...")
connected = graph.is_connected(start_node, end_node)
print(f"  Connected: {connected}")
if not connected:
    start_comp = graph.get_component_id(start_node)
    end_comp = graph.get_component_id(end_node)
    print(f"  Start component: {start_comp}")
    print(f"  End component: {end_comp}")

# Calculate route
print("\n[7] Calculating route...")
start = time.time()
route = router.route(start_lat, start_lon, end_lat, end_lon)
elapsed = time.time() - start
print(f"✓ Route calculated in {elapsed:.2f}s")

if route:
    if 'error' in route:
        print(f"  Error: {route['error']}")
        print(f"  Reason: {route.get('reason', 'N/A')}")
    else:
        print(f"  Distance: {route.get('distance_m', 0) / 1000:.1f} km")
        print(f"  Duration: {route.get('duration_s', 0) / 60:.1f} min")
        print(f"  Algorithm: {route.get('algorithm', 'N/A')}")
else:
    print(f"  Route is None!")

print("\n" + "=" * 70)


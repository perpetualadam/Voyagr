#!/usr/bin/env python3
"""
Test London-Manchester route specifically
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
from custom_router.component_analyzer import ComponentAnalyzer
from custom_router.dijkstra import Router

def main():
    print("=" * 70)
    print("LONDON-MANCHESTER ROUTE TEST")
    print("=" * 70)
    print()

    # Load graph
    print("[1] Loading graph...")
    start = time.time()
    graph = RoadNetwork()
    graph.load_from_db()
    elapsed = time.time() - start
    print(f"✓ Loaded in {elapsed:.1f}s")
    print(f"  Nodes: {len(graph.nodes):,}")
    print(f"  Edges: {len(graph.edges):,}")
    print()

    # Analyze components
    print("[2] Analyzing components...")
    start = time.time()
    analyzer = ComponentAnalyzer(graph)
    analyzer.analyze_full()
    elapsed = time.time() - start
    print(f"✓ Analysis complete in {elapsed:.1f}s")
    print(f"  Main component: {analyzer.main_component_size:,} nodes")
    print()

    # Initialize router
    print("[3] Initializing router...")
    start = time.time()
    router = Router(graph, analyzer, use_ch=False)
    elapsed = time.time() - start
    print(f"✓ Router ready in {elapsed:.1f}s")
    print()

    # Test coordinates
    london_lat, london_lon = 51.5074, -0.1278
    manchester_lat, manchester_lon = 53.4808, -2.2426

    print("[4] Testing London-Manchester route...")
    print(f"  Start: ({london_lat}, {london_lon})")
    print(f"  End: ({manchester_lat}, {manchester_lon})")
    print()

    # Find nearest nodes
    print("[5] Finding nearest nodes...")
    start_node = graph.find_nearest_node(london_lat, london_lon)
    end_node = graph.find_nearest_node(manchester_lat, manchester_lon)
    print(f"  Start node: {start_node}")
    print(f"  End node: {end_node}")
    print()

    # Check connectivity
    print("[6] Checking connectivity...")
    connected = analyzer.is_connected(start_node, end_node)
    print(f"  Connected: {connected}")
    
    # Check components
    start_comp = analyzer.components.get(start_node, "NOT FOUND")
    end_comp = analyzer.components.get(end_node, "NOT FOUND")
    print(f"  Start component: {start_comp}")
    print(f"  End component: {end_comp}")
    print()

    # Calculate route
    print("[7] Calculating route...")
    start = time.time()
    result = router.calculate_route(london_lat, london_lon, manchester_lat, manchester_lon)
    elapsed = time.time() - start
    
    if 'error' in result:
        print(f"❌ Route failed in {elapsed:.2f}s")
        print(f"  Error: {result['error']}")
        print(f"  Reason: {result.get('reason', 'Unknown')}")
    else:
        print(f"✓ Route calculated in {elapsed:.2f}s")
        print(f"  Distance: {result['distance_km']:.1f} km")
        print(f"  Duration: {result['duration_minutes']:.1f} min")
        print(f"  Algorithm: {result.get('algorithm', 'Unknown')}")
    print()

    print("=" * 70)

if __name__ == '__main__':
    main()


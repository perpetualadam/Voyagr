#!/usr/bin/env python3
"""
Phase 4 Testing: Component Caching & Optimization
Tests component detection, caching, and component-aware routing
"""

import time
from custom_router.graph import RoadNetwork
from custom_router.dijkstra import Router
from custom_router.component_analyzer import ComponentAnalyzer

print("="*70)
print("PHASE 4: Component Caching & Optimization")
print("="*70)

# ============================================================================
# STEP 1: Load Graph
# ============================================================================
print("\n[STEP 1] Loading graph...")
start = time.time()
graph = RoadNetwork('data/uk_router.db')
print(f"✓ Graph loaded in {time.time()-start:.1f}s")
print(f"  Nodes: {len(graph.nodes):,}")
print(f"  Ways: {len(graph.ways):,}")

# ============================================================================
# STEP 2: Analyze Components
# ============================================================================
print("\n[STEP 2] Analyzing connected components...")
analyzer = ComponentAnalyzer(graph)
stats = analyzer.analyze()

print(f"\n✓ Component analysis complete:")
print(f"  Total components: {stats['total_components']}")
print(f"  Main component: {stats['main_component_size']:,} nodes "
      f"({stats['main_component_pct']:.1f}%)")
print(f"\n  Top 5 components:")
for comp_id, size in stats['top_5_components']:
    pct = 100 * size / stats['total_nodes']
    print(f"    Component {comp_id}: {size:,} nodes ({pct:.1f}%)")

# ============================================================================
# STEP 3: Set Component Analyzer
# ============================================================================
print("\n[STEP 3] Setting component analyzer...")
graph.set_component_analyzer(analyzer)
print("✓ Component analyzer set")

# ============================================================================
# STEP 4: Test Component Lookup (O(1))
# ============================================================================
print("\n[STEP 4] Testing component lookup performance...")
router = Router(graph)

test_nodes = [
    (1239525667, "London"),
    (213435, "Oxford"),
    (12407862771, "Manchester"),
]

for node_id, label in test_nodes:
    if node_id in graph.nodes:
        comp_id = graph.get_component_id(node_id)
        in_main = graph.is_in_main_component(node_id)
        print(f"  {label} (node {node_id}): component {comp_id}, "
              f"in_main={in_main}")

# ============================================================================
# STEP 5: Test Component-Aware Routing
# ============================================================================
print("\n[STEP 5] Testing component-aware routing...")

test_routes = [
    ((51.5074, -0.1278), (51.5200, -0.1000), "London short"),
    ((51.5074, -0.1278), (51.7520, -1.2577), "London to Oxford"),
    ((51.5074, -0.1278), (53.4808, -2.2426), "London to Manchester"),
]

for src, dst, label in test_routes:
    print(f"\n  {label}:")
    print(f"    From: {src}")
    print(f"    To:   {dst}")
    
    start = time.time()
    route = router.route(src[0], src[1], dst[0], dst[1])
    elapsed = time.time() - start
    
    if route:
        if 'error' in route:
            print(f"    ✗ {route['error']}")
            print(f"      Reason: {route['reason']}")
            print(f"      Start component: {route['start_component']}")
            print(f"      End component: {route['end_component']}")
            print(f"      Time: {route['response_time_ms']:.1f}ms")
        else:
            print(f"    ✓ Route found: {route['distance_km']:.1f}km")
            print(f"      Time: {route['response_time_ms']:.1f}ms")
    else:
        print(f"    ✗ Route not found in {elapsed*1000:.1f}ms")

# ============================================================================
# STEP 6: Performance Benchmark
# ============================================================================
print("\n[STEP 6] Performance benchmark...")

# Test component lookup speed
print("\n  Component lookup (O(1)):")
start = time.time()
for _ in range(10000):
    node_id = list(graph.nodes.keys())[0]
    graph.is_connected(node_id, node_id)
elapsed = time.time() - start
print(f"    10,000 lookups: {elapsed*1000:.1f}ms ({elapsed*1000/10000:.3f}ms per lookup)")

# Test routing within main component
print("\n  Routing within main component:")
main_nodes = [nid for nid in graph.nodes.keys() 
              if graph.is_in_main_component(nid)][:10]

if len(main_nodes) >= 2:
    src_node = main_nodes[0]
    dst_node = main_nodes[1]
    src_lat, src_lon = graph.nodes[src_node]
    dst_lat, dst_lon = graph.nodes[dst_node]
    
    start = time.time()
    route = router.route(src_lat, src_lon, dst_lat, dst_lon)
    elapsed = time.time() - start
    
    if route and 'error' not in route:
        print(f"    ✓ Route found: {route['distance_km']:.1f}km in {elapsed*1000:.1f}ms")
    else:
        print(f"    ✗ Route not found in {elapsed*1000:.1f}ms")

print("\n" + "="*70)
print("PHASE 4 TESTING COMPLETE")
print("="*70)


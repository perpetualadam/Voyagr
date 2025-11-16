#!/usr/bin/env python3
"""
Phase 4 Simple Test: Component-Aware Routing
Tests component detection and routing without full analysis
"""

import time
from custom_router.graph import RoadNetwork
from custom_router.dijkstra import Router
from custom_router.component_analyzer import ComponentAnalyzer

print("="*70)
print("PHASE 4: Component-Aware Routing (Simple Test)")
print("="*70)

# ============================================================================
# STEP 1: Load Graph
# ============================================================================
print("\n[STEP 1] Loading graph...")
start = time.time()
graph = RoadNetwork('data/uk_router.db')
print(f"✓ Graph loaded in {time.time()-start:.1f}s")

# ============================================================================
# STEP 2: Quick Component Analysis (Sample 1000 nodes)
# ============================================================================
print("\n[STEP 2] Quick component analysis (sampling 1000 nodes)...")
analyzer = ComponentAnalyzer(graph)
stats = analyzer.analyze(sample_size=1000, max_bfs_nodes=10000)

print(f"\n✓ Component analysis complete:")
print(f"  Total components found: {stats['total_components']}")
print(f"  Main component: {stats['main_component_size']:,} nodes "
      f"({stats['main_component_pct']:.1f}%)")

# ============================================================================
# STEP 3: Set Component Analyzer
# ============================================================================
print("\n[STEP 3] Setting component analyzer...")
graph.set_component_analyzer(analyzer)
print("✓ Component analyzer set")

# ============================================================================
# STEP 4: Test Component-Aware Routing
# ============================================================================
print("\n[STEP 4] Testing component-aware routing...")
router = Router(graph)

test_routes = [
    ((51.5074, -0.1278), (51.5200, -0.1000), "London short"),
    ((51.5074, -0.1278), (51.7520, -1.2577), "London to Oxford"),
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
            print(f"      Time: {route['response_time_ms']:.1f}ms")
        else:
            print(f"    ✓ Route found: {route['distance_km']:.1f}km")
            print(f"      Time: {route['response_time_ms']:.1f}ms")
    else:
        print(f"    ✗ Route not found in {elapsed*1000:.1f}ms")

# ============================================================================
# STEP 5: Performance Benchmark
# ============================================================================
print("\n[STEP 5] Performance benchmark...")

# Test component lookup speed
print("\n  Component lookup (O(1)):")
start = time.time()
for _ in range(10000):
    node_id = list(graph.nodes.keys())[0]
    graph.is_connected(node_id, node_id)
elapsed = time.time() - start
print(f"    10,000 lookups: {elapsed*1000:.1f}ms ({elapsed*1000/10000:.3f}ms per lookup)")

print("\n" + "="*70)
print("PHASE 4 SIMPLE TEST COMPLETE")
print("="*70)


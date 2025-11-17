#!/usr/bin/env python3
"""
Phase 4 Test: Eager Edge Loading
Tests component detection with pre-loaded edges
"""

import time
from custom_router.graph import RoadNetwork
from custom_router.dijkstra import Router
from custom_router.component_analyzer import ComponentAnalyzer

print("="*70)
print("PHASE 4: Component-Aware Routing (Eager Loading Test)")
print("="*70)

# ============================================================================
# STEP 1: Load Graph with Eager Edge Loading
# ============================================================================
print("\n[STEP 1] Loading graph with eager edge loading...")
start = time.time()
graph = RoadNetwork('data/uk_router.db')
load_time = time.time() - start
print(f"✓ Graph loaded in {load_time:.1f}s")

# ============================================================================
# STEP 2: Component Analysis (Should be MUCH faster now)
# ============================================================================
print("\n[STEP 2] Component analysis (with eager-loaded edges)...")
start = time.time()
analyzer = ComponentAnalyzer(graph)
stats = analyzer.analyze(sample_size=1000, max_bfs_nodes=500000)
analysis_time = time.time() - start

print(f"\n✓ Component analysis complete in {analysis_time:.1f}s:")
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
# STEP 5: Performance Summary
# ============================================================================
print("\n[STEP 5] Performance Summary")
print(f"  Graph load time: {load_time:.1f}s")
print(f"  Component analysis: {analysis_time:.1f}s")
print(f"  Total startup: {load_time + analysis_time:.1f}s")

print("\n" + "="*70)
print("PHASE 4 EAGER LOADING TEST COMPLETE")
print("="*70)


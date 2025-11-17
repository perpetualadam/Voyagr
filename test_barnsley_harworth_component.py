#!/usr/bin/env python3
"""
Test if Barnsley and Harworth are in the same component
Barnsley: 53.5505, -1.4793
Harworth: 53.5833, -1.1667 (near Blyth, Nottinghamshire)
"""

import time
from custom_router.graph import RoadNetwork
from custom_router.dijkstra import Router
from custom_router.component_analyzer import ComponentAnalyzer

print("="*70)
print("BARNSLEY TO HARWORTH - COMPONENT TEST")
print("="*70)

# Coordinates
BARNSLEY = (53.5505, -1.4793)
HARWORTH = (53.5833, -1.1667)

print(f"\nBarnsley: {BARNSLEY}")
print(f"Harworth: {HARWORTH}")
print(f"Distance: ~{((HARWORTH[0]-BARNSLEY[0])**2 + (HARWORTH[1]-BARNSLEY[1])**2)**0.5 * 111:.1f} km")

# ============================================================================
# STEP 1: Load Graph
# ============================================================================
print("\n[STEP 1] Loading graph...")
start = time.time()
graph = RoadNetwork('data/uk_router.db')
load_time = time.time() - start
print(f"✓ Graph loaded in {load_time:.1f}s")

# ============================================================================
# STEP 2: Analyze Components
# ============================================================================
print("\n[STEP 2] Analyzing components (sampling 1000 nodes)...")
start = time.time()
analyzer = ComponentAnalyzer(graph)
stats = analyzer.analyze(sample_size=1000, max_bfs_nodes=500000)
analysis_time = time.time() - start

print(f"✓ Analysis complete in {analysis_time:.1f}s:")
print(f"  Total components: {stats['total_components']}")
print(f"  Main component: {stats['main_component_size']:,} nodes ({stats['main_component_pct']:.1f}%)")

# ============================================================================
# STEP 3: Set Component Analyzer
# ============================================================================
print("\n[STEP 3] Setting component analyzer...")
graph.set_component_analyzer(analyzer)
print("✓ Component analyzer set")

# ============================================================================
# STEP 4: Find Nearest Nodes
# ============================================================================
print("\n[STEP 4] Finding nearest nodes...")
barnsley_node = graph.find_nearest_node(BARNSLEY[0], BARNSLEY[1])
harworth_node = graph.find_nearest_node(HARWORTH[0], HARWORTH[1])

print(f"✓ Barnsley nearest node: {barnsley_node}")
print(f"✓ Harworth nearest node: {harworth_node}")

# ============================================================================
# STEP 5: Check Components
# ============================================================================
print("\n[STEP 5] Checking components...")
if barnsley_node and harworth_node:
    barnsley_comp = graph.get_component_id(barnsley_node)
    harworth_comp = graph.get_component_id(harworth_node)
    
    print(f"✓ Barnsley component: {barnsley_comp}")
    print(f"✓ Harworth component: {harworth_comp}")
    
    if barnsley_comp == harworth_comp:
        print(f"\n✅ SAME COMPONENT - Can route between them!")
    else:
        print(f"\n❌ DIFFERENT COMPONENTS - Cannot route between them")
else:
    print("✗ Could not find nodes")

# ============================================================================
# STEP 6: Test Routing
# ============================================================================
print("\n[STEP 6] Testing routing...")
router = Router(graph)

start = time.time()
route = router.route(BARNSLEY[0], BARNSLEY[1], HARWORTH[0], HARWORTH[1])
elapsed = time.time() - start

if route:
    if 'error' in route:
        print(f"✗ {route['error']}")
        print(f"  Reason: {route['reason']}")
        print(f"  Time: {route['response_time_ms']:.1f}ms")
    else:
        print(f"✓ Route found!")
        print(f"  Distance: {route['distance_km']:.1f} km")
        print(f"  Duration: {route['duration_minutes']:.0f} minutes")
        print(f"  Time: {route['response_time_ms']:.1f}ms")
else:
    print(f"✗ Route not found in {elapsed*1000:.1f}ms")

print("\n" + "="*70)


#!/usr/bin/env python3
"""
Test full BFS component analysis
Tests if Barnsley and Harworth are in the same component using FULL BFS
"""

import time
from custom_router.graph import RoadNetwork
from custom_router.component_analyzer import ComponentAnalyzer

print("="*70)
print("FULL BFS COMPONENT ANALYSIS TEST")
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
print(f"  Nodes: {len(graph.nodes):,}")
print(f"  Edges: {sum(len(neighbors) for neighbors in graph.edges.values()):,}")

# ============================================================================
# STEP 2: Run FULL Component Analysis
# ============================================================================
print("\n[STEP 2] Running FULL component analysis (all 26.5M nodes)...")
print("⏱️  This will take 30-60 minutes...")
start = time.time()
analyzer = ComponentAnalyzer(graph)
stats = analyzer.analyze_full()
analysis_time = time.time() - start

print(f"\n✓ FULL analysis complete in {analysis_time:.1f}s ({analysis_time/60:.1f}m):")
print(f"  Total components: {stats['total_components']}")
print(f"  Main component: {stats['main_component_size']:,} nodes ({stats['main_component_pct']:.1f}%)")
print(f"  Total nodes analyzed: {stats['total_nodes']:,}")

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
    
    if barnsley_comp == harworth_comp and barnsley_comp != -1:
        print(f"\n✅ SAME COMPONENT - Can route between them!")
    elif barnsley_comp == -1 or harworth_comp == -1:
        print(f"\n⚠️  UNANALYZED NODES - Will fallback to other routing engines")
    else:
        print(f"\n❌ DIFFERENT COMPONENTS - Cannot route between them")
else:
    print("✗ Could not find nodes")

print("\n" + "="*70)
print("TEST COMPLETE")
print("="*70)


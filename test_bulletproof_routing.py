#!/usr/bin/env python3
"""
Test bulletproof routing with component detection
Tests London → Oxford routing after fixes
"""

import time
from custom_router.graph import RoadNetwork
from custom_router.dijkstra import Router

print("=" * 70)
print("BULLETPROOF ROUTING TEST - London → Oxford")
print("=" * 70)

# Test coordinates
LONDON = (51.5074, -0.1278)  # London (Trafalgar Square)
OXFORD = (51.7520, -1.2577)  # Oxford (City Centre)
MANCHESTER = (53.4808, -2.2426)  # Manchester (City Centre)
EDINBURGH = (55.9533, -3.1883)  # Edinburgh (City Centre)

print("\n[1] Loading graph with bulletproof component detection...")
start = time.time()
graph = RoadNetwork('data/uk_router.db')
print(f"✅ Graph loaded in {time.time() - start:.1f}s")
print(f"   Nodes: {len(graph.nodes):,}")
print(f"   Edges: {sum(len(e) for e in graph.edges.values()):,}")

# Check component_id was built
if hasattr(graph, 'component_id') and graph.component_id:
    print(f"   Components: {len(set(graph.component_id.values())):,}")
    print(f"   Component coverage: {len(graph.component_id):,}/{len(graph.nodes):,} nodes")
else:
    print("   ⚠️  WARNING: component_id not built!")

print("\n[2] Initializing router...")
router = Router(graph, use_ch=False)
print("✅ Router initialized")

# Test 1: London → Oxford
print("\n" + "=" * 70)
print("TEST 1: London → Oxford (~90 km)")
print("=" * 70)
print(f"Start: {LONDON} (London)")
print(f"End: {OXFORD} (Oxford)")

start_node = graph.find_nearest_node(LONDON[0], LONDON[1])
end_node = graph.find_nearest_node(OXFORD[0], OXFORD[1])
print(f"Start node: {start_node}")
print(f"End node: {end_node}")

if start_node and end_node and hasattr(graph, 'component_id'):
    start_comp = graph.component_id.get(start_node)
    end_comp = graph.component_id.get(end_node)
    print(f"Start component: {start_comp}")
    print(f"End component: {end_comp}")
    print(f"Same component: {start_comp == end_comp}")

print("\nCalculating route...")
start = time.time()
result = router.route(LONDON[0], LONDON[1], OXFORD[0], OXFORD[1])
elapsed = time.time() - start

if result and 'error' not in result:
    print(f"✅ ROUTE FOUND in {elapsed:.2f}s")
    print(f"   Distance: {result.get('distance_km', 0):.1f} km")
    print(f"   Duration: {result.get('duration_min', 0):.0f} min")
    print(f"   Algorithm: {result.get('algorithm', 'unknown')}")
else:
    print(f"❌ ROUTE FAILED in {elapsed:.2f}s")
    if result:
        print(f"   Error: {result.get('error', 'unknown')}")
        print(f"   Reason: {result.get('reason', 'unknown')}")

# Test 2: London → Manchester
print("\n" + "=" * 70)
print("TEST 2: London → Manchester (~265 km)")
print("=" * 70)
print(f"Start: {LONDON} (London)")
print(f"End: {MANCHESTER} (Manchester)")

print("\nCalculating route...")
start = time.time()
result = router.route(LONDON[0], LONDON[1], MANCHESTER[0], MANCHESTER[1])
elapsed = time.time() - start

if result and 'error' not in result:
    print(f"✅ ROUTE FOUND in {elapsed:.2f}s")
    print(f"   Distance: {result.get('distance_km', 0):.1f} km")
    print(f"   Duration: {result.get('duration_min', 0):.0f} min")
    print(f"   Algorithm: {result.get('algorithm', 'unknown')}")
else:
    print(f"❌ ROUTE FAILED in {elapsed:.2f}s")
    if result:
        print(f"   Error: {result.get('error', 'unknown')}")
        print(f"   Reason: {result.get('reason', 'unknown')}")

# Test 3: London → Edinburgh
print("\n" + "=" * 70)
print("TEST 3: London → Edinburgh (~650 km)")
print("=" * 70)
print(f"Start: {LONDON} (London)")
print(f"End: {EDINBURGH} (Edinburgh)")

print("\nCalculating route...")
start = time.time()
result = router.route(LONDON[0], LONDON[1], EDINBURGH[0], EDINBURGH[1])
elapsed = time.time() - start

if result and 'error' not in result:
    print(f"✅ ROUTE FOUND in {elapsed:.2f}s")
    print(f"   Distance: {result.get('distance_km', 0):.1f} km")
    print(f"   Duration: {result.get('duration_min', 0):.0f} min")
    print(f"   Algorithm: {result.get('algorithm', 'unknown')}")
else:
    print(f"❌ ROUTE FAILED in {elapsed:.2f}s")
    if result:
        print(f"   Error: {result.get('error', 'unknown')}")
        print(f"   Reason: {result.get('reason', 'unknown')}")

print("\n" + "=" * 70)
print("TEST COMPLETE")
print("=" * 70)


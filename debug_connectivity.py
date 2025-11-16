#!/usr/bin/env python3
"""
Debug graph connectivity - find main component
"""

import sys
import time
from collections import deque
from custom_router.graph import RoadNetwork

print("[SETUP] Loading graph...")
start = time.time()
graph = RoadNetwork('data/uk_router.db')
print(f"✓ Graph loaded in {time.time()-start:.1f}s")
print(f"  Nodes: {len(graph.nodes):,}")

# ============================================================================
# Find Main Connected Component
# ============================================================================
print("\n" + "="*70)
print("Finding Main Connected Component")
print("="*70)

def find_main_component(graph, sample_size=10000):
    """Find largest connected component using BFS."""
    print(f"\nScanning {sample_size:,} nodes...")
    
    visited = set()
    components = []
    node_list = list(graph.nodes.keys())
    
    # Sample nodes to find components
    for i, start_node in enumerate(node_list[:sample_size]):
        if start_node in visited:
            continue
        
        if i % 1000 == 0:
            print(f"  Processed {i:,} nodes, found {len(components)} components")
        
        # BFS to find component
        component = set()
        queue = deque([start_node])
        
        while queue:
            node = queue.popleft()
            if node in visited:
                continue
            
            visited.add(node)
            component.add(node)
            
            # Get neighbors (lazy loaded)
            neighbors = graph.get_neighbors(node)
            for neighbor, _, _, _ in neighbors:
                if neighbor not in visited:
                    queue.append(neighbor)
        
        components.append(component)
    
    # Find largest component
    if components:
        main_comp = max(components, key=len)
        print(f"\n✓ Found {len(components)} components")
        print(f"✓ Main component: {len(main_comp):,} nodes")
        print(f"✓ Visited: {len(visited):,} nodes")
        
        # Show top 5 components
        sorted_comps = sorted(components, key=len, reverse=True)
        print(f"\nTop 5 components:")
        for i, comp in enumerate(sorted_comps[:5], 1):
            print(f"  {i}. {len(comp):,} nodes")
        
        return main_comp
    
    return set()

main_component = find_main_component(graph, sample_size=50000)

# ============================================================================
# Test Routing Within Main Component
# ============================================================================
print("\n" + "="*70)
print("Testing Routes Within Main Component")
print("="*70)

from custom_router.dijkstra import Router

router = Router(graph)

# Get 3 random nodes from main component
import random
main_nodes = list(main_component)

print(f"\nTesting 3 routes within main component ({len(main_nodes):,} nodes)...")

for attempt in range(3):
    src_node_id = random.choice(main_nodes)
    dst_node_id = random.choice(main_nodes)
    
    src_lat, src_lon = graph.nodes[src_node_id]
    dst_lat, dst_lon = graph.nodes[dst_node_id]
    
    print(f"\nAttempt {attempt+1}:")
    print(f"  Source: Node {src_node_id} at ({src_lat:.4f}, {src_lon:.4f})")
    print(f"  Dest:   Node {dst_node_id} at ({dst_lat:.4f}, {dst_lon:.4f})")
    
    start = time.time()
    route = router.route(src_lat, src_lon, dst_lat, dst_lon)
    elapsed = time.time() - start
    
    if route:
        print(f"  ✓ Route found: {route['distance_km']:.1f}km in {elapsed*1000:.0f}ms")
    else:
        print(f"  ✗ Route not found in {elapsed*1000:.0f}ms")

print("\n" + "="*70)
print("CONNECTIVITY DEBUG COMPLETE")
print("="*70)


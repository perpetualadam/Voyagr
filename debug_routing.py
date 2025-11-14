#!/usr/bin/env python3
"""Debug routing algorithm"""

from custom_router.graph import RoadNetwork
from custom_router.dijkstra import Router
import time

print('Loading graph...')
graph = RoadNetwork('data/uk_router.db')
print(f'✓ Nodes: {len(graph.nodes):,}')
print(f'✓ Edges: {sum(len(neighbors) for neighbors in graph.edges.values()):,}')

# Test 1: Check if nodes have neighbors
print('\n=== TEST 1: Node Connectivity ===')
nodes_with_neighbors = sum(1 for node_id in graph.nodes if len(graph.get_neighbors(node_id)) > 0)
print(f'Nodes with neighbors: {nodes_with_neighbors:,} / {len(graph.nodes):,}')
print(f'Connectivity: {100 * nodes_with_neighbors / len(graph.nodes):.1f}%')

# Test 2: Check specific nodes
print('\n=== TEST 2: Specific Node Analysis ===')
start_lat, start_lon = 51.5074, -0.1278  # London
end_lat, end_lon = 53.4808, -2.2426      # Manchester

start_node = graph.find_nearest_node(start_lat, start_lon)
end_node = graph.find_nearest_node(end_lat, end_lon)

print(f'Start node: {start_node}')
print(f'  Neighbors: {len(graph.get_neighbors(start_node))}')
if graph.get_neighbors(start_node):
    print(f'  First neighbor: {graph.get_neighbors(start_node)[0]}')

print(f'End node: {end_node}')
print(f'  Neighbors: {len(graph.get_neighbors(end_node))}')
if graph.get_neighbors(end_node):
    print(f'  First neighbor: {graph.get_neighbors(end_node)[0]}')

# Test 3: Simple Dijkstra with debug
print('\n=== TEST 3: Dijkstra Debug ===')
router = Router(graph)

# Add debug to Dijkstra
start_time = time.time()
path = router.dijkstra(start_node, end_node)
elapsed = time.time() - start_time

print(f'Path found: {path is not None}')
print(f'Time: {elapsed:.2f}s')
print(f'Stats: {router.get_stats()}')

if path:
    print(f'Path length: {len(path)} nodes')
    print(f'First 5 nodes: {path[:5]}')
    print(f'Last 5 nodes: {path[-5:]}')


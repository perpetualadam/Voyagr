#!/usr/bin/env python3
"""Debug component analyzer"""

from custom_router.graph import RoadNetwork
from custom_router.component_analyzer import ComponentAnalyzer

print("Loading graph...")
graph = RoadNetwork('data/uk_router.db')

print("Analyzing components (FULL)...")
analyzer = ComponentAnalyzer(graph)
analyzer.analyze_full()

node1 = 7639001106  # London
node2 = 4770811000  # Oxford

print(f'\nNode 1: {node1}')
print(f'Node 2: {node2}')
print(f'Total nodes in components dict: {len(analyzer.components)}')
print(f'Component 1: {analyzer.components.get(node1, "NOT FOUND")}')
print(f'Component 2: {analyzer.components.get(node2, "NOT FOUND")}')
print(f'Connected: {analyzer.is_connected(node1, node2)}')

# Check if nodes exist in graph
print(f'\nNode 1 in graph: {node1 in graph.nodes}')
print(f'Node 2 in graph: {node2 in graph.nodes}')

# Check neighbors
neighbors1 = graph.get_neighbors(node1)
neighbors2 = graph.get_neighbors(node2)
print(f'Node 1 neighbors: {len(neighbors1)}')
print(f'Node 2 neighbors: {len(neighbors2)}')


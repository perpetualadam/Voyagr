#!/usr/bin/env python3
"""Check if two nodes are in the same component"""

from custom_router.graph import RoadNetwork
from custom_router.component_analyzer import ComponentAnalyzer

print("Loading graph...")
graph = RoadNetwork('data/uk_router.db')

print("Analyzing components...")
analyzer = ComponentAnalyzer(graph)

node1 = 7639001106  # London
node2 = 4770811000  # Oxford

print(f'Node 1: {node1}')
print(f'Node 2: {node2}')
print(f'Component 1: {analyzer.components.get(node1, "NOT FOUND")}')
print(f'Component 2: {analyzer.components.get(node2, "NOT FOUND")}')
print(f'Connected: {analyzer.is_connected(node1, node2)}')


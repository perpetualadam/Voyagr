#!/usr/bin/env python3
"""Check component sizes"""

from custom_router.graph import RoadNetwork
from custom_router.component_analyzer import ComponentAnalyzer

print("Loading graph...")
graph = RoadNetwork('data/uk_router.db')

print("Analyzing components (FULL)...")
analyzer = ComponentAnalyzer(graph)
analyzer.analyze_full()

print(f'\nComponent sizes:')
sorted_comps = sorted(analyzer.component_sizes.items(), key=lambda x: x[1], reverse=True)
for i, (comp_id, size) in enumerate(sorted_comps[:20]):
    print(f'  Component {comp_id}: {size:,} nodes')

print(f'\nTotal components: {len(analyzer.component_sizes)}')
print(f'Main component ID: {analyzer.main_component_id}')
print(f'Main component size: {analyzer.main_component_size:,}')

# Check which component London and Oxford are in
node1 = 7639001106  # London
node2 = 4770811000  # Oxford
comp1 = analyzer.components.get(node1)
comp2 = analyzer.components.get(node2)
print(f'\nLondon (node {node1}): Component {comp1}, size {analyzer.component_sizes.get(comp1, 0):,}')
print(f'Oxford (node {node2}): Component {comp2}, size {analyzer.component_sizes.get(comp2, 0):,}')


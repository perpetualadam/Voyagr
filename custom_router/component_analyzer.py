"""
Connected component analyzer for road network graph
Identifies and caches connected components for fast routing
Uses optimized BFS with early termination for large graphs
"""

import time
import random
from collections import deque
from typing import Dict, Set, Tuple, List

class ComponentAnalyzer:
    """Analyze and cache connected components in road network."""

    def __init__(self, graph):
        """Initialize analyzer with graph."""
        self.graph = graph
        self.components = {}  # node_id -> component_id
        self.component_sizes = {}  # component_id -> size
        self.main_component_id = None
        self.main_component_size = 0
        self.analysis_mode = 'fast'  # 'fast' or 'full'
    
    def analyze(self, sample_size=10000, max_bfs_nodes=50000) -> Dict:
        """
        Fast component analysis using limited BFS.

        Args:
            sample_size: Number of random starting nodes to sample (default 10k)
            max_bfs_nodes: Max nodes to explore per BFS (default 50k)

        Returns:
            Dictionary with component statistics
        """
        print("[ComponentAnalyzer] Starting fast component analysis...")
        start_time = time.time()

        visited = set()
        component_id = 0
        node_list = list(self.graph.nodes.keys())

        # Randomly sample nodes for faster analysis
        if len(node_list) > sample_size:
            node_list = random.sample(node_list, sample_size)
            print(f"[ComponentAnalyzer] Sampling {len(node_list):,} random nodes")
        else:
            print(f"[ComponentAnalyzer] Analyzing {len(node_list):,} nodes")

        # Find components using limited BFS
        for i, start_node in enumerate(node_list):
            if start_node in visited:
                continue

            if i % 1000 == 0 and i > 0:
                print(f"[ComponentAnalyzer] Processed {i:,} samples, "
                      f"found {component_id} components")

            # Limited BFS to find component
            component_nodes = self._bfs_component_limited(start_node, visited, max_bfs_nodes)

            # Store component info
            self.components.update({node: component_id for node in component_nodes})
            self.component_sizes[component_id] = len(component_nodes)

            component_id += 1

        # Find main component
        if self.component_sizes:
            self.main_component_id = max(self.component_sizes,
                                         key=self.component_sizes.get)
            self.main_component_size = self.component_sizes[self.main_component_id]

        elapsed = time.time() - start_time

        # Print statistics
        stats = self._get_statistics()
        print(f"[ComponentAnalyzer] Analysis complete in {elapsed:.1f}s")
        print(f"[ComponentAnalyzer] Found {len(self.component_sizes)} components")
        if self.main_component_size > 0:
            print(f"[ComponentAnalyzer] Main component: {self.main_component_size:,} nodes "
                  f"({stats['main_component_pct']:.1f}%)")

        self.analysis_mode = 'fast'
        return stats
    
    def _bfs_component(self, start_node: int, visited: Set[int]) -> Set[int]:
        """Find all nodes in component using BFS."""
        component = set()
        queue = deque([start_node])
        visited.add(start_node)

        while queue:
            node = queue.popleft()
            component.add(node)

            # Get neighbors (lazy loaded)
            neighbors = self.graph.get_neighbors(node)
            for neighbor, _, _, _ in neighbors:
                if neighbor not in visited:
                    visited.add(neighbor)
                    queue.append(neighbor)

        return component

    def _bfs_component_limited(self, start_node: int, visited: Set[int],
                               max_nodes: int = 50000) -> Set[int]:
        """Find component using limited BFS (stops after max_nodes)."""
        component = set()
        queue = deque([start_node])
        visited.add(start_node)

        while queue and len(component) < max_nodes:
            node = queue.popleft()
            component.add(node)

            # Get neighbors (lazy loaded)
            neighbors = self.graph.get_neighbors(node)
            for neighbor, _, _, _ in neighbors:
                if neighbor not in visited and len(component) < max_nodes:
                    visited.add(neighbor)
                    queue.append(neighbor)

        return component
    
    def is_connected(self, node1: int, node2: int) -> bool:
        """Check if two nodes are in same component (O(1))."""
        if node1 not in self.components or node2 not in self.components:
            return False
        return self.components[node1] == self.components[node2]
    
    def get_component_id(self, node_id: int) -> int:
        """Get component ID for a node."""
        return self.components.get(node_id, -1)
    
    def is_in_main_component(self, node_id: int) -> bool:
        """Check if node is in main component."""
        return self.get_component_id(node_id) == self.main_component_id
    
    def _get_statistics(self) -> Dict:
        """Get component statistics."""
        total_nodes = len(self.components)
        total_components = len(self.component_sizes)
        
        # Sort components by size
        sorted_comps = sorted(self.component_sizes.items(), 
                            key=lambda x: x[1], reverse=True)
        
        return {
            'total_nodes': total_nodes,
            'total_components': total_components,
            'main_component_id': self.main_component_id,
            'main_component_size': self.main_component_size,
            'main_component_pct': 100 * self.main_component_size / total_nodes if total_nodes > 0 else 0,
            'top_5_components': sorted_comps[:5],
            'components': self.component_sizes
        }
    
    def get_statistics(self) -> Dict:
        """Get component statistics."""
        return self._get_statistics()


# Phase 4 Full BFS Implementation Guide

## 🎯 Objective

Replace sampling-based component detection with complete BFS to find TRUE connected components and enable routing for all UK locations.

---

## 📝 Implementation Steps

### Step 1: Add `analyze_full()` Method

Add to `custom_router/component_analyzer.py`:

```python
def analyze_full(self) -> Dict:
    """
    Complete component analysis using full BFS.
    Finds TRUE connected components (not sampled).
    
    Takes ~30-60 minutes but guarantees all nodes are analyzed.
    """
    print("[ComponentAnalyzer] Starting FULL component analysis...")
    start_time = time.time()
    
    visited = set()
    component_id = 0
    node_list = list(self.graph.nodes.keys())
    total_nodes = len(node_list)
    
    print(f"[ComponentAnalyzer] Analyzing ALL {total_nodes:,} nodes...")
    
    for i, start_node in enumerate(node_list):
        if start_node in visited:
            continue
        
        if i % 100000 == 0 and i > 0:
            elapsed = time.time() - start_time
            rate = i / elapsed
            remaining = (total_nodes - i) / rate / 60
            print(f"[ComponentAnalyzer] {i:,}/{total_nodes:,} nodes "
                  f"({100*i/total_nodes:.1f}%) - "
                  f"ETA: {remaining:.0f} min")
        
        # Full BFS (no limit)
        component_nodes = self._bfs_component(start_node, visited)
        
        self.components.update({node: component_id for node in component_nodes})
        self.component_sizes[component_id] = len(component_nodes)
        component_id += 1
    
    # Find main component
    if self.component_sizes:
        self.main_component_id = max(self.component_sizes,
                                     key=self.component_sizes.get)
        self.main_component_size = self.component_sizes[self.main_component_id]
    
    elapsed = time.time() - start_time
    stats = self._get_statistics()
    
    print(f"[ComponentAnalyzer] FULL analysis complete in {elapsed/60:.1f} minutes")
    print(f"[ComponentAnalyzer] Found {len(self.component_sizes)} TRUE components")
    print(f"[ComponentAnalyzer] Main component: {self.main_component_size:,} nodes "
          f"({stats['main_component_pct']:.1f}%)")
    
    self.analysis_mode = 'full'
    return stats
```

### Step 2: Update `graph.py` Initialization

Modify `custom_router/graph.py` to use full BFS:

```python
# In RoadNetwork.__init__() or after loading edges:
if self.component_analyzer is None:
    print("[Graph] Running FULL component analysis...")
    analyzer = ComponentAnalyzer(self)
    stats = analyzer.analyze_full()  # Use full BFS instead of sampling
    self.set_component_analyzer(analyzer)
```

### Step 3: Handle Missing Nodes

Update `is_connected()` to handle nodes not in components:

```python
def is_connected(self, node1: int, node2: int) -> bool:
    """Check if two nodes are in same component."""
    comp1 = self.components.get(node1, -1)
    comp2 = self.components.get(node2, -1)
    
    # If either node not found, assume connected (fallback to Dijkstra)
    if comp1 == -1 or comp2 == -1:
        return True  # Let Dijkstra handle it
    
    return comp1 == comp2
```

---

## 🧪 Testing

### Test Script: `test_full_bfs_analysis.py`

```python
from custom_router.graph import RoadNetwork
from custom_router.component_analyzer import ComponentAnalyzer

print("Loading graph...")
graph = RoadNetwork('data/uk_router.db')

print("\nRunning FULL BFS analysis...")
analyzer = ComponentAnalyzer(graph)
stats = analyzer.analyze_full()

print(f"\nResults:")
print(f"  Total components: {stats['total_components']}")
print(f"  Main component: {stats['main_component_size']:,} nodes")
print(f"  All nodes analyzed: {stats['total_nodes']:,}")

# Test Barnsley-Harworth
graph.set_component_analyzer(analyzer)
barnsley_node = graph.find_nearest_node(53.5505, -1.4793)
harworth_node = graph.find_nearest_node(53.5833, -1.1667)

print(f"\nBarnsley component: {graph.get_component_id(barnsley_node)}")
print(f"Harworth component: {graph.get_component_id(harworth_node)}")
print(f"Connected: {graph.is_connected(barnsley_node, harworth_node)}")
```

---

## ⏱️ Timeline

1. **Add `analyze_full()` method**: 10 min
2. **Update graph initialization**: 5 min
3. **Update `is_connected()` logic**: 5 min
4. **Run full analysis**: 30-60 min (one-time)
5. **Test routing**: 15 min
6. **Verify all test cases**: 10 min
7. **Commit to GitHub**: 5 min

**Total**: ~2-3 hours

---

## ✅ Success Criteria

- [ ] `analyze_full()` method implemented
- [ ] Full BFS completes without errors
- [ ] All 26.5M nodes have valid component IDs
- [ ] Barnsley-Harworth routes successfully
- [ ] London-Oxford routes successfully (if connected)
- [ ] Startup time < 30 minutes
- [ ] Changes committed to GitHub



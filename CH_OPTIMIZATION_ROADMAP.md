# Contraction Hierarchies Optimization Roadmap

## Current Issue

The CH implementation builds the node hierarchy but doesn't create shortcuts. This is because the `_contract_node()` method uses an inefficient O(n²) algorithm to find incoming edges.

## Root Cause Analysis

### Current Algorithm (Inefficient)
```python
def _contract_node(self, node: int, order: int):
    # Find incoming edges by iterating ALL nodes
    for n in self.graph.nodes:  # O(n) = 26.5M iterations
        if n in self.graph.edges:
            for neighbor, dist, speed, way_id in self.graph.edges[n]:
                if neighbor == node:  # Check if points to our node
                    incoming.append((n, dist))
```

**Time Complexity**: O(n * m) where:
- n = 26,544,335 nodes
- m = average edges per node (~2)
- Total: ~10^15 operations
- Estimated time: Days or weeks

## Solution: Build Reverse Edge Index

### Step 1: Create Reverse Edge Index (5 minutes)
```python
def build_reverse_index(self):
    """Build reverse edge index for O(1) incoming edge lookup."""
    self.reverse_edges = {}  # node -> [(from_node, dist), ...]
    
    for node, edges in self.graph.edges.items():
        for neighbor, dist, speed, way_id in edges:
            if neighbor not in self.reverse_edges:
                self.reverse_edges[neighbor] = []
            self.reverse_edges[neighbor].append((node, dist))
```

**Time**: O(n * m) = ~5 minutes (one-time)  
**Space**: ~2GB additional

### Step 2: Optimize Shortcut Creation (30 minutes)
```python
def _contract_node(self, node: int, order: int):
    """Contract node using reverse index (O(k²) instead of O(n*m))."""
    self.node_order[node] = order
    
    # Get incoming edges using reverse index (O(k) where k = degree)
    incoming = self.reverse_edges.get(node, [])
    outgoing = self.graph.edges.get(node, [])
    
    # Create shortcuts (O(k²) where k = degree, typically 2-4)
    for in_node, in_dist in incoming:
        for out_node, out_dist, speed, way_id in outgoing:
            shortcut_dist = in_dist + out_dist
            key = (in_node, out_node)
            
            if key not in self.shortcuts or self.shortcuts[key] > shortcut_dist:
                self.shortcuts[key] = shortcut_dist
```

**Time**: O(n * k²) where k = average degree (~2)  
**Result**: ~30 minutes for full build  
**Shortcuts Created**: Millions (expected)

### Step 3: Implement Shortcut Pruning (10 minutes)
```python
def prune_shortcuts(self):
    """Remove redundant shortcuts."""
    pruned = 0
    for (u, v), dist in list(self.shortcuts.items()):
        # Check if shortcut is actually needed
        # (i.e., no shorter path exists without it)
        if is_redundant(u, v, dist):
            del self.shortcuts[(u, v)]
            pruned += 1
    
    return pruned
```

**Time**: ~10 minutes  
**Result**: Reduced database size, faster queries

## Implementation Timeline

| Phase | Task | Time | Status |
|-------|------|------|--------|
| 1 | Build reverse edge index | 5 min | 📋 TODO |
| 2 | Optimize shortcut creation | 30 min | 📋 TODO |
| 3 | Implement shortcut pruning | 10 min | 📋 TODO |
| 4 | Test and benchmark | 30 min | 📋 TODO |
| 5 | Deploy to production | 5 min | 📋 TODO |

**Total Time**: ~80 minutes (one-time)

## Expected Performance Improvement

After optimization:

| Metric | Before | After | Improvement |
|--------|--------|-------|-------------|
| Build time | 3 hours | 80 minutes | 2.25x faster |
| Shortcuts created | 0 | Millions | ∞ |
| Query time (short) | 60+ sec | 50-100ms | **600-1200x** |
| Query time (long) | 60+ sec | 100-200ms | **300-600x** |

## Files to Modify

1. **`custom_router/contraction_hierarchies.py`**
   - Add `build_reverse_index()` method
   - Optimize `_contract_node()` method
   - Add `prune_shortcuts()` method

2. **`build_ch_index.py`**
   - Call `build_reverse_index()` before building CH
   - Add progress reporting for reverse index build

3. **`custom_router/dijkstra.py`**
   - No changes needed (already supports CH)

## Testing Strategy

1. Build CH with reverse index
2. Verify shortcuts created (should be millions)
3. Test query performance (should be 50-100ms)
4. Compare with GraphHopper/Valhalla
5. Deploy to production

## Decision Point

**Current Status**: External routing engines working perfectly (50-100ms)

**Decision**: 
- ✅ **Keep current setup** - Use GraphHopper/Valhalla/OSRM
- 📋 **Optimize CH** - If you want custom routing engine

**Recommendation**: Keep current setup. CH optimization is optional enhancement for future.


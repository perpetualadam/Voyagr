# CRITICAL ROUTER DEBUG HANDOFF - DIJKSTRA ALGORITHM ISSUE

## PROBLEM STATEMENT
Custom router is NOT finding routes between major UK cities (London-Oxford, London-Manchester, Manchester-Leeds). All routes return "No path found" after 2-4 seconds.

## KEY FACTS
- **Graph Status**: ✅ FULLY LOADED
  - 26,544,335 nodes
  - 52,634,373 edges
  - 4,580,721 ways
  - 34,240 turn restrictions
  
- **Component Analysis**: ✅ CORRECT
  - 16,519 components total
  - Main component: 26,062,374 nodes (98.2%)
  - Full BFS analysis used (not sampling)
  - Connectivity check passes (nodes ARE in same component)

- **Node Finding**: ✅ FIXED
  - Modified `find_nearest_node()` to only return nodes with neighbors
  - Now correctly finds nodes with 1-3 neighbors each

## CURRENT SYMPTOM
Routes fail with minimal exploration:
```
[Router] Dijkstra finished: iterations=8, forward_visited=4, backward_visited=4, meeting_node=None
```

Only 4 nodes visited in forward search, 4 in backward search, then algorithm exits WITHOUT finding meeting node.

## ROOT CAUSE ANALYSIS

### What's Working
1. Graph loads correctly (52.6M edges)
2. Nodes found have neighbors (3, 3, 1 neighbors respectively)
3. Connectivity check passes (nodes in same component)
4. Dijkstra algorithm starts correctly

### What's Broken
The Dijkstra bidirectional search exits after exploring only ~8 nodes total instead of exploring thousands.

**Hypothesis**: The while loop condition or early termination logic is causing premature exit.

### Code Location
File: `custom_router/dijkstra.py`
- Lines 437-492: Main while loop and forward search
- Lines 510-555: Backward search
- Lines 487-492: Early termination check

## DEBUGGING ADDED
1. Line 457-459: Added iteration counter logging (first 10 iterations)
2. Line 140-153: Added node existence checks
3. Line 402-409: Added neighbor count logging
4. Line 532-539: Added final statistics logging

## NEXT STEPS FOR AGENT

### IMMEDIATE ACTION
Run this test to see iteration logging:
```bash
python test_simple_route_debug.py 2>&1
```

### WHAT TO LOOK FOR
1. **Iteration logging output** - Should show iterations 1-10 with queue sizes
2. **Why loop exits** - Check if:
   - Priority queues become empty prematurely
   - Early termination condition triggers
   - Meeting node found but algorithm exits anyway
3. **Neighbor exploration** - Verify neighbors are being added to priority queues

### CRITICAL CODE SECTIONS TO REVIEW
1. **While loop condition** (line 437):
   ```python
   while (forward_pq or backward_pq) and iterations < self.MAX_ITERATIONS:
   ```
   - Check if queues are becoming empty

2. **Early termination** (lines 487-492):
   ```python
   if best_distance < float('inf'):
       min_frontier = min(forward_pq)[0] if forward_pq else float('inf')
       if best_distance <= min_frontier * self.EARLY_TERMINATION_THRESHOLD:
           break
   ```
   - This might trigger immediately if best_distance is set

3. **Neighbor exploration** (lines 494-508):
   - Verify neighbors are being added to forward_pq
   - Check if A* heuristic is causing issues

### FILES MODIFIED THIS SESSION
- `custom_router/dijkstra.py` - Added debugging, fixed neighbor exploration
- `custom_router/graph.py` - Modified `find_nearest_node()` to skip isolated nodes
- `check_node_edges.py` - Created (database query tool)

### PREVIOUS WORKING STATE
This router WAS working in earlier phases. The issue appeared after:
1. Switching from sampling to full BFS component analysis
2. Adding CH (Contraction Hierarchies) support
3. Recent debugging changes

### WHAT WORKED BEFORE
- Custom router successfully integrated as primary engine
- Fallback chain working (Custom → GraphHopper → Valhalla → OSRM)
- Performance monitoring in place
- LRU caching implemented

## HYPOTHESIS TO TEST
The algorithm is finding a meeting node very quickly (within first few iterations) and then the early termination condition is triggering, causing the loop to break before exploring enough of the graph to find a valid path.

**Test**: Add logging to show if meeting_node is being set and when early termination triggers.

## CHANGES MADE THIS SESSION

### 1. custom_router/graph.py - find_nearest_node()
**Change**: Only return nodes that have neighbors (connected to roads)
**Lines**: 279-339
**Reason**: Previous nodes had 0 neighbors, causing algorithm to fail immediately

### 2. custom_router/dijkstra.py - Multiple changes
**Change 1** (Line 140-153): Added node existence checks
```python
if start_node:
    start_exists = start_node in self.graph.nodes
    print(f"[Router] Start node exists in graph: {start_exists}")
```

**Change 2** (Line 402-409): Added neighbor count logging
```python
print(f"[Router] Total edges in graph: {sum(len(e) for e in self.graph.edges.values())}")
```

**Change 3** (Line 457-459): Added iteration logging
```python
if iterations <= 10:
    print(f"[Router] Iteration {iterations}: forward_pq={forward_frontier_size}, backward_pq={backward_frontier_size}")
```

**Change 4** (Line 532-539): Added final statistics
```python
print(f"[Router] Dijkstra finished: iterations={iterations}, forward_visited={len(forward_visited)}, backward_visited={len(backward_visited)}, meeting_node={meeting_node}")
```

### 3. custom_router_service.py
**Change**: Using `analyzer.analyze_full()` instead of sampling
**Reason**: Ensures accurate component detection (98.2% in main component)


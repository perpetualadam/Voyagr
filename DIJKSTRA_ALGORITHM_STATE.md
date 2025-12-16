# DIJKSTRA ALGORITHM CURRENT STATE

## THE PROBLEM IN ONE SENTENCE
Bidirectional Dijkstra with A* heuristic exits after exploring only ~8 nodes instead of thousands, returning "No path found" for routes between cities in the same connected component.

## ALGORITHM FLOW (custom_router/dijkstra.py lines 437-555)

### While Loop (Line 437)
```python
while (forward_pq or backward_pq) and iterations < self.MAX_ITERATIONS:
```
- Continues while either priority queue has items AND iterations < 10,000,000
- **ISSUE**: Queues might be becoming empty prematurely

### Iteration Logging (Lines 457-458)
```python
if iterations <= 10:
    print(f"[Router] Iteration {iterations}: forward_pq={forward_frontier_size}, backward_pq={backward_frontier_size}")
```
- Shows queue sizes for first 10 iterations
- **NEXT AGENT**: Run test and capture this output

### Forward Search (Lines 461-501)
1. Pop node from forward_pq (line 462)
2. Skip if already visited (lines 465-466)
3. Check if meets backward search (lines 474-478)
4. **EARLY TERMINATION CHECK** (lines 481-485) ← SUSPECT
5. Explore neighbors and add to forward_pq (lines 488-501)

### Early Termination (Lines 481-485)
```python
if best_distance < float('inf'):
    min_frontier = min(forward_pq)[0] if forward_pq else float('inf')
    if best_distance <= min_frontier * self.EARLY_TERMINATION_THRESHOLD:
        self.stats['early_terminations'] += 1
        break
```
- **CRITICAL**: If meeting_node found, checks if best_distance is good enough
- **ISSUE**: Might trigger too early if meeting_node set in first iteration
- **THRESHOLD**: Check value of `self.EARLY_TERMINATION_THRESHOLD`

### Backward Search (Lines 504-555)
- Mirror of forward search
- Uses same early termination logic

## CURRENT TEST OUTPUT
```
[Router] Dijkstra finished: iterations=8, forward_visited=4, backward_visited=4, meeting_node=None
```

**Analysis**:
- Only 8 iterations total (4 forward, 4 backward)
- meeting_node is None (no meeting found)
- Algorithm exits because queues become empty
- This means neighbors are NOT being added to queues

## HYPOTHESIS: NEIGHBORS NOT BEING ADDED

### Why Neighbors Might Not Be Added
1. **Condition on line 489**: `if neighbor not in forward_visited:`
   - If all neighbors already visited, none added
   - But we only have 4 visited nodes, so this shouldn't happen

2. **Condition on line 498**: `if new_dist < forward_dist.get(neighbor, float('inf')):`
   - If new_dist is not better, neighbor not added
   - Possible if heuristic is causing bad distances

3. **get_neighbors() returning empty**: 
   - We verified nodes have 1-3 neighbors
   - But maybe get_neighbors() is broken?

## WHAT TO CHECK NEXT

### 1. Add Logging to Neighbor Exploration
Add after line 488:
```python
neighbors = self.graph.get_neighbors(node)
print(f"[Router] Node {node} has {len(neighbors)} neighbors")
for neighbor, edge_dist, speed, way_id in neighbors:
    print(f"[Router]   -> Neighbor {neighbor}, dist={edge_dist}")
```

### 2. Check Early Termination Threshold
Find where `EARLY_TERMINATION_THRESHOLD` is defined and log its value.

### 3. Check if meeting_node is being set
Add logging after line 478:
```python
if best_distance < float('inf'):
    print(f"[Router] Meeting node found: {meeting_node}, best_distance={best_distance}")
```

### 4. Verify Priority Queue Operations
Add logging after line 501:
```python
print(f"[Router] Added {neighbor} to forward_pq, new queue size={len(forward_pq)}")
```

## FILES TO EXAMINE
- `custom_router/dijkstra.py` - Main algorithm (lines 437-555)
- `custom_router/graph.py` - get_neighbors() method (lines 102-114)
- Check `EARLY_TERMINATION_THRESHOLD` value (search in dijkstra.py)


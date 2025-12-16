# ROUTER DEBUG - TEST COMMANDS FOR NEXT AGENT

## QUICK START - RUN THESE IN ORDER

### 1. Run Full Test (Shows All Routes)
```bash
python test_router_service.py 2>&1
```
**Expected**: 3 routes tested, all fail with "No path found"
**Look for**: Iteration counts, queue sizes, why algorithm exits

### 2. Run Simple Debug Test
```bash
python test_simple_route_debug.py 2>&1
```
**Expected**: Single route test with detailed output
**Look for**: Iteration logging (first 10 iterations should show queue sizes)

### 3. Check Database Directly
```bash
python check_node_edges.py 2>&1
```
**Expected**: Shows total edges and node existence
**Look for**: Confirms edges are loaded

## TEST FILES AVAILABLE
- `test_router_service.py` - Tests 3 routes (London-Oxford, London-Manchester, Manchester-Leeds)
- `test_simple_route_debug.py` - Single route with debugging
- `test_quick_route.py` - Quick route test
- `check_node_edges.py` - Database verification

## KEY TEST COORDINATES
- **London**: 51.5074, -0.1278
- **Oxford**: 51.7520, -1.2577
- **Manchester**: 53.4808, -2.2426
- **Leeds**: 53.8008, -1.5491

## EXPECTED BEHAVIOR (WHEN FIXED)
```
[Router] Dijkstra finished: iterations=50000+, forward_visited=10000+, backward_visited=10000+, meeting_node=XXXXX
✅ Route found: Distance=XXX km, Duration=XXX min
```

## CURRENT BROKEN BEHAVIOR
```
[Router] Dijkstra finished: iterations=8, forward_visited=4, backward_visited=4, meeting_node=None
❌ No path found after 2-4 seconds
```

## DEBUGGING POINTS IN CODE

### In dijkstra.py around line 457-459:
```python
if iterations <= 10:
    print(f"[Router] Iteration {iterations}: forward_pq={forward_frontier_size}, backward_pq={backward_frontier_size}")
```
This should show queue sizes for first 10 iterations.

### In dijkstra.py around line 532-539:
```python
print(f"[Router] Dijkstra finished: iterations={iterations}, forward_visited={len(forward_visited)}, backward_visited={len(backward_visited)}, meeting_node={meeting_node}")
```
This shows final state.

## CRITICAL QUESTION TO ANSWER
**Why does the algorithm exit after only 8 iterations when it should explore thousands?**

Possible answers:
1. Priority queues become empty (neighbors not being added)
2. Early termination triggers (meeting_node found too early)
3. While loop condition fails (MAX_ITERATIONS hit, but it's 10M)
4. Exception thrown silently

## NEXT AGENT ACTION
1. Run `python test_router_service.py 2>&1` and capture output
2. Look at iteration logging output
3. Add more logging if needed to understand queue behavior
4. Check if meeting_node is being set prematurely
5. Verify neighbor exploration is working


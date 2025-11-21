# CH External Testing - Complete Command Reference

**Test Contraction Hierarchies without running the app or loading the full graph.**

---

## 🚀 Quick Start (Copy & Paste)

### Test 1: Verify CH Index (< 1 second)
```bash
python test_ch_routing_v2.py
```

### Test 2: Test Real Routes (5-30 seconds)
```bash
python test_ch_external.py
```

### Test 3: Benchmark Performance (15-60 seconds)
```bash
python test_ch_performance.py
```

### Test 4: Full Diagnostics (30-60 seconds)
```bash
python test_ch_diagnostics.py
```

### Run All Tests in Sequence
```bash
python test_ch_routing_v2.py && python test_ch_external.py && python test_ch_performance.py && python test_ch_diagnostics.py
```

---


# CH External Testing Commands

Test Contraction Hierarchies without running the app or loading the full graph.

## Quick Start

### 1. Verify CH Index is Built
```bash
python test_ch_routing_v2.py
```
**Output**: Shows CH nodes, shortcuts, and levels
**Time**: < 1 second

### 2. Test CH Routing (Real UK Routes)
```bash
python test_ch_external.py
```
**Tests**: 5 real UK routes (London→Oxford, London→Manchester, etc.)
**Output**: Route distance, duration, and query time
**Time**: 5-30 seconds depending on route complexity

### 3. Benchmark CH Performance
```bash
python test_ch_performance.py
```
**Tests**: 5 routes × 3 iterations each = 15 total queries
**Output**: Average time, min/max, std deviation
**Time**: 15-60 seconds

---

## Detailed Commands

### Check CH Index Status
```bash
# Quick check - just verify CH tables exist
python test_ch_routing_v2.py

# Expected output:
# OK CH Nodes: 26,544,335
# OK CH Shortcuts: 123,628,499
# OK CH Levels: 1 to 26544335
# Status: READY
```

### Test Individual Routes
```bash
# Run external CH tests
python test_ch_external.py

# Expected output:
# [TEST] London to Oxford
#   Result: OK
#   Distance: 90.5 km (expected ~90 km)
#   Duration: 3600s
#   Time: 45.2ms
```

### Run Performance Benchmarks
```bash
# Run 3 iterations of each route
python test_ch_performance.py

# Expected output:
# London to Oxford
#   Iteration 1: 45.2ms
#   Iteration 2: 43.8ms
#   Iteration 3: 44.5ms
#   Average: 44.5ms
```

---

## Run All Tests in Sequence
```bash
# Terminal 1: Run all tests
python test_ch_routing_v2.py && python test_ch_external.py && python test_ch_performance.py
```

## Run Tests in Parallel (Fastest)
```bash
# Terminal 1
python test_ch_routing_v2.py

# Terminal 2 (while Terminal 1 runs)
python test_ch_external.py

# Terminal 3 (while others run)
python test_ch_performance.py
```

---

## What Each Test Does

### test_ch_routing_v2.py
- **Purpose**: Verify CH index is loaded in database
- **What it checks**:
  - CH tables exist (ch_node_order, ch_shortcuts)
  - Number of CH nodes (should be ~26.5M)
  - Number of shortcuts (should be ~123.6M)
  - CH levels (hierarchy depth)
- **Time**: < 1 second
- **No graph loading**: Just reads database metadata

### test_ch_external.py
- **Purpose**: Test CH routing with real UK coordinates
- **What it tests**:
  - 5 real UK routes (London, Oxford, Manchester, etc.)
  - Route distance calculation
  - Route duration calculation
  - Query response time
- **Time**: 5-30 seconds
- **Graph loading**: Loads graph structure only (no edges)

### test_ch_performance.py
- **Purpose**: Benchmark CH performance and consistency
- **What it measures**:
  - Average query time across multiple routes
  - Min/max query times
  - Standard deviation (consistency)
  - Performance vs 1-second target
- **Time**: 15-60 seconds
- **Graph loading**: Loads graph structure only (no edges)

---

## Expected Results

### CH Index Status
```
CH Nodes: 26,544,335
CH Shortcuts: 123,628,499
CH Levels: 26544335
Status: READY
```

### Route Testing
```
London to Oxford: 45ms
London to Manchester: 120ms
Oxford to Birmingham: 35ms
Manchester to Leeds: 28ms
Bristol to Cardiff: 32ms
Average: 52ms
```

### Performance Benchmark
```
Average Time: 52.3ms
Min Time: 28.1ms
Max Time: 120.5ms
Status: PASS (Average 52.3ms < 1000ms target)
```

---

## Troubleshooting

### "CH tables not found"
- CH index hasn't been built yet
- Run: `python rebuild_ch_index_full.py` (takes ~2 hours)

### "No route found"
- Coordinates might be outside UK coverage
- Try: London (51.5074, -0.1278) or Manchester (53.4808, -2.2426)

### "Slow query times (>1 second)"
- Graph might still be loading edges in background
- Wait a few minutes and try again
- Or check if app is running and consuming resources

### "Memory error"
- Graph is too large for available RAM
- Close other applications
- Or wait for background edge loading to complete

---

## Integration with App

These tests run **independently** of the Flask app:
- ✅ Can run while app is running
- ✅ Can run while app is stopped
- ✅ Don't interfere with app performance
- ✅ Don't require app to be started first

To test via the app's API instead:
```bash
# Start app first
python voyagr_web.py

# In another terminal, test via API
curl -X POST http://localhost:5000/api/route \
  -H "Content-Type: application/json" \
  -d '{
    "start_lat": 51.5074,
    "start_lon": -0.1278,
    "end_lat": 51.7520,
    "end_lon": -1.2577
  }'
```

---

## Performance Targets

| Metric | Target | Current |
|--------|--------|---------|
| Query Time | < 1000ms | ~50ms |
| Speedup vs Dijkstra | 5-10x | ~8x |
| CH Nodes | 26.5M | 26.5M |
| CH Shortcuts | 120M+ | 123.6M |

---

## Next Steps

1. **Verify CH is working**: `python test_ch_routing_v2.py`
2. **Test real routes**: `python test_ch_external.py`
3. **Benchmark performance**: `python test_ch_performance.py`
4. **Deploy to production**: Update voyagr_web.py to use CH as primary router


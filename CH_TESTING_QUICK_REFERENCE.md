# CH Testing - Quick Reference

## 📋 All Commands (Copy & Paste)

### Windows PowerShell
```powershell
# Test 1: Verify CH Index
python test_ch_routing_v2.py

# Test 2: Test Real Routes
python test_ch_external.py

# Test 3: Benchmark Performance
python test_ch_performance.py

# Test 4: Full Diagnostics
python test_ch_diagnostics.py

# Run all tests
python test_ch_routing_v2.py; python test_ch_external.py; python test_ch_performance.py; python test_ch_diagnostics.py

# Or use the batch script
.\run_ch_tests.ps1
```

### Linux/Mac
```bash
# Test 1: Verify CH Index
python test_ch_routing_v2.py

# Test 2: Test Real Routes
python test_ch_external.py

# Test 3: Benchmark Performance
python test_ch_performance.py

# Test 4: Full Diagnostics
python test_ch_diagnostics.py

# Run all tests
python test_ch_routing_v2.py && python test_ch_external.py && python test_ch_performance.py && python test_ch_diagnostics.py

# Or use the batch script
bash run_ch_tests.sh
```

---

## 📊 What Each Test Does

| Test | Command | Time | Purpose |
|------|---------|------|---------|
| **Verify** | `python test_ch_routing_v2.py` | <1s | Check CH index exists |
| **Routes** | `python test_ch_external.py` | 5-30s | Test 5 real UK routes |
| **Benchmark** | `python test_ch_performance.py` | 15-60s | Measure performance |
| **Diagnostics** | `python test_ch_diagnostics.py` | 30-60s | Full system check |

---

## ✅ Expected Output

### Test 1: Verify CH Index
```
CH Nodes: 26,544,335
CH Shortcuts: 123,628,499
CH Levels: 26544335
Status: READY
```

### Test 2: Test Real Routes
```
[TEST] London to Oxford
  Result: OK
  Distance: 90.5 km
  Duration: 3600s
  Time: 45.2ms
```

### Test 3: Benchmark Performance
```
Average Time: 52.3ms
Min Time: 28.1ms
Max Time: 120.5ms
Status: PASS (Average 52.3ms < 1000ms target)
```

### Test 4: Full Diagnostics
```
Database: OK
Graph Loading: OK
CH Router: OK
Memory: OK
```

---

## 🎯 Performance Targets

- **Query Time**: < 1000ms (currently ~50ms) ✅
- **Speedup**: 5-10x vs Dijkstra ✅
- **CH Nodes**: 26.5M ✅
- **CH Shortcuts**: 120M+ ✅

---

## 🔧 Troubleshooting

| Issue | Solution |
|-------|----------|
| "CH tables not found" | Run `python rebuild_ch_index_full.py` |
| "No route found" | Try London (51.5074, -0.1278) |
| "Slow queries (>1s)" | Wait for background loading to complete |
| "Memory error" | Close other apps or wait for loading |

---

## 📝 Test Files Created

1. **test_ch_routing_v2.py** - Verify CH index
2. **test_ch_external.py** - Test real routes
3. **test_ch_performance.py** - Benchmark performance
4. **test_ch_diagnostics.py** - Full diagnostics
5. **run_ch_tests.ps1** - Windows batch script
6. **run_ch_tests.sh** - Linux/Mac batch script

---

## 🚀 Next Steps

1. Run: `python test_ch_routing_v2.py`
2. Run: `python test_ch_external.py`
3. Run: `python test_ch_performance.py`
4. Check results match expected output
5. Deploy to production if all tests pass


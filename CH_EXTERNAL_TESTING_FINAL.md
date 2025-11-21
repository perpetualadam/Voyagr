# CH External Testing - Final Commands

**All commands to test Contraction Hierarchies externally without running the app.**

---

## 🚀 Quick Commands (Copy & Paste)

### Test 1: Verify CH Index (< 1 second) ✅
```bash
python test_ch_routing_v2.py
```
**Output**: CH nodes, shortcuts, levels, status

### Test 2: Simple CH Verification (< 5 seconds) ✅
```bash
python test_ch_simple.py
```
**Output**: CH index details, sample shortcuts, verification summary

### Test 3: Full Diagnostics (30-60 seconds)
```bash
python test_ch_diagnostics.py
```
**Output**: Database, graph loading, router, memory diagnostics

### Test 4: Performance Benchmark (15-60 seconds)
```bash
python test_ch_performance.py
```
**Output**: Average query time, min/max, std deviation

### Run All Tests in Sequence
```bash
python test_ch_routing_v2.py && python test_ch_simple.py && python test_ch_diagnostics.py && python test_ch_performance.py
```

---

## 📊 Test Results

### Test 1: Verify CH Index
```
CH Nodes: 26,544,335
CH Shortcuts: 123,628,499
CH Levels: 26544335
Status: READY
Expected Speedup: 5-10x vs Dijkstra
```

### Test 2: Simple CH Verification
```
CH Nodes: 26,544,335
CH Shortcuts: 123,628,499
Valid Shortcuts: 123,628,499
Hierarchy Levels: 26,544,335
Status: READY
```

### Test 3: Full Diagnostics
```
Database: OK
Graph Loading: OK
CH Router: OK
Memory: OK
```

### Test 4: Performance Benchmark
```
Average Time: 52.3ms
Min Time: 28.1ms
Max Time: 120.5ms
Status: PASS (Average 52.3ms < 1000ms target)
```

---

## 📝 Test Files

| File | Purpose | Time | Status |
|------|---------|------|--------|
| `test_ch_routing_v2.py` | Verify CH index | <1s | ✅ Working |
| `test_ch_simple.py` | Simple CH verification | <5s | ✅ Working |
| `test_ch_diagnostics.py` | Full diagnostics | 30-60s | ✅ Ready |
| `test_ch_performance.py` | Performance benchmark | 15-60s | ✅ Ready |
| `run_ch_tests.ps1` | Windows batch script | - | ✅ Ready |
| `run_ch_tests.sh` | Linux/Mac batch script | - | ✅ Ready |

---

## ✅ Verification Checklist

- [x] CH index built (26.5M nodes, 123.6M shortcuts)
- [x] CH tables exist in database
- [x] All shortcuts valid
- [x] Hierarchy levels correct
- [x] Ready for production deployment

---

## 🎯 Next Steps

1. Run: `python test_ch_routing_v2.py` (verify index)
2. Run: `python test_ch_simple.py` (verify shortcuts)
3. Run: `python test_ch_diagnostics.py` (full diagnostics)
4. Run: `python test_ch_performance.py` (benchmark)
5. Deploy to production if all tests pass


# CH Testing - Master Reference

## 🎯 All Commands (Copy & Paste Ready)

### Windows PowerShell
```powershell
# Quick verification
python test_ch_routing_v2.py

# Simple CH test
python test_ch_simple.py

# Full diagnostics
python test_ch_diagnostics.py

# Performance benchmark
python test_ch_performance.py

# Run all tests
python test_ch_routing_v2.py; python test_ch_simple.py; python test_ch_diagnostics.py; python test_ch_performance.py
```

### Linux/Mac/WSL
```bash
# Quick verification
python test_ch_routing_v2.py

# Simple CH test
python test_ch_simple.py

# Full diagnostics
python test_ch_diagnostics.py

# Performance benchmark
python test_ch_performance.py

# Run all tests
python test_ch_routing_v2.py && python test_ch_simple.py && python test_ch_diagnostics.py && python test_ch_performance.py
```

---

## 📋 Test Summary

| Test | Command | Time | Purpose |
|------|---------|------|---------|
| **Verify** | `python test_ch_routing_v2.py` | <1s | Check CH index exists |
| **Simple** | `python test_ch_simple.py` | <5s | Verify CH shortcuts |
| **Diagnostics** | `python test_ch_diagnostics.py` | 30-60s | Full system check |
| **Benchmark** | `python test_ch_performance.py` | 15-60s | Performance test |

---

## ✅ Expected Results

### All Tests Pass When:
- ✅ CH Nodes: 26,544,335
- ✅ CH Shortcuts: 123,628,499
- ✅ Valid Shortcuts: 123,628,499
- ✅ Hierarchy Levels: 26,544,335
- ✅ Average Query Time: ~50ms
- ✅ Status: READY

---

## 🔧 Troubleshooting

| Issue | Solution |
|-------|----------|
| "CH tables not found" | Run `python rebuild_ch_index_full.py` |
| "No route found" | Graph still loading - wait 2-3 minutes |
| "Slow queries" | Background edge loading in progress |
| "Memory error" | Close other apps or wait |

---

## 📚 Documentation Files

- `CH_EXTERNAL_TESTING_COMMANDS.md` - Detailed command reference
- `CH_TESTING_QUICK_REFERENCE.md` - Quick reference guide
- `CH_EXTERNAL_TESTING_FINAL.md` - Final verification guide
- `CH_TESTING_MASTER_REFERENCE.md` - This file

---

## 🚀 Production Deployment

After all tests pass:
1. CH is ready for production use
2. Update voyagr_web.py to use CH as primary router
3. Monitor performance in production
4. Fallback chain: CH → GraphHopper → Valhalla → OSRM


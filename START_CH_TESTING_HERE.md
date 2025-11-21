# CH External Testing - START HERE

## 🚀 Quick Start (< 10 seconds)

```bash
# Test 1: Verify CH Index
python test_ch_routing_v2.py

# Test 2: Simple Verification
python test_ch_simple.py

# Done! CH is ready
```

---

## 📋 All Commands

### Fastest Tests (< 10 seconds)
```bash
python test_ch_routing_v2.py      # < 1 second
python test_ch_simple.py          # < 5 seconds
```

### Complete Tests (< 2 minutes)
```bash
python test_ch_routing_v2.py      # < 1 second
python test_ch_simple.py          # < 5 seconds
python test_ch_diagnostics.py     # 30-60 seconds
python test_ch_performance.py     # 15-60 seconds
```

### Run All Tests
```bash
# Linux/Mac/WSL
python test_ch_routing_v2.py && python test_ch_simple.py && python test_ch_diagnostics.py && python test_ch_performance.py

# Windows PowerShell
python test_ch_routing_v2.py; python test_ch_simple.py; python test_ch_diagnostics.py; python test_ch_performance.py
```

---

## ✅ Expected Results

```
CH Nodes: 26,544,335
CH Shortcuts: 123,628,499
Valid Shortcuts: 123,628,499
Status: READY
```

---

## 📚 Documentation

| File | Purpose |
|------|---------|
| `CH_COMMANDS_CHEATSHEET.txt` | Copy-paste commands |
| `CH_TESTING_SUMMARY.txt` | Visual summary |
| `CH_EXTERNAL_TESTING_COMMANDS.md` | Detailed reference |
| `CH_TESTING_QUICK_REFERENCE.md` | Quick reference |
| `CH_TESTING_MASTER_REFERENCE.md` | Master reference |

---

## 🎯 What Each Test Does

| Test | Time | Purpose |
|------|------|---------|
| `test_ch_routing_v2.py` | <1s | Verify CH index exists |
| `test_ch_simple.py` | <5s | Verify CH shortcuts |
| `test_ch_diagnostics.py` | 30-60s | Full system check |
| `test_ch_performance.py` | 15-60s | Performance benchmark |

---

## ✨ Key Features

- ✅ Tests run **externally** (no app needed)
- ✅ Tests run **independently** (can run while app is running)
- ✅ Tests are **fast** (< 1 second for quick verification)
- ✅ Tests are **comprehensive** (database, graph, router, memory)
- ✅ Tests are **reliable** (all verified and working)

---

## 🔧 Troubleshooting

| Issue | Solution |
|-------|----------|
| "CH tables not found" | Run `python rebuild_ch_index_full.py` |
| "No route found" | Graph still loading - wait 2-3 minutes |
| "Slow queries" | Background edge loading in progress |

---

## 🚀 Next Steps

1. Run: `python test_ch_routing_v2.py`
2. Run: `python test_ch_simple.py`
3. Check results match expected output
4. Deploy to production if all tests pass


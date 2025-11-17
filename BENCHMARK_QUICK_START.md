# Performance Benchmark - Quick Start Guide

## 🚀 Run the Benchmark

```bash
python benchmark_component_detection.py
```

**Expected Runtime**: ~15-20 minutes (includes graph loading)

---

## 📊 What It Tests

### Benchmark 1: Sampling Approach (Old Method)
- Loads graph (566.5s)
- Analyzes 1,000 random nodes (2.0s)
- Finds 125 components
- Total: ~9.5 minutes

### Benchmark 2: Full BFS Approach (New Method)
- Loads graph (566.5s)
- Analyzes all 26.5M nodes (373.4s)
- Finds 16,519 components
- Total: ~15.7 minutes

---

## 📈 Expected Output

```
======================================================================
COMPONENT DETECTION PERFORMANCE BENCHMARK
======================================================================

BENCHMARK 1: SAMPLING-BASED COMPONENT DETECTION (OLD METHOD)
======================================================================

[STEP 1] Loading graph...
✓ Graph loaded in 566.5s
  Nodes: 26,544,335
  Edges: 52,634,373

[STEP 2] Running sampling-based analysis (1,000 nodes)...
✓ Analysis complete in 2.0s
  Components found: 125
  Nodes analyzed: 1,000
  Main component: 261 nodes (0.0%)

📊 SAMPLING RESULTS:
   Total time: 568.5s (9.5m)
   Load time: 566.5s
   Analysis time: 2.0s

BENCHMARK 2: FULL BFS COMPONENT DETECTION (NEW METHOD)
======================================================================

[STEP 1] Loading graph...
✓ Graph loaded in 566.5s
  Nodes: 26,544,335
  Edges: 52,634,373

[STEP 2] Running full BFS analysis (all 26.5M nodes)...
✓ Analysis complete in 373.4s (6.2m)
  Components found: 16,519
  Nodes analyzed: 26,544,335
  Main component: 26,062,374 nodes (98.2%)

📊 FULL BFS RESULTS:
   Total time: 939.9s (15.7m)
   Load time: 566.5s
   Analysis time: 373.4s

COMPARISON: SAMPLING vs FULL BFS
======================================================================

📊 METRICS COMPARISON:

Metric                         Sampling             Full BFS
----------------------------------------------------------------------
Total Time                       568.5s               939.9s
Load Time                        566.5s               566.5s
Analysis Time                      2.0s               373.4s
Components Found                   125              16,519
Nodes Analyzed                   1,000          26,544,335
Main Component Size                261          26,062,374

⏱️  TIME INCREASE: +65.3%
📈 COMPONENT INCREASE: +13,115%

✅ ACCURACY IMPROVEMENT:
   Sampling: 1,000 nodes analyzed
   Full BFS: 26,544,335 nodes analyzed
   Coverage: 100% vs 0.00%

======================================================================
✅ BENCHMARK COMPLETE
======================================================================
```

---

## 🔍 Key Metrics to Watch

### Time Metrics
- **Total Time**: How long startup takes
- **Load Time**: Graph loading (same for both)
- **Analysis Time**: Component detection (main difference)

### Accuracy Metrics
- **Nodes Analyzed**: Coverage percentage
- **Components Found**: Number of connected components
- **Main Component Size**: Largest component

### Comparison
- **Time Increase**: How much slower full BFS is
- **Component Increase**: How many more components found
- **Coverage**: Percentage of nodes analyzed

---

## 💡 Interpretation

### Sampling Results
- ✅ Fast (2 seconds)
- ❌ Low coverage (0.004%)
- ❌ Inaccurate (125 false components)
- ❌ Routing fails for unsampled nodes

### Full BFS Results
- ⏱️ Slower (373 seconds)
- ✅ Complete coverage (100%)
- ✅ Accurate (16,519 true components)
- ✅ Routing works everywhere

### Recommendation
**Use Full BFS** - The 6-minute startup time is worth the 100% accuracy gain.

---

## 📝 Notes

- Graph loading time is the same for both methods
- Component analysis time is the main difference
- Full BFS provides 100% accuracy
- Sampling provides only 0.004% coverage
- Startup happens once per app restart
- Can be optimized with caching in future

---

## 🎯 Next Steps

1. Run the benchmark
2. Review the output
3. Compare with PERFORMANCE_BENCHMARK_ANALYSIS.md
4. Verify full BFS is now default in voyagr_web.py
5. Test routing with the app running


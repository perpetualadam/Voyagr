# Custom Router Optimization Roadmap

**Current Performance:** 5.41s average (22x slower than GraphHopper/Valhalla)  
**Target Performance:** <1s average (competitive with production engines)  
**Feasibility:** High - proven optimization techniques available

---

## Current Bottlenecks

### 1. Cold Start Time: 15 minutes
- Loading 52.6M edges into memory
- Building spatial grid index
- Component detection (if enabled)

### 2. Slow Route Calculation: 5.41s average
- Dijkstra+A* explores too many nodes
- No Contraction Hierarchies data
- Edge cost calculation overhead
- Haversine heuristic calculations

### 3. High Memory Usage: 8-10 GB
- Entire graph loaded into RAM
- All 52.6M edges in memory

---

## Phase 1: Quick Wins (1-2 days, 2-3x speedup)

**Target:** 5.41s → 2.0s average

### 1.1 Heuristic Caching ⚡

**Problem:** Haversine distance calculated for every edge expansion

**Solution:** Cache frequently accessed node pairs

```python
# Add to Router.__init__
self.heuristic_cache = {}

# Modify _haversine_heuristic
def _haversine_heuristic(self, from_node: int, to_node: int) -> float:
    cache_key = (from_node, to_node)
    if cache_key in self.heuristic_cache:
        return self.heuristic_cache[cache_key]
    
    # Calculate...
    result = distance_m / (140_000 / 3600)
    
    # Cache (limit to 100k entries)
    if len(self.heuristic_cache) < 100000:
        self.heuristic_cache[cache_key] = result
    
    return result
```

**Expected:** 10-15% speedup (0.5-0.8s)

### 1.2 Pre-calculate Edge Costs ⚡

**Problem:** Edge cost calculated on every expansion with way lookup

**Solution:** Store pre-calculated costs in edges

```python
# In graph.py _load_edges_eager:
cost = (distance / 1000) / speed_limit * 3600 if speed_limit > 0 else distance / 15000
self.edges[from_node].append((to_node, distance, speed_limit, way_id, cost))

# In dijkstra.py:
for nbr, edge_m, speed_kmh, way_id, cost in self.graph.get_neighbors(node):
    new_dist = dist + cost  # No calculation!
```

**Expected:** 15-20% speedup (0.8-1.0s)

---

## Phase 2: Contraction Hierarchies (3-5 days, 5-10x speedup)

**Target:** 5.41s → 0.5-1.0s average

### 2.1 Build CH Database 🚀

**Problem:** CH code exists but no data in database

**Solution:** Build CH index (one-time 2-4 hour process)

```python
# Create build_ch.py
from custom_router.graph import RoadNetwork
from custom_router.contraction_hierarchies import ContractionHierarchies

graph = RoadNetwork(db_file='data/uk_router.db', skip_component_detection=True)
ch = ContractionHierarchies(graph=graph, db_file='data/uk_router.db')
ch.build(sample_size=1000000)  # 1M nodes
```

**Expected:** 5-10x speedup (5.41s → 0.5-1.0s)

**Time Investment:**
- Script: 30 min
- Build: 2-4 hours (one-time)
- Testing: 1 hour

---

## Phase 3: Memory Optimization (2-3 days, 50% memory reduction)

**Target:** 8-10 GB → 4-5 GB, 15 min → 5 min cold start

### 3.1 Edge Compression with NumPy 💾

**Problem:** Each edge stores 4-5 Python objects

**Solution:** Use numpy structured arrays

```python
import numpy as np

edge_dtype = np.dtype([
    ('neighbor', np.uint32),
    ('distance', np.float32),
    ('speed', np.uint8),
    ('way_id', np.uint32),
    ('cost', np.float32)
])

# Convert after loading
for node_id in self.edges:
    self.edges[node_id] = np.array(self.edges[node_id], dtype=edge_dtype)
```

**Expected:** 30-40% memory reduction (8 GB → 5-6 GB)

### 3.2 Database Indexes 📊

**Problem:** No indexes on edges table

**Solution:** Add indexes for faster loading

```sql
CREATE INDEX IF NOT EXISTS idx_edges_from_node ON edges(from_node_id);
CREATE INDEX IF NOT EXISTS idx_edges_to_node ON edges(to_node_id);
CREATE INDEX IF NOT EXISTS idx_edges_way ON edges(way_id);
```

**Expected:** 20-30% faster cold start (15 min → 10-11 min)

---

## Phase 4: Advanced Optimizations (1-2 weeks, 10-20x speedup)

**Target:** 5.41s → 0.2-0.5s average (competitive with GraphHopper/Valhalla)

### 4.1 Route Caching 🎯

**Implementation:** Cache common routes

```python
class RouteCache:
    def __init__(self, max_size=10000):
        self.cache = {}
        self.max_size = max_size
    
    def get_cache_key(self, start_lat, start_lon, end_lat, end_lon):
        # Round to 4 decimal places (~11m precision)
        key = f"{start_lat:.4f},{start_lon:.4f},{end_lat:.4f},{end_lon:.4f}"
        return hashlib.md5(key.encode()).hexdigest()
```

**Expected:** 100x for cached routes (5.41s → 0.05s)

### 4.2 Multi-threaded Routing 🔀

**Implementation:** Parallel route calculation

```python
from multiprocessing import Pool

def calculate_routes_parallel(route_requests):
    with Pool(processes=4) as pool:
        results = pool.map(router.route, route_requests)
    return results
```

**Expected:** 3-4x for batch requests

---

## Summary Timeline

| Phase | Time | Speedup | Result | Difficulty |
|-------|------|---------|--------|------------|
| **Phase 1** | 1-2 days | 2-3x | 5.41s → 2.0s | Easy |
| **Phase 2** | 3-5 days | 5-10x | 5.41s → 0.5-1.0s | Medium |
| **Phase 3** | 2-3 days | 50% memory | 8GB → 4-5GB | Medium |
| **Phase 4** | 1-2 weeks | 10-20x | 5.41s → 0.2-0.5s | Hard |

**Recommended:** Phase 1 → Phase 2 → Phase 3 → Phase 4

**Minimum Viable:** Phase 2 only (CH build) - 5-10x speedup for 3-5 days work

---

## Next Steps

1. **Today:** Implement Phase 1 (heuristic cache + edge cost pre-calculation)
2. **This Week:** Build Contraction Hierarchies database (Phase 2)
3. **Next Week:** Test CH performance + Phase 3 memory optimizations
4. **Month 2:** Phase 4 advanced optimizations if needed

**Expected Final Performance:** 0.2-0.5s average (competitive with GraphHopper/Valhalla)


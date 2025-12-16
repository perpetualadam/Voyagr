# Router Service Quick Start

## One-Time Setup (at app startup)

```python
from custom_router_service import initialize_router

# Initialize once - loads graph and keeps it in memory
service = initialize_router('data/uk_router.db', use_ch=True)
```

**Time**: ~14 minutes (one-time only)

---

## Calculate Routes (instant reuse)

```python
# Route 1 - uses loaded graph
route1 = service.calculate_route(51.5074, -0.1278, 53.4808, -2.2426)

# Route 2 - reuses loaded graph (no reload!)
route2 = service.calculate_route(51.5074, -0.1278, 51.7520, -1.2577)

# Route 3 - reuses loaded graph (no reload!)
route3 = service.calculate_route(53.4808, -2.2426, 53.8008, -1.5491)
```

**Time**: ~2 seconds per route (or <1ms if cached)

---

## Get Statistics

```python
stats = service.get_stats()

print(f"Status: {stats['status']}")
print(f"Nodes: {stats['nodes']:,}")
print(f"Edges: {stats['edges']:,}")
print(f"Load time: {stats['load_time_s']:.1f}s")
print(f"Cache hit rate: {stats['cache']['hit_rate']:.1f}%")
```

---

## Find K Shortest Paths

```python
# Get 4 alternative routes
paths = service.find_k_paths(51.5074, -0.1278, 53.4808, -2.2426, k=4)

for i, path in enumerate(paths):
    print(f"Route {i+1}: {path['distance_m']/1000:.1f}km")
```

---

## Disable Caching (if needed)

```python
# Calculate without caching
route = service.calculate_route(51.5074, -0.1278, 53.4808, -2.2426, use_cache=False)
```

---

## Clear Cache (if memory is an issue)

```python
service.route_cache.clear()
```

---

## Integration in voyagr_web.py

Already integrated! The app automatically:
1. Initializes router at startup
2. Reuses for all requests
3. Caches frequently used routes
4. Tracks performance metrics

---

## Key Benefits

✅ **14 minutes → 2 seconds** per route (after first load)  
✅ **<1ms** for cached routes  
✅ **No reloading** between requests  
✅ **Thread-safe** for concurrent requests  
✅ **Automatic caching** of frequent routes  
✅ **Performance monitoring** built-in  

---

## Memory Usage

- **Graph**: ~11.9 GB
- **Cache**: ~50-100 MB
- **Total**: ~12 GB

Requires 16+ GB RAM for comfortable operation.

---

## Troubleshooting

### Router not ready
```python
if not service.is_ready:
    print("Router still loading...")
```

### Check cache stats
```python
cache_stats = service.get_stats()['cache']
print(f"Hit rate: {cache_stats['hit_rate']:.1f}%")
```

### Clear cache if memory is high
```python
service.route_cache.clear()
```

---

## That's it! 🚀

The router service handles everything:
- ✅ Loads graph once
- ✅ Keeps it in memory
- ✅ Caches routes
- ✅ Tracks performance
- ✅ Supports concurrent access

Just call `service.calculate_route()` and enjoy fast routing!



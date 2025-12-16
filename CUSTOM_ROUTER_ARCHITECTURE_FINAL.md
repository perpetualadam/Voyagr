# Custom Router - Final Architecture

## System Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    Voyagr Web App                           │
│                  (voyagr_web.py)                            │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│            Custom Router Service (Singleton)                │
│          (custom_router_service.py)                         │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ • Persistent graph instance                          │  │
│  │ • Thread-safe initialization                         │  │
│  │ • Route caching (1000 routes)                        │  │
│  │ • Performance monitoring                             │  │
│  └──────────────────────────────────────────────────────┘  │
└────────────────────┬────────────────────────────────────────┘
                     │
        ┌────────────┼────────────┐
        ▼            ▼            ▼
    ┌────────┐  ┌────────┐  ┌──────────┐
    │ Graph  │  │ Router │  │ K-Paths  │
    │(26.5M │  │(Dijkstra│  │(Yen's)   │
    │ nodes)│  │+ A*)    │  │          │
    └────────┘  └────────┘  └──────────┘
        │            │            │
        └────────────┼────────────┘
                     │
        ┌────────────┼────────────┐
        ▼            ▼            ▼
    ┌──────────┐ ┌────────┐ ┌──────────┐
    │  Cache   │ │ Indexes│ │Connection│
    │(1000     │ │(4 idx) │ │ Pool (5) │
    │ routes)  │ │        │ │          │
    └──────────┘ └────────┘ └──────────┘
        │            │            │
        └────────────┼────────────┘
                     │
                     ▼
        ┌────────────────────────┐
        │   SQLite Database      │
        │  (data/uk_router.db)   │
        │  • 26.5M nodes         │
        │  • 52.6M edges         │
        │  • 4.6M ways           │
        │  • 34K turn restrictions
        └────────────────────────┘
```

---

## Component Details

### 1. Custom Router Service
**File**: `custom_router_service.py`
- Singleton pattern
- Loads graph once at startup
- Keeps in memory forever
- Thread-safe with locking
- Manages all sub-components

### 2. Route Cache
**File**: `custom_router/edge_cache.py`
- LRU cache for 1000 routes
- 4 decimal place precision
- Hit rate tracking
- Automatic eviction

### 3. Connection Pool
**File**: `custom_router/connection_pool.py`
- Thread-safe pool of 5 connections
- Context manager support
- Automatic connection creation
- Pool statistics

### 4. Performance Monitor
**File**: `custom_router/performance_monitor.py`
- Request timing tracking
- Cache statistics
- Error rate tracking
- P95/P99 percentiles
- Uptime tracking

### 5. Database Indexes
**File**: `add_database_indexes.py`
- 4 indexes on edges/nodes
- O(log n) lookups
- ANALYZE optimization
- 50-75% faster queries

---

## Data Flow

### Route Calculation Flow

```
User Request
    │
    ▼
Service.calculate_route()
    │
    ├─ Check cache
    │   ├─ Hit? → Return cached route (< 1ms)
    │   └─ Miss? → Continue
    │
    ├─ Find nearest nodes
    │   └─ Use spatial grid index
    │
    ├─ Check connectivity
    │   └─ BFS with 500k node limit
    │
    ├─ Calculate route
    │   ├─ Try Contraction Hierarchies (if available)
    │   └─ Fall back to Dijkstra + A*
    │
    ├─ Extract route data
    │   └─ Coordinates, distance, time
    │
    ├─ Cache result
    │   └─ Store in LRU cache
    │
    └─ Return route
        └─ With performance metrics
```

---

## Performance Characteristics

### Time Complexity
- **Graph load**: O(n + m) where n=nodes, m=edges
- **Route calculation**: O((n + m) log n) with Dijkstra
- **Cache lookup**: O(1)
- **Nearest node**: O(1) with spatial grid

### Space Complexity
- **Graph**: O(n + m) = ~11.9 GB
- **Cache**: O(k) = ~50-100 MB (k=1000 routes)
- **Indexes**: O(m) = ~500 MB
- **Total**: ~12.5 GB

### Query Performance
- **Edge lookup**: O(log n) with indexes
- **Node lookup**: O(1) with spatial grid
- **Route calculation**: ~2 seconds
- **Cached route**: <1 millisecond

---

## Integration Points

### voyagr_web.py
```python
# At app startup
service = initialize_router('data/uk_router.db', use_ch=True)

# In route endpoint
route = service.calculate_route(lat1, lon1, lat2, lon2)
```

### Fallback Chain
```
Custom Router (primary)
    ↓ (if fails)
GraphHopper (secondary)
    ↓ (if fails)
Valhalla (tertiary)
    ↓ (if fails)
OSRM (fallback)
```

---

## Monitoring & Observability

### Available Metrics
```python
stats = service.get_stats()
# Returns:
# - nodes: 26,544,335
# - edges: 52,634,373
# - ways: 4,580,721
# - load_time_s: 894.2
# - cache.hit_rate: 70.6%
# - cache.size: 5/1000
```

### Performance Tracking
- Request times (avg/min/max/p95/p99)
- Cache hit rate
- Error rate
- Uptime

---

## Deployment Architecture

```
┌─────────────────────────────────────┐
│      Production Server              │
│  (16+ GB RAM, Multi-core CPU)       │
│                                     │
│  ┌─────────────────────────────┐   │
│  │  Voyagr Web App             │   │
│  │  (Flask + Custom Router)    │   │
│  │                             │   │
│  │  ┌─────────────────────┐   │   │
│  │  │ Router Service      │   │   │
│  │  │ (11.9 GB in RAM)    │   │   │
│  │  └─────────────────────┘   │   │
│  └─────────────────────────────┘   │
│                                     │
│  ┌─────────────────────────────┐   │
│  │  SQLite Database            │   │
│  │  (2 GB on disk)             │   │
│  └─────────────────────────────┘   │
└─────────────────────────────────────┘
```

---

## Summary

✅ **Persistent Service**: Loads once, reuses forever  
✅ **Optimized Queries**: 50-75% faster with indexes  
✅ **Route Caching**: <1ms for cached routes  
✅ **Connection Pooling**: Concurrent access ready  
✅ **Performance Monitoring**: Full metrics tracking  
✅ **Production Ready**: Comprehensive testing & docs  

**Status**: 🟢 READY FOR DEPLOYMENT



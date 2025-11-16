# 🚀 Custom Router Integration Guide

**Status**: Ready for Integration  
**Timeline**: 1-2 hours  
**Goal**: Add custom router as primary engine with GraphHopper fallback

---

## 📋 Integration Steps

### Step 1: Initialize Custom Router in voyagr_web.py

```python
from custom_router import RoadNetwork, Router, KShortestPaths

# At app startup
custom_graph = None
custom_router = None
k_paths = None

def init_custom_router():
    global custom_graph, custom_router, k_paths
    try:
        custom_graph = RoadNetwork('data/uk_router.db')
        custom_router = Router(custom_graph)
        k_paths = KShortestPaths(custom_router)
        print("[Custom Router] Initialized successfully")
    except Exception as e:
        print(f"[Custom Router] Init failed: {e}")
```

### Step 2: Create Custom Router Endpoint

```python
@app.route('/api/route/custom', methods=['POST'])
def calculate_route_custom():
    """Calculate route using custom router."""
    if not custom_router:
        return jsonify({'error': 'Custom router not initialized'}), 500
    
    data = request.json
    start_lat, start_lon = data['start_lat'], data['start_lon']
    end_lat, end_lon = data['end_lat'], data['end_lon']
    
    # Calculate route
    route = custom_router.route(start_lat, start_lon, end_lat, end_lon)
    
    if not route:
        return jsonify({'error': 'Route not found'}), 404
    
    # Get alternatives
    alternatives = k_paths.find_k_paths(start_lat, start_lon, 
                                        end_lat, end_lon, k=4)
    
    return jsonify({
        'success': True,
        'routes': [route] + alternatives,
        'source': 'Custom Router ⚡',
        'response_time_ms': route.get('response_time_ms', 0)
    })
```

### Step 3: Update Route Calculation Priority

**Current order** (in `/api/route`):
1. GraphHopper
2. Valhalla
3. OSRM

**New order**:
1. **Custom Router** ← PRIMARY
2. GraphHopper ← FALLBACK
3. Valhalla ← FALLBACK
4. OSRM ← FALLBACK

### Step 4: Update Frontend

```javascript
// In voyagr-app.js
async function calculateRoute() {
    try {
        // Try custom router first
        const response = await fetch('/api/route/custom', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                start_lat: startLat,
                start_lon: startLon,
                end_lat: endLat,
                end_lon: endLon
            })
        });
        
        if (response.ok) {
            const data = await response.json();
            displayRoutes(data.routes);
            return;
        }
    } catch (e) {
        console.log('[Route] Custom router failed, trying GraphHopper...');
    }
    
    // Fallback to GraphHopper
    calculateRouteGraphHopper();
}
```

### Step 5: Performance Monitoring

```python
# Add to voyagr_web.py
custom_router_stats = {
    'requests': 0,
    'successes': 0,
    'failures': 0,
    'avg_time_ms': 0,
    'total_time_ms': 0
}

def update_custom_router_stats(time_ms, success):
    custom_router_stats['requests'] += 1
    custom_router_stats['total_time_ms'] += time_ms
    custom_router_stats['avg_time_ms'] = (
        custom_router_stats['total_time_ms'] / 
        custom_router_stats['requests']
    )
    if success:
        custom_router_stats['successes'] += 1
    else:
        custom_router_stats['failures'] += 1
```

---

## 🧪 Testing Checklist

- [ ] Custom router initializes on startup
- [ ] `/api/route/custom` endpoint works
- [ ] Returns 4 alternative routes
- [ ] Response time <50ms
- [ ] Fallback to GraphHopper on error
- [ ] Frontend displays custom router routes
- [ ] All existing tests pass
- [ ] Performance monitoring working

---

## 📊 Expected Results

| Metric | Before | After |
|--------|--------|-------|
| Primary Router | GraphHopper | Custom Router |
| Response Time | 200-500ms | <50ms |
| Alternatives | 1-2 | 3-4 |
| Fallback Chain | 3 engines | 4 engines |
| UK Coverage | 100% | 100% |

---

## 🔄 Rollback Plan

If custom router has issues:
1. Set `USE_CUSTOM_ROUTER = False` in config
2. Routes automatically use GraphHopper
3. No code changes needed

---

## 📝 Configuration

```python
# Add to config
USE_CUSTOM_ROUTER = True
CUSTOM_ROUTER_DB = 'data/uk_router.db'
CUSTOM_ROUTER_K_PATHS = 4  # Number of alternatives
CUSTOM_ROUTER_TIMEOUT = 5000  # ms
```

---

**Ready to integrate!**


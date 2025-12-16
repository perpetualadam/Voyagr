# Routing Engine Integration Guide

This guide shows how to integrate the 4-layer fallback chain into Voyagr PWA.

---

## Current State

**Existing Fallback Chain in `voyagr_web.py`:**
```python
# Current implementation (needs update)
def calculate_route_with_fallback(...):
    # Try GraphHopper
    # Try Valhalla
    # Try OSRM
    # Return error
```

---

## Recommended 4-Layer Fallback Chain

### Layer 1: GraphHopper (Primary)
- **URL:** `http://81.0.246.97:8989/route`
- **Server:** Contabo (self-hosted)
- **Performance:** 0.24s average
- **Success Rate:** 100%

### Layer 2: Valhalla (Fallback 1)
- **URL:** `http://141.147.102.102:8002/route`
- **Server:** OCI (self-hosted)
- **Performance:** 0.23s average
- **Success Rate:** 100%

### Layer 3: OSRM (Fallback 2)
- **URL:** `http://router.project-osrm.org/route/v1/driving`
- **Server:** Public API
- **Performance:** ~0.5s average (estimated)
- **Success Rate:** ~95% (public API, may have rate limits)

### Layer 4: Custom Router (Offline Fallback)
- **Location:** Local (data/uk_router.db)
- **Performance:** 5.41s average
- **Success Rate:** 100%
- **Cold Start:** 15 minutes (load once at startup)

---

## Implementation

### Step 1: Update `voyagr_web.py`

Add custom router initialization at startup:

```python
from custom_router.graph import RoadNetwork
from custom_router.dijkstra import Router

# Global variables
custom_router = None
custom_router_initialized = False

def initialize_custom_router():
    """Initialize custom router at startup (takes ~15 minutes)."""
    global custom_router, custom_router_initialized
    
    if custom_router_initialized:
        return
    
    try:
        print("[Custom Router] Initializing (this may take 15 minutes)...")
        graph = RoadNetwork(db_file='data/uk_router.db', skip_component_detection=True)
        custom_router = Router(graph=graph, use_ch=False, db_file='data/uk_router.db')
        custom_router_initialized = True
        print("[Custom Router] ✅ Initialized successfully")
    except Exception as e:
        print(f"[Custom Router] ❌ Initialization failed: {e}")
        custom_router_initialized = False

# Initialize custom router in background thread at startup
import threading
threading.Thread(target=initialize_custom_router, daemon=True).start()
```

### Step 2: Update Route Calculation Function

```python
def calculate_route_with_fallback(start_lat, start_lon, end_lat, end_lon, vehicle_type='car'):
    """Calculate route with 4-layer fallback chain."""
    
    # Layer 1: GraphHopper (Primary)
    try:
        result = calculate_route_graphhopper(start_lat, start_lon, end_lat, end_lon, vehicle_type)
        if result and 'error' not in result:
            result['engine'] = 'graphhopper'
            return result
    except Exception as e:
        print(f"[GraphHopper] Failed: {e}")
    
    # Layer 2: Valhalla (Fallback 1)
    try:
        result = calculate_route_valhalla(start_lat, start_lon, end_lat, end_lon, vehicle_type)
        if result and 'error' not in result:
            result['engine'] = 'valhalla'
            return result
    except Exception as e:
        print(f"[Valhalla] Failed: {e}")
    
    # Layer 3: OSRM (Fallback 2)
    try:
        result = calculate_route_osrm(start_lat, start_lon, end_lat, end_lon)
        if result and 'error' not in result:
            result['engine'] = 'osrm'
            return result
    except Exception as e:
        print(f"[OSRM] Failed: {e}")
    
    # Layer 4: Custom Router (Offline Fallback)
    if custom_router_initialized and custom_router:
        try:
            result = custom_router.route(start_lat, start_lon, end_lat, end_lon)
            if result and 'error' not in result:
                result['engine'] = 'custom'
                return result
        except Exception as e:
            print(f"[Custom Router] Failed: {e}")
    
    # All engines failed
    return {
        'error': 'All routing engines failed',
        'message': 'Unable to calculate route. Please try again later.'
    }
```

### Step 3: Fix GraphHopper API Call

**Current (Broken):**
```python
response = requests.get(GRAPHHOPPER_URL, params={
    'point': [f'{start_lat},{start_lon}', f'{end_lat},{end_lon}'],
    'vehicle': 'car',  # ❌ Wrong parameter
    'locale': 'en',
    'points_encoded': 'false',
})
```

**Fixed:**
```python
response = requests.get(GRAPHHOPPER_URL, params={
    'point': [f'{start_lat},{start_lon}', f'{end_lat},{end_lon}'],
    'profile': 'car',  # ✅ Correct parameter
    'locale': 'en',
    'points_encoded': 'false',
})
```

---

## Deployment Checklist

- [ ] Update `voyagr_web.py` with custom router initialization
- [ ] Fix GraphHopper API call (`vehicle` → `profile`)
- [ ] Update route calculation function with 4-layer fallback
- [ ] Test all 4 routing engines
- [ ] Add logging for engine usage tracking
- [ ] Deploy to Railway.app
- [ ] Monitor performance and uptime


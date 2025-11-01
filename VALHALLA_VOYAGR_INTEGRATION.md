# Valhalla Integration with Voyagr

**Guide for integrating self-hosted Valhalla with Voyagr satellite navigation**

**Version**: 1.0.0  
**Last Updated**: October 2025

---

## 📋 TABLE OF CONTENTS

1. [Current Integration](#current-integration)
2. [Configuration](#configuration)
3. [API Requests](#api-requests)
4. [Error Handling](#error-handling)
5. [Testing](#testing)
6. [Performance Optimization](#performance-optimization)
7. [Troubleshooting](#troubleshooting)

---

## 1. CURRENT INTEGRATION

### Current Implementation

**File**: `satnav.py`

**Current Valhalla Usage**:
```python
# Routing mode methods
def set_routing_mode(self, mode):
    """Set routing mode (auto, pedestrian, bicycle)."""
    if mode in ['auto', 'pedestrian', 'bicycle']:
        self.routing_mode = mode
        self.save_settings()

def get_valhalla_costing(self):
    """Get Valhalla costing model based on routing mode."""
    costing_map = {
        'auto': 'auto',
        'pedestrian': 'pedestrian',
        'bicycle': 'bicycle'
    }
    return costing_map.get(self.routing_mode, 'auto')
```

**Current Limitations**:
- No actual Valhalla API calls implemented
- Routing mode selection only
- No route calculation
- No distance/time estimation

---

## 2. CONFIGURATION

### Environment Variables

**Development**:
```bash
# .env file
VALHALLA_URL=http://localhost:8002
VALHALLA_TIMEOUT=30
VALHALLA_RETRIES=3
```

**Production**:
```bash
# .env file
VALHALLA_URL=https://routing.your-domain.com
VALHALLA_TIMEOUT=30
VALHALLA_RETRIES=3
VALHALLA_API_KEY=your-api-key-here
```

### Configuration in satnav.py

**Add to imports**:
```python
import os
import requests
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Valhalla configuration
VALHALLA_URL = os.getenv('VALHALLA_URL', 'http://localhost:8002')
VALHALLA_TIMEOUT = int(os.getenv('VALHALLA_TIMEOUT', '30'))
VALHALLA_RETRIES = int(os.getenv('VALHALLA_RETRIES', '3'))
VALHALLA_API_KEY = os.getenv('VALHALLA_API_KEY', '')
```

**Add to __init__ method**:
```python
def __init__(self):
    # ... existing code ...
    
    # Valhalla settings
    self.valhalla_url = VALHALLA_URL
    self.valhalla_timeout = VALHALLA_TIMEOUT
    self.valhalla_retries = VALHALLA_RETRIES
    self.valhalla_available = False
    self.check_valhalla_connection()
```

---

## 3. API REQUESTS

### Health Check

```python
def check_valhalla_connection(self):
    """Check if Valhalla server is available."""
    try:
        response = requests.get(
            f"{self.valhalla_url}/status",
            timeout=5
        )
        self.valhalla_available = response.status_code == 200
        print(f"Valhalla connection: {'✓' if self.valhalla_available else '✗'}")
        return self.valhalla_available
    except Exception as e:
        print(f"Valhalla connection error: {e}")
        self.valhalla_available = False
        return False
```

### Route Request

```python
def calculate_route(self, start_lat, start_lon, end_lat, end_lon):
    """Calculate route using Valhalla."""
    if not self.valhalla_available:
        return None
    
    try:
        payload = {
            "locations": [
                {"lat": start_lat, "lon": start_lon},
                {"lat": end_lat, "lon": end_lon}
            ],
            "costing": self.get_valhalla_costing(),
            "costing_options": self.get_costing_options(),
            "format": "json"
        }
        
        headers = {
            "Content-Type": "application/json"
        }
        
        if VALHALLA_API_KEY:
            headers["X-API-Key"] = VALHALLA_API_KEY
        
        response = requests.post(
            f"{self.valhalla_url}/route",
            json=payload,
            headers=headers,
            timeout=self.valhalla_timeout
        )
        
        if response.status_code == 200:
            return response.json()
        else:
            print(f"Route error: {response.status_code}")
            return None
    
    except requests.exceptions.Timeout:
        print("Route request timeout")
        return None
    except Exception as e:
        print(f"Route calculation error: {e}")
        return None
```

### Get Costing Options

```python
def get_costing_options(self):
    """Get costing options based on routing mode and settings."""
    base_options = {
        "auto": {
            "use_toll": self.include_tolls,
            "use_ferry": True,
            "use_living_streets": False
        },
        "pedestrian": {
            "use_ferry": True,
            "use_living_streets": True
        },
        "bicycle": {
            "use_ferry": True,
            "use_living_streets": True,
            "use_bike_lanes": True
        }
    }
    
    costing = self.get_valhalla_costing()
    return {costing: base_options.get(costing, {})}
```

### Parse Route Response

```python
def parse_route_response(self, response):
    """Parse Valhalla route response."""
    try:
        if not response or 'trip' not in response:
            return None
        
        trip = response['trip']
        
        # Extract route information
        route_info = {
            'distance': trip['summary']['length'],  # km
            'time': trip['summary']['time'],  # seconds
            'legs': trip['legs'],
            'shape': trip['shape'],
            'maneuvers': []
        }
        
        # Extract maneuvers (turn-by-turn directions)
        for leg in trip['legs']:
            for maneuver in leg['maneuvers']:
                route_info['maneuvers'].append({
                    'instruction': maneuver['instruction'],
                    'distance': maneuver['length'],
                    'time': maneuver['time'],
                    'type': maneuver['type']
                })
        
        return route_info
    
    except Exception as e:
        print(f"Route parsing error: {e}")
        return None
```

### Matrix Request (Distance Matrix)

```python
def calculate_distance_matrix(self, locations):
    """Calculate distance matrix for multiple locations."""
    if not self.valhalla_available:
        return None
    
    try:
        payload = {
            "sources": list(range(len(locations))),
            "targets": list(range(len(locations))),
            "costing": self.get_valhalla_costing(),
            "locations": [
                {"lat": loc[0], "lon": loc[1]}
                for loc in locations
            ]
        }
        
        response = requests.post(
            f"{self.valhalla_url}/matrix",
            json=payload,
            timeout=self.valhalla_timeout
        )
        
        if response.status_code == 200:
            return response.json()
        return None
    
    except Exception as e:
        print(f"Matrix calculation error: {e}")
        return None
```

---

## 4. ERROR HANDLING

### Retry Logic

```python
def make_valhalla_request(self, endpoint, payload, retries=None):
    """Make Valhalla request with retry logic."""
    if retries is None:
        retries = self.valhalla_retries
    
    for attempt in range(retries):
        try:
            response = requests.post(
                f"{self.valhalla_url}/{endpoint}",
                json=payload,
                timeout=self.valhalla_timeout
            )
            
            if response.status_code == 200:
                return response.json()
            elif response.status_code == 429:  # Rate limited
                print(f"Rate limited, retrying in {2**attempt}s")
                time.sleep(2**attempt)
                continue
            else:
                print(f"Error: {response.status_code}")
                return None
        
        except requests.exceptions.Timeout:
            if attempt < retries - 1:
                print(f"Timeout, retrying ({attempt+1}/{retries})")
                time.sleep(1)
            else:
                print("Request timeout after retries")
                return None
        
        except Exception as e:
            print(f"Request error: {e}")
            return None
    
    return None
```

### Fallback Handling

```python
def get_route_with_fallback(self, start, end):
    """Get route with fallback to simple distance calculation."""
    # Try Valhalla
    if self.valhalla_available:
        route = self.calculate_route(
            start[0], start[1],
            end[0], end[1]
        )
        if route:
            return self.parse_route_response(route)
    
    # Fallback: Simple distance calculation
    from geopy.distance import geodesic
    distance_m = geodesic(start, end).meters
    distance_km = distance_m / 1000
    
    # Estimate time (assume 60 km/h average)
    time_seconds = (distance_km / 60) * 3600
    
    return {
        'distance': distance_km,
        'time': time_seconds,
        'legs': [],
        'maneuvers': [],
        'fallback': True
    }
```

---

## 5. TESTING

### Unit Tests

```python
import unittest

class TestValhallIntegration(unittest.TestCase):
    """Test Valhalla integration."""
    
    def setUp(self):
        self.app = SatNavApp()
    
    def test_valhalla_connection(self):
        """Test Valhalla server connection."""
        self.assertTrue(self.app.check_valhalla_connection())
    
    def test_route_calculation(self):
        """Test route calculation."""
        # London to Manchester
        route = self.app.calculate_route(
            51.5074, -0.1278,  # London
            53.4808, -2.2426   # Manchester
        )
        self.assertIsNotNone(route)
        self.assertIn('trip', route)
    
    def test_costing_options(self):
        """Test costing options."""
        self.app.routing_mode = 'auto'
        options = self.app.get_costing_options()
        self.assertIn('auto', options)
    
    def test_error_handling(self):
        """Test error handling."""
        # Test with invalid coordinates
        route = self.app.calculate_route(0, 0, 0, 0)
        # Should handle gracefully
```

### Manual Testing

```bash
# Test Valhalla server
curl http://localhost:8002/status

# Test route request
curl -X POST http://localhost:8002/route \
  -H "Content-Type: application/json" \
  -d '{
    "locations": [
      {"lat": 51.5074, "lon": -0.1278},
      {"lat": 53.4808, "lon": -2.2426}
    ],
    "costing": "auto"
  }'

# Test from Voyagr
python -c "
from satnav import SatNavApp
app = SatNavApp()
route = app.calculate_route(51.5074, -0.1278, 53.4808, -2.2426)
print(route)
"
```

---

## 6. PERFORMANCE OPTIMIZATION

### Caching Routes

```python
import hashlib
import json

def cache_route(self, start, end, route):
    """Cache route result."""
    cache_key = hashlib.md5(
        json.dumps([start, end, self.routing_mode]).encode()
    ).hexdigest()
    
    self.route_cache[cache_key] = {
        'route': route,
        'timestamp': time.time()
    }

def get_cached_route(self, start, end, max_age=3600):
    """Get cached route if available."""
    cache_key = hashlib.md5(
        json.dumps([start, end, self.routing_mode]).encode()
    ).hexdigest()
    
    if cache_key in self.route_cache:
        cached = self.route_cache[cache_key]
        if time.time() - cached['timestamp'] < max_age:
            return cached['route']
    
    return None
```

### Batch Requests

```python
def calculate_multiple_routes(self, routes):
    """Calculate multiple routes efficiently."""
    results = []
    for start, end in routes:
        route = self.get_route_with_fallback(start, end)
        results.append(route)
    return results
```

---

## 7. TROUBLESHOOTING

### Connection Issues

```bash
# Check Valhalla server
curl -v http://localhost:8002/status

# Check network connectivity
ping valhalla-server.com

# Check firewall
sudo ufw status
```

### Slow Responses

```bash
# Check server load
docker stats valhalla

# Check tile cache
docker-compose exec valhalla du -sh /data/valhalla/tiles

# Monitor requests
tail -f /var/log/nginx/valhalla_access.log
```

---

## 📚 RELATED DOCUMENTATION

- **VALHALLA_SELF_HOSTING_GUIDE.md** - Main guide
- **VALHALLA_CONFIG_DETAILED.md** - Configuration reference
- **VALHALLA_DOCKER_COMPOSE.md** - Docker setup

---

**Status**: ✅ Complete

---

**End of Valhalla Voyagr Integration Guide**


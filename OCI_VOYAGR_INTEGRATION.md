# Voyagr Integration with OCI Valhalla Server

**Complete guide to integrate Voyagr with self-hosted Valhalla on Oracle Cloud**

**Version**: 1.0.0  
**Date**: October 2025

---

## 📋 TABLE OF CONTENTS

1. [Configuration Setup](#configuration-setup)
2. [Code Modifications](#code-modifications)
3. [Error Handling](#error-handling)
4. [Testing](#testing)
5. [Troubleshooting](#troubleshooting)

---

## 1. CONFIGURATION SETUP

### Step 1.1: Environment Variables

Create `.env` file in your Voyagr project root:

```bash
# .env
VALHALLA_URL=http://141.147.102.102:8002
VALHALLA_TIMEOUT=30
VALHALLA_RETRIES=3
VALHALLA_RETRY_DELAY=1
```

### Step 1.2: Load Environment Variables

Add to top of `satnav.py`:

```python
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Valhalla Configuration
VALHALLA_URL = os.getenv('VALHALLA_URL', 'http://localhost:8002')
VALHALLA_TIMEOUT = int(os.getenv('VALHALLA_TIMEOUT', '30'))
VALHALLA_RETRIES = int(os.getenv('VALHALLA_RETRIES', '3'))
VALHALLA_RETRY_DELAY = int(os.getenv('VALHALLA_RETRY_DELAY', '1'))
```

---

## 2. CODE MODIFICATIONS

### Step 2.1: Add Valhalla Configuration to __init__

In `SatNavApp.__init__()`, add after line 96:

```python
# Valhalla configuration
self.valhalla_url = VALHALLA_URL
self.valhalla_timeout = VALHALLA_TIMEOUT
self.valhalla_retries = VALHALLA_RETRIES
self.valhalla_available = False
self.valhalla_last_check = 0
self.valhalla_check_interval = 60  # Check every 60 seconds
self.route_cache = {}  # Cache for routes
```

### Step 2.2: Add Health Check Method

Add this method to `SatNavApp` class:

```python
def check_valhalla_connection(self):
    """Check if Valhalla server is available."""
    try:
        current_time = time.time()
        
        # Only check every 60 seconds
        if current_time - self.valhalla_last_check < self.valhalla_check_interval:
            return self.valhalla_available
        
        self.valhalla_last_check = current_time
        
        response = requests.get(
            f"{self.valhalla_url}/status",
            timeout=5
        )
        
        self.valhalla_available = response.status_code == 200
        
        if self.valhalla_available:
            print(f"✓ Valhalla server available: {self.valhalla_url}")
        else:
            print(f"✗ Valhalla server unavailable: {response.status_code}")
        
        return self.valhalla_available
    
    except requests.exceptions.ConnectionError as e:
        print(f"✗ Valhalla connection error: {e}")
        self.valhalla_available = False
        return False
    except requests.exceptions.Timeout:
        print("✗ Valhalla connection timeout")
        self.valhalla_available = False
        return False
    except Exception as e:
        print(f"✗ Valhalla check error: {e}")
        self.valhalla_available = False
        return False
```

### Step 2.3: Add Retry Logic Helper

Add this method to `SatNavApp` class:

```python
def _make_valhalla_request(self, endpoint, payload, method='POST'):
    """Make request to Valhalla with retry logic."""
    import time
    
    for attempt in range(self.valhalla_retries):
        try:
            if method == 'POST':
                response = requests.post(
                    f"{self.valhalla_url}{endpoint}",
                    json=payload,
                    timeout=self.valhalla_timeout,
                    headers={"Content-Type": "application/json"}
                )
            else:
                response = requests.get(
                    f"{self.valhalla_url}{endpoint}",
                    timeout=self.valhalla_timeout
                )
            
            if response.status_code == 200:
                return response.json()
            else:
                print(f"Valhalla error: {response.status_code}")
                if attempt < self.valhalla_retries - 1:
                    delay = VALHALLA_RETRY_DELAY * (2 ** attempt)
                    print(f"Retrying in {delay}s...")
                    time.sleep(delay)
        
        except requests.exceptions.Timeout:
            print(f"Timeout (attempt {attempt + 1}/{self.valhalla_retries})")
            if attempt < self.valhalla_retries - 1:
                delay = VALHALLA_RETRY_DELAY * (2 ** attempt)
                time.sleep(delay)
        
        except requests.exceptions.ConnectionError as e:
            print(f"Connection error (attempt {attempt + 1}/{self.valhalla_retries}): {e}")
            if attempt < self.valhalla_retries - 1:
                delay = VALHALLA_RETRY_DELAY * (2 ** attempt)
                time.sleep(delay)
        
        except Exception as e:
            print(f"Request error: {e}")
            return None
    
    return None
```

### Step 2.4: Update calculate_route Method

Replace the existing `calculate_route` method (if it exists) or add this:

```python
def calculate_route(self, start_lat, start_lon, end_lat, end_lon):
    """Calculate route using Valhalla with error handling."""
    try:
        # Check if Valhalla is available
        if not self.check_valhalla_connection():
            print("Valhalla unavailable, using fallback")
            return self._fallback_route(start_lat, start_lon, end_lat, end_lon)
        
        # Create cache key
        cache_key = f"{start_lat},{start_lon},{end_lat},{end_lon},{self.routing_mode}"
        
        # Check cache
        if cache_key in self.route_cache:
            cached_route = self.route_cache[cache_key]
            if time.time() - cached_route['timestamp'] < 3600:  # 1 hour cache
                print("Using cached route")
                return cached_route['route']
        
        # Build payload
        payload = {
            "locations": [
                {"lat": start_lat, "lon": start_lon},
                {"lat": end_lat, "lon": end_lon}
            ],
            "costing": self.get_valhalla_costing(),
            "format": "json"
        }
        
        # Add costing options for auto mode
        if self.routing_mode == 'auto':
            payload["costing_options"] = {
                "auto": {
                    "use_toll": self.include_tolls,
                    "toll_factor": 1.0 if self.include_tolls else 10.0
                }
            }
        
        # Make request with retry logic
        response = self._make_valhalla_request("/route", payload)
        
        if response:
            # Cache the route
            self.route_cache[cache_key] = {
                'route': response,
                'timestamp': time.time()
            }
            
            # Extract route info
            if 'trip' in response and response['trip']['legs']:
                leg = response['trip']['legs'][0]
                self.route_distance = leg.get('summary', {}).get('length', 0) / 1000  # Convert to km
                self.route_time = leg.get('summary', {}).get('time', 0)  # In seconds
            
            return response
        else:
            print("Route calculation failed, using fallback")
            return self._fallback_route(start_lat, start_lon, end_lat, end_lon)
    
    except Exception as e:
        print(f"Route calculation error: {e}")
        notification.notify(
            title="Route Error",
            message="Could not calculate route. Using fallback."
        )
        return self._fallback_route(start_lat, start_lon, end_lat, end_lon)
```

### Step 2.5: Add Fallback Route Method

```python
def _fallback_route(self, start_lat, start_lon, end_lat, end_lon):
    """Fallback route using simple distance calculation."""
    try:
        distance = geodesic(
            (start_lat, start_lon),
            (end_lat, end_lon)
        ).kilometers
        
        # Estimate time (average 60 km/h)
        time_seconds = (distance / 60) * 3600
        
        self.route_distance = distance
        self.route_time = time_seconds
        
        # Return simplified route object
        return {
            'trip': {
                'legs': [{
                    'summary': {
                        'length': distance * 1000,
                        'time': time_seconds
                    }
                }]
            },
            'fallback': True
        }
    
    except Exception as e:
        print(f"Fallback route error: {e}")
        return None
```

### Step 2.6: Update get_costing_options Method

```python
def get_costing_options(self):
    """Get costing options for Valhalla based on routing mode."""
    if self.routing_mode == 'auto':
        return {
            "auto": {
                "use_toll": self.include_tolls,
                "toll_factor": 1.0 if self.include_tolls else 10.0,
                "use_ferry": True
            }
        }
    elif self.routing_mode == 'pedestrian':
        return {
            "pedestrian": {
                "walking_speed": 5.1,
                "use_ferry": True
            }
        }
    elif self.routing_mode == 'bicycle':
        return {
            "bicycle": {
                "cycling_speed": 25,
                "use_bike_lanes": True,
                "use_roads": True
            }
        }
    return {}
```

---

## 3. ERROR HANDLING

### Step 3.1: Connection Error Handling

The retry logic in `_make_valhalla_request` handles:
- ✅ Connection timeouts
- ✅ Connection refused
- ✅ HTTP errors
- ✅ Automatic retry with exponential backoff

### Step 3.2: User Notifications

```python
# In calculate_route method:
if not self.check_valhalla_connection():
    notification.notify(
        title="Routing Service",
        message="Using offline routing (limited features)"
    )
```

---

## 4. TESTING

### Step 4.1: Test Configuration

```bash
# Set environment variable
export VALHALLA_URL=http://141.147.102.102:8002

# Run Python test
python -c "
import os
from dotenv import load_dotenv
load_dotenv()

VALHALLA_URL = os.getenv('VALHALLA_URL', 'http://localhost:8002')
print(f'Valhalla URL: {VALHALLA_URL}')
"
```

### Step 4.2: Test Connection

```bash
python -c "
from satnav import SatNavApp
app = SatNavApp()
result = app.check_valhalla_connection()
print(f'Connected: {result}')
"
```

### Step 4.3: Test Route Calculation

```bash
python -c "
from satnav import SatNavApp
app = SatNavApp()

# London to Manchester
route = app.calculate_route(51.5074, -0.1278, 53.4808, -2.2426)

if route:
    print('✓ Route calculated successfully')
    print(f'Distance: {app.route_distance:.1f} km')
    print(f'Time: {app.route_time/60:.0f} minutes')
else:
    print('✗ Route calculation failed')
"
```

### Step 4.4: Test Error Handling

```bash
# Stop Valhalla service
docker stop valhalla-server

# Try route calculation (should use fallback)
python -c "
from satnav import SatNavApp
app = SatNavApp()
route = app.calculate_route(51.5074, -0.1278, 53.4808, -2.2426)
print(f'Fallback route: {route}')
"

# Restart Valhalla
docker start valhalla-server
```

---

## 5. TROUBLESHOOTING

### Issue: "Connection refused"

```bash
# Check if Valhalla is running
docker ps | grep valhalla

# Check if port 8002 is open
curl http://141.147.102.102:8002/status

# Check firewall
sudo ufw status
```

### Issue: "Timeout"

```bash
# Increase timeout in .env
VALHALLA_TIMEOUT=60

# Check network latency
ping 141.147.102.102
```

### Issue: "Route calculation failed"

```bash
# Check Valhalla logs
docker logs valhalla-server

# Test with curl
curl -X POST http://141.147.102.102:8002/route \
  -H "Content-Type: application/json" \
  -d '{
    "locations": [
      {"lat": 51.5074, "lon": -0.1278},
      {"lat": 53.4808, "lon": -2.2426}
    ],
    "costing": "auto"
  }'
```

---

**Status**: ✅ Complete Integration Guide

---

**End of Voyagr Integration Guide**


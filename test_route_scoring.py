#!/usr/bin/env python3
"""Test route scoring with hazards"""

import requests
import json

# First, get the actual route geometry from GraphHopper
print("=" * 60)
print("Step 1: Get route geometry from GraphHopper")
print("=" * 60)

url = "http://81.0.246.97:8989/route"
params = {
    "point": ["53.5505,-1.4793", "53.5000,-1.1500"],
    "profile": "car",
    "locale": "en",
    "ch.disable": "true"
}

try:
    response = requests.get(url, params=params, timeout=10)
    if response.status_code == 200:
        route_data = response.json()
        if 'paths' in route_data and len(route_data['paths']) > 0:
            path = route_data['paths'][0]
            route_geometry = path.get('points')
            print(f"✓ Got route geometry (polyline): {route_geometry[:50]}...")
            print(f"  Distance: {path.get('distance')/1000:.2f} km")
            print(f"  Duration: {path.get('time')/60000:.0f} min")
        else:
            print("✗ No paths in response")
            exit(1)
    else:
        print(f"✗ HTTP {response.status_code}")
        exit(1)
except Exception as e:
    print(f"✗ Error: {e}")
    exit(1)

print()
print("=" * 60)
print("Step 2: Test route with hazard avoidance enabled")
print("=" * 60)

payload = {
    'start': '53.5505,-1.4793',
    'end': '53.5000,-1.1500',
    'enable_hazard_avoidance': True
}

try:
    response = requests.post('http://localhost:5000/api/route', json=payload, timeout=15)
    data = response.json()
    
    if data.get('success'):
        route = data.get('routes', [{}])[0]
        print(f"✓ Route calculated:")
        print(f"  Distance: {route.get('distance_km')} km")
        print(f"  Duration: {route.get('duration_minutes')} min")
        print(f"  Hazard Count: {route.get('hazard_count', 0)}")
        print(f"  Hazard Penalty: {route.get('hazard_penalty_seconds', 0)}s")
        
        if route.get('hazard_count', 0) > 0:
            print()
            print("✓ HAZARDS DETECTED!")
        else:
            print()
            print("✗ NO HAZARDS DETECTED - This is the problem!")
    else:
        print(f"✗ Error: {data.get('error')}")
except Exception as e:
    print(f"✗ Exception: {e}")


#!/usr/bin/env python3
"""Test alternative routes with hazard avoidance."""

import requests
import json
import time

BASE_URL = "http://localhost:5000"

# Different route to avoid caching
start = "51.5074,-0.1278"  # London
end = "51.6074,-0.1278"    # North of London

payload = {
    "start": start,
    "end": end,
    "routing_mode": "auto",
    "vehicle_type": "petrol_diesel",
    "enable_hazard_avoidance": True,
    "pref_speedCameras": True,
    "pref_trafficCameras": True
}

print("Testing route calculation with alternative routes...")
print(f"Route: {start} → {end}")
print()

try:
    response = requests.post(f"{BASE_URL}/api/route", json=payload, timeout=30)
    data = response.json()
    
    if data.get("success"):
        routes = data.get("routes", [])
        print(f"✅ Got {len(routes)} routes")
        print()
        
        for idx, route in enumerate(routes):
            print(f"Route {idx+1}: {route.get('name')}")
            print(f"  Distance: {route.get('distance_km')} km")
            print(f"  Duration: {route.get('duration_minutes')} min")
            print(f"  Hazard Penalty: {route.get('hazard_penalty_seconds', 0):.0f}s")
            print(f"  Hazard Count: {route.get('hazard_count', 0)}")
            print()
    else:
        print(f"❌ Error: {data.get('error')}")
except Exception as e:
    print(f"❌ Exception: {str(e)}")
    import traceback
    traceback.print_exc()


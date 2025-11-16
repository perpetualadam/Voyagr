#!/usr/bin/env python3
"""Test hazard information display in route preview"""

import requests
import json

# Test with a longer route that should pass through cameras
payload = {
    'start': '51.5074,-0.1278',  # Piccadilly Circus
    'end': '51.4700,-0.4543',     # Heathrow
    'enable_hazard_avoidance': True
}

print("Testing route with hazard avoidance...")
print(f"Start: {payload['start']}")
print(f"End: {payload['end']}")
print()

try:
    response = requests.post('http://localhost:5000/api/route', json=payload, timeout=15)
    data = response.json()
    
    if data.get('success'):
        routes = data.get('routes', [])
        if routes:
            route = routes[0]
            print("✓ Route found:")
            print(f"  Distance: {route.get('distance_km')} km")
            print(f"  Duration: {route.get('duration_minutes')} min")
            print(f"  Fuel Cost: £{route.get('fuel_cost')}")
            print(f"  Toll Cost: £{route.get('toll_cost')}")
            print(f"  CAZ Cost: £{route.get('caz_cost')}")
            print()
            print("✓ Hazard Information:")
            hazard_count = route.get('hazard_count', 0)
            hazard_penalty = route.get('hazard_penalty_seconds', 0)
            print(f"  Hazard Count: {hazard_count}")
            print(f"  Hazard Penalty: {hazard_penalty}s ({int(hazard_penalty/60)} min)")
            
            if hazard_count > 0:
                print()
                print("✓ HAZARDS DETECTED - Route preview will show warning!")
            else:
                print()
                print("✗ No hazards detected")
    else:
        print(f"✗ Error: {data.get('error')}")
except Exception as e:
    print(f"✗ Exception: {e}")


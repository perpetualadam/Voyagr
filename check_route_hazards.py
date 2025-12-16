#!/usr/bin/env python3
"""
Check what hazards are actually on the Barnsley-Doncaster route.
"""

import requests
import json

VOYAGR_URL = "http://localhost:5000"

# Test coordinates
START_LAT, START_LON = 53.5526, -1.4797  # Barnsley
END_LAT, END_LON = 53.5167, -1.0833      # Doncaster

print("="*80)
print("CHECKING HAZARDS ON ROUTE")
print("="*80)
print(f"\nRoute: Barnsley ({START_LAT},{START_LON}) to Doncaster ({END_LAT},{END_LON})")

# Get route WITH hazard avoidance
payload = {
    "start": f"{START_LAT},{START_LON}",
    "end": f"{END_LAT},{END_LON}",
    "routing_mode": "auto",
    "vehicle_type": "petrol_diesel",
    "enable_hazard_avoidance": True
}

print(f"\nRequest: {json.dumps(payload, indent=2)}")

response = requests.post(f"{VOYAGR_URL}/api/route", json=payload, timeout=30)

if response.status_code == 200:
    data = response.json()
    
    print(f"\n✅ Success! Source: {data.get('source', 'Unknown')}")
    
    if 'routes' in data and len(data['routes']) > 0:
        route = data['routes'][0]
        
        print(f"\nRoute Details:")
        print(f"  Distance: {route.get('distance_km', 0)} km")
        print(f"  Duration: {route.get('duration_minutes', 0)} min")
        print(f"  Hazard Count: {route.get('hazard_count', 0)}")
        print(f"  Hazard Penalty: {route.get('hazard_penalty_seconds', 0)}s")
        
        if 'hazards' in route and len(route['hazards']) > 0:
            print(f"\n📍 Hazards on route ({len(route['hazards'])} total):")
            for hazard in route['hazards']:
                print(f"  - {hazard.get('type', 'unknown')}: ({hazard.get('lat', 0)}, {hazard.get('lon', 0)}) - {hazard.get('description', 'N/A')}")
        else:
            print("\n✅ NO HAZARDS ON ROUTE!")
    else:
        print("\n❌ No routes returned")
else:
    print(f"\n❌ Error: HTTP {response.status_code}")
    print(response.text[:500])


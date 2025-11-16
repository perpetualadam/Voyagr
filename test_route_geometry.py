#!/usr/bin/env python3
"""Test route geometry and hazard scoring"""

import requests
import json

payload = {
    'start': '51.5074,-0.1278',
    'end': '51.5174,-0.1378',
    'enable_hazard_avoidance': True
}

print("Testing route with hazard avoidance...")
response = requests.post('http://localhost:5000/api/route', json=payload, timeout=10)
data = response.json()

if data.get('success'):
    routes = data.get('routes', [])
    if routes:
        route = routes[0]
        print("\nRoute response:")
        print(json.dumps(route, indent=2))
        
        # Check if geometry is present
        if 'geometry' in route:
            geom = route['geometry']
            print(f"\nGeometry type: {type(geom)}")
            print(f"Geometry length: {len(str(geom))}")
            print(f"Geometry (first 100 chars): {str(geom)[:100]}")
        else:
            print("\nWARNING: No geometry in route!")
else:
    print(f"Error: {data.get('error')}")


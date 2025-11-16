#!/usr/bin/env python3
"""Check A630 cameras through Balby"""

import requests
import json

# Test the API
response = requests.get('http://localhost:5000/api/route', params={
    'start_lat': 53.5527719,
    'start_lon': -1.4827755,
    'end_lat': 53.505844,
    'end_lon': -1.1575225,
    'routing_mode': 'auto',
    'vehicle_type': 'petrol_diesel',
    'enable_hazard_avoidance': 'true'
})

data = response.json()

# Print hazards
if 'routes' in data and len(data['routes']) > 0:
    hazards = data['routes'][0].get('hazards', [])
    print(f'Total hazards detected: {len(hazards)}')
    print()
    
    # Group by type
    by_type = {}
    for h in hazards:
        htype = h.get('type', 'unknown')
        if htype not in by_type:
            by_type[htype] = []
        by_type[htype].append(h)
    
    for htype, items in by_type.items():
        print(f'{htype}: {len(items)} cameras')
        for h in items:
            lat = h['lat']
            lon = h['lon']
            dist = h['distance']
            desc = h.get('description', 'N/A')
            print(f'  - Lat: {lat:.5f}, Lon: {lon:.5f}, Distance: {dist}m, Desc: {desc}')
    
    print()
    print(f'Total hazard penalty: {data["routes"][0].get("hazard_penalty_seconds", 0):.0f} seconds')


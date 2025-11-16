#!/usr/bin/env python3
"""Test hazard scoring with a longer route"""

import requests
import json

# Test with a longer route that should pass through more cameras
# From central London to Heathrow area (about 20km)
test_routes = [
    {
        'name': 'London Center to Heathrow',
        'start': '51.5074,-0.1278',  # Piccadilly Circus
        'end': '51.4700,-0.4543'     # Heathrow
    },
    {
        'name': 'London Center to Canary Wharf',
        'start': '51.5074,-0.1278',  # Piccadilly Circus
        'end': '51.5033,-0.0195'     # Canary Wharf
    },
    {
        'name': 'London Center to Tower Bridge',
        'start': '51.5074,-0.1278',  # Piccadilly Circus
        'end': '51.5055,-0.0754'     # Tower Bridge
    }
]

for test in test_routes:
    print(f"\n{'='*60}")
    print(f"Testing: {test['name']}")
    print(f"Start: {test['start']}")
    print(f"End: {test['end']}")
    print('='*60)
    
    payload = {
        'start': test['start'],
        'end': test['end'],
        'enable_hazard_avoidance': True
    }
    
    try:
        response = requests.post('http://localhost:5000/api/route', json=payload, timeout=15)
        data = response.json()
        
        if data.get('success'):
            routes = data.get('routes', [])
            if routes:
                route = routes[0]
                print(f"\n✓ Route found:")
                print(f"  Distance: {route.get('distance_km')} km")
                print(f"  Duration: {route.get('duration_minutes')} min")
                print(f"  Hazard Penalty: {route.get('hazard_penalty_seconds')}s")
                print(f"  Hazard Count: {route.get('hazard_count')}")
                
                if route.get('hazard_penalty_seconds', 0) > 0:
                    print(f"  ✓ HAZARDS DETECTED!")
                else:
                    print(f"  ✗ No hazards detected")
        else:
            print(f"✗ Error: {data.get('error')}")
    except Exception as e:
        print(f"✗ Exception: {e}")

print("\n" + "="*60)


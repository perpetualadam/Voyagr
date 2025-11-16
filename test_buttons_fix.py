#!/usr/bin/env python3
"""Test that route buttons work with destination coordinates"""

import requests
import json

BASE_URL = 'http://localhost:5000'

# Test route calculation (York to Leeds - completely new route)
payload = {
    'start': '53.9581,-1.0873',  # York
    'end': '53.8008,-1.5491',    # Leeds
    'routing_mode': 'auto',
    'vehicle_type': 'petrol_diesel',
    'enable_hazard_avoidance': True
}

print('Testing route calculation...')
response = requests.post(f'{BASE_URL}/api/route', json=payload, timeout=30)
data = response.json()

if data.get('success'):
    print('✅ Route calculated successfully')

    # Print full response keys
    print(f'\nResponse keys: {list(data.keys())}')
    print(f'  Source: {data.get("source")}')

    # Check if coordinates are in response
    print(f'  start_lat: {data.get("start_lat")}')
    print(f'  start_lon: {data.get("start_lon")}')
    print(f'  end_lat: {data.get("end_lat")}')
    print(f'  end_lon: {data.get("end_lon")}')

    # Check route data
    route = data.get('routes', [{}])[0]
    print(f'  Distance: {route.get("distance_km")} km')
    print(f'  Duration: {route.get("duration_minutes")} minutes')
    print(f'  Hazard Penalty: {route.get("hazard_penalty_seconds")}s')
    print(f'  Hazard Count: {route.get("hazard_count")}')

    # Verify coordinates are present (needed for Find Parking button)
    if data.get('end_lat') and data.get('end_lon'):
        print('\n✅ Destination coordinates present - Find Parking button will work!')
    else:
        print('\n❌ Destination coordinates missing - Find Parking button will fail!')
        print('\nFull response:')
        print(json.dumps(data, indent=2)[:500])
else:
    print(f'❌ Error: {data.get("error")}')


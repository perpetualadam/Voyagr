#!/usr/bin/env python3
"""
Test PWA routing endpoint
Verifies the Flask API is working correctly
"""

import requests
import json
import time

# Start the PWA server first: python voyagr_web.py
PWA_URL = 'http://localhost:5000'

print("\n" + "="*70)
print("PWA ROUTING ENDPOINT TEST")
print("="*70)
print("Make sure to start the PWA server first: python voyagr_web.py")

# Test coordinates: London to Exeter
START_LAT, START_LON = 51.5074, -0.1278
END_LAT, END_LON = 50.7520, -3.7373

test_cases = [
    {
        'name': 'Basic route (auto mode)',
        'data': {
            'start': f'{START_LAT},{START_LON}',
            'end': f'{END_LAT},{END_LON}',
            'routing_mode': 'auto',
            'vehicle_type': 'petrol_diesel'
        }
    },
    {
        'name': 'Pedestrian mode',
        'data': {
            'start': f'{START_LAT},{START_LON}',
            'end': f'{END_LAT},{END_LON}',
            'routing_mode': 'pedestrian'
        }
    },
    {
        'name': 'Bicycle mode',
        'data': {
            'start': f'{START_LAT},{START_LON}',
            'end': f'{END_LAT},{END_LON}',
            'routing_mode': 'bicycle'
        }
    }
]

for test in test_cases:
    print(f"\n{'-'*70}")
    print(f"Test: {test['name']}")
    print(f"{'-'*70}")
    
    try:
        url = f'{PWA_URL}/api/route'
        print(f'URL: {url}')
        print(f'Data: {json.dumps(test["data"], indent=2)}')
        
        start_time = time.time()
        response = requests.post(url, json=test['data'], timeout=30)
        elapsed = time.time() - start_time
        
        print(f'Status: {response.status_code} (took {elapsed:.2f}s)')
        
        if response.status_code == 200:
            data = response.json()
            if data.get('success'):
                print(f'✅ SUCCESS')
                print(f'   Source: {data.get("source", "Unknown")}')
                if 'routes' in data:
                    print(f'   Routes found: {len(data["routes"])}')
                    for i, route in enumerate(data['routes'][:2]):
                        print(f'   Route {i+1}: {route.get("name", "Unknown")}')
                        print(f'     Distance: {route.get("distance_km", 0):.1f} km')
                        print(f'     Duration: {route.get("duration_minutes", 0):.0f} min')
                        fuel = route.get("fuel_cost", 0)
                        toll = route.get("toll_cost", 0)
                        caz = route.get("caz_cost", 0)
                        total = fuel + toll + caz
                        if total > 0:
                            print(f'     Cost: £{total:.2f} (fuel: £{fuel:.2f}, toll: £{toll:.2f}, CAZ: £{caz:.2f})')
                else:
                    print(f'   Distance: {data.get("distance", "N/A")}')
                    print(f'   Time: {data.get("time", "N/A")}')
            else:
                print(f'❌ Error: {data.get("error", "Unknown error")}')
        else:
            print(f'❌ HTTP Error: {response.status_code}')
            print(f'Response: {response.text[:300]}')
            
    except requests.exceptions.ConnectionError:
        print(f'❌ Connection Error: Cannot connect to {PWA_URL}')
        print('   Make sure to start the PWA server: python voyagr_web.py')
    except Exception as e:
        print(f'❌ Exception: {str(e)}')

print('\n' + "="*70)


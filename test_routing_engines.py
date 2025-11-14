#!/usr/bin/env python3
"""
Test all routing engines: GraphHopper, Valhalla, OSRM
Verifies connectivity and basic routing functionality
"""

import requests
import json
import time
from dotenv import load_dotenv
import os

load_dotenv()

GRAPHHOPPER_URL = os.getenv('GRAPHHOPPER_URL', 'http://localhost:8989')
VALHALLA_URL = os.getenv('VALHALLA_URL', 'http://localhost:8002')
OSRM_URL = 'http://router.project-osrm.org'

# Test coordinates: London to Exeter
START_LAT, START_LON = 51.5074, -0.1278
END_LAT, END_LON = 50.7520, -3.7373

print("\n" + "="*70)
print("ROUTING ENGINE TEST SUITE")
print("="*70)
print(f"Test route: London ({START_LAT},{START_LON}) → Exeter ({END_LAT},{END_LON})")
print(f"Expected distance: ~290 km")

# Test GraphHopper route
print('\n' + "-"*70)
print('Testing GraphHopper...')
print("-"*70)
try:
    url = f'{GRAPHHOPPER_URL}/route'
    params = {
        'point': [f'{START_LAT},{START_LON}', f'{END_LAT},{END_LON}'],
        'profile': 'car',
        'locale': 'en',
        'ch.disable': 'true'
    }
    print(f'URL: {url}')
    start_time = time.time()
    response = requests.get(url, params=params, timeout=30)
    elapsed = time.time() - start_time
    print(f'Status: {response.status_code} (took {elapsed:.2f}s)')
    if response.status_code == 200:
        data = response.json()
        if 'paths' in data and len(data['paths']) > 0:
            path = data['paths'][0]
            distance = path.get('distance', 0) / 1000
            duration = path.get('time', 0) / 60000
            print(f'✅ SUCCESS')
            print(f'   Routes found: {len(data["paths"])}')
            print(f'   Distance: {distance:.1f} km')
            print(f'   Duration: {duration:.1f} min')
        else:
            print(f'❌ No paths in response')
    else:
        print(f'❌ Error: {response.text[:200]}')
except Exception as e:
    print(f'❌ Exception: {e}')

print('\n' + "-"*70)
print('Testing Valhalla...')
print("-"*70)
try:
    url = f'{VALHALLA_URL}/route'
    payload = {
        'locations': [
            {'lat': START_LAT, 'lon': START_LON},
            {'lat': END_LAT, 'lon': END_LON}
        ],
        'costing': 'auto',
        'alternatives': True
    }
    print(f'URL: {url}')
    start_time = time.time()
    response = requests.post(url, json=payload, timeout=30)
    elapsed = time.time() - start_time
    print(f'Status: {response.status_code} (took {elapsed:.2f}s)')
    if response.status_code == 200:
        data = response.json()
        if 'trip' in data:
            trip = data['trip']
            if 'summary' in trip:
                # Valhalla returns distance in kilometers (check units field)
                distance = trip['summary'].get('length', 0)
                duration = trip['summary'].get('time', 0) / 60  # convert to minutes
                units = trip.get('units', 'kilometers')
                print(f'✅ SUCCESS')
                print(f'   Distance: {distance:.1f} {units}')
                print(f'   Duration: {duration:.1f} min')
            else:
                print('❌ No summary in trip')
        else:
            print('❌ No trip in response')
    else:
        print(f'❌ Error: {response.text[:200]}')
except Exception as e:
    print(f'❌ Exception: {e}')

print('\n' + "-"*70)
print('Testing OSRM...')
print("-"*70)
try:
    url = f'{OSRM_URL}/route/v1/driving/{START_LON},{START_LAT};{END_LON},{END_LAT}'
    print(f'URL: {url}')
    start_time = time.time()
    response = requests.get(url, timeout=30)
    elapsed = time.time() - start_time
    print(f'Status: {response.status_code} (took {elapsed:.2f}s)')
    if response.status_code == 200:
        data = response.json()
        if 'routes' in data and len(data['routes']) > 0:
            route = data['routes'][0]
            distance = route.get('distance', 0) / 1000
            duration = route.get('duration', 0) / 60
            print(f'✅ SUCCESS')
            print(f'   Distance: {distance:.1f} km')
            print(f'   Duration: {duration:.1f} min')
        else:
            print('❌ No routes in response')
    else:
        print(f'❌ Error: {response.text[:200]}')
except Exception as e:
    print(f'❌ Exception: {e}')

print('\n' + "="*70)


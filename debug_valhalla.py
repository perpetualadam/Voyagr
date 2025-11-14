#!/usr/bin/env python3
"""Debug Valhalla response format"""

import requests
import json

url = 'http://141.147.102.102:8002/route'
payload = {
    'locations': [
        {'lat': 51.5074, 'lon': -0.1278},
        {'lat': 50.7520, 'lon': -3.7373}
    ],
    'costing': 'auto',
    'alternatives': True
}

response = requests.post(url, json=payload, timeout=30)
print(f'Status: {response.status_code}')

if response.status_code == 200:
    data = response.json()
    print(f'\nFull response:')
    print(json.dumps(data, indent=2))
    
    if 'trip' in data:
        trip = data['trip']
        summary = trip.get('summary', {})
        print(f'\nSummary:')
        print(f'  length: {summary.get("length")} (type: {type(summary.get("length"))})')
        print(f'  time: {summary.get("time")} (type: {type(summary.get("time"))})')
        print(f'  units: {trip.get("units")}')


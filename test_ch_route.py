#!/usr/bin/env python3
"""Test route with full CH index."""

import requests
import json
import time

url = 'http://localhost:5000/api/route'
data = {
    'start': '51.5074,-0.1278',
    'end': '51.7520,-1.2577'
}

print('Testing route with full CH index: London to Oxford')
print(f'URL: {url}')
print()

try:
    start = time.time()
    response = requests.post(url, json=data, timeout=60)
    elapsed = time.time() - start
    
    print(f'Status: {response.status_code}')
    print(f'Total time: {elapsed:.1f}s')
    print()
    
    result = response.json()
    if 'routes' in result and len(result['routes']) > 0:
        route = result['routes'][0]
        print(f"Distance: {route.get('distance_km', 'N/A')} km")
        print(f"Duration: {route.get('duration_minutes', 'N/A')} minutes")
        print(f"Algorithm: {route.get('algorithm', 'N/A')}")
        print(f"Response time: {route.get('response_time_ms', 'N/A')} ms")
    else:
        print('Response:')
        print(json.dumps(result, indent=2))
except Exception as e:
    print(f'Error: {e}')


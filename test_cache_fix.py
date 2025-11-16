#!/usr/bin/env python3
"""Test that cache respects hazard_avoidance parameter"""

import requests
import json

print("=" * 60)
print("Test 1: Request WITHOUT hazard avoidance")
print("=" * 60)

payload1 = {
    'start': '53.5505,-1.4793',
    'end': '53.5000,-1.1500',
    'enable_hazard_avoidance': False
}

response1 = requests.post('http://localhost:5000/api/route', json=payload1, timeout=15)
data1 = response1.json()
route1 = data1.get('routes', [{}])[0]

print(f"Hazard Count: {route1.get('hazard_count', 0)}")
print(f"Hazard Penalty: {route1.get('hazard_penalty_seconds', 0)}s")
print(f"Cached: {data1.get('cached', False)}")
print()

print("=" * 60)
print("Test 2: Request WITH hazard avoidance (should NOT use cache)")
print("=" * 60)

payload2 = {
    'start': '53.5505,-1.4793',
    'end': '53.5000,-1.1500',
    'enable_hazard_avoidance': True
}

response2 = requests.post('http://localhost:5000/api/route', json=payload2, timeout=15)
data2 = response2.json()
route2 = data2.get('routes', [{}])[0]

print(f"Hazard Count: {route2.get('hazard_count', 0)}")
print(f"Hazard Penalty: {route2.get('hazard_penalty_seconds', 0)}s")
print(f"Cached: {data2.get('cached', False)}")
print()

if route2.get('hazard_count', 0) > 0:
    print("✓ SUCCESS: Hazards detected with enable_hazard_avoidance=True")
else:
    print("✗ FAILED: No hazards detected")

print()
print("=" * 60)
print("Test 3: Request WITH hazard avoidance again (should use cache)")
print("=" * 60)

response3 = requests.post('http://localhost:5000/api/route', json=payload2, timeout=15)
data3 = response3.json()
route3 = data3.get('routes', [{}])[0]

print(f"Hazard Count: {route3.get('hazard_count', 0)}")
print(f"Hazard Penalty: {route3.get('hazard_penalty_seconds', 0)}s")
print(f"Cached: {data3.get('cached', False)}")

if data3.get('cached', False):
    print("✓ SUCCESS: Cache hit on second request with same parameters")
else:
    print("✗ FAILED: Cache miss on second request")


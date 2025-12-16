#!/usr/bin/env python3
"""
Test GraphHopper API to diagnose HTTP 400 errors
"""

import requests
import json

GRAPHHOPPER_URL = "http://81.0.246.97:8989/route"

# Test coordinates (London to Oxford)
start_lat, start_lon = 51.5074, -0.1278
end_lat, end_lon = 51.7520, -1.2577

print("="*80)
print("GRAPHHOPPER API DIAGNOSTIC TEST")
print("="*80)
print(f"\nServer: {GRAPHHOPPER_URL}")
print(f"Route: London ({start_lat}, {start_lon}) → Oxford ({end_lat}, {end_lon})")

# Test 1: Original parameters (from benchmark)
print("\n" + "="*80)
print("TEST 1: Original Parameters (from benchmark)")
print("="*80)

params1 = {
    'point': [f'{start_lat},{start_lon}', f'{end_lat},{end_lon}'],
    'vehicle': 'car',
    'locale': 'en',
    'points_encoded': 'false',
}

print(f"\nParameters: {json.dumps(params1, indent=2)}")

try:
    response = requests.get(GRAPHHOPPER_URL, params=params1, timeout=10)
    print(f"\nStatus Code: {response.status_code}")
    print(f"Response Headers: {dict(response.headers)}")
    print(f"\nResponse Body:")
    try:
        print(json.dumps(response.json(), indent=2))
    except:
        print(response.text)
except Exception as e:
    print(f"\n❌ Error: {e}")

# Test 2: Alternative parameter format (profile instead of vehicle)
print("\n" + "="*80)
print("TEST 2: Alternative Parameters (profile instead of vehicle)")
print("="*80)

params2 = {
    'point': [f'{start_lat},{start_lon}', f'{end_lat},{end_lon}'],
    'profile': 'car',
    'locale': 'en',
    'points_encoded': 'false',
}

print(f"\nParameters: {json.dumps(params2, indent=2)}")

try:
    response = requests.get(GRAPHHOPPER_URL, params=params2, timeout=10)
    print(f"\nStatus Code: {response.status_code}")
    print(f"Response Headers: {dict(response.headers)}")
    print(f"\nResponse Body:")
    try:
        print(json.dumps(response.json(), indent=2))
    except:
        print(response.text)
except Exception as e:
    print(f"\n❌ Error: {e}")

# Test 3: Minimal parameters
print("\n" + "="*80)
print("TEST 3: Minimal Parameters")
print("="*80)

params3 = {
    'point': [f'{start_lat},{start_lon}', f'{end_lat},{end_lon}'],
}

print(f"\nParameters: {json.dumps(params3, indent=2)}")

try:
    response = requests.get(GRAPHHOPPER_URL, params=params3, timeout=10)
    print(f"\nStatus Code: {response.status_code}")
    print(f"Response Headers: {dict(response.headers)}")
    print(f"\nResponse Body:")
    try:
        print(json.dumps(response.json(), indent=2))
    except:
        print(response.text)
except Exception as e:
    print(f"\n❌ Error: {e}")

# Test 4: Check server info endpoint
print("\n" + "="*80)
print("TEST 4: Server Info Endpoint")
print("="*80)

info_url = "http://81.0.246.97:8989/info"
print(f"\nURL: {info_url}")

try:
    response = requests.get(info_url, timeout=10)
    print(f"\nStatus Code: {response.status_code}")
    print(f"\nResponse Body:")
    try:
        print(json.dumps(response.json(), indent=2))
    except:
        print(response.text)
except Exception as e:
    print(f"\n❌ Error: {e}")

print("\n" + "="*80)
print("DIAGNOSTIC TEST COMPLETE")
print("="*80)


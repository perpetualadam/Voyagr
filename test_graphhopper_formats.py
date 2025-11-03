#!/usr/bin/env python3
"""
Test different GraphHopper API payload formats
"""

import requests
import json

print("Testing different GraphHopper /route payload formats...")
print("=" * 60)

# Try format 1: POST with JSON body
print("\n1️⃣ Format 1: POST with JSON body (lng key)...")
payload1 = {
    "points": [
        {"lat": 51.5074, "lng": -0.1278},
        {"lat": 51.5174, "lng": -0.1278}
    ],
    "profile": "car"
}

try:
    response = requests.post(
        "http://81.0.246.97:8989/route",
        json=payload1,
        timeout=10
    )
    print(f"Status: {response.status_code}")
    print(f"Response: {response.text[:300]}")
except Exception as e:
    print(f"Error: {e}")

# Try format 2: GET request with query parameters
print("\n2️⃣ Format 2: GET request with query parameters...")
try:
    response = requests.get(
        "http://81.0.246.97:8989/route",
        params={
            "point": ["51.5074,-0.1278", "51.5174,-0.1278"],
            "profile": "car"
        },
        timeout=10
    )
    print(f"Status: {response.status_code}")
    if response.status_code == 200:
        data = response.json()
        if 'paths' in data and len(data['paths']) > 0:
            path = data['paths'][0]
            print(f"✅ SUCCESS!")
            print(f"   Distance: {path.get('distance', 0) / 1000:.2f} km")
            print(f"   Time: {path.get('time', 0) / 60000:.0f} minutes")
        else:
            print(f"Response keys: {data.keys()}")
    else:
        print(f"Response: {response.text[:300]}")
except Exception as e:
    print(f"Error: {e}")

# Try format 3: GET with point parameter as single string
print("\n3️⃣ Format 3: GET with point parameter (comma-separated)...")
try:
    response = requests.get(
        "http://81.0.246.97:8989/route",
        params={
            "point": "51.5074,-0.1278&point=51.5174,-0.1278",
            "profile": "car"
        },
        timeout=10
    )
    print(f"Status: {response.status_code}")
    if response.status_code == 200:
        data = response.json()
        if 'paths' in data and len(data['paths']) > 0:
            path = data['paths'][0]
            print(f"✅ SUCCESS!")
            print(f"   Distance: {path.get('distance', 0) / 1000:.2f} km")
            print(f"   Time: {path.get('time', 0) / 60000:.0f} minutes")
        else:
            print(f"Response keys: {data.keys()}")
    else:
        print(f"Response: {response.text[:300]}")
except Exception as e:
    print(f"Error: {e}")

print("\n" + "=" * 60)


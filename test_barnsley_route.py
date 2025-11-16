#!/usr/bin/env python3
"""Test hazard avoidance on Barnsley to Balby route"""

import requests
import json

# Barnsley, South Yorkshire to Balby, near Doncaster
# Barnsley: 53.5505, -1.4793
# Balby: 53.5000, -1.1500

print("=" * 60)
print("Testing Barnsley → Balby Route")
print("=" * 60)
print()

# Test 1: WITHOUT hazard avoidance
print("TEST 1: Route WITHOUT hazard avoidance")
print("-" * 60)
payload1 = {
    'start': '53.5505,-1.4793',
    'end': '53.5000,-1.1500',
    'enable_hazard_avoidance': False
}

try:
    response = requests.post('http://localhost:5000/api/route', json=payload1, timeout=15)
    data = response.json()
    
    if data.get('success'):
        route = data.get('routes', [{}])[0]
        print(f"✓ Distance: {route.get('distance_km')} km")
        print(f"✓ Duration: {route.get('duration_minutes')} min")
        print(f"✓ Hazard Count: {route.get('hazard_count', 0)}")
        print(f"✓ Hazard Penalty: {route.get('hazard_penalty_seconds', 0)}s")
    else:
        print(f"✗ Error: {data.get('error')}")
except Exception as e:
    print(f"✗ Exception: {e}")

print()
print()

# Test 2: WITH hazard avoidance
print("TEST 2: Route WITH hazard avoidance")
print("-" * 60)
payload2 = {
    'start': '53.5505,-1.4793',
    'end': '53.5000,-1.1500',
    'enable_hazard_avoidance': True
}

try:
    response = requests.post('http://localhost:5000/api/route', json=payload2, timeout=15)
    data = response.json()
    
    if data.get('success'):
        route = data.get('routes', [{}])[0]
        print(f"✓ Distance: {route.get('distance_km')} km")
        print(f"✓ Duration: {route.get('duration_minutes')} min")
        print(f"✓ Hazard Count: {route.get('hazard_count', 0)}")
        print(f"✓ Hazard Penalty: {route.get('hazard_penalty_seconds', 0)}s")
        
        if route.get('hazard_count', 0) > 0:
            print()
            print("✓ HAZARDS DETECTED on this route!")
        else:
            print()
            print("✗ NO HAZARDS DETECTED on this route")
    else:
        print(f"✗ Error: {data.get('error')}")
except Exception as e:
    print(f"✗ Exception: {e}")

print()
print()

# Test 3: Check if there are ANY cameras in South Yorkshire
print("TEST 3: Checking for cameras in South Yorkshire area")
print("-" * 60)

import sqlite3
try:
    conn = sqlite3.connect('voyagr_web.db')
    cursor = conn.cursor()
    
    # South Yorkshire bounding box
    # Lat: 53.3 to 53.7, Lon: -1.7 to -0.9
    cursor.execute("""
        SELECT COUNT(*) FROM cameras 
        WHERE latitude BETWEEN 53.3 AND 53.7 
        AND longitude BETWEEN -1.7 AND -0.9
    """)
    count = cursor.fetchone()[0]
    print(f"✓ Cameras in South Yorkshire area: {count}")
    
    if count > 0:
        cursor.execute("""
            SELECT latitude, longitude, description FROM cameras 
            WHERE latitude BETWEEN 53.3 AND 53.7 
            AND longitude BETWEEN -1.7 AND -0.9
            LIMIT 5
        """)
        print("  Sample cameras:")
        for lat, lon, desc in cursor.fetchall():
            print(f"    ({lat}, {lon}) - {desc}")
    
    conn.close()
except Exception as e:
    print(f"✗ Error checking database: {e}")


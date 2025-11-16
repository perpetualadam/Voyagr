#!/usr/bin/env python3
"""Debug hazard avoidance system"""

import sqlite3
import requests
import json

print("=" * 60)
print("HAZARD AVOIDANCE DEBUG")
print("=" * 60)

# Test 1: Check if cameras exist in database
print("\n1. Checking cameras in database...")
conn = sqlite3.connect('voyagr_web.db')
cursor = conn.cursor()
cursor.execute('SELECT COUNT(*) FROM cameras WHERE type = ?', ('speed_camera',))
count = cursor.fetchone()[0]
print(f"   Speed cameras: {count:,}")

# Test 2: Check hazard preferences
print("\n2. Checking hazard preferences...")
cursor.execute('SELECT hazard_type, penalty_seconds, enabled FROM hazard_preferences')
prefs = cursor.fetchall()
print(f"   Total hazard types: {len(prefs)}")
for h, p, e in prefs:
    status = "ENABLED" if e else "DISABLED"
    print(f"   - {h}: {p}s penalty ({status})")
conn.close()

# Test 3: Try a route with hazard avoidance
print("\n3. Testing route with hazard avoidance...")
try:
    payload = {
        'start': '51.5074,-0.1278',
        'end': '51.5174,-0.1378',
        'enable_hazard_avoidance': True
    }
    print(f"   Request: {json.dumps(payload, indent=2)}")
    
    response = requests.post('http://localhost:5000/api/route', json=payload, timeout=10)
    print(f"   Status: {response.status_code}")
    
    data = response.json()
    if data.get('success'):
        routes = data.get('routes', [])
        print(f"   Routes returned: {len(routes)}")
        if routes:
            route = routes[0]
            print(f"   First route:")
            print(f"     - Name: {route.get('name')}")
            print(f"     - Distance: {route.get('distance_km')} km")
            print(f"     - Duration: {route.get('duration_minutes')} min")
            print(f"     - Hazard Penalty: {route.get('hazard_penalty_seconds')}s")
            print(f"     - Hazard Count: {route.get('hazard_count')}")
    else:
        print(f"   Error: {data.get('error')}")
        print(f"   Full response: {json.dumps(data, indent=2)}")
except Exception as e:
    print(f"   Connection error: {e}")

# Test 4: Try a route WITHOUT hazard avoidance
print("\n4. Testing route WITHOUT hazard avoidance...")
try:
    payload = {
        'start': '51.5074,-0.1278',
        'end': '51.5174,-0.1378',
        'enable_hazard_avoidance': False
    }
    
    response = requests.post('http://localhost:5000/api/route', json=payload, timeout=10)
    data = response.json()
    if data.get('success'):
        routes = data.get('routes', [])
        if routes:
            route = routes[0]
            print(f"   First route:")
            print(f"     - Hazard Penalty: {route.get('hazard_penalty_seconds')}s")
            print(f"     - Hazard Count: {route.get('hazard_count')}")
    else:
        print(f"   Error: {data.get('error')}")
except Exception as e:
    print(f"   Connection error: {e}")

print("\n" + "=" * 60)


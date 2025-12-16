#!/usr/bin/env python3
"""
Diagnose why cameras aren't being detected on the route.
"""

import requests
import sqlite3
import polyline
import math

def haversine_distance(lat1, lon1, lat2, lon2):
    """Calculate distance between two points in meters."""
    R = 6371000  # Earth radius in meters
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)
    
    a = math.sin(delta_phi/2)**2 + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda/2)**2
    c = 2 * math.asin(math.sqrt(a))
    
    return R * c

# Test coordinates
START_LAT = 53.5526
START_LON = -1.4797
END_LAT = 53.5167
END_LON = -1.0833

print("\n" + "="*80)
print("ROUTE CAMERA DIAGNOSTIC")
print("="*80)

# Get route from API
print("\n[1/3] Fetching route from Valhalla...")
response = requests.post(
    "http://localhost:5000/api/route",
    json={
        "start": f"{START_LAT},{START_LON}",
        "end": f"{END_LAT},{END_LON}",
        "routing_mode": "auto",
        "vehicle_type": "petrol_diesel",
        "enable_hazard_avoidance": False
    },
    timeout=30
)

if response.status_code != 200:
    print(f"❌ Error: {response.status_code}")
    exit(1)

data = response.json()
route = data['routes'][0]
geometry = route['geometry']

print(f"✅ Route received: {route['distance_km']} km, {route['duration_minutes']} min")

# Decode route geometry
print("\n[2/3] Decoding route geometry...")
route_points = polyline.decode(geometry, 6)  # Valhalla uses precision 6
print(f"✅ Decoded {len(route_points)} route points")

# Sample first 5 and last 5 points
print(f"\nFirst 5 points:")
for i, (lat, lon) in enumerate(route_points[:5]):
    print(f"  {i+1}. ({lat:.6f}, {lon:.6f})")
print(f"\nLast 5 points:")
for i, (lat, lon) in enumerate(route_points[-5:]):
    print(f"  {len(route_points)-5+i+1}. ({lat:.6f}, {lon:.6f})")

# Get cameras from database
print("\n[3/3] Checking cameras near route...")
conn = sqlite3.connect('voyagr.db')
cursor = conn.cursor()

cursor.execute(
    'SELECT lat, lon, description FROM cameras WHERE lat BETWEEN ? AND ? AND lon BETWEEN ? AND ?',
    (min(START_LAT, END_LAT) - 0.1, max(START_LAT, END_LAT) + 0.1,
     min(START_LON, END_LON) - 0.1, max(START_LON, END_LON) + 0.1)
)

cameras = cursor.fetchall()
print(f"✅ Found {len(cameras)} cameras in bounding box")

# Check distance from each camera to route
print(f"\n📍 Camera distances to route:")
cameras_on_route = []

for cam_lat, cam_lon, desc in cameras:
    # Find minimum distance to route
    min_distance = float('inf')
    closest_point = None
    
    for route_lat, route_lon in route_points:
        distance = haversine_distance(cam_lat, cam_lon, route_lat, route_lon)
        if distance < min_distance:
            min_distance = distance
            closest_point = (route_lat, route_lon)
    
    status = "✅ ON ROUTE" if min_distance <= 500 else "❌ TOO FAR"
    print(f"  ({cam_lat:.4f}, {cam_lon:.4f}) - {min_distance:6.0f}m - {status} - {desc[:40]}")
    
    if min_distance <= 500:
        cameras_on_route.append((cam_lat, cam_lon, min_distance, desc))

print(f"\n📊 Summary:")
print(f"  Total cameras in bounding box: {len(cameras)}")
print(f"  Cameras within 500m of route: {len(cameras_on_route)}")
print(f"  Cameras beyond 500m: {len(cameras) - len(cameras_on_route)}")

if len(cameras_on_route) == 0:
    print(f"\n⚠️  NO CAMERAS WITHIN 500M OF ROUTE!")
    print(f"  This explains why hazard_count = 0")
    print(f"\n💡 Solutions:")
    print(f"  1. Use a different route with cameras closer to the road")
    print(f"  2. Increase proximity_threshold_meters in hazard_preferences table")
    print(f"  3. Add test cameras directly on the route path")
else:
    print(f"\n✅ Cameras should be detected on route!")
    print(f"  Check server logs for hazard scoring messages")

conn.close()
print("\n" + "="*80)


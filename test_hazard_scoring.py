#!/usr/bin/env python3
"""Test hazard scoring directly"""

import polyline
import sqlite3
from math import radians, cos, sin, asin, sqrt

# The encoded polyline from the route
encoded_polyline = "u`kyHx~WEGISCWU}@I]KOMES@{@Ps@TQAo@We@Be@F[FMHILo@tA[`@YVs@\\}@P_A@_DGKvD?ZL|AT~AfAdE`@~AgD|Be@d@oA|AAHS\\qA~@cEfCkGtEyBxAeE`CRlB]P}AvAARHP"

print("1. Decoding polyline...")
try:
    decoded_points = polyline.decode(encoded_polyline)
    print(f"   ✓ Decoded {len(decoded_points)} points")
    print(f"   First 3 points: {decoded_points[:3]}")
except Exception as e:
    print(f"   ✗ Error: {e}")
    exit(1)

# Get hazards from database
print("\n2. Fetching hazards from database...")
conn = sqlite3.connect('voyagr_web.db')
cursor = conn.cursor()

# Bounding box for London
south, north = 51.407, 51.617
west, east = -0.238, -0.028

cursor.execute(
    'SELECT lat, lon, type FROM cameras WHERE lat BETWEEN ? AND ? AND lon BETWEEN ? AND ? LIMIT 10',
    (south, north, west, east)
)
cameras = cursor.fetchall()
print(f"   ✓ Found {len(cameras)} cameras in bounding box")
for lat, lon, cam_type in cameras[:3]:
    print(f"     ({lat}, {lon}) - {cam_type}")

# Test distance calculation
print("\n3. Testing distance calculation...")

def get_distance_between_points(lat1, lon1, lat2, lon2):
    """Calculate distance between two points in meters using Haversine formula"""
    lon1, lat1, lon2, lat2 = map(radians, [lon1, lat1, lon2, lat2])
    dlon = lon2 - lon1
    dlat = lat2 - lat1
    a = sin(dlat/2)**2 + cos(lat1) * cos(lat2) * sin(dlon/2)**2
    c = 2 * asin(sqrt(a))
    r = 6371000  # Radius of earth in meters
    return c * r

if cameras:
    camera_lat, camera_lon, _ = cameras[0]
    print(f"   Testing camera at ({camera_lat}, {camera_lon})")
    
    min_distance = float('inf')
    for point_lat, point_lon in decoded_points:
        distance = get_distance_between_points(camera_lat, camera_lon, point_lat, point_lon)
        min_distance = min(min_distance, distance)
    
    print(f"   ✓ Minimum distance to route: {min_distance:.0f} meters")
    
    # Check if within threshold (100m for traffic cameras)
    threshold = 100
    if min_distance <= threshold:
        print(f"   ✓ Camera is within {threshold}m threshold - SHOULD APPLY PENALTY")
    else:
        print(f"   ✗ Camera is {min_distance:.0f}m away - outside {threshold}m threshold")

conn.close()
print("\n✓ All tests completed")


#!/usr/bin/env python3
"""
Check which cameras are being excluded vs. which are on the route.
"""

# --- Windows console UTF-8 (auto-added) ---
import sys as _vsys
if _vsys.platform == "win32":
    try:
        _vsys.stdout.reconfigure(encoding="utf-8", errors="replace")
        _vsys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass


import sqlite3
import requests
import json

# Test route
start = "53.5526,-1.4797"
end = "53.5167,-1.0833"

# Parse coordinates
start_lat, start_lon = map(float, start.split(','))
end_lat, end_lon = map(float, end.split(','))

# Calculate bounding box with margins (same as voyagr_web.py)
min_lat = min(start_lat, end_lat)
max_lat = max(start_lat, end_lat)
min_lon = min(start_lon, end_lon)
max_lon = max(start_lon, end_lon)

margin_percent = 0.5
min_margin_degrees = 0.15

lat_margin = max((max_lat - min_lat) * margin_percent, min_margin_degrees)
lon_margin = max((max_lon - min_lon) * margin_percent, min_margin_degrees)

bbox_min_lat = min_lat - lat_margin
bbox_max_lat = max_lat + lat_margin
bbox_min_lon = min_lon - lon_margin
bbox_max_lon = max_lon + lon_margin

print("=" * 80)
print("CHECKING EXCLUDED CAMERAS VS. ROUTE CAMERAS")
print("=" * 80)
print()
print(f"Route: Barnsley ({start}) to Doncaster ({end})")
print()
print(f"Bounding box:")
print(f"  Lat: [{bbox_min_lat:.4f}, {bbox_max_lat:.4f}]")
print(f"  Lon: [{bbox_min_lon:.4f}, {bbox_max_lon:.4f}]")
print(f"  Margins: lat={lat_margin:.4f}, lon={lon_margin:.4f}")
print()

# Get cameras in bounding box
conn = sqlite3.connect('voyagr.db')
cursor = conn.cursor()

cursor.execute("""
    SELECT id, lat, lon, description
    FROM cameras
    WHERE lat BETWEEN ? AND ?
    AND lon BETWEEN ? AND ?
    AND type = 'speed_camera'
    ORDER BY lat DESC, lon ASC
""", (bbox_min_lat, bbox_max_lat, bbox_min_lon, bbox_max_lon))

cameras_in_bbox = cursor.fetchall()
print(f"📍 Cameras in bounding box: {len(cameras_in_bbox)}")
print()

# Cameras on route (from previous test)
cameras_on_route = [
    156075, 1156075001, 156076, 1156076001, 167338, 1167338001, 1167338002,
    167339, 1167339001, 167340, 1167340001, 1167340002, 167341, 1167341001
]

print(f"📍 Cameras on route: {len(cameras_on_route)}")
for cam_id in cameras_on_route:
    cursor.execute("SELECT lat, lon, description FROM cameras WHERE id = ?", (cam_id,))
    row = cursor.fetchone()
    if row:
        print(f"  - {cam_id}: ({row[0]}, {row[1]}) - {row[2]}")
print()

# Check if route cameras are in bounding box
print("🔍 Checking if route cameras are in bounding box:")
for cam_id in cameras_on_route:
    cursor.execute("SELECT lat, lon FROM cameras WHERE id = ?", (cam_id,))
    row = cursor.fetchone()
    if row:
        lat, lon = row
        in_bbox = (bbox_min_lat <= lat <= bbox_max_lat) and (bbox_min_lon <= lon <= bbox_max_lon)
        status = "✅ IN BBOX" if in_bbox else "❌ OUTSIDE BBOX"
        print(f"  - {cam_id}: ({lat}, {lon}) - {status}")
print()

# Top 50 cameras by weight (same logic as build_valhalla_exclude_locations)
hazard_weights = {'speed_camera': 50.0}
all_cameras = []
for cam_id, lat, lon, desc in cameras_in_bbox:
    all_cameras.append({
        'id': cam_id,
        'lat': lat,
        'lon': lon,
        'description': desc,
        'weight': hazard_weights['speed_camera']
    })

# Sort by weight (descending) and take top 50
all_cameras_sorted = sorted(all_cameras, key=lambda h: h['weight'], reverse=True)
top_50_cameras = all_cameras_sorted[:50]
top_50_ids = [cam['id'] for cam in top_50_cameras]

print(f"📍 Top 50 cameras (by weight) that would be excluded:")
print(f"  Total: {len(top_50_cameras)}")
print()

# Check if route cameras are in top 50
print("🔍 Checking if route cameras are in top 50 excluded:")
excluded_count = 0
not_excluded_count = 0
for cam_id in cameras_on_route:
    if cam_id in top_50_ids:
        print(f"  - {cam_id}: ✅ EXCLUDED (in top 50)")
        excluded_count += 1
    else:
        print(f"  - {cam_id}: ❌ NOT EXCLUDED (not in top 50)")
        not_excluded_count += 1
print()

print("=" * 80)
print("SUMMARY")
print("=" * 80)
print(f"Cameras in bounding box: {len(cameras_in_bbox)}")
print(f"Top 50 excluded: {len(top_50_cameras)}")
print(f"Cameras on route: {len(cameras_on_route)}")
print(f"  - Excluded: {excluded_count}")
print(f"  - NOT excluded: {not_excluded_count}")
print()
print("💡 Conclusion:")
if not_excluded_count > 0:
    print(f"  {not_excluded_count} cameras on route are NOT in top 50 excluded.")
    print(f"  This is expected - all cameras have same weight (50.0), so top 50 is arbitrary.")
    print(f"  To exclude ALL {len(cameras_in_bbox)} cameras, we'd need Valhalla to support more than 50 locations.")
else:
    print(f"  All route cameras are in top 50 excluded - something else is wrong!")

conn.close()


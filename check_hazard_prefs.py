#!/usr/bin/env python3
"""Check hazard preferences in database"""

import sqlite3

conn = sqlite3.connect('voyagr_web.db')
cursor = conn.cursor()

print("=" * 60)
print("Hazard Preferences")
print("=" * 60)

cursor.execute("SELECT hazard_type, penalty_seconds, proximity_threshold_meters, enabled FROM hazard_preferences")
rows = cursor.fetchall()

for hazard_type, penalty, threshold, enabled in rows:
    status = "✓ ENABLED" if enabled else "✗ DISABLED"
    print(f"{hazard_type:25} | Penalty: {penalty:5}s | Threshold: {threshold:5}m | {status}")

print()
print("=" * 60)
print("Testing hazard fetch for Barnsley-Balby route")
print("=" * 60)

# Barnsley: 53.5505, -1.4793
# Balby: 53.5000, -1.1500
start_lat, start_lon = 53.5505, -1.4793
end_lat, end_lon = 53.5000, -1.1500

# Calculate bounding box with 10km buffer
north = max(start_lat, end_lat) + 0.1
south = min(start_lat, end_lat) - 0.1
east = max(start_lon, end_lon) + 0.1
west = min(start_lon, end_lon) - 0.1

print(f"Bounding box: Lat {south:.4f} to {north:.4f}, Lon {west:.4f} to {east:.4f}")
print()

cursor.execute(
    "SELECT COUNT(*) FROM cameras WHERE lat BETWEEN ? AND ? AND lon BETWEEN ? AND ?",
    (south, north, west, east)
)
count = cursor.fetchone()[0]
print(f"Cameras in bounding box: {count}")

if count > 0:
    cursor.execute(
        "SELECT lat, lon, type, description FROM cameras WHERE lat BETWEEN ? AND ? AND lon BETWEEN ? AND ? LIMIT 5",
        (south, north, west, east)
    )
    print("Sample cameras:")
    for lat, lon, cam_type, desc in cursor.fetchall():
        print(f"  ({lat}, {lon}) - {cam_type}: {desc[:50]}")

conn.close()


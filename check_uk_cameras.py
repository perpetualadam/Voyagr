#!/usr/bin/env python3
"""Check for UK cameras in database"""

import sqlite3

conn = sqlite3.connect('voyagr_web.db')
cursor = conn.cursor()

print("=" * 60)
print("Checking for UK Cameras")
print("=" * 60)
print()

# UK bounding box: roughly 50-56 latitude, -8 to 2 longitude
print("UK Bounding Box: Lat 50-56, Lon -8 to 2")
cursor.execute("""
    SELECT COUNT(*) FROM cameras 
    WHERE lat BETWEEN 50 AND 56 
    AND lon BETWEEN -8 AND 2
""")
uk_count = cursor.fetchone()[0]
print(f"Cameras in UK area: {uk_count}")
print()

# Check specific regions
regions = [
    ("London", 51.5, 51.6, -0.2, 0.0),
    ("South Yorkshire (Barnsley/Doncaster)", 53.3, 53.7, -1.7, -0.9),
    ("Manchester", 53.4, 53.5, -2.3, -2.2),
    ("Birmingham", 52.5, 52.6, -1.9, -1.8),
]

for region_name, lat_min, lat_max, lon_min, lon_max in regions:
    cursor.execute(f"""
        SELECT COUNT(*) FROM cameras 
        WHERE lat BETWEEN {lat_min} AND {lat_max}
        AND lon BETWEEN {lon_min} AND {lon_max}
    """)
    count = cursor.fetchone()[0]
    print(f"{region_name}: {count} cameras")

print()
print("=" * 60)
print("Sample cameras from database")
print("=" * 60)
cursor.execute("SELECT lat, lon, type, description FROM cameras LIMIT 10")
for lat, lon, cam_type, desc in cursor.fetchall():
    print(f"({lat}, {lon}) - {cam_type}: {desc[:50]}")

conn.close()


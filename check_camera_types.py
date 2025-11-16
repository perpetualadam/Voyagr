#!/usr/bin/env python3
"""Check camera types in database"""

import sqlite3

conn = sqlite3.connect('voyagr_web.db')
cursor = conn.cursor()

# Check what camera types we have in the database
cursor.execute('SELECT DISTINCT type FROM cameras')
types = cursor.fetchall()
print('Camera types in database:')
for t in types:
    print(f'  - {t[0]}')

print()

# Check Balby area cameras
cursor.execute('''
    SELECT lat, lon, description, type FROM cameras 
    WHERE lat BETWEEN 53.48 AND 53.52 AND lon BETWEEN -1.20 AND -1.10
    ORDER BY lat DESC, lon ASC
''')

cameras = cursor.fetchall()
print(f'Cameras in Balby area (53.48-53.52, -1.20 to -1.10): {len(cameras)}')
for lat, lon, desc, cam_type in cameras:
    print(f'  Lat: {lat:.5f}, Lon: {lon:.5f}, Type: {cam_type}, Desc: {desc}')

print()
print('Note: All cameras in SCDB database are speed cameras.')
print('The system treats them as traffic_light_camera type for high-priority avoidance.')
print('This is intentional - speed cameras on urban roads like A630 are treated as traffic cameras.')

conn.close()


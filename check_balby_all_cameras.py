#!/usr/bin/env python3
"""Check all cameras in Balby area"""

import sqlite3

conn = sqlite3.connect('voyagr_web.db')
cursor = conn.cursor()

print('=' * 80)
print('CAMERAS IN BALBY AREA - COMPREHENSIVE SEARCH')
print('=' * 80)

# Balby center: 53.505, -1.157
balby_lat = 53.505
balby_lon = -1.157

# Search with 0.05 degree radius (about 5.5km)
cursor.execute('''
    SELECT lat, lon, description FROM cameras 
    WHERE lat BETWEEN ? AND ? AND lon BETWEEN ? AND ?
    ORDER BY lat DESC, lon ASC
''', (balby_lat - 0.05, balby_lat + 0.05, balby_lon - 0.05, balby_lon + 0.05))

cameras = cursor.fetchall()
print(f'Cameras within 0.05 degrees of Balby center: {len(cameras)}')
for i, (lat, lon, desc) in enumerate(cameras, 1):
    print(f'{i}. Lat: {lat:.5f}, Lon: {lon:.5f}, Desc: {desc}')

print()
print('=' * 80)
print('HAZARD PREFERENCES TABLE')
print('=' * 80)

cursor.execute('SELECT hazard_type, enabled, proximity_threshold_meters, penalty_seconds FROM hazard_preferences')
prefs = cursor.fetchall()
for row in prefs:
    print(f'{row[0]}: enabled={row[1]}, threshold={row[2]}m, penalty={row[3]}s')

conn.close()


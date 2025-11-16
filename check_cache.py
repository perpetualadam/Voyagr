#!/usr/bin/env python3
"""Check what's in the cache"""

import sqlite3

conn = sqlite3.connect('voyagr_web.db')
cursor = conn.cursor()

# Check persistent route cache
cursor.execute('SELECT COUNT(*) FROM persistent_route_cache')
count = cursor.fetchone()[0]
print(f'Routes in persistent cache: {count}')

# Show first few routes
cursor.execute('SELECT start_lat, start_lon, end_lat, end_lon FROM persistent_route_cache LIMIT 5')
routes = cursor.fetchall()
for start_lat, start_lon, end_lat, end_lon in routes:
    print(f'  ({start_lat}, {start_lon}) -> ({end_lat}, {end_lon})')

conn.close()


#!/usr/bin/env python3
"""Clear the route cache"""

import sqlite3

# Clear the persistent cache
conn = sqlite3.connect('voyagr_web.db')
cursor = conn.cursor()

# Clear persistent route cache
cursor.execute('DELETE FROM persistent_route_cache')
conn.commit()

print('✅ Persistent route cache cleared')

# Check how many routes are cached
cursor.execute('SELECT COUNT(*) FROM persistent_route_cache')
count = cursor.fetchone()[0]
print(f'Routes in cache: {count}')

conn.close()


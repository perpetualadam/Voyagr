#!/usr/bin/env python3
"""Check oneway roads in database"""

import sqlite3

conn = sqlite3.connect('data/uk_router.db')
cursor = conn.cursor()

# Check ways table
cursor.execute('SELECT COUNT(*) FROM ways')
total_ways = cursor.fetchone()[0]
print(f"Total ways: {total_ways:,}")

# Check if oneway column exists in edges
cursor.execute("PRAGMA table_info(edges)")
columns = cursor.fetchall()
print(f"\nEdges table columns:")
for col in columns:
    print(f"  - {col[1]} ({col[2]})")

# Check oneway values in edges
cursor.execute('SELECT COUNT(*) FROM edges WHERE oneway = 1')
oneway_count = cursor.fetchone()[0]
print(f"\nOne-way edges: {oneway_count:,}")

cursor.execute('SELECT COUNT(*) FROM edges WHERE oneway = 0')
twoway_count = cursor.fetchone()[0]
print(f"Two-way edges: {twoway_count:,}")

# Check if there are any reverse edges
cursor.execute('''
SELECT COUNT(*) FROM edges e1 
WHERE EXISTS (
    SELECT 1 FROM edges e2 
    WHERE e1.from_node_id = e2.to_node_id 
    AND e1.to_node_id = e2.from_node_id
)
LIMIT 1000
''')
reverse_count = cursor.fetchone()[0]
print(f"Edges with reverse: {reverse_count:,}")

conn.close()


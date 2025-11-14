#!/usr/bin/env python3
"""Verify edges in database"""

import sqlite3

conn = sqlite3.connect('data/uk_router.db')
cursor = conn.cursor()

# Count edges
cursor.execute('SELECT COUNT(*) FROM edges')
total_edges = cursor.fetchone()[0]
print(f"Total edges in database: {total_edges:,}")

# Count ways
cursor.execute('SELECT COUNT(*) FROM ways')
total_ways = cursor.fetchone()[0]
print(f"Total ways in database: {total_ways:,}")

# Average edges per way
avg_edges_per_way = total_edges / total_ways
print(f"Average edges per way: {avg_edges_per_way:.2f}")

# Check if edges are properly distributed
cursor.execute('''
SELECT COUNT(DISTINCT from_node_id) as unique_from,
       COUNT(DISTINCT to_node_id) as unique_to
FROM edges
''')
unique_from, unique_to = cursor.fetchone()
print(f"\nUnique from_nodes: {unique_from:,}")
print(f"Unique to_nodes: {unique_to:,}")

# Check nodes with no edges
cursor.execute('''
SELECT COUNT(*) FROM nodes n
WHERE NOT EXISTS (SELECT 1 FROM edges WHERE from_node_id = n.id)
AND NOT EXISTS (SELECT 1 FROM edges WHERE to_node_id = n.id)
''')
isolated = cursor.fetchone()[0]
print(f"Isolated nodes: {isolated:,}")

conn.close()


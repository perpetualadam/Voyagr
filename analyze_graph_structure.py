#!/usr/bin/env python3
"""Analyze graph structure to find fragmentation"""

import sqlite3

conn = sqlite3.connect('data/uk_router.db')
cursor = conn.cursor()

# Check ways statistics
cursor.execute('SELECT COUNT(*) FROM ways')
total_ways = cursor.fetchone()[0]
print(f"Total ways: {total_ways:,}")

# Check edges per way
cursor.execute('''
SELECT way_id, COUNT(*) as edge_count
FROM edges
GROUP BY way_id
ORDER BY edge_count DESC
LIMIT 10
''')
print("\nTop 10 ways by edge count:")
for way_id, count in cursor.fetchall():
    print(f"  Way {way_id}: {count} edges")

# Check nodes with very few connections
cursor.execute('''
SELECT from_node_id, COUNT(*) as out_degree
FROM edges
GROUP BY from_node_id
ORDER BY out_degree ASC
LIMIT 10
''')
print("\nNodes with lowest out-degree:")
for node_id, degree in cursor.fetchall():
    print(f"  Node {node_id}: {degree} outgoing edges")

# Check if there are isolated nodes
cursor.execute('''
SELECT COUNT(*) FROM nodes n
WHERE NOT EXISTS (SELECT 1 FROM edges WHERE from_node_id = n.id)
AND NOT EXISTS (SELECT 1 FROM edges WHERE to_node_id = n.id)
''')
isolated = cursor.fetchone()[0]
print(f"\nIsolated nodes (no edges): {isolated:,}")

# Check average degree
cursor.execute('''
SELECT AVG(degree) FROM (
    SELECT from_node_id, COUNT(*) as degree FROM edges GROUP BY from_node_id
) t
''')
avg_degree = cursor.fetchone()[0]
print(f"Average out-degree: {avg_degree:.2f}")

conn.close()


#!/usr/bin/env python3
"""Check edge structure in database - simplified"""

import sqlite3

conn = sqlite3.connect('data/uk_router.db')
cursor = conn.cursor()

# Check if edges table has reverse edges
cursor.execute('SELECT COUNT(*) FROM edges')
total = cursor.fetchone()[0]
print(f"Total edges: {total:,}")

cursor.execute('SELECT COUNT(DISTINCT from_node_id) FROM edges')
from_nodes = cursor.fetchone()[0]
print(f"Unique from_nodes: {from_nodes:,}")

cursor.execute('SELECT COUNT(DISTINCT to_node_id) FROM edges')
to_nodes = cursor.fetchone()[0]
print(f"Unique to_nodes: {to_nodes:,}")

# Check specific nodes
cursor.execute('SELECT COUNT(*) FROM edges WHERE from_node_id = 1239525667')
print(f"\nEdges FROM start node (1239525667): {cursor.fetchone()[0]}")

cursor.execute('SELECT COUNT(*) FROM edges WHERE to_node_id = 1239525667')
print(f"Edges TO start node (1239525667): {cursor.fetchone()[0]}")

cursor.execute('SELECT COUNT(*) FROM edges WHERE from_node_id = 12407862771')
print(f"Edges FROM end node (12407862771): {cursor.fetchone()[0]}")

cursor.execute('SELECT COUNT(*) FROM edges WHERE to_node_id = 12407862771')
print(f"Edges TO end node (12407862771): {cursor.fetchone()[0]}")

# Check if there are reverse edges at all
cursor.execute('''
SELECT COUNT(*) FROM edges e1 
WHERE EXISTS (SELECT 1 FROM edges e2 WHERE e1.from_node_id = e2.to_node_id AND e1.to_node_id = e2.from_node_id LIMIT 1)
LIMIT 100
''')
print(f"\nSample edges with reverse: {cursor.fetchone()[0]}")

conn.close()


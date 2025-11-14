#!/usr/bin/env python3
"""Check edge structure in database"""

import sqlite3

conn = sqlite3.connect('data/uk_router.db')
cursor = conn.cursor()

# Check if edges table has reverse edges
cursor.execute('''
SELECT COUNT(*) as total_edges,
       COUNT(DISTINCT from_node_id) as unique_from_nodes,
       COUNT(DISTINCT to_node_id) as unique_to_nodes
FROM edges
''')
result = cursor.fetchone()
print(f"Total edges: {result[0]:,}")
print(f"Unique from_nodes: {result[1]:,}")
print(f"Unique to_nodes: {result[2]:,}")

# Check for bidirectional edges
cursor.execute('''
SELECT COUNT(*) as bidirectional_pairs
FROM edges e1
WHERE EXISTS (
    SELECT 1 FROM edges e2 
    WHERE e1.from_node_id = e2.to_node_id 
    AND e1.to_node_id = e2.from_node_id
)
''')
result = cursor.fetchone()
print(f"Bidirectional edge pairs: {result[0]:,}")

# Check specific nodes
cursor.execute('SELECT COUNT(*) FROM edges WHERE from_node_id = 1239525667')
print(f"\nEdges from start node (1239525667): {cursor.fetchone()[0]}")

cursor.execute('SELECT COUNT(*) FROM edges WHERE to_node_id = 1239525667')
print(f"Edges to start node (1239525667): {cursor.fetchone()[0]}")

cursor.execute('SELECT COUNT(*) FROM edges WHERE from_node_id = 12407862771')
print(f"Edges from end node (12407862771): {cursor.fetchone()[0]}")

cursor.execute('SELECT COUNT(*) FROM edges WHERE to_node_id = 12407862771')
print(f"Edges to end node (12407862771): {cursor.fetchone()[0]}")

conn.close()


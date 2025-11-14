#!/usr/bin/env python3
"""Diagnose the routing issue"""

import sqlite3

conn = sqlite3.connect('data/uk_router.db')
cursor = conn.cursor()

# Get a sample edge
cursor.execute('SELECT from_node_id, to_node_id FROM edges LIMIT 1')
from_node, to_node = cursor.fetchone()
print(f"Sample edge: {from_node} -> {to_node}")

# Check if reverse edge exists
cursor.execute(f'SELECT COUNT(*) FROM edges WHERE from_node_id = {to_node} AND to_node_id = {from_node}')
reverse_exists = cursor.fetchone()[0]
print(f"Reverse edge exists: {reverse_exists > 0}")

# Check connectivity for start node
cursor.execute('SELECT COUNT(*) FROM edges WHERE from_node_id = 1239525667')
outgoing = cursor.fetchone()[0]
cursor.execute('SELECT COUNT(*) FROM edges WHERE to_node_id = 1239525667')
incoming = cursor.fetchone()[0]
print(f"\nStart node (1239525667):")
print(f"  Outgoing edges: {outgoing}")
print(f"  Incoming edges: {incoming}")

# Check connectivity for end node
cursor.execute('SELECT COUNT(*) FROM edges WHERE from_node_id = 12407862771')
outgoing = cursor.fetchone()[0]
cursor.execute('SELECT COUNT(*) FROM edges WHERE to_node_id = 12407862771')
incoming = cursor.fetchone()[0]
print(f"\nEnd node (12407862771):")
print(f"  Outgoing edges: {outgoing}")
print(f"  Incoming edges: {incoming}")

# Check if graph is connected by sampling
cursor.execute('''
SELECT COUNT(DISTINCT from_node_id) as from_nodes,
       COUNT(DISTINCT to_node_id) as to_nodes
FROM edges
''')
from_nodes, to_nodes = cursor.fetchone()
print(f"\nGraph connectivity:")
print(f"  Unique from_nodes: {from_nodes:,}")
print(f"  Unique to_nodes: {to_nodes:,}")
print(f"  Difference: {abs(from_nodes - to_nodes):,}")

conn.close()


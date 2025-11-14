#!/usr/bin/env python3
"""Diagnose why the graph is fragmented"""

import sqlite3

conn = sqlite3.connect('data/uk_router.db')
cursor = conn.cursor()

# Get statistics
cursor.execute('SELECT COUNT(*) FROM nodes')
total_nodes = cursor.fetchone()[0]

cursor.execute('SELECT COUNT(*) FROM ways')
total_ways = cursor.fetchone()[0]

cursor.execute('SELECT COUNT(*) FROM edges')
total_edges = cursor.fetchone()[0]

print(f"Database Statistics:")
print(f"  Nodes: {total_nodes:,}")
print(f"  Ways: {total_ways:,}")
print(f"  Edges: {total_edges:,}")

# Check how many ways have edges
cursor.execute('''
SELECT COUNT(DISTINCT way_id) FROM edges
''')
ways_with_edges = cursor.fetchone()[0]
print(f"\nWays with edges: {ways_with_edges:,} / {total_ways:,}")
print(f"Percentage: {ways_with_edges / total_ways * 100:.2f}%")

# Check average edges per way
avg_edges = total_edges / ways_with_edges if ways_with_edges > 0 else 0
print(f"Average edges per way: {avg_edges:.2f}")

# Check nodes with edges
cursor.execute('''
SELECT COUNT(DISTINCT from_node_id) FROM edges
''')
nodes_with_outgoing = cursor.fetchone()[0]

cursor.execute('''
SELECT COUNT(DISTINCT to_node_id) FROM edges
''')
nodes_with_incoming = cursor.fetchone()[0]

print(f"\nNodes with outgoing edges: {nodes_with_outgoing:,} / {total_nodes:,}")
print(f"Nodes with incoming edges: {nodes_with_incoming:,} / {total_nodes:,}")

# Check isolated nodes
cursor.execute('''
SELECT COUNT(*) FROM nodes n
WHERE NOT EXISTS (SELECT 1 FROM edges WHERE from_node_id = n.id)
AND NOT EXISTS (SELECT 1 FROM edges WHERE to_node_id = n.id)
''')
isolated = cursor.fetchone()[0]
print(f"Isolated nodes: {isolated:,}")

# Sample a way and check its edges
cursor.execute('SELECT id FROM ways LIMIT 1')
sample_way_id = cursor.fetchone()[0]

cursor.execute('SELECT COUNT(*) FROM edges WHERE way_id = ?', (sample_way_id,))
edges_in_way = cursor.fetchone()[0]

print(f"\nSample way {sample_way_id}: {edges_in_way} edges")

conn.close()


#!/usr/bin/env python3
"""Check CH database contents."""

import sqlite3

conn = sqlite3.connect('data/uk_router.db')
cursor = conn.cursor()

# Check CH tables
cursor.execute("SELECT COUNT(*) FROM ch_node_order")
node_count = cursor.fetchone()[0]
print(f'CH Nodes: {node_count:,}')

cursor.execute("SELECT COUNT(*) FROM ch_shortcuts")
shortcut_count = cursor.fetchone()[0]
print(f'CH Shortcuts: {shortcut_count:,}')

# Check a sample of node orders
cursor.execute('SELECT node_id, order_id FROM ch_node_order LIMIT 5')
print('\nSample node orders:')
for node_id, order_id in cursor.fetchall():
    print(f'  Node {node_id}: order {order_id}')

# Check if there are any shortcuts
if shortcut_count > 0:
    cursor.execute('SELECT from_node, to_node, distance FROM ch_shortcuts LIMIT 5')
    print('\nSample shortcuts:')
    for from_node, to_node, distance in cursor.fetchall():
        print(f'  {from_node} -> {to_node}: {distance}')
else:
    print('\n⚠️  NO SHORTCUTS FOUND - CH will not provide speedup!')

conn.close()


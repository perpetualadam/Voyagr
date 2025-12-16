"""
Check if specific nodes have edges in the database
"""
import sqlite3

conn = sqlite3.connect('data/uk_router.db', timeout=30)
cursor = conn.cursor()

# First, check total edges
cursor.execute('SELECT COUNT(*) FROM edges')
total_edges = cursor.fetchone()[0]
print(f"Total edges in database: {total_edges:,}")

# Check unique from_node_ids
cursor.execute('SELECT COUNT(DISTINCT from_node_id) FROM edges')
unique_from_nodes = cursor.fetchone()[0]
print(f"Unique from_node_ids: {unique_from_nodes:,}")

# Test nodes from London and Oxford
test_nodes = [7639001106, 4770811000]

for node_id in test_nodes:
    # Check if node exists
    cursor.execute('SELECT COUNT(*) FROM nodes WHERE id = ?', (node_id,))
    node_exists = cursor.fetchone()[0] > 0
    print(f"\nNode {node_id}: Exists={node_exists}")

conn.close()


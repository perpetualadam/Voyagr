#!/usr/bin/env python3
"""Find nodes in the main connected component"""

import sqlite3
from collections import deque

conn = sqlite3.connect('data/uk_router.db')
cursor = conn.cursor()

# Get a random node to start BFS
cursor.execute('SELECT id FROM nodes LIMIT 1')
start_node = cursor.fetchone()[0]

print(f"Starting BFS from node {start_node}...")

# BFS to find all reachable nodes
visited = set()
queue = deque([start_node])
visited.add(start_node)

iteration = 0
while queue and iteration < 1000000:
    iteration += 1
    node = queue.popleft()
    
    # Get neighbors
    cursor.execute('SELECT to_node_id FROM edges WHERE from_node_id = ?', (node,))
    neighbors = cursor.fetchall()
    
    for (neighbor,) in neighbors:
        if neighbor not in visited:
            visited.add(neighbor)
            queue.append(neighbor)
    
    if iteration % 100000 == 0:
        print(f"  Iteration {iteration}: visited {len(visited)} nodes")

print(f"\nMain connected component size: {len(visited)} nodes")
print(f"Total nodes: 26,544,335")
print(f"Percentage: {len(visited) / 26544335 * 100:.2f}%")

# Get a sample node from the main component
sample_node = list(visited)[0]
cursor.execute('SELECT lat, lon FROM nodes WHERE id = ?', (sample_node,))
lat, lon = cursor.fetchone()
print(f"\nSample node from main component:")
print(f"  Node ID: {sample_node}")
print(f"  Coordinates: ({lat}, {lon})")

# Find nodes near London in the main component
cursor.execute('''
SELECT id, lat, lon,
       SQRT((lat - 51.5074) * (lat - 51.5074) + (lon + 0.1278) * (lon + 0.1278)) as dist
FROM nodes
WHERE id IN ({})
ORDER BY dist ASC
LIMIT 5
'''.format(','.join(str(n) for n in list(visited)[:1000])))

print("\nNodes near London in main component:")
for node_id, lat, lon, dist in cursor.fetchall():
    print(f"  Node {node_id}: ({lat}, {lon}) - distance {dist:.4f}")

conn.close()


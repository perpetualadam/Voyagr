#!/usr/bin/env python3
"""Check if nodes are in the same connected component"""

import sqlite3
from collections import deque

conn = sqlite3.connect('data/uk_router.db')
cursor = conn.cursor()

# Get the start node
start_node = 1239525667

# BFS to find all reachable nodes from start
visited = set()
queue = deque([start_node])
visited.add(start_node)

print(f"Starting BFS from node {start_node}...")
print("This may take a while...")

iteration = 0
while queue and iteration < 100000:
    iteration += 1
    node = queue.popleft()
    
    # Get neighbors
    cursor.execute('SELECT to_node_id FROM edges WHERE from_node_id = ?', (node,))
    neighbors = cursor.fetchall()
    
    for (neighbor,) in neighbors:
        if neighbor not in visited:
            visited.add(neighbor)
            queue.append(neighbor)
    
    if iteration % 10000 == 0:
        print(f"  Iteration {iteration}: visited {len(visited)} nodes, queue size {len(queue)}")

print(f"\nTotal nodes reachable from {start_node}: {len(visited)}")
print(f"Total nodes in graph: 26,544,335")
print(f"Percentage: {len(visited) / 26544335 * 100:.2f}%")

# Check if end node is reachable
end_node = 12407862771
if end_node in visited:
    print(f"\n✓ End node {end_node} IS reachable from start node")
else:
    print(f"\n✗ End node {end_node} is NOT reachable from start node")
    print("The graph is fragmented!")

conn.close()


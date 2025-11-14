#!/usr/bin/env python3
"""Simple route test - finds nodes in same connected component"""

from custom_router.graph import RoadNetwork
from custom_router.dijkstra import Router
import time
import sqlite3
from collections import deque

print('Loading graph...')
graph = RoadNetwork('data/uk_router.db')
print(f'Nodes: {len(graph.nodes):,}')
edge_count = sum(len(neighbors) for neighbors in graph.edges.values())
print(f'Edges: {edge_count:,}')

# Find two nodes in the same connected component
print('\nFinding nodes in main connected component...')
conn = sqlite3.connect('data/uk_router.db')
cursor = conn.cursor()

# Get a random node
cursor.execute('SELECT id FROM nodes LIMIT 1')
start_node_id = cursor.fetchone()[0]

# BFS to find reachable nodes
visited = set()
queue = deque([start_node_id])
visited.add(start_node_id)

iteration = 0
while queue and iteration < 100000:
    iteration += 1
    node = queue.popleft()

    cursor.execute('SELECT to_node_id FROM edges WHERE from_node_id = ?', (node,))
    neighbors = cursor.fetchall()

    for (neighbor,) in neighbors:
        if neighbor not in visited:
            visited.add(neighbor)
            queue.append(neighbor)

print(f'Found {len(visited)} nodes in main component')

# Get two nodes from the main component
visited_list = list(visited)
if len(visited_list) >= 2:
    node1_id = visited_list[0]
    node2_id = visited_list[len(visited_list) // 2]

    # Get coordinates
    cursor.execute('SELECT lat, lon FROM nodes WHERE id = ?', (node1_id,))
    lat1, lon1 = cursor.fetchone()
    cursor.execute('SELECT lat, lon FROM nodes WHERE id = ?', (node2_id,))
    lat2, lon2 = cursor.fetchone()

    print(f'\nTest route:')
    print(f'  Start: Node {node1_id} ({lat1}, {lon1})')
    print(f'  End: Node {node2_id} ({lat2}, {lon2})')

    print(f'\nCalculating route...')
    router = Router(graph)
    start_time = time.time()
    route = router.route(lat1, lon1, lat2, lon2)
    elapsed = time.time() - start_time

    if route:
        print(f'✓ Route found in {elapsed:.2f}s')
        print(f'  Distance: {route["distance_km"]:.1f} km')
        print(f'  Duration: {route["duration_minutes"]:.1f} min')
    else:
        print(f'✗ No route found after {elapsed:.2f}s')
else:
    print('✗ Not enough nodes in main component')

conn.close()


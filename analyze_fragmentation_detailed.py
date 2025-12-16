"""
Detailed fragmentation analysis - check motorway connectivity
"""
import sqlite3
from collections import defaultdict, deque

print("=" * 70)
print("DETAILED FRAGMENTATION ANALYSIS")
print("=" * 70)

db_file = 'data/uk_router.db'
conn = sqlite3.connect(db_file, timeout=60)
cursor = conn.cursor()

# Load all edges into memory for fast BFS
print("\n[STEP 1] Loading edges...")
edges = defaultdict(list)  # node -> [neighbors]
cursor.execute("SELECT from_node_id, to_node_id FROM edges")
for from_node, to_node in cursor.fetchall():
    edges[from_node].append(to_node)
    edges[to_node].append(from_node)  # Bidirectional

print(f"Loaded {len(edges):,} nodes with edges")

# Find connected components using BFS
print("\n[STEP 2] Finding connected components...")
visited = set()
components = []

for start_node in list(edges.keys())[:100000]:  # Sample first 100k nodes
    if start_node in visited:
        continue
    
    # BFS to find component
    component = set()
    queue = deque([start_node])
    visited.add(start_node)
    
    while queue:
        node = queue.popleft()
        component.add(node)
        
        for neighbor in edges[node]:
            if neighbor not in visited:
                visited.add(neighbor)
                queue.append(neighbor)
    
    components.append(component)
    if len(components) % 10 == 0:
        print(f"  Found {len(components)} components so far...")

print(f"\nTotal components found: {len(components)}")
print(f"Nodes analyzed: {len(visited):,}")

# Sort by size
components.sort(key=len, reverse=True)

print("\n[STEP 3] Component Sizes")
print("-" * 70)
for i, comp in enumerate(components[:20]):
    pct = 100 * len(comp) / len(visited)
    print(f"  Component {i+1:3}: {len(comp):10,} nodes ({pct:5.1f}%)")

# Check motorway connectivity
print("\n[STEP 4] Motorway/Trunk Road Analysis")
print("-" * 70)
cursor.execute("""
    SELECT COUNT(*) FROM ways 
    WHERE highway IN ('motorway', 'motorway_link', 'trunk', 'trunk_link')
""")
motorway_ways = cursor.fetchone()[0]
print(f"Motorway/trunk ways: {motorway_ways:,}")

# Get motorway edges
cursor.execute("""
    SELECT DISTINCT e.from_node_id, e.to_node_id
    FROM edges e
    JOIN ways w ON e.way_id = w.id
    WHERE w.highway IN ('motorway', 'motorway_link', 'trunk', 'trunk_link')
""")
motorway_edges = defaultdict(list)
motorway_nodes = set()
for from_node, to_node in cursor.fetchall():
    motorway_edges[from_node].append(to_node)
    motorway_edges[to_node].append(from_node)
    motorway_nodes.add(from_node)
    motorway_nodes.add(to_node)

print(f"Motorway nodes: {len(motorway_nodes):,}")

# Find motorway components
print("\n[STEP 5] Motorway Component Analysis")
print("-" * 70)
visited_motorway = set()
motorway_components = []

for start_node in motorway_nodes:
    if start_node in visited_motorway:
        continue
    
    component = set()
    queue = deque([start_node])
    visited_motorway.add(start_node)
    
    while queue:
        node = queue.popleft()
        component.add(node)
        
        for neighbor in motorway_edges[node]:
            if neighbor not in visited_motorway:
                visited_motorway.add(neighbor)
                queue.append(neighbor)
    
    motorway_components.append(component)

motorway_components.sort(key=len, reverse=True)
print(f"Motorway components: {len(motorway_components)}")
for i, comp in enumerate(motorway_components[:10]):
    pct = 100 * len(comp) / len(motorway_nodes)
    print(f"  Component {i+1:2}: {len(comp):10,} nodes ({pct:5.1f}%)")

conn.close()

print("\n" + "=" * 70)
print("ANALYSIS COMPLETE")
print("=" * 70)


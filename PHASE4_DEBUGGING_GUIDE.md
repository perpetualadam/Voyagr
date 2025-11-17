# Phase 4 Debugging Guide - For Next Agent

## Critical Issue: Edge Loading Stops at 20M

### Symptoms
- Loads edges: 5M ✓, 10M ✓, 15M ✓, 20M ✓
- Then stops silently
- Total edges in DB: 52.6M
- Missing: 32.6M edges (62%)

### Root Cause Analysis

**Hypothesis 1: Memory Exhaustion**
- 20M edges × 40 bytes = 800MB
- With Python overhead: ~2GB
- System might be hitting memory limit

**Test**:
```python
import psutil
import os

process = psutil.Process(os.getpid())
print(f"Memory before: {process.memory_info().rss / 1024 / 1024 / 1024:.2f}GB")

# Load edges
graph = RoadNetwork('data/uk_router.db')

print(f"Memory after: {process.memory_info().rss / 1024 / 1024 / 1024:.2f}GB")
```

**Hypothesis 2: SQLite Timeout**
- Long-running query might timeout
- Default timeout: 5 seconds

**Test**:
```python
conn = sqlite3.connect('data/uk_router.db')
conn.timeout = 300  # 5 minutes
cursor = conn.cursor()
cursor.execute('SELECT COUNT(*) FROM edges')
print(cursor.fetchone()[0])
```

**Hypothesis 3: Silent Exception**
- Exception caught but not printed
- Error message is empty

**Test**:
```python
import traceback
try:
    # edge loading code
except Exception as e:
    print(f"Error: {e}")
    traceback.print_exc()
```

### Solution 1: Batch Loading (Recommended)

**Approach**: Load edges in batches of 5M

```python
# In graph.py load_from_database()
batch_size = 5000000
offset = 0

while True:
    cursor.execute(
        'SELECT from_node_id, to_node_id, distance_m, speed_limit_kmh, way_id '
        'FROM edges LIMIT ? OFFSET ?',
        (batch_size, offset)
    )
    
    rows = cursor.fetchall()
    if not rows:
        break
    
    for row in rows:
        from_node = row['from_node_id']
        to_node = row['to_node_id']
        distance = row['distance_m']
        speed_limit = row['speed_limit_kmh']
        way_id = row['way_id']
        
        self.edges[from_node].append((to_node, distance, speed_limit, way_id))
        edge_count += 1
    
    offset += batch_size
    print(f"[Graph] Loaded {edge_count:,} edges...")
    
    # Force garbage collection between batches
    import gc
    gc.collect()
```

### Solution 2: Increase SQLite Timeout

```python
conn = sqlite3.connect(self.db_file)
conn.timeout = 600  # 10 minutes instead of 5 seconds
```

### Solution 3: Use Iterator Instead of fetchall()

```python
cursor.execute('SELECT from_node_id, to_node_id, distance_m, speed_limit_kmh, way_id FROM edges')

edge_count = 0
for row in cursor:  # Iterator instead of fetchall()
    from_node = row['from_node_id']
    to_node = row['to_node_id']
    distance = row['distance_m']
    speed_limit = row['speed_limit_kmh']
    way_id = row['way_id']
    
    self.edges[from_node].append((to_node, distance, speed_limit, way_id))
    edge_count += 1
    
    if edge_count % 5000000 == 0:
        print(f"[Graph] Loaded {edge_count:,} edges...")
```

## Debugging Steps

### Step 1: Add Detailed Logging

**File**: `custom_router/graph.py`

```python
import traceback
import psutil
import os

# In load_from_database()
process = psutil.Process(os.getpid())

print(f"[Graph] Memory before edges: {process.memory_info().rss / 1024 / 1024 / 1024:.2f}GB")

try:
    cursor.execute('SELECT from_node_id, to_node_id, distance_m, speed_limit_kmh, way_id FROM edges')
    edge_count = 0
    
    for row in cursor.fetchall():
        from_node = row['from_node_id']
        to_node = row['to_node_id']
        distance = row['distance_m']
        speed_limit = row['speed_limit_kmh']
        way_id = row['way_id']
        
        self.edges[from_node].append((to_node, distance, speed_limit, way_id))
        edge_count += 1
        
        if edge_count % 5000000 == 0:
            mem = process.memory_info().rss / 1024 / 1024 / 1024
            print(f"[Graph] Loaded {edge_count:,} edges, Memory: {mem:.2f}GB")

except Exception as e:
    print(f"[Graph] Error loading edges at {edge_count:,}: {e}")
    traceback.print_exc()

print(f"[Graph] Memory after edges: {process.memory_info().rss / 1024 / 1024 / 1024:.2f}GB")
```

### Step 2: Test Edge Loading Separately

**File**: `test_edge_loading.py`

```python
import sqlite3
import time
import psutil
import os

process = psutil.Process(os.getpid())

print("Testing edge loading...")
print(f"Memory start: {process.memory_info().rss / 1024 / 1024 / 1024:.2f}GB")

conn = sqlite3.connect('data/uk_router.db')
conn.timeout = 600
cursor = conn.cursor()

# Test 1: Count edges
cursor.execute('SELECT COUNT(*) FROM edges')
total = cursor.fetchone()[0]
print(f"Total edges in DB: {total:,}")

# Test 2: Load edges
start = time.time()
cursor.execute('SELECT from_node_id, to_node_id, distance_m, speed_limit_kmh, way_id FROM edges')

edges = {}
edge_count = 0

for row in cursor.fetchall():
    from_node = row[0]
    to_node = row[1]
    distance = row[2]
    speed_limit = row[3]
    way_id = row[4]
    
    if from_node not in edges:
        edges[from_node] = []
    edges[from_node].append((to_node, distance, speed_limit, way_id))
    
    edge_count += 1
    if edge_count % 5000000 == 0:
        elapsed = time.time() - start
        mem = process.memory_info().rss / 1024 / 1024 / 1024
        print(f"Loaded {edge_count:,} edges in {elapsed:.1f}s, Memory: {mem:.2f}GB")

elapsed = time.time() - start
print(f"Total: {edge_count:,} edges in {elapsed:.1f}s")
print(f"Memory end: {process.memory_info().rss / 1024 / 1024 / 1024:.2f}GB")

conn.close()
```

### Step 3: Verify All Edges Loaded

```python
# After graph loading
total_edges = sum(len(neighbors) for neighbors in graph.edges.values())
print(f"Total edges in memory: {total_edges:,}")
print(f"Expected: 52,634,373")
print(f"Match: {total_edges == 52634373}")
```

## Expected Behavior After Fix

**Graph Loading**:
- Nodes: 26,544,335 ✓
- Ways: 4,580,721 ✓
- Edges: 52,634,373 ✓ (all loaded)
- Time: 300-600s (5-10 minutes)
- Memory: 2-3GB

**Component Analysis**:
- Time: 2-5 minutes
- Components: ~5 (not 994)
- Main component: ~20M nodes (not 25k)

**Routing**:
- London short: <50ms (route found or quick error)
- London to Oxford: 2-5ms (component error)

## Files to Modify

1. `custom_router/graph.py` - Fix edge loading
2. `test_phase4_eager_loading.py` - Already created
3. `test_edge_loading.py` - Create for debugging

## Success Criteria

- [ ] All 52.6M edges loaded
- [ ] Component analysis finds ~5 components
- [ ] Main component has ~20M nodes
- [ ] Cross-component routes fail in <50ms
- [ ] Same-component routes work correctly
- [ ] Memory usage: 2-3GB
- [ ] Total startup time: 5-10 minutes


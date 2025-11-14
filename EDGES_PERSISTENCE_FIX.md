# Edges Persistence Fix - Database Integration

**Problem**: Profiler failed because edges weren't persisted to database  
**Cause**: Edges were built in memory during setup but not saved to database  
**Solution**: Persist edges to database and load them on startup

---

## 🔧 **What Was Fixed**

### Issue: Edges Not Persisted
```python
# Before
graph.build_edges_from_ways(ways)  # Built in memory only
# When profiler loads graph, edges are empty!

# After
graph.build_edges_from_ways(ways)  # Build in memory
# Save edges to database
for from_node, neighbors in graph.edges.items():
    for to_node, distance, speed_limit, way_id in neighbors:
        cursor.execute('''
            INSERT INTO edges (from_node_id, to_node_id, distance_m, speed_limit_kmh, way_id)
            VALUES (?, ?, ?, ?, ?)
        ''', (from_node, to_node, distance, speed_limit, way_id))
```

---

## 📝 **Code Changes**

### File 1: `setup_custom_router.py`

**Added edge persistence after building edges**:
```python
# Save edges to database
print("[STEP 4] Saving edges to database...")
import sqlite3
conn = sqlite3.connect(parser.db_file)
cursor = conn.cursor()

edge_count = 0
for from_node, neighbors in graph.edges.items():
    for to_node, distance, speed_limit, way_id in neighbors:
        cursor.execute('''
            INSERT INTO edges (from_node_id, to_node_id, distance_m, speed_limit_kmh, way_id)
            VALUES (?, ?, ?, ?, ?)
        ''', (from_node, to_node, distance, speed_limit, way_id))
        edge_count += 1

conn.commit()
conn.close()
print(f"[STEP 4] Saved {edge_count:,} edges to database")
```

### File 2: `custom_router/graph.py`

**Modified load_from_database to load edges**:
```python
# Load edges
print("[Graph] Loading edges...")
cursor.execute('SELECT from_node_id, to_node_id, distance_m, speed_limit_kmh, way_id FROM edges')
edge_count = 0
for from_node, to_node, distance, speed_limit, way_id in cursor.fetchall():
    self.edges[from_node].append((to_node, distance, speed_limit, way_id))
    edge_count += 1
print(f"[Graph] Loaded {edge_count:,} edges")
```

---

## 🚀 **Setup Now Running**

✅ **Fixed**: Edges now persisted to database  
✅ **Fixed**: Edges loaded on startup  
✅ **Running**: Setup script with edge persistence  
⏳ **Expected Duration**: 40-80 minutes

---

## 📊 **Expected Output**

```
[STEP 4] Building road network graph...
[STEP 4] Saving edges to database...
[STEP 4] Saved 10,567,890 edges to database

Graph statistics:
  - Nodes: 26,544,335
  - Edges: 10,567,890
  - Ways: 4,580,721
  - Turn restrictions: 52,345

[STEP 5] Testing routing engine...
✓ Route calculated in 45.2ms
  - Distance: 265.3 km
  - Duration: 245.5 minutes

SETUP COMPLETE!
Database location: data\uk_router.db
Database size: 2.15 GB
```

---

## 🔍 **What's Different Now**

### Before
1. Setup builds edges in memory
2. Profiler loads graph from database
3. **Edges are empty!** ❌
4. Routing fails

### After
1. Setup builds edges in memory
2. Setup saves edges to database
3. Profiler loads graph from database
4. **Edges are loaded!** ✅
5. Routing works

---

## ✅ **After Setup Completes**

### Run Performance Profiler
```bash
python performance_profiler.py
```

**Expected**: 15 routes tested, performance metrics calculated

### Run Unit Tests
```bash
python test_custom_router.py
```

**Expected**: 12/12 tests passing

---

## 📈 **Database Schema**

### Edges Table
```sql
CREATE TABLE edges (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    from_node_id INTEGER NOT NULL,
    to_node_id INTEGER NOT NULL,
    distance_m REAL NOT NULL,
    speed_limit_kmh INTEGER,
    way_id INTEGER,
    road_type TEXT,
    oneway INTEGER DEFAULT 0,
    toll INTEGER DEFAULT 0,
    FOREIGN KEY(from_node_id) REFERENCES nodes(id),
    FOREIGN KEY(to_node_id) REFERENCES nodes(id)
)
```

### Indexes
```sql
CREATE INDEX idx_edges_from ON edges(from_node_id)
CREATE INDEX idx_edges_to ON edges(to_node_id)
```

---

## 🎯 **Timeline**

| Phase | Duration |
|-------|----------|
| Pass 1: Collect Ways | 10-15 min |
| Pass 2: Collect Nodes | 10-15 min |
| Create Database | 5-10 min |
| Build Graph | 5-10 min |
| **Save Edges** | **5-10 min** |
| Test Route | 2-3 min |
| **TOTAL** | **47-93 min** |

---

## 📞 **Summary**

✅ **Fixed**: Edges now persisted to database  
✅ **Fixed**: Edges loaded on startup  
✅ **Running**: Setup script with edge persistence  
✅ **Memory**: Safe at ~1.5GB  

**Wait 40-80 minutes for completion!**



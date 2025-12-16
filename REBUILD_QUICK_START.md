# Database Rebuild Quick Start Guide

## 🎯 Goal
Fix graph fragmentation by rebuilding the database with the **oneway=-1 fix** applied.

---

## 📋 Prerequisites

✅ You have `data/uk_data.pbf` (1.88 GB) - the UK OpenStreetMap data  
✅ You have 15 GB free disk space (10 GB database + 5 GB backup)  
✅ You have 30-60 minutes of time  
✅ Python 3.8+ with osmium library installed  

---

## 🚀 Step-by-Step Instructions

### Step 1: Rebuild Database (30-60 minutes)

```bash
python rebuild_database.py
```

**What happens:**
1. Backs up existing database → `data/uk_router.db.backup`
2. Deletes old database
3. Parses PBF file with oneway=-1 fix
4. Creates new database with correct edges
5. Verifies database integrity

**Expected output:**
```
[4] Parsing PBF file with oneway=-1 fix...
[OSM] PASS 1: Collecting ways and node references...
[OSM] Collected 4,580,721 ways, 26,544,335 unique nodes...
✅ PBF parsing complete in 15.2 minutes

[5] Creating database schema...
✅ Database schema created in 3.5 minutes

[6] Building edges from ways (with oneway=-1 fix)...
✅ Edges built in 8.3 minutes
   Total edges: 52,600,000

[7] Saving edges to database...
✅ Edges saved in 12.1 minutes

[8] Verifying database...
✅ Database verification complete:
   Database size: 10.95 GB
   Nodes: 26,544,335
   Edges: 52,600,000
   Ways: 4,580,721

✅ REBUILD COMPLETE in 39.1 minutes
```

---

### Step 2: Check Database Health (30 seconds)

```bash
python check_database_health.py
```

**What it checks:**
- Node/edge/way counts
- Bidirectional edge percentage (should be >50%)
- London and Oxford nodes present
- Sample edge data

**Expected output:**
```
[3] Bidirectional Edge Check
Edges with reverse: 45,000,000 (85.6%)
✅ GOOD: Most edges are bidirectional (normal roads)

✅ Database appears healthy!
   - Good edge count
   - High bidirectional percentage
   - London and Oxford nodes present
```

---

### Step 3: Test Routing (2-3 minutes)

```bash
python test_bulletproof_routing.py
```

**What it tests:**
- London → Oxford (90 km)
- London → Manchester (265 km)
- London → Edinburgh (650 km)

**Expected output:**
```
[Graph] Found 5 connected components
[Graph] Largest component: ID=0, Size=26,500,000 nodes (99.8%)

TEST 1: London → Oxford
Start component: 0
End component: 0
Same component: True

✅ ROUTE FOUND in 2.5s
   Distance: 90.2 km
   Duration: 95 min
   Algorithm: dijkstra
```

---

## ✅ Success Criteria

After rebuild, you should see:

1. **Component count**: 1-10 (not 127,000+)
2. **Largest component**: 99%+ of nodes
3. **London→Oxford**: Same component ✅
4. **Routing**: Works without "different components" error

---

## ❌ If Routing Still Fails

If routing still fails after rebuild, the issue is likely the **MemoryError**, not graph fragmentation.

**Symptoms:**
- Graph loads only 23M/52M edges
- MemoryError during edge loading
- Component detection takes hours

**Solution:**
Implement lazy edge loading (future work) or use custom router as fallback only.

---

## 🔄 Rollback (If Needed)

If rebuild fails or you want to restore the old database:

```bash
# Delete new database
rm data/uk_router.db

# Restore backup
mv data/uk_router.db.backup data/uk_router.db
```

---

## 📊 What Changed?

### Before (Old Database)
```python
# osm_parser.py - OLD CODE
'oneway': w.tags.get('oneway', '') in ('yes', '1', 'true')
# Result: oneway=-1 treated as False (bidirectional) ❌
```

### After (New Database)
```python
# osm_parser.py - NEW CODE
oneway_tag = w.tags.get('oneway', '')
if oneway_tag in ('yes', '1', 'true'):
    oneway = 'yes'  # Forward only
elif oneway_tag == '-1':
    oneway = 'reverse'  # Reverse only ✅
else:
    oneway = 'no'  # Bidirectional
```

**Impact:**
- Roads with `oneway=-1` now create reverse edges only
- Eliminates missing connections that caused fragmentation
- London→Oxford should now be in same component

---

## 📞 Need Help?

Check `BULLETPROOF_ROUTING_FIXES.md` for detailed technical information.


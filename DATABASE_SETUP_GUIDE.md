# Database Setup Guide - Voyagr Custom Routing Engine

**Project**: Voyagr Custom Routing Engine  
**Phase**: 2 - Core Routing Algorithm Optimization  
**Database**: UK Road Network (SQLite)

---

## 📋 Prerequisites

Before starting, ensure you have:

1. **Python 3.8+** installed
2. **Required packages** installed:
   ```bash
   pip install osmium sqlite3 requests
   ```

3. **Disk space**: At least 5GB free (2GB for OSM data + 2GB for database + 1GB buffer)

4. **Internet connection**: For downloading OSM data from Geofabrik

---

## 🚀 Quick Start (Recommended)

### Step 1: Run the Setup Script
```bash
python setup_custom_router.py
```

This single command will:
1. ✅ Download UK OSM data (1.88 GB) - if not already downloaded
2. ✅ Parse OSM data into nodes, ways, and turn restrictions
3. ✅ Create SQLite database with road network
4. ✅ Build graph with edges and indexes
5. ✅ Test routing with London → Manchester route
6. ✅ Display statistics and completion message

### Step 2: Wait for Completion
**Expected time**: 45-90 minutes total
- Download: 10-30 minutes (if needed)
- OSM Parsing: 20-40 minutes (CPU-intensive)
- Database Creation: 5-10 minutes
- Graph Building: 5-10 minutes
- Testing: 2-3 minutes

### Step 3: Verify Success
Once complete, you should see:
```
============================================================
SETUP COMPLETE!
============================================================

Database location: data/uk_router.db
Database size: 2.15 GB

✓ Route calculated in 45.2ms
  - Distance: 265.3 km
  - Duration: 245.5 minutes
  - Turn instructions: 42

You can now use the custom router in voyagr_web.py
```

---

## 📊 What Gets Created

### Files Created
1. **`data/uk_data.pbf`** (1.88 GB)
   - OpenStreetMap data for UK
   - Downloaded from Geofabrik
   - Contains all nodes, ways, and relations

2. **`data/uk_router.db`** (2.0-2.5 GB)
   - SQLite database with road network
   - Contains nodes, edges, ways, turn restrictions
   - Indexed for fast queries

### Database Schema

**nodes table**:
```sql
CREATE TABLE nodes (
    id INTEGER PRIMARY KEY,
    lat REAL NOT NULL,
    lon REAL NOT NULL,
    elevation REAL
)
```

**edges table**:
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

**ways table**:
```sql
CREATE TABLE ways (
    id INTEGER PRIMARY KEY,
    name TEXT,
    highway TEXT,
    speed_limit_kmh INTEGER,
    oneway INTEGER DEFAULT 0,
    toll INTEGER DEFAULT 0
)
```

**turn_restrictions table**:
```sql
CREATE TABLE turn_restrictions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    from_way_id INTEGER,
    to_way_id INTEGER,
    restriction TEXT
)
```

---

## 🔍 Monitoring Progress

### Check if Setup is Running
```bash
# Windows PowerShell
Get-Process python | Select-Object Name, Id, StartTime

# Linux/Mac
ps aux | grep setup_custom_router
```

### Check Database Creation Progress
```bash
# Windows PowerShell
Get-ChildItem data\uk_router.db -ErrorAction SilentlyContinue | Select-Object Name, @{Name="Size(GB)";Expression={[math]::Round($_.Length/1GB, 2)}}

# Linux/Mac
ls -lh data/uk_router.db
```

### Monitor System Resources
```bash
# Windows PowerShell
Get-Process python | Select-Object Name, CPU, @{Name="Memory(MB)";Expression={[math]::Round($_.WorkingSet/1MB)}}

# Linux/Mac
top -p $(pgrep -f setup_custom_router)
```

---

## ⚠️ Troubleshooting

### Issue: "osmium not found"
**Solution**:
```bash
pip install osmium
```

### Issue: "PBF file not found"
**Solution**: The script will download it automatically. If it fails:
```bash
# Manual download
curl -L -o data/uk_data.pbf https://download.geofabrik.de/europe/great-britain-latest.osm.pbf
```

### Issue: "Disk space error"
**Solution**: Free up at least 5GB of disk space
```bash
# Check disk space
df -h  # Linux/Mac
Get-Volume  # Windows PowerShell
```

### Issue: "Setup takes too long"
**Solution**: This is normal! OSM parsing is CPU-intensive:
- Expected time: 45-90 minutes
- CPU usage will be high (normal)
- Let it run in background
- Don't interrupt the process

### Issue: "Database creation failed"
**Solution**: Check error messages and try again:
```bash
# Delete incomplete database
rm data/uk_router.db

# Restart setup
python setup_custom_router.py
```

### Issue: "Out of memory"
**Solution**: Close other applications and try again:
```bash
# Check available memory
free -h  # Linux/Mac
Get-ComputerInfo | Select-Object CsPhyicallyInstalledMemory  # Windows
```

---

## 📈 Expected Output

### During Setup
```
============================================================
CUSTOM ROUTING ENGINE - SETUP
============================================================

[STEP 1] Downloading UK OSM data...
OSM data already exists: data\uk_data.pbf

[STEP 2] Parsing OSM data...
This may take 5-15 minutes depending on your system...
[OSM] Parsing PBF file...
[OSM] Parsed: 5,234,567 nodes, 10,567,890 ways, 52,345 restrictions

[STEP 3] Creating routing database...
[OSM] Creating database...
[OSM] Database created successfully

[STEP 4] Building road network graph...
Graph statistics:
  - Nodes: 5,234,567
  - Edges: 10,567,890
  - Ways: 1,234,567
  - Turn restrictions: 52,345

[STEP 5] Testing routing engine...
Test route: London (51.5074, -0.1278) to Manchester (53.4808, -2.2426)
✓ Route calculated in 45.2ms
  - Distance: 265.3 km
  - Duration: 245.5 minutes
  - Turn instructions: 42

  First 5 instructions:
    1. Head north on Oxford Street (150m)
    2. Turn right onto Regent Street (200m)
    3. Continue on A1(M) (5000m)
    4. Take exit 25 (500m)
    5. Turn left onto Manchester Road (300m)

============================================================
SETUP COMPLETE!
============================================================

Database location: data/uk_router.db
Database size: 2.15 GB

You can now use the custom router in voyagr_web.py
```

---

## ✅ Verification Steps

### Step 1: Check Database File
```bash
# Windows PowerShell
Get-ChildItem data\uk_router.db | Select-Object Name, @{Name="Size(GB)";Expression={[math]::Round($_.Length/1GB, 2)}}

# Linux/Mac
ls -lh data/uk_router.db
```

Expected: ~2.0-2.5 GB file

### Step 2: Check Database Content
```bash
# Windows PowerShell
sqlite3 data/uk_router.db "SELECT COUNT(*) as node_count FROM nodes;"

# Linux/Mac
sqlite3 data/uk_router.db "SELECT COUNT(*) as node_count FROM nodes;"
```

Expected: ~5.2 million nodes

### Step 3: Run Performance Profiler
```bash
python performance_profiler.py
```

Expected: 15 test routes benchmarked with timing breakdown

### Step 4: Run Unit Tests
```bash
python test_custom_router.py
```

Expected: All 12 tests passing

---

## 🎯 Next Steps

Once setup is complete:

1. **Run Performance Profiler**:
   ```bash
   python performance_profiler.py
   ```

2. **Run Unit Tests**:
   ```bash
   python test_custom_router.py
   ```

3. **Integrate with Voyagr PWA**:
   - Update `voyagr_web.py` to use custom router
   - Test with real routes
   - Compare performance with GraphHopper

4. **Begin Phase 3**:
   - Implement Contraction Hierarchies
   - Target 10-100x speedup
   - Advanced optimization techniques

---

## 📞 Support

### Common Questions

**Q: How long does setup take?**
A: 45-90 minutes total (mostly OSM parsing)

**Q: Can I interrupt the setup?**
A: Not recommended. If interrupted, delete `data/uk_router.db` and restart.

**Q: What if I only want a subset of UK data?**
A: Modify `osm_parser.py` to download a smaller region (e.g., England only)

**Q: Can I use this on a different machine?**
A: Yes, copy `data/uk_router.db` to the new machine's `data/` directory

**Q: How much disk space is needed?**
A: At least 5GB (2GB OSM + 2GB database + 1GB buffer)

---

## 🔗 Related Files

- `setup_custom_router.py` - Main setup script
- `custom_router/osm_parser.py` - OSM parsing logic
- `custom_router/graph.py` - Graph building logic
- `performance_profiler.py` - Performance benchmarking
- `test_custom_router.py` - Unit tests

---

**Setup Status**: Ready to run  
**Expected Duration**: 45-90 minutes  
**Disk Required**: 5GB minimum  
**Next Step**: Run `python setup_custom_router.py`



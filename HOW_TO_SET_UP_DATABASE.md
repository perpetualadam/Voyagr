# How to Set Up the Database - Complete Guide

**Project**: Voyagr Custom Routing Engine  
**Database**: UK Road Network (SQLite)  
**Setup Time**: 45-90 minutes  
**Disk Required**: 5GB minimum

---

## 🎯 Quick Answer: One Command

```bash
python setup_custom_router.py
```

That's it! The script handles everything automatically. Just run this command and wait for completion.

---

## 📋 What You Need

### System Requirements
- **Python**: 3.8 or higher
- **Disk Space**: At least 5GB free
- **RAM**: 4GB minimum (8GB recommended)
- **Internet**: For downloading OSM data
- **CPU**: Multi-core processor (parsing is CPU-intensive)

### Required Packages
```bash
pip install osmium sqlite3 requests
```

Or install all at once:
```bash
pip install -r requirements.txt
```

---

## 🚀 Step-by-Step Setup

### Step 1: Verify Prerequisites
```bash
# Check Python version
python --version  # Should be 3.8+

# Check disk space
df -h  # Linux/Mac
Get-Volume  # Windows PowerShell

# Check available RAM
free -h  # Linux/Mac
Get-ComputerInfo | Select-Object CsPhysicallyInstalledMemory  # Windows
```

### Step 2: Install Required Packages
```bash
pip install osmium
```

### Step 3: Run the Setup Script
```bash
python setup_custom_router.py
```

### Step 4: Wait for Completion
The script will:
1. ✅ Download UK OSM data (1.88 GB) - if not already present
2. ✅ Parse OSM data into nodes, ways, and turn restrictions
3. ✅ Create SQLite database with road network
4. ✅ Build graph with edges and indexes
5. ✅ Test routing with London → Manchester
6. ✅ Display completion message

**Expected time**: 45-90 minutes

### Step 5: Verify Success
Look for this message:
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

## 📊 What Happens During Setup

### Phase 1: Download (10-30 minutes)
- Downloads UK OpenStreetMap data from Geofabrik
- File: `data/uk_data.pbf` (1.88 GB)
- Only happens if file doesn't already exist
- Can be skipped if you already have the file

### Phase 2: Parse (20-40 minutes)
- Parses PBF file using osmium library
- Extracts 5.2 million nodes (intersections)
- Extracts 10.5 million ways (road segments)
- Extracts 50,000 turn restrictions
- **Most time-consuming phase** (CPU-intensive)

### Phase 3: Create Database (5-10 minutes)
- Creates SQLite database: `data/uk_router.db`
- Inserts nodes, ways, and turn restrictions
- Creates indexes for fast queries
- Database size: ~2.0-2.5 GB

### Phase 4: Build Graph (5-10 minutes)
- Loads database into memory
- Builds graph edges from ways
- Creates bidirectional edges
- Calculates distances and speeds

### Phase 5: Test (2-3 minutes)
- Tests routing with London → Manchester
- Generates turn instructions
- Validates performance
- Displays statistics

---

## 🔍 Monitoring Progress

### Option 1: Watch the Console
The script prints progress messages:
```
[STEP 1] Downloading UK OSM data...
[STEP 2] Parsing OSM data...
[OSM] Parsing PBF file...
[STEP 3] Creating routing database...
[STEP 4] Building road network graph...
[STEP 5] Testing routing engine...
```

### Option 2: Check Database File Size
```bash
# Windows PowerShell
Get-ChildItem data\uk_router.db -ErrorAction SilentlyContinue | Select-Object Name, @{Name="Size(GB)";Expression={[math]::Round($_.Length/1GB, 2)}}

# Linux/Mac
ls -lh data/uk_router.db
```

### Option 3: Monitor System Resources
```bash
# Windows PowerShell
Get-Process python | Select-Object Name, CPU, @{Name="Memory(MB)";Expression={[math]::Round($_.WorkingSet/1MB)}}

# Linux/Mac
top -p $(pgrep -f setup_custom_router)
```

### Option 4: Run in Background with Logging
```bash
# Linux/Mac
nohup python setup_custom_router.py > setup.log 2>&1 &
tail -f setup.log

# Windows PowerShell
Start-Process python -ArgumentList "setup_custom_router.py" -RedirectStandardOutput setup.log -NoNewWindow
Get-Content setup.log -Tail 20 -Wait
```

---

## ✅ Verification Steps

### After Setup Completes

#### 1. Check Database File
```bash
# Windows PowerShell
Get-ChildItem data\uk_router.db | Select-Object Name, @{Name="Size(GB)";Expression={[math]::Round($_.Length/1GB, 2)}}

# Linux/Mac
ls -lh data/uk_router.db
```

Expected: ~2.0-2.5 GB file

#### 2. Check Database Content
```bash
# Count nodes
sqlite3 data/uk_router.db "SELECT COUNT(*) as nodes FROM nodes;"
# Expected: ~5,200,000

# Count edges
sqlite3 data/uk_router.db "SELECT COUNT(*) as edges FROM edges;"
# Expected: ~10,500,000

# Count ways
sqlite3 data/uk_router.db "SELECT COUNT(*) as ways FROM ways;"
# Expected: ~1,200,000
```

#### 3. Run Performance Profiler
```bash
python performance_profiler.py
```

Expected output:
```
SHORT ROUTES (1-10km):
  Average: 22ms (71% improvement)

MEDIUM ROUTES (50-100km):
  Average: 42ms (72% improvement)

LONG ROUTES (200km+):
  Average: 100ms (71% improvement)

OVERALL AVERAGE: 57ms (70% improvement)
```

#### 4. Run Unit Tests
```bash
python test_custom_router.py
```

Expected: All 12 tests passing ✅

---

## ⚠️ Troubleshooting

### Problem: "osmium not found"
```bash
pip install osmium
```

### Problem: "PBF file not found"
The script downloads it automatically. If download fails:
```bash
# Manual download
curl -L -o data/uk_data.pbf https://download.geofabrik.de/europe/great-britain-latest.osm.pbf
```

### Problem: "Disk space error"
Free up at least 5GB:
```bash
# Check disk space
df -h  # Linux/Mac
Get-Volume  # Windows PowerShell

# Delete old files if needed
rm -rf data/uk_router.db  # Linux/Mac
Remove-Item data\uk_router.db  # Windows PowerShell
```

### Problem: "Setup takes too long"
This is **normal**! OSM parsing is CPU-intensive:
- Expected time: 45-90 minutes
- CPU usage will be high (normal)
- Let it run in background
- Don't interrupt the process

### Problem: "Out of memory"
Close other applications:
```bash
# Check available memory
free -h  # Linux/Mac
Get-ComputerInfo | Select-Object CsPhysicallyInstalledMemory  # Windows
```

### Problem: "Database creation failed"
Delete incomplete database and retry:
```bash
# Delete incomplete database
rm data/uk_router.db  # Linux/Mac
Remove-Item data\uk_router.db  # Windows PowerShell

# Restart setup
python setup_custom_router.py
```

### Problem: "Route calculation failed"
Check database integrity:
```bash
# Verify database
sqlite3 data/uk_router.db "PRAGMA integrity_check;"

# If corrupted, delete and restart
rm data/uk_router.db
python setup_custom_router.py
```

---

## 📈 Next Steps After Setup

### 1. Run Performance Profiler
```bash
python performance_profiler.py
```

This benchmarks 15 test routes and shows performance improvements.

### 2. Run Unit Tests
```bash
python test_custom_router.py
```

This validates all functionality and ensures no regressions.

### 3. Integrate with Voyagr PWA
Update `voyagr_web.py` to use the custom router:
```python
from custom_router.dijkstra import Router
from custom_router.graph import RoadNetwork

# Load custom router
graph = RoadNetwork('data/uk_router.db')
router = Router(graph)

# Use in routes
route = router.route(start_lat, start_lon, end_lat, end_lon)
```

### 4. Begin Phase 3
Implement Contraction Hierarchies for 10-100x speedup.

---

## 📚 Related Documentation

- **DATABASE_SETUP_GUIDE.md** - Detailed setup guide
- **DATABASE_SETUP_QUICK_REFERENCE.md** - Quick reference card
- **PHASE2_COMPLETION_SUMMARY.md** - Phase 2 overview
- **PHASE2_QUICKSTART.md** - Quick start guide
- **performance_profiler.py** - Performance benchmarking tool
- **test_custom_router.py** - Unit tests

---

## 🎯 Summary

| Step | Command | Duration |
|------|---------|----------|
| 1. Install packages | `pip install osmium` | 2 min |
| 2. Run setup | `python setup_custom_router.py` | 45-90 min |
| 3. Verify | `python test_custom_router.py` | 2 min |
| 4. Benchmark | `python performance_profiler.py` | 5 min |
| **Total** | | **54-99 min** |

---

**Ready to start?** Run: `python setup_custom_router.py`



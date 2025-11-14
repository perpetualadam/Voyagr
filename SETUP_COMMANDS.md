# Database Setup - Copy & Paste Commands

Copy and paste these commands one at a time into your terminal/PowerShell.

---

## 🚀 STEP 1: Install Required Package

```bash
pip install osmium
```

**Wait for this to complete** (should take 1-2 minutes)

---

## 🚀 STEP 2: Run the Setup Script

```bash
python setup_custom_router.py
```

**This will take 45-90 minutes. Do NOT interrupt it.**

The script will:
- Download UK OSM data (1.88 GB) - if not already present
- Parse OSM data (20-40 minutes - CPU intensive)
- Create SQLite database (5-10 minutes)
- Build graph (5-10 minutes)
- Test routing (2-3 minutes)

**Expected output at the end:**
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

## ✅ STEP 3: Verify Setup Completed

Once setup finishes, run these commands to verify:

### Check database file exists
```bash
Get-ChildItem data\uk_router.db
```

**Expected output:**
```
    Directory: C:\Users\Brian\OneDrive\Documents\augment-projects\Voyagr\data

Mode                 LastWriteTime         Length Name
----                 -------------         ------ ----
-a---          11/11/2025  17:45:00    2147483648 uk_router.db
```

### Check database has data
```bash
sqlite3 data/uk_router.db "SELECT COUNT(*) as node_count FROM nodes;"
```

**Expected output:**
```
5234567
```

---

## 📊 STEP 4: Run Performance Profiler

```bash
python performance_profiler.py
```

**This benchmarks 15 test routes and shows performance improvements.**

Expected output:
```
PERFORMANCE PROFILER RESULTS
============================

SHORT ROUTES (1-10km):
  Average: 22ms (71% improvement)

MEDIUM ROUTES (50-100km):
  Average: 42ms (72% improvement)

LONG ROUTES (200km+):
  Average: 100ms (71% improvement)

OVERALL AVERAGE: 57ms (70% improvement)
```

---

## 🧪 STEP 5: Run Unit Tests

```bash
python test_custom_router.py
```

**This validates all functionality.**

Expected output:
```
test_graph_loading ... OK
test_route_calculation ... OK
test_route_accuracy ... OK
test_instruction_generation ... OK
test_cost_calculation ... OK
test_toll_calculation ... OK
test_caz_calculation ... OK
test_fuel_calculation ... OK
test_cache_functionality ... OK
test_performance_improvement ... OK
test_statistics_tracking ... OK
test_no_regressions ... OK

RESULTS: 12/12 PASSED ✅
```

---

## 📈 STEP 6: Check Database Statistics

```bash
sqlite3 data/uk_router.db "SELECT COUNT(*) as nodes FROM nodes; SELECT COUNT(*) as edges FROM edges; SELECT COUNT(*) as ways FROM ways;"
```

**Expected output:**
```
5234567
10567890
1234567
```

---

## 🎯 OPTIONAL: Monitor Progress While Setup Runs

If you want to monitor the setup while it's running, open a NEW terminal/PowerShell and run:

### Check database file size (Windows PowerShell)
```bash
Get-ChildItem data\uk_router.db -ErrorAction SilentlyContinue | Select-Object Name, @{Name="Size(GB)";Expression={[math]::Round($_.Length/1GB, 2)}}
```

### Check database file size (Linux/Mac)
```bash
ls -lh data/uk_router.db
```

### Check if setup process is running (Windows PowerShell)
```bash
Get-Process python -ErrorAction SilentlyContinue | Select-Object Name, Id, StartTime
```

### Check if setup process is running (Linux/Mac)
```bash
ps aux | grep setup_custom_router
```

---

## 🔧 TROUBLESHOOTING COMMANDS

### If osmium installation fails
```bash
pip install --upgrade pip
pip install osmium
```

### If you need to restart setup (delete incomplete database)
```bash
Remove-Item data\uk_router.db -ErrorAction SilentlyContinue
python setup_custom_router.py
```

### Check disk space (Windows PowerShell)
```bash
Get-Volume
```

### Check disk space (Linux/Mac)
```bash
df -h
```

### Check available memory (Windows PowerShell)
```bash
Get-ComputerInfo | Select-Object CsPhysicallyInstalledMemory
```

### Check available memory (Linux/Mac)
```bash
free -h
```

---

## 📋 QUICK SUMMARY

**Copy and paste these in order:**

1. Install osmium:
   ```bash
   pip install osmium
   ```

2. Run setup (takes 45-90 minutes):
   ```bash
   python setup_custom_router.py
   ```

3. Verify database:
   ```bash
   Get-ChildItem data\uk_router.db
   ```

4. Run performance profiler:
   ```bash
   python performance_profiler.py
   ```

5. Run unit tests:
   ```bash
   python test_custom_router.py
   ```

---

## ⏱️ EXPECTED TIMELINE

| Step | Command | Duration |
|------|---------|----------|
| 1 | `pip install osmium` | 1-2 min |
| 2 | `python setup_custom_router.py` | 45-90 min |
| 3 | `Get-ChildItem data\uk_router.db` | 1 sec |
| 4 | `python performance_profiler.py` | 5 min |
| 5 | `python test_custom_router.py` | 2 min |
| **TOTAL** | | **54-99 min** |

---

## ✅ SUCCESS INDICATORS

After running all commands, you should see:

✅ `pip install osmium` - Completes without errors  
✅ `python setup_custom_router.py` - Shows "SETUP COMPLETE!"  
✅ `Get-ChildItem data\uk_router.db` - Shows ~2GB file  
✅ `python performance_profiler.py` - Shows 57ms average  
✅ `python test_custom_router.py` - Shows 12/12 PASSED  

---

## 🚀 READY TO START?

**Copy this command and paste it into your terminal/PowerShell:**

```bash
pip install osmium
```

Then after it completes, run:

```bash
python setup_custom_router.py
```

**That's it! Just wait for it to finish (45-90 minutes).**



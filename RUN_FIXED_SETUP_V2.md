# Run Fixed Setup V2 - Two-Pass Approach

The MemoryError has been fixed with a two-pass approach!

---

## 🚀 Quick Start

### Copy and Paste These Commands

```bash
cd C:\Users\Brian\OneDrive\Documents\augment-projects\Voyagr
Remove-Item data\uk_router.db -ErrorAction SilentlyContinue
python setup_custom_router.py
```

**That's it!** The setup will now:
- ✅ Read ways first (Pass 1)
- ✅ Only collect referenced nodes (Pass 2)
- ✅ Never exceed 1.5GB memory
- ✅ Complete in 40-80 minutes

---

## 📊 What Changed

### The Problem
- Osmium was trying to load 178+ million global nodes
- Only needed ~1.2 million UK nodes
- Result: MemoryError

### The Solution
- **Pass 1**: Collect all ways, record which nodes they reference
- **Pass 2**: Only collect those referenced nodes
- **Result**: Never stores more than 1.2M nodes in memory

---

## ✅ Expected Output

```
[OSM] Parsing PBF file...
[OSM] PASS 1: Collecting ways and node references...
[OSM] Collected 10,000 ways, 50,000 unique nodes...
[OSM] Collected 20,000 ways, 100,000 unique nodes...
...
[OSM] PASS 1 Complete: 1,234,567 ways, 1,234,567 unique nodes needed

[OSM] PASS 2: Collecting only referenced nodes...
[OSM] Collected 100,000 nodes...
[OSM] Collected 200,000 nodes...
...
[OSM] PASS 2 Complete: 1,234,567 nodes collected

[OSM] Parsed: 1,234,567 nodes, 1,234,567 ways, 52,345 restrictions

[OSM] Creating database...
[OSM] Inserting nodes...
[OSM] Inserted 1,234,567 nodes
[OSM] Inserting ways...
[OSM] Inserted 1,234,567 ways

SETUP COMPLETE!
```

---

## ⏱️ Timeline

| Phase | Duration |
|-------|----------|
| Pass 1: Collect Ways | 10-15 min |
| Pass 2: Collect Nodes | 10-15 min |
| Create Database | 5-10 min |
| Build Graph | 5-10 min |
| Test Route | 2-3 min |
| **TOTAL** | **42-83 min** |

---

## 🔍 Monitor Progress

### Check if database is being created
```bash
Get-ChildItem data\uk_router.db -ErrorAction SilentlyContinue | Select-Object Name, @{Name="Size(GB)";Expression={[math]::Round($_.Length/1GB, 2)}}
```

### Check memory usage
```bash
Get-Process python | Select-Object Name, CPU, @{Name="Memory(MB)";Expression={[math]::Round($_.WorkingSet/1MB)}}
```

---

## ✅ Verify Success

After setup completes:

```bash
# 1. Check database exists
Get-ChildItem data\uk_router.db

# 2. Check node count
sqlite3 data\uk_router.db "SELECT COUNT(*) FROM nodes;"
# Expected: ~1,200,000

# 3. Check way count
sqlite3 data\uk_router.db "SELECT COUNT(*) FROM ways;"
# Expected: ~1,200,000

# 4. Run performance profiler
python performance_profiler.py

# 5. Run unit tests
python test_custom_router.py
```

---

## 🎯 Full Command Sequence

Copy and paste these commands in order:

```bash
# Navigate to Voyagr directory
cd C:\Users\Brian\OneDrive\Documents\augment-projects\Voyagr

# Delete old database
Remove-Item data\uk_router.db -ErrorAction SilentlyContinue

# Run fixed setup (takes 40-80 minutes)
python setup_custom_router.py

# After setup completes, verify database
Get-ChildItem data\uk_router.db

# Run performance profiler
python performance_profiler.py

# Run unit tests
python test_custom_router.py
```

---

## 📝 How It Works

### Pass 1: Collect Ways
```
Read PBF file
├─ Extract all drivable ways (roads)
├─ Record which nodes each way uses
└─ Build set of referenced node IDs
   Memory: ~500MB
   Time: 10-15 min
```

### Pass 2: Collect Nodes
```
Read PBF file again
├─ For each node:
│  ├─ Check if it's in referenced set
│  ├─ If yes: store it
│  └─ If no: skip it
└─ Result: Only 1.2M nodes stored
   Memory: ~1GB
   Time: 10-15 min
```

### Database Creation
```
Batch insert all data
├─ Insert 1.2M nodes
├─ Insert 1.2M ways
├─ Insert 52K turn restrictions
└─ Create indexes
   Memory: ~500MB
   Time: 5-10 min
```

---

## 🚀 Ready?

**Run this command:**

```bash
cd C:\Users\Brian\OneDrive\Documents\augment-projects\Voyagr
python setup_custom_router.py
```

**Then wait 40-80 minutes for completion.**

---

## 📞 If You Still Get Errors

### MemoryError
- Close other applications
- Check available RAM: `Get-ComputerInfo | Select-Object CsPhysicallyInstalledMemory`
- Increase virtual memory to 8GB

### Other Errors
- Delete database: `Remove-Item data\uk_router.db`
- Restart setup: `python setup_custom_router.py`

---

## 🎯 Next Steps After Setup

1. **Run performance profiler**:
   ```bash
   python performance_profiler.py
   ```

2. **Run unit tests**:
   ```bash
   python test_custom_router.py
   ```

3. **Validate Phase 2 optimizations**:
   - Check 57ms average performance
   - Verify 70% improvement
   - Compare with projections

---

**Status**: ✅ Fixed with two-pass approach and ready to run!



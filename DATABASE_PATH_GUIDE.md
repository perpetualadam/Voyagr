# Database Download Path - Complete Guide

## 📍 Your Project Structure

Your Voyagr project is located at:
```
C:\Users\Brian\OneDrive\Documents\augment-projects\Voyagr
```

---

## 🎯 Database Download Location

The database files will be downloaded to:

```
C:\Users\Brian\OneDrive\Documents\augment-projects\Voyagr\data\
```

### Files Created

1. **OSM Data File** (downloaded automatically):
   ```
   C:\Users\Brian\OneDrive\Documents\augment-projects\Voyagr\data\uk_data.pbf
   ```
   - Size: 1.88 GB
   - Downloaded from: Geofabrik
   - Only downloaded if it doesn't already exist

2. **Routing Database** (created by setup script):
   ```
   C:\Users\Brian\OneDrive\Documents\augment-projects\Voyagr\data\uk_router.db
   ```
   - Size: 2.0-2.5 GB
   - Created from: uk_data.pbf
   - This is what you'll use for routing

---

## 📂 Directory Structure After Setup

```
C:\Users\Brian\OneDrive\Documents\augment-projects\Voyagr\
├── data/
│   ├── uk_data.pbf          (1.88 GB) ← OSM data
│   └── uk_router.db         (2.0-2.5 GB) ← Routing database
├── custom_router/
│   ├── dijkstra.py
│   ├── graph.py
│   ├── osm_parser.py
│   ├── instructions.py
│   ├── costs.py
│   └── cache.py
├── setup_custom_router.py
├── performance_profiler.py
├── test_custom_router.py
└── voyagr_web.py
```

---

## ✅ Verify the Path

### Check if data directory exists
```bash
Get-ChildItem C:\Users\Brian\OneDrive\Documents\augment-projects\Voyagr\data
```

Or from your project directory:
```bash
Get-ChildItem data
```

### Check if files will be created there
```bash
# Windows PowerShell
Test-Path "C:\Users\Brian\OneDrive\Documents\augment-projects\Voyagr\data"

# Or shorter version
Test-Path data
```

---

## 🚀 How to Run Setup

### Option 1: From Project Directory (Recommended)

1. Open PowerShell
2. Navigate to your project:
   ```bash
   cd C:\Users\Brian\OneDrive\Documents\augment-projects\Voyagr
   ```

3. Run setup:
   ```bash
   python setup_custom_router.py
   ```

The script will automatically create/use the `data/` directory.

### Option 2: From Any Directory

```bash
cd C:\Users\Brian\OneDrive\Documents\augment-projects\Voyagr
python setup_custom_router.py
```

---

## 📊 Disk Space Requirements

Make sure you have enough space on your C: drive:

```bash
# Check available space
Get-Volume C
```

**Required space**:
- OSM data: 1.88 GB
- Database: 2.0-2.5 GB
- Buffer: 1 GB
- **Total: 5 GB minimum**

---

## 🔍 Monitor Download Progress

### Check if files are being created
```bash
# Windows PowerShell
Get-ChildItem data -Force | Select-Object Name, @{Name="Size(MB)";Expression={[math]::Round($_.Length/1MB, 2)}}
```

### Check specific file sizes
```bash
# Check OSM data
Get-ChildItem data\uk_data.pbf -ErrorAction SilentlyContinue | Select-Object Name, @{Name="Size(GB)";Expression={[math]::Round($_.Length/1GB, 2)}}

# Check database
Get-ChildItem data\uk_router.db -ErrorAction SilentlyContinue | Select-Object Name, @{Name="Size(GB)";Expression={[math]::Round($_.Length/1GB, 2)}}
```

---

## ✅ After Setup Completes

### Verify files exist
```bash
# Check both files
Get-ChildItem data\*.* | Select-Object Name, @{Name="Size(GB)";Expression={[math]::Round($_.Length/1GB, 2)}}
```

**Expected output**:
```
Name            Size(GB)
----            --------
uk_data.pbf     1.88
uk_router.db    2.15
```

### Verify database has data
```bash
sqlite3 data\uk_router.db "SELECT COUNT(*) as nodes FROM nodes;"
```

**Expected output**: ~5,200,000

---

## 🎯 Quick Reference

| Item | Path |
|------|------|
| **Project Root** | `C:\Users\Brian\OneDrive\Documents\augment-projects\Voyagr` |
| **Data Directory** | `C:\Users\Brian\OneDrive\Documents\augment-projects\Voyagr\data` |
| **OSM Data** | `data\uk_data.pbf` (1.88 GB) |
| **Routing DB** | `data\uk_router.db` (2.0-2.5 GB) |
| **Setup Script** | `setup_custom_router.py` |
| **Profiler** | `performance_profiler.py` |
| **Tests** | `test_custom_router.py` |

---

## 🚀 Ready to Start?

1. **Open PowerShell**
2. **Navigate to project**:
   ```bash
   cd C:\Users\Brian\OneDrive\Documents\augment-projects\Voyagr
   ```

3. **Install osmium**:
   ```bash
   pip install osmium
   ```

4. **Run setup** (files will download to `data/` directory):
   ```bash
   python setup_custom_router.py
   ```

**That's it! The database will be downloaded to the `data/` directory automatically.**

---

## 📞 Troubleshooting

### "data directory not found"
The script creates it automatically. If it doesn't exist:
```bash
mkdir data
python setup_custom_router.py
```

### "Permission denied"
Make sure you have write permissions to the Voyagr directory:
```bash
# Check permissions
Get-Acl C:\Users\Brian\OneDrive\Documents\augment-projects\Voyagr
```

### "Not enough disk space"
Free up space on C: drive or move project to a drive with more space.

### "Download failed"
The script will retry. If it fails multiple times:
```bash
# Manual download
curl -L -o data\uk_data.pbf https://download.geofabrik.de/europe/great-britain-latest.osm.pbf
```

---

**Summary**: Database downloads to `data/` directory in your project folder automatically!



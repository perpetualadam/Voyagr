# Database Setup - Quick Reference Card

---

## 🚀 One-Command Setup

```bash
python setup_custom_router.py
```

**That's it!** The script handles everything automatically.

---

## ⏱️ Timeline

| Step | Duration | What Happens |
|------|----------|--------------|
| Download OSM | 10-30 min | Downloads 1.88 GB UK data (if needed) |
| Parse OSM | 20-40 min | Extracts nodes, ways, restrictions |
| Create DB | 5-10 min | Builds SQLite database |
| Build Graph | 5-10 min | Creates edges and indexes |
| Test Route | 2-3 min | Validates with London → Manchester |
| **TOTAL** | **45-90 min** | **Complete setup** |

---

## 📊 What Gets Created

| File | Size | Purpose |
|------|------|---------|
| `data/uk_data.pbf` | 1.88 GB | OpenStreetMap data |
| `data/uk_router.db` | 2.0-2.5 GB | Routing database |

---

## 🔍 Monitor Progress

### Check if Running
```bash
# Windows
Get-Process python

# Linux/Mac
ps aux | grep setup
```

### Check Database Size
```bash
# Windows
Get-ChildItem data\uk_router.db

# Linux/Mac
ls -lh data/uk_router.db
```

### Check System Resources
```bash
# Windows
Get-Process python | Select-Object Name, CPU, WorkingSet

# Linux/Mac
top -p $(pgrep -f setup)
```

---

## ✅ Success Indicators

### During Setup
- ✅ "Parsing PBF file..." message appears
- ✅ CPU usage is high (normal)
- ✅ No error messages

### After Setup
- ✅ `data/uk_router.db` file exists (~2GB)
- ✅ "SETUP COMPLETE!" message displayed
- ✅ Route calculation shows ~45ms timing
- ✅ Database size shown as ~2.15 GB

---

## ⚠️ Quick Troubleshooting

| Problem | Solution |
|---------|----------|
| "osmium not found" | `pip install osmium` |
| "PBF file not found" | Script downloads automatically |
| "Disk space error" | Free up 5GB minimum |
| "Setup takes too long" | Normal! Takes 45-90 min |
| "Out of memory" | Close other apps |
| "Database creation failed" | Delete `data/uk_router.db` and retry |

---

## 📈 Next Steps After Setup

```bash
# 1. Run performance profiler
python performance_profiler.py

# 2. Run unit tests
python test_custom_router.py

# 3. Check database content
sqlite3 data/uk_router.db "SELECT COUNT(*) FROM nodes;"
```

---

## 🎯 Expected Results

### Setup Complete Message
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

### Database Statistics
- **Nodes**: ~5.2 million
- **Edges**: ~10.5 million
- **Ways**: ~1.2 million
- **Turn Restrictions**: ~50,000

### Performance
- **Average Route Time**: ~45ms
- **Short Routes**: ~20ms
- **Long Routes**: ~100ms

---

## 💡 Pro Tips

1. **Run in background** (Linux/Mac):
   ```bash
   nohup python setup_custom_router.py > setup.log 2>&1 &
   ```

2. **Run in background** (Windows PowerShell):
   ```bash
   Start-Process python -ArgumentList "setup_custom_router.py" -NoNewWindow
   ```

3. **Monitor log file**:
   ```bash
   tail -f setup.log  # Linux/Mac
   Get-Content setup.log -Tail 20 -Wait  # Windows
   ```

4. **Check progress periodically**:
   ```bash
   # Every 30 seconds
   while true; do ls -lh data/uk_router.db 2>/dev/null || echo "Not ready yet"; sleep 30; done
   ```

---

## 📋 Checklist

Before starting:
- [ ] Python 3.8+ installed
- [ ] Required packages installed (`pip install osmium`)
- [ ] 5GB disk space available
- [ ] Internet connection active

During setup:
- [ ] Monitor progress (optional)
- [ ] Don't interrupt the process
- [ ] Let CPU run at high usage (normal)

After setup:
- [ ] Verify `data/uk_router.db` exists (~2GB)
- [ ] Run performance profiler
- [ ] Run unit tests
- [ ] Check database statistics

---

## 🔗 Related Commands

```bash
# View setup script
cat setup_custom_router.py

# View OSM parser
cat custom_router/osm_parser.py

# Run performance profiler
python performance_profiler.py

# Run unit tests
python test_custom_router.py

# Check database
sqlite3 data/uk_router.db ".tables"
sqlite3 data/uk_router.db "SELECT COUNT(*) FROM nodes;"
```

---

## 📞 Need Help?

1. **Check DATABASE_SETUP_GUIDE.md** for detailed instructions
2. **Check PHASE2_COMPLETION_SUMMARY.md** for Phase 2 overview
3. **Check PHASE2_QUICKSTART.md** for quick start guide

---

**Status**: Ready to run  
**Command**: `python setup_custom_router.py`  
**Duration**: 45-90 minutes  
**Disk Required**: 5GB minimum



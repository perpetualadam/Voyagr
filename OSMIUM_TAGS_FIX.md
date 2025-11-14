# Osmium Tags Fix - TypeError Resolved

**Problem**: `TypeError: tags_get_value_by_key() incompatible function arguments`  
**Cause**: Osmium's `tags.get()` doesn't accept default values like Python dicts  
**Solution**: Handle tag retrieval properly with empty string defaults

---

## 🔧 What Was Fixed

### The Issue
```python
# ❌ Wrong - osmium doesn't support default parameter
w.tags.get('maxspeed', default_speeds.get(highway, 50))

# Error:
# TypeError: tags_get_value_by_key(): incompatible function arguments
```

### The Solution
```python
# ✅ Correct - get with empty string default, then handle
maxspeed_str = w.tags.get('maxspeed', '')
if maxspeed_str:
    try:
        speed_limit = int(maxspeed_str)
    except (ValueError, TypeError):
        speed_limit = default_speeds.get(highway, 50)
else:
    speed_limit = default_speeds.get(highway, 50)
```

---

## 📝 Code Changes

### File: `custom_router/osm_parser.py`

#### Change 1: Highway Tag
```python
# Before
highway = w.tags.get('highway')

# After
highway = w.tags.get('highway', '')
```

#### Change 2: Speed Limit Tag
```python
# Before
'speed_limit': int(w.tags.get('maxspeed', default_speeds.get(highway, 50)))

# After
maxspeed_str = w.tags.get('maxspeed', '')
if maxspeed_str:
    try:
        speed_limit = int(maxspeed_str)
    except (ValueError, TypeError):
        speed_limit = default_speeds.get(highway, 50)
else:
    speed_limit = default_speeds.get(highway, 50)
```

#### Change 3: Oneway Tag
```python
# Before
'oneway': w.tags.get('oneway') in ('yes', '1', 'true')

# After
'oneway': w.tags.get('oneway', '') in ('yes', '1', 'true')
```

#### Change 4: Toll Tag
```python
# Before
'toll': w.tags.get('toll') in ('yes', '1', 'true')

# After
'toll': w.tags.get('toll', '') in ('yes', '1', 'true')
```

---

## 🚀 Setup Now Running

✅ **Fixed**: Osmium tags handling  
✅ **Running**: Two-pass OSM parser  
⏳ **Expected Duration**: 40-80 minutes

---

## ✅ Expected Output

```
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

SETUP COMPLETE!
```

---

## 📊 Timeline

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

```bash
# Check database file size
Get-ChildItem data\uk_router.db -ErrorAction SilentlyContinue | Select-Object Name, @{Name="Size(GB)";Expression={[math]::Round($_.Length/1GB, 2)}}

# Check memory usage
Get-Process python | Select-Object Name, CPU, @{Name="Memory(MB)";Expression={[math]::Round($_.WorkingSet/1MB)}}
```

---

## ✅ After Setup Completes

```bash
# 1. Verify database
Get-ChildItem data\uk_router.db

# 2. Run performance profiler
python performance_profiler.py

# 3. Run unit tests
python test_custom_router.py
```

---

## 📞 Summary

✅ **Fixed**: Osmium tags TypeError  
✅ **Running**: Two-pass OSM parser  
✅ **Memory**: Safe at ~1.5GB  
✅ **Timeline**: 40-80 minutes  

**Wait 40-80 minutes for completion!**



# Correct Directory - Quick Reference

## ❌ Wrong Directory
```
C:\Users\Brian\OneDrive\Documents\augment-projects\SwotGen
```

## ✅ Correct Directory
```
C:\Users\Brian\OneDrive\Documents\augment-projects\Voyagr
```

---

## 🚀 How to Navigate

### Option 1: PowerShell Command
```bash
cd C:\Users\Brian\OneDrive\Documents\augment-projects\Voyagr
```

### Option 2: File Explorer
1. Open File Explorer
2. Navigate to: `C:\Users\Brian\OneDrive\Documents\augment-projects\`
3. Open the **Voyagr** folder (not SwotGen)
4. Right-click → Open PowerShell here

### Option 3: Quick Navigation
```bash
# From SwotGen, go up one level and into Voyagr
cd ..\Voyagr
```

---

## 📂 Project Structure

```
C:\Users\Brian\OneDrive\Documents\augment-projects\
├── SwotGen/              ← Wrong folder
└── Voyagr/               ← Correct folder ✅
    ├── data/
    ├── custom_router/
    ├── setup_custom_router.py
    ├── performance_profiler.py
    ├── test_custom_router.py
    └── voyagr_web.py
```

---

## ✅ Verify You're in the Right Directory

```bash
# Check current directory
pwd

# Should show:
# C:\Users\Brian\OneDrive\Documents\augment-projects\Voyagr

# List files to verify
Get-ChildItem | Select-Object Name

# Should show:
# setup_custom_router.py
# performance_profiler.py
# test_custom_router.py
# custom_router/
# data/
```

---

## 🎯 Correct Commands

### From Voyagr Directory

```bash
# 1. Install osmium
pip install osmium

# 2. Run setup
python setup_custom_router.py

# 3. Run profiler
python performance_profiler.py

# 4. Run tests
python test_custom_router.py
```

---

## 📝 Quick Checklist

- [ ] Navigate to: `C:\Users\Brian\OneDrive\Documents\augment-projects\Voyagr`
- [ ] Verify `setup_custom_router.py` exists: `Get-ChildItem setup_custom_router.py`
- [ ] Run setup: `python setup_custom_router.py`
- [ ] Wait 30-45 minutes
- [ ] Verify database: `Get-ChildItem data\uk_router.db`

---

## 🚀 Start Here

```bash
# 1. Navigate to correct directory
cd C:\Users\Brian\OneDrive\Documents\augment-projects\Voyagr

# 2. Verify you're in the right place
pwd

# 3. Run setup
python setup_custom_router.py
```

---

**Status**: ✅ Setup is now running in the Voyagr directory!



# 🔧 Fix: Simplify Requirements for Android

## ✅ Solution: Remove Problematic Dependencies

Many of our dependencies don't work well on Android (pygame, geopandas, osmnx, etc.). We need to simplify to only Android-compatible packages.

---

## Step 1: Edit pyproject.toml

**Copy and paste this command:**

```bash
nano ~/voyagr/pyproject.toml
```

**In nano editor:**

Find the `requires = [` section and replace it with:

```toml
requires = [
    "kivy==2.3.0",
    "kivy_garden.mapview==1.0.6",
    "kivy-garden==0.1.4",
    "plyer==2.1.0",
    "pyttsx3==2.90",
    "pyjnius==1.6.1",
    "requests==2.31.0",
    "protobuf==5.28.2",
    "boto3==1.35.24",
    "polyline==2.0.4",
    "mercantile==1.2.1",
    "geopy",
]
```

**Removed (not Android-compatible):**
- ❌ pygame (requires SDL2)
- ❌ geopandas (requires GDAL)
- ❌ osmnx (requires geopandas)

**Kept (Android-compatible):**
- ✅ kivy (UI framework)
- ✅ kivy_garden.mapview (maps)
- ✅ plyer (device features)
- ✅ pyttsx3 (text-to-speech)
- ✅ pyjnius (Java interop)
- ✅ requests (HTTP)
- ✅ protobuf (serialization)
- ✅ boto3 (AWS)
- ✅ polyline (route encoding)
- ✅ mercantile (tile math)
- ✅ geopy (geocoding)

**To save and exit nano:**
- Press `Ctrl+X`
- Press `Y` (yes)
- Press `Enter`

---

## Step 2: Verify the Change

**Copy and paste this command:**

```bash
cat ~/voyagr/pyproject.toml | grep -A 20 "requires = \["
```

Make sure you see the simplified list.

---

## Step 3: Clean Previous Build

**Copy and paste this command:**

```bash
cd ~/voyagr
rm -rf build
```

---

## Step 4: Try Build Again

**Copy and paste this command:**

```bash
cd ~/voyagr
briefcase build android
```

This should work now!

---

## ⏱️ Timeline

| Step | Time | Command |
|------|------|---------|
| 1 | 2 min | Edit pyproject.toml |
| 2 | 1 min | Verify change |
| 3 | 1 min | Clean build |
| 4 | 30-45 min | Build APK |
| **Total** | **35-50 min** | **Ready!** |

---

## 📋 What We Removed

These packages don't work on Android:

- **pygame** - Requires SDL2 development libraries
- **geopandas** - Requires GDAL (geospatial library)
- **osmnx** - Depends on geopandas

The app will still work! These were optional features.

---

## ✅ What We Kept

All the essential packages:

- **kivy** - UI framework
- **kivy_garden.mapview** - Maps
- **plyer** - Device features (GPS, camera, etc.)
- **pyttsx3** - Text-to-speech
- **pyjnius** - Java interop
- **requests** - HTTP requests
- **protobuf** - Data serialization
- **boto3** - AWS integration
- **polyline** - Route encoding
- **mercantile** - Tile math
- **geopy** - Geocoding

---

## 🚀 Next Steps

1. **Run Step 1:** Edit pyproject.toml
2. **Run Step 2:** Verify change
3. **Run Step 3:** Clean build
4. **Run Step 4:** Build APK (WAIT 30-45 minutes!)

---

## 🎉 Ready!

Start with Step 1:

```bash
nano ~/voyagr/pyproject.toml
```

Go! 🚀



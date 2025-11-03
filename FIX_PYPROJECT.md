# 🔧 Fix: Duplicate requires Section in pyproject.toml

## ✅ Solution: Remove Duplicate Section

The error means there are two `requires` sections in the file. We need to remove the old one.

---

## Step 1: View the File

**Copy and paste this command:**

```bash
cat ~/voyagr/pyproject.toml
```

Look for duplicate `requires = [` sections.

---

## Step 2: Fix the File

**Copy and paste this command:**

```bash
nano ~/voyagr/pyproject.toml
```

**In nano editor:**

1. **Find the first `requires = [`** (around line 40)
2. **Delete the entire old `requires` section** (all lines until the closing `]`)
3. **Keep only ONE `requires` section** with our new dependencies

**The file should look like:**

```toml
[build-system]
requires = ["setuptools", "wheel"]
build-backend = "setuptools.build_meta"

[project]
name = "voyagr"
version = "0.0.1"
description = "Advanced navigation app with social features"
requires = [
    "kivy==2.3.0",
    "kivy_garden.mapview==1.0.6",
    "kivy-garden==0.1.4",
    "pygame==2.5.2",
    "plyer==2.1.0",
    "pyttsx3==2.90",
    "pyjnius==1.6.1",
    "requests==2.31.0",
    "geopandas==0.14.4",
    "osmnx==1.9.3",
    "protobuf==5.28.2",
    "boto3==1.35.24",
    "polyline==2.0.4",
    "mercantile==1.2.1",
    "geopy",
]
```

**To save and exit nano:**
- Press `Ctrl+X`
- Press `Y` (yes)
- Press `Enter`

---

## Step 3: Verify the Fix

**Copy and paste this command:**

```bash
cat ~/voyagr/pyproject.toml
```

Make sure there's only ONE `requires` section.

---

## Step 4: Try Build Again

**Copy and paste this command:**

```bash
cd ~/voyagr
briefcase build android
```

This should work now!

---

## 🆘 If Still Having Issues

**Delete and recreate the project:**

```bash
cd ~
rm -rf voyagr
briefcase new
```

Answer the prompts again, then skip the requirements update step.

---

## 🎉 Ready!

Start with Step 1:

```bash
cat ~/voyagr/pyproject.toml
```

Go! 🚀



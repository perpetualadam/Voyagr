# 🔧 Fix: Update Android Section in pyproject.toml

## ✅ Solution: Add Android-Specific Requirements

The Android section needs to include our app dependencies, not just toga-android.

---

## Step 1: Edit pyproject.toml

**Copy and paste this command:**

```bash
nano ~/voyagr/pyproject.toml
```

**In nano editor:**

Find the section that says:

```toml
[tool.briefcase.app.voyagr.android]
requires = [
    "toga-android~=0.5.0",
]
```

Replace it with:

```toml
[tool.briefcase.app.voyagr.android]
requires = [
    "toga-android~=0.5.0",
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

**To save and exit nano:**
- Press `Ctrl+X`
- Press `Y` (yes)
- Press `Enter`

---

## Step 2: Verify the Change

**Copy and paste this command:**

```bash
cat ~/voyagr/pyproject.toml | grep -A 20 "\[tool.briefcase.app.voyagr.android\]"
```

Make sure you see all the dependencies listed.

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

## 📋 What We Added

Added all our app dependencies to the Android section:

```toml
[tool.briefcase.app.voyagr.android]
requires = [
    "toga-android~=0.5.0",
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



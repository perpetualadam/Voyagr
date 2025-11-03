# 🚀 Briefcase Build Guide - Step by Step

## ✅ You Chose Briefcase!

Briefcase is the official Kivy tool and much simpler than buildozer. Let's build your APK!

---

## Step 1: Stop Current Build (1 min)

**In Ubuntu terminal, press:** `Ctrl+C` to stop the buildozer build

---

## Step 2: Install Briefcase (2 min)

**Make sure you're in Ubuntu terminal with `(buildenv)` active.**

**Copy and paste this command:**

```bash
pip install briefcase
```

Wait for it to complete.

---

## Step 3: Verify Installation (1 min)

**Copy and paste this command:**

```bash
briefcase --version
```

You should see the version number.

---

## Step 4: Create Briefcase Project (2 min)

**Copy and paste this command:**

```bash
cd ~
briefcase new
```

When prompted, answer these questions:

```
Formal name: Voyagr
App name: voyagr
Bundle identifier: org.voyagr
Project directory: [press Enter for default]
Author name: Brian
Author email: anamnesisekklesia@googlemail.com
URL: https://github.com/perpetualadam/Voyagr
License: GPL v3
```

---

## Step 5: Copy Your Code (2 min)

**Copy and paste these commands:**

```bash
cp ~/Voyagr/satnav.py ~/voyagr/src/voyagr/app.py
cp ~/Voyagr/.env ~/voyagr/src/voyagr/
```

---

## Step 6: Update Requirements (5 min)

**Edit the requirements file:**

```bash
nano ~/voyagr/pyproject.toml
```

Find the line that says `requires = [` and replace the entire requires section with:

```toml
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

## Step 7: Build APK (30-45 min) ⏳

**Copy and paste this command:**

```bash
cd ~/voyagr
briefcase build android
```

**WAIT 30-45 MINUTES** for the build to complete.

You'll see lots of output. This is normal!

Watch for "BUILD SUCCESSFUL" at the end.

---

## Step 8: Check APK (1 min)

**After build completes, copy and paste this command:**

```bash
ls -lh ~/voyagr/build/voyagr/android/gradle/app/build/outputs/apk/debug/
```

You should see: `app-debug.apk`

---

## Step 9: Copy to Windows (2 min)

**Copy and paste this command:**

```bash
cp ~/voyagr/build/voyagr/android/gradle/app/build/outputs/apk/debug/app-debug.apk /mnt/c/Users/Brian/Downloads/voyagr-debug.apk
```

Verify it's there:

```bash
ls -lh /mnt/c/Users/Brian/Downloads/voyagr-debug.apk
```

---

## Step 10: Install on Device (5 min)

**Open PowerShell (NOT WSL) and run:**

```bash
adb install C:\Users\Brian\Downloads\voyagr-debug.apk
```

You should see: `Success`

---

## Step 11: Launch App (2 min)

**In PowerShell, run:**

```bash
adb shell am start -n org.voyagr.voyagr/.SatNavApp
```

The app should launch on your device!

---

## ⏱️ Timeline

| Step | Time | Command |
|------|------|---------|
| 1 | 1 min | Stop build (Ctrl+C) |
| 2 | 2 min | `pip install briefcase` |
| 3 | 1 min | `briefcase --version` |
| 4 | 2 min | `briefcase new` |
| 5 | 2 min | Copy code |
| 6 | 5 min | Update requirements |
| 7 | 30-45 min | `briefcase build android` |
| 8 | 1 min | Check APK |
| 9 | 2 min | Copy to Windows |
| 10 | 5 min | Install on device |
| 11 | 2 min | Launch app |
| **Total** | **55-70 min** | **Done!** |

---

## 🆘 Troubleshooting

### If Step 2 (Install Briefcase) fails:
```bash
pip install --upgrade pip
pip install briefcase
```

### If Step 4 (Create project) fails:
```bash
cd ~
rm -rf voyagr
briefcase new
```

### If Step 7 (Build) fails:
- Check the error message
- Common issues:
  - Missing dependencies (briefcase handles most)
  - Timeout (increase timeout)
  - Memory (close other apps)

### If Step 10 (Install) fails:
```bash
# Make sure device is connected
adb devices

# Clear old installation
adb uninstall org.voyagr.voyagr

# Try again
adb install C:\Users\Brian\Downloads\voyagr-debug.apk
```

---

## ✅ Success Indicators

- ✅ Step 3: See version number
- ✅ Step 4: Project created
- ✅ Step 7: See "BUILD SUCCESSFUL"
- ✅ Step 8: See app-debug.apk
- ✅ Step 10: See "Success"
- ✅ Step 11: App launches on device

---

## 🎉 Ready to Start!

**Start with Step 1:**

Press `Ctrl+C` to stop the current build

Then follow Steps 2-11 in order!

Go! 🚀



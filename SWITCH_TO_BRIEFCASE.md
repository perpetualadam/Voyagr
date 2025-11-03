# 🔄 Switch to Briefcase (Much Simpler!)

## ⚠️ Buildozer is Too Complex

Buildozer has too many dependency issues on WSL2. Let's use **Briefcase** instead - it's the official Kivy tool and much simpler!

---

## ✅ Why Briefcase is Better

- ✅ Official Kivy tool
- ✅ Much simpler setup
- ✅ Better documentation
- ✅ Fewer dependency issues
- ✅ Works great on WSL2
- ✅ Same result (APK file)

---

## Step 1: Stop Current Build

**In Ubuntu terminal, press:** `Ctrl+C` to stop the build

---

## Step 2: Install Briefcase

**Copy and paste this command:**

```bash
pip install briefcase
```

Wait for it to complete.

---

## Step 3: Verify Installation

**Copy and paste this command:**

```bash
briefcase --version
```

You should see the version number.

---

## Step 4: Create Briefcase Project

**Copy and paste these commands:**

```bash
cd ~
briefcase new
```

When prompted:
- **Formal name:** Voyagr
- **App name:** voyagr
- **Bundle identifier:** org.voyagr
- **Project directory:** (press Enter for default)
- **Author name:** Brian
- **Author email:** anamnesisekklesia@googlemail.com
- **URL:** https://github.com/perpetualadam/Voyagr
- **License:** GPL v3

---

## Step 5: Copy Your Code

**Copy and paste these commands:**

```bash
cp ~/Voyagr/satnav.py ~/voyagr/src/voyagr/app.py
cp ~/Voyagr/.env ~/voyagr/src/voyagr/
cp ~/Voyagr/buildozer.spec ~/voyagr/
```

---

## Step 6: Update Requirements

**Edit:** `~/voyagr/pyproject.toml`

Find the `requires` section and update it to:

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

---

## Step 7: Build APK

**Copy and paste this command:**

```bash
cd ~/voyagr
briefcase build android
```

Wait 30-45 minutes for the build.

---

## Step 8: Check APK

**Copy and paste this command:**

```bash
ls -lh build/voyagr/android/gradle/app/build/outputs/apk/debug/
```

You should see: `app-debug.apk`

---

## Step 9: Copy to Windows

**Copy and paste this command:**

```bash
cp build/voyagr/android/gradle/app/build/outputs/apk/debug/app-debug.apk /mnt/c/Users/Brian/Downloads/voyagr-debug.apk
```

---

## Step 10: Install on Device (PowerShell)

**Open PowerShell and run:**

```bash
adb install C:\Users\Brian\Downloads\voyagr-debug.apk
```

---

## ⏱️ Timeline

| Step | Time |
|------|------|
| Stop build | 1 min |
| Install Briefcase | 2 min |
| Verify | 1 min |
| Create project | 2 min |
| Copy code | 2 min |
| Update requirements | 2 min |
| Build APK | 30-45 min |
| Check APK | 1 min |
| Copy to Windows | 1 min |
| Install on device | 5 min |
| **Total** | **50-65 min** |

---

## 🚀 START NOW!

1. **Stop current build:** Press `Ctrl+C`
2. **Install Briefcase:** `pip install briefcase`
3. **Create project:** `briefcase new`
4. **Build APK:** `briefcase build android`

---

## 📚 Documentation

- `SWITCH_TO_BRIEFCASE.md` - This guide
- `COPY_PASTE_COMMANDS.md` - Original buildozer commands

---

## 🎉 Much Simpler!

Briefcase is much easier than buildozer. Let's use it!



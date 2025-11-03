# 🚀 Run Automated Build Script

## ✅ Complete Automated Build

I've created a script that will do everything automatically:
1. Create virtual environment
2. Install Briefcase
3. Create Briefcase project
4. Configure for Android
5. Build APK
6. Copy to Windows

---

## Step 1: Copy Script to Ubuntu

**In PowerShell (Windows), run:**

```powershell
# Copy the script to Ubuntu
wsl cp C:\Users\Brian\OneDrive\Documents\augment-projects\Voyagr\AUTOMATED_BUILD.sh ~/AUTOMATED_BUILD.sh
```

---

## Step 2: Make Script Executable

**In Ubuntu terminal, run:**

```bash
chmod +x ~/AUTOMATED_BUILD.sh
```

---

## Step 3: Run the Script

**In Ubuntu terminal, run:**

```bash
~/AUTOMATED_BUILD.sh
```

**This will:**
- ✅ Create virtual environment (if needed)
- ✅ Install Briefcase
- ✅ Create Briefcase project
- ✅ Copy your code
- ✅ Configure for Android
- ✅ Build APK (30-45 minutes)
- ✅ Copy APK to Windows

---

## ⏱️ Timeline

| Step | Time |
|------|------|
| Virtual env | 2 min |
| Install Briefcase | 5 min |
| Create project | 2 min |
| Copy code | 1 min |
| Configure | 1 min |
| Build APK | 30-45 min |
| Copy to Windows | 1 min |
| **Total** | **45-60 min** |

---

## 📋 What the Script Does

1. **Creates virtual environment** (if needed)
2. **Activates virtual environment**
3. **Upgrades pip**
4. **Installs Briefcase**
5. **Verifies Briefcase**
6. **Removes old project** (if exists)
7. **Creates new Briefcase project**
8. **Copies your code** (satnav.py, .env)
9. **Updates pyproject.toml** with correct requirements
10. **Builds APK** (30-45 minutes)
11. **Checks for APK**
12. **Copies APK to Windows**

---

## 🎯 After Build Completes

Once the script finishes, you'll see:

```
🎉 BUILD COMPLETE!

APK Location: C:\Users\Brian\Downloads\voyagr-debug.apk

Next steps:
1. Open PowerShell
2. Run: adb install C:\Users\Brian\Downloads\voyagr-debug.apk
3. Run: adb shell am start -n org.voyagr.voyagr/.SatNavApp
```

---

## 🚀 Quick Start

### In Ubuntu Terminal:

```bash
chmod +x ~/AUTOMATED_BUILD.sh
~/AUTOMATED_BUILD.sh
```

**That's it!** The script will do everything else automatically.

---

## 🆘 If Something Goes Wrong

The script will stop and show an error. Common issues:

1. **Virtual environment already exists** - Script will use it
2. **Old project exists** - Script will remove it
3. **Build fails** - Check the error message

---

## 📚 Documentation

- `AUTOMATED_BUILD.sh` - The build script
- `RUN_AUTOMATED_BUILD.md` - This guide

---

## 🎉 Ready!

Run the script:

```bash
~/AUTOMATED_BUILD.sh
```

Go! 🚀



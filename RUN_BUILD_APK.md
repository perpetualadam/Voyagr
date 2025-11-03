# 🚀 Run APK Build - Simple Method

## ✅ I've Created a Batch File for You

I've created `BUILD_APK.bat` which will automatically:
1. Open WSL
2. Create virtual environment
3. Install Briefcase
4. Create Briefcase project
5. Copy your code
6. Build APK (30-45 min)
7. Copy APK to Windows

---

## 🚀 HOW TO RUN

### **Step 1: Open PowerShell**

Press `Win+R` and type:
```
powershell
```

### **Step 2: Navigate to Project**

```powershell
cd C:\Users\Brian\OneDrive\Documents\augment-projects\Voyagr
```

### **Step 3: Run the Build Script**

```powershell
.\BUILD_APK.bat
```

**That's it!** The script will do everything automatically.

---

## ⏱️ TIMELINE

| Step | Time |
|------|------|
| Virtual env | 2 min |
| Install Briefcase | 5 min |
| Create project | 2 min |
| Copy code | 1 min |
| Build APK | 30-45 min |
| Copy to Windows | 1 min |
| **Total** | **45-60 min** |

---

## 📋 WHAT THE SCRIPT DOES

1. Opens WSL terminal
2. Creates virtual environment (if needed)
3. Activates virtual environment
4. Upgrades pip
5. Installs Briefcase
6. Verifies Briefcase
7. Removes old project (if exists)
8. Creates new Briefcase project
9. Copies your code (satnav.py, .env)
10. Builds APK (30-45 minutes)
11. Checks for APK
12. Copies APK to Windows

---

## 🎯 AFTER BUILD COMPLETES

You'll see:

```
==========================================
🎉 BUILD COMPLETE!
==========================================

APK Location: C:\Users\Brian\Downloads\voyagr-debug.apk

Next steps:
1. Open PowerShell
2. Run: adb install C:\Users\Brian\Downloads\voyagr-debug.apk
3. Run: adb shell am start -n org.voyagr.voyagr/.SatNavApp

==========================================
```

---

## 🚀 QUICK START

1. **Open PowerShell**
2. **Run:** `cd C:\Users\Brian\OneDrive\Documents\augment-projects\Voyagr`
3. **Run:** `.\BUILD_APK.bat`
4. **Wait 45-60 minutes**
5. **Done!**

---

## 📚 DOCUMENTATION

- `BUILD_APK.bat` - The build script
- `RUN_BUILD_APK.md` - This guide

---

## 🎉 LET'S BUILD!

Run the script:

```powershell
.\BUILD_APK.bat
```

Go! 🚀



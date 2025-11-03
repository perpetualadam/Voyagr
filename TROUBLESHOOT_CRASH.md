# 🔧 Troubleshoot Voyagr Crash

## 📱 New Version Available

**File:** `voyagr-debug-v2.apk` (57 MB)  
**Location:** `C:\Users\Brian\Downloads\voyagr-debug-v2.apk`  
**What's New:** Fixed entry point structure

---

## 🔍 Common Crash Causes & Fixes

### **1. Missing Permissions** ⚠️

**Symptoms:** App crashes immediately or after a few seconds

**Fix:**
```
Settings → Apps → Voyagr → Permissions
Enable:
  ✅ Location (GPS)
  ✅ Microphone
  ✅ Internet
  ✅ Vibration
```

---

### **2. Corrupted App Data** 🗄️

**Symptoms:** App crashes on startup

**Fix:**
```
Settings → Apps → Voyagr → Storage
Tap "Clear Cache"
Tap "Clear Data"
Reinstall app
```

---

### **3. Insufficient Storage** 💾

**Symptoms:** App crashes during initialization

**Check:**
```
Settings → Storage
Need at least 100 MB free space
```

**Fix:**
- Delete unused apps
- Clear cache
- Delete old files

---

### **4. Android Version Incompatibility** 📱

**Symptoms:** App won't install or crashes immediately

**Check:**
```
Settings → About Phone → Android Version
Need: Android 5.0+ (API 21+)
```

**Fix:**
- Update Android OS if available
- Or use different device

---

### **5. Database Initialization Error** 🗄️

**Symptoms:** App crashes after permissions are granted

**Fix:**
```
1. Clear app data (see #2)
2. Reinstall app
3. Wait 10 seconds after launch
```

---

## 🚀 Installation Steps (Fresh Install)

### **Step 1: Uninstall Old Version**
```
Settings → Apps → Voyagr → Uninstall
```

### **Step 2: Download New Version**
```
Download: voyagr-debug-v2.apk
From: C:\Users\Brian\Downloads\
```

### **Step 3: Transfer to Phone**

**Option A: Windows Link**
```
Right-click voyagr-debug-v2.apk
→ Share → Link
→ Copy link
→ Open Windows Link on phone
→ Paste link
→ Download
```

**Option B: OneDrive**
```powershell
Copy-Item C:\Users\Brian\Downloads\voyagr-debug-v2.apk "C:\Users\Brian\OneDrive\Documents\"
```

### **Step 4: Install**
```
1. Open File Manager on phone
2. Go to Downloads
3. Tap voyagr-debug-v2.apk
4. Tap "Install"
5. Wait for installation
```

### **Step 5: Grant Permissions**
```
When app launches:
  ✅ Tap "Allow" for Location
  ✅ Tap "Allow" for Microphone
  ✅ Tap "Allow" for Internet
  ✅ Tap "Allow" for Vibration
```

### **Step 6: Test**
```
1. App should launch without crashing
2. Try entering a location
3. Try clicking buttons
4. Check if results display
```

---

## 🆘 If Still Crashing

### **Option 1: Clear Everything & Reinstall**

```
1. Settings → Apps → Voyagr → Uninstall
2. Settings → Storage → Clear Cache
3. Restart phone
4. Download voyagr-debug-v2.apk
5. Install fresh
6. Grant all permissions
```

### **Option 2: Check Device Compatibility**

```
Settings → About Phone
Check:
  ✅ Android version (need 5.0+)
  ✅ Available storage (need 100+ MB)
  ✅ RAM (need 1+ GB)
```

### **Option 3: Try Different Device**

- If available, test on another Android phone
- Different device may have different results

---

## 📊 What Changed in v2

| Item | v1 (fixed) | v2 (current) |
|------|-----------|-------------|
| Entry Point | app.py | __main__.py + app.py |
| Init File | Missing | __init__.py added |
| Structure | Basic | Proper Briefcase structure |
| Expected Result | May crash | Should work |

---

## 🎯 Testing Checklist

After installation, verify:

- [ ] App launches without crashing
- [ ] Permissions dialog appears
- [ ] Can grant all permissions
- [ ] UI displays correctly
- [ ] Can enter text in search field
- [ ] Can click buttons
- [ ] Results display area shows text
- [ ] No errors in status label

---

## 📞 Detailed Troubleshooting

### **If you see "App keeps stopping"**

1. **Check permissions:**
   - Settings → Apps → Voyagr → Permissions
   - Enable all permissions

2. **Clear app data:**
   - Settings → Apps → Voyagr → Storage → Clear Data

3. **Reinstall:**
   - Uninstall app
   - Download voyagr-debug-v2.apk
   - Install fresh

### **If you see "Installation failed"**

1. **Enable unknown sources:**
   - Settings → Security → Install from unknown sources

2. **Check storage:**
   - Need at least 100 MB free space

3. **Try again:**
   - Delete old APK
   - Download fresh copy
   - Install

### **If app launches but crashes after a few seconds**

1. **Wait longer:**
   - Database initialization takes time
   - Wait 10 seconds before interacting

2. **Check logs:**
   - If USB connected: `adb logcat | grep voyagr`

3. **Clear data and retry:**
   - Settings → Apps → Voyagr → Storage → Clear Data

---

## 📁 Files Available

**Latest APK:**
- `voyagr-debug-v2.apk` ← **Use this one**

**Previous versions:**
- `voyagr-debug-fixed.apk`
- `voyagr-debug.apk`

---

## 🎉 Expected Result

After following these steps, the app should:
- ✅ Launch without crashing
- ✅ Display the main UI
- ✅ Allow location search
- ✅ Allow route calculation
- ✅ Display results

**Try the new version and let me know if it works! 🚀**

---

*Updated: November 1, 2025*  
*Version: v2 with proper entry point*


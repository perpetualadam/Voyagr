# 📱 Install Voyagr APK on Android Device

## Prerequisites

✅ APK file: `C:\Users\Brian\Downloads\voyagr-debug.apk` (57 MB)  
✅ Android device with USB cable  
✅ USB Debugging enabled on device  
✅ ADB installed on Windows  

---

## Step 1: Enable USB Debugging on Android Device

1. Open **Settings** on your Android phone
2. Go to **About Phone**
3. Tap **Build Number** 7 times (until you see "Developer mode enabled")
4. Go back to **Settings** → **Developer Options**
5. Enable **USB Debugging**
6. Connect phone to Windows via USB cable
7. Tap **Allow** when prompted on phone

---

## Step 2: Install APK Using ADB

### Option A: PowerShell (Recommended)

```powershell
# Open PowerShell and run:
adb install C:\Users\Brian\Downloads\voyagr-debug.apk

# Wait for installation to complete
# You should see: "Success"
```

### Option B: Manual Installation

1. Copy `voyagr-debug.apk` to your Android device
2. Open **File Manager** on device
3. Navigate to the APK file
4. Tap the APK file
5. Tap **Install**
6. Grant permissions when prompted
7. Tap **Open** to launch

---

## Step 3: Launch the App

### Using ADB:
```powershell
adb shell am start -n org.voyagr.voyagr/.SatNavApp
```

### Using Device:
1. Open **App Drawer**
2. Find **Voyagr**
3. Tap to launch

---

## Step 4: Grant Permissions

When app launches, grant these permissions:
- ✅ **Location** (GPS) - Required for navigation
- ✅ **Microphone** - For voice commands
- ✅ **Internet** - For routing and maps
- ✅ **Vibration** - For notifications

---

## Troubleshooting

### "adb: command not found"
```powershell
# Install Android SDK Platform Tools
# Download from: https://developer.android.com/studio/releases/platform-tools
# Add to PATH or use full path: C:\path\to\adb.exe
```

### "Device not found"
```powershell
# Check if device is connected:
adb devices

# If not listed:
# 1. Reconnect USB cable
# 2. Tap "Allow" on device when prompted
# 3. Try: adb kill-server && adb devices
```

### "Installation failed"
```powershell
# Try force reinstall:
adb install -r C:\Users\Brian\Downloads\voyagr-debug.apk

# Or uninstall first:
adb uninstall org.voyagr.voyagr
adb install C:\Users\Brian\Downloads\voyagr-debug.apk
```

### App crashes on launch
```powershell
# Check logs:
adb logcat | grep voyagr

# Or save to file:
adb logcat > logcat.txt
```

---

## View App Logs

```powershell
# Real-time logs:
adb logcat | grep voyagr

# Save logs to file:
adb logcat > C:\Users\Brian\Downloads\voyagr_logs.txt

# Clear logs:
adb logcat -c
```

---

## Uninstall App

```powershell
adb uninstall org.voyagr.voyagr
```

---

## Testing Checklist

After installation, test these features:

- [ ] App launches without crashing
- [ ] GPS location works
- [ ] Can search for locations
- [ ] Can calculate routes
- [ ] Voice commands work (if microphone granted)
- [ ] Database operations work
- [ ] Network requests work (Valhalla routing)
- [ ] All permissions are granted

---

## Important Notes

⚠️ **Debug APK:**
- This is a debug build (not optimized)
- Larger file size than release build
- May have slower performance
- Good for testing and development

⚠️ **Permissions:**
- App requires GPS for navigation
- Microphone needed for voice commands
- Internet required for routing and maps
- Grant all permissions for full functionality

⚠️ **Database:**
- First launch may take longer (database initialization)
- Check logs if app seems stuck

---

## Next Steps

1. ✅ Install APK on device
2. ✅ Grant all permissions
3. ✅ Test core features
4. ✅ Check logs for errors
5. ✅ Report any issues

**Enjoy Voyagr! 🚀**


# ⚡ Quick Install Commands

## Copy & Paste These Commands

### 1. Check ADB is Working
```powershell
adb version
adb devices
```

### 2. Install APK
```powershell
adb install C:\Users\Brian\Downloads\voyagr-debug.apk
```

**Expected Output:**
```
Success
```

### 3. Launch App
```powershell
adb shell am start -n org.voyagr.voyagr/.SatNavApp
```

### 4. View Logs (Real-time)
```powershell
adb logcat | grep voyagr
```

### 5. Save Logs to File
```powershell
adb logcat > C:\Users\Brian\Downloads\voyagr_logs.txt
```

### 6. Clear Logs
```powershell
adb logcat -c
```

### 7. Uninstall App
```powershell
adb uninstall org.voyagr.voyagr
```

### 8. Force Reinstall
```powershell
adb install -r C:\Users\Brian\Downloads\voyagr-debug.apk
```

---

## Troubleshooting Commands

### Device Not Found
```powershell
adb kill-server
adb devices
```

### Check Device Storage
```powershell
adb shell df -h
```

### Check App Permissions
```powershell
adb shell pm list permissions -g
```

### Grant Permissions Manually
```powershell
adb shell pm grant org.voyagr.voyagr android.permission.ACCESS_FINE_LOCATION
adb shell pm grant org.voyagr.voyagr android.permission.RECORD_AUDIO
adb shell pm grant org.voyagr.voyagr android.permission.INTERNET
adb shell pm grant org.voyagr.voyagr android.permission.VIBRATE
```

### Check App Info
```powershell
adb shell pm dump org.voyagr.voyagr
```

### Get App Package Info
```powershell
adb shell pm list packages | grep voyagr
```

---

## Testing Commands

### Check if App is Running
```powershell
adb shell ps | grep voyagr
```

### Stop App
```powershell
adb shell am force-stop org.voyagr.voyagr
```

### Clear App Data
```powershell
adb shell pm clear org.voyagr.voyagr
```

### Get App Version
```powershell
adb shell dumpsys package org.voyagr.voyagr | grep versionName
```

---

## Database Commands

### Access App Database
```powershell
adb shell
cd /data/data/org.voyagr.voyagr/databases
ls -la
```

### Pull Database to Windows
```powershell
adb pull /data/data/org.voyagr.voyagr/databases/satnav.db C:\Users\Brian\Downloads\
```

### Push Database to Device
```powershell
adb push C:\Users\Brian\Downloads\satnav.db /data/data/org.voyagr.voyagr/databases/
```

---

## File Management

### List App Files
```powershell
adb shell ls -la /data/data/org.voyagr.voyagr/
```

### Pull App Files
```powershell
adb pull /data/data/org.voyagr.voyagr/ C:\Users\Brian\Downloads\voyagr_data\
```

### Push Files to App
```powershell
adb push C:\path\to\file /data/data/org.voyagr.voyagr/
```

---

## Performance Monitoring

### Monitor CPU Usage
```powershell
adb shell top -n 1 | grep voyagr
```

### Monitor Memory Usage
```powershell
adb shell dumpsys meminfo org.voyagr.voyagr
```

### Monitor Battery Usage
```powershell
adb shell dumpsys batterystats | grep voyagr
```

---

## Quick Test Sequence

```powershell
# 1. Install
adb install C:\Users\Brian\Downloads\voyagr-debug.apk

# 2. Launch
adb shell am start -n org.voyagr.voyagr/.SatNavApp

# 3. Wait 5 seconds
Start-Sleep -Seconds 5

# 4. Check logs
adb logcat | grep voyagr

# 5. Check if running
adb shell ps | grep voyagr

# 6. Grant permissions
adb shell pm grant org.voyagr.voyagr android.permission.ACCESS_FINE_LOCATION
adb shell pm grant org.voyagr.voyagr android.permission.RECORD_AUDIO
adb shell pm grant org.voyagr.voyagr android.permission.INTERNET
adb shell pm grant org.voyagr.voyagr android.permission.VIBRATE

# 7. View logs again
adb logcat | grep voyagr
```

---

## One-Liner Commands

### Install and Launch
```powershell
adb install C:\Users\Brian\Downloads\voyagr-debug.apk; adb shell am start -n org.voyagr.voyagr/.SatNavApp
```

### Install, Launch, and View Logs
```powershell
adb install C:\Users\Brian\Downloads\voyagr-debug.apk; adb shell am start -n org.voyagr.voyagr/.SatNavApp; adb logcat | grep voyagr
```

### Uninstall and Reinstall
```powershell
adb uninstall org.voyagr.voyagr; adb install C:\Users\Brian\Downloads\voyagr-debug.apk
```

---

## Notes

- Replace `C:\Users\Brian\Downloads\voyagr-debug.apk` with actual path if different
- Replace `org.voyagr.voyagr` with actual package name if different
- Use `adb -s <device_id>` if multiple devices connected
- Use `adb -e` for emulator, `adb -d` for device

---

**Ready to test? Copy and paste the commands above! 🚀**


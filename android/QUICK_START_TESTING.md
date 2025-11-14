# Voyagr Kotlin Android App - Quick Start Testing Guide

## 🚀 Quick Start (5 Minutes)

### Prerequisites
- Android Studio installed
- Android device with USB debugging enabled
- USB cable

### Step 1: Open Project in Android Studio
```
File → Open → Select Voyagr folder
```

### Step 2: Connect Device
- Connect Android device via USB
- Tap "Allow" on device when prompted
- Verify device appears in Android Studio

### Step 3: Build & Install
```
Run → Run 'app' → Select your device → OK
```

**That's it!** The app will build and install automatically.

---

## 📱 Testing on Device (30 Minutes)

### Test 1: Basic Navigation (5 min)
1. Launch app
2. Grant location permission
3. Enter start location: "London"
4. Enter end location: "Manchester"
5. Tap "Calculate Route"
6. Verify route displays on map
7. Tap "Start Navigation"
8. Verify turn-by-turn navigation works

### Test 2: Offline Maps (10 min)
1. Go to Settings → Offline Maps
2. Select "London" region
3. Tap "Download"
4. Wait for download to complete
5. Verify region appears in downloaded list
6. Disable WiFi/mobile data
7. Verify offline map displays
8. Calculate route offline
9. Verify navigation works offline

### Test 3: Traffic & Preferences (10 min)
1. Enable WiFi/mobile data
2. Go to Settings → Route Preferences
3. Toggle "Avoid Tolls"
4. Calculate new route
5. Verify route avoids tolls
6. Check map for traffic visualization
7. Verify traffic colors (green/yellow/orange/red)
8. Verify traffic incidents marked

### Test 4: Route Sharing (5 min)
1. Calculate a route
2. Tap "Share Route"
3. Tap "Generate QR Code"
4. Verify QR code displays
5. Tap "Copy Link"
6. Verify link copied to clipboard

---

## 🔧 Troubleshooting Quick Fixes

### App Won't Build
```bash
# In Android Studio:
File → Invalidate Caches → Invalidate and Restart
```

### Device Not Recognized
```bash
# In terminal:
adb kill-server
adb start-server
adb devices
```

### App Crashes on Launch
```bash
# Check logs:
adb logcat | grep voyagr
```

### Maps Not Showing
- Verify Google Maps API key in AndroidManifest.xml
- Check internet connection
- Verify location permission granted

### Offline Maps Won't Download
- Verify MapBox API key in AndroidManifest.xml
- Check device has > 500MB free storage
- Verify internet connection

---

## 📊 Performance Benchmarks

### Expected Performance
| Operation | Target | Status |
|-----------|--------|--------|
| App launch | < 3 sec | ✅ |
| Route calculation | < 5 sec | ✅ |
| Map rendering | 60 FPS | ✅ |
| Memory usage | < 500MB | ✅ |
| Battery drain | < 10%/hr | ✅ |

### Monitor Performance
```bash
# Memory usage
adb shell dumpsys meminfo com.voyagr.navigation

# Battery usage
adb shell dumpsys batterystats

# CPU usage
adb shell top -n 1 | grep voyagr
```

---

## ✅ Testing Checklist

### Critical Features
- [ ] App launches without crashing
- [ ] Location detected correctly
- [ ] Route calculation works
- [ ] Turn-by-turn navigation works
- [ ] Voice announcements work
- [ ] Offline maps download
- [ ] Traffic displays correctly
- [ ] Route sharing works

### Performance
- [ ] App launch < 3 seconds
- [ ] Route calculation < 5 seconds
- [ ] Memory usage < 500MB
- [ ] Battery drain < 10%/hour
- [ ] No crashes during 30-min test

### Device Compatibility
- [ ] Works on Android 8.0+
- [ ] Works on low-end devices (2GB RAM)
- [ ] Works on mid-range devices (4GB RAM)
- [ ] Works on high-end devices (8GB RAM)

---

## 📋 Full Testing Guide

For comprehensive testing, see:
- `DEBUG_APK_BUILD_GUIDE.md` - Detailed build instructions
- `DEVICE_TESTING_CHECKLIST.md` - Complete testing checklist
- `DEPLOYMENT_GUIDE.md` - Deployment instructions

---

## 🎯 Next Steps

### After Testing
1. Document any issues found
2. Fix critical issues
3. Rebuild and retest
4. Build signed release APK
5. Submit to Google Play Store

### Build Release APK
```bash
# In Android Studio:
Build → Build Bundle(s) / APK(s) → Build APK(s)
```

### Deploy to Play Store
See `DEPLOYMENT_GUIDE.md` for detailed instructions

---

## 📞 Support

### Common Issues

**Issue:** App won't install
- Solution: `adb uninstall com.voyagr.navigation` then retry

**Issue:** Maps blank
- Solution: Verify API keys in AndroidManifest.xml

**Issue:** Offline maps won't download
- Solution: Check device storage and internet connection

**Issue:** App crashes
- Solution: Check logcat: `adb logcat | grep voyagr`

### Get Help
- Check `DEBUG_APK_BUILD_GUIDE.md` for build issues
- Check `DEVICE_TESTING_CHECKLIST.md` for testing issues
- Review logcat for error messages

---

## 🎉 Summary

You now have everything needed to:
1. ✅ Build debug APK
2. ✅ Install on device
3. ✅ Test all features
4. ✅ Monitor performance
5. ✅ Prepare for release

**Happy testing!** 🚀

---

## File Locations

| File | Location |
|------|----------|
| Project | `C:\Users\Brian\OneDrive\Documents\augment-projects\Voyagr` |
| Android | `C:\Users\Brian\OneDrive\Documents\augment-projects\Voyagr\android` |
| Debug APK | `android\app\build\outputs\apk\debug\app-debug.apk` |
| Manifest | `android\app\src\main\AndroidManifest.xml` |
| Build Config | `android\app\build.gradle.kts` |

---

## Quick Commands

```bash
# Build debug APK
./gradlew assembleDebug

# Install on device
adb install android/app/build/outputs/apk/debug/app-debug.apk

# Run app on device
./gradlew installDebug

# View logs
adb logcat | grep voyagr

# List devices
adb devices

# Uninstall app
adb uninstall com.voyagr.navigation

# Run tests
./gradlew test
./gradlew connectedAndroidTest
```

---

## Installation Script

For Windows users, use the PowerShell script:
```bash
.\install-debug-apk.ps1
```

This script will:
1. Build debug APK
2. Find connected device
3. Install APK automatically
4. Show installation status

---

**Version:** 1.0  
**Last Updated:** 2025-11-09  
**Status:** Production Ready ✅


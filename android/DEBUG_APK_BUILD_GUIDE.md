# Voyagr Kotlin Android App - Debug APK Build & Installation Guide

## Overview

This guide will help you build a debug APK of the Voyagr Kotlin Android app and install it on your physical Android device for testing.

---

## Prerequisites

### Required Software

1. **Android Studio** (Latest version)
   - Download from: https://developer.android.com/studio
   - Includes Android SDK, Gradle, and ADB

2. **Android SDK** (API 26+)
   - Installed automatically with Android Studio
   - Minimum: API 26 (Android 8.0)
   - Target: API 34 (Android 14)

3. **Java Development Kit (JDK)**
   - JDK 17 or higher
   - Installed with Android Studio

4. **USB Driver** (for your device)
   - Windows: Usually installed automatically
   - Mac/Linux: Usually not needed

### Optional but Recommended

- **ADB (Android Debug Bridge)** - Included with Android SDK
- **USB Cable** - For connecting device to computer

---

## Step 1: Install Android Studio

### Windows Installation

1. Download Android Studio from https://developer.android.com/studio
2. Run the installer
3. Follow the setup wizard:
   - Accept license agreements
   - Choose installation location (default is fine)
   - Select components to install (keep defaults)
4. Complete installation
5. Launch Android Studio

### First Launch Setup

1. Android Studio will prompt to download SDK components
2. Accept and download:
   - Android SDK Platform 34
   - Android SDK Build-Tools 34.x.x
   - Android Emulator (optional)
   - Android SDK Platform-Tools (includes ADB)

---

## Step 2: Configure API Keys (Optional but Recommended)

### Google Maps API Key

1. Go to https://console.cloud.google.com/
2. Create a new project or select existing
3. Enable "Maps SDK for Android"
4. Create an API key
5. Update `android/app/src/main/AndroidManifest.xml`:

```xml
<meta-data
    android:name="com.google.android.geo.API_KEY"
    android:value="YOUR_ACTUAL_GOOGLE_MAPS_API_KEY" />
```

### MapBox API Key

1. Go to https://account.mapbox.com/
2. Create a new access token
3. Update `android/app/src/main/AndroidManifest.xml`:

```xml
<meta-data
    android:name="com.mapbox.maps.API_KEY"
    android:value="YOUR_ACTUAL_MAPBOX_API_KEY" />
```

**Note:** Without API keys, the app will still build and run, but maps and offline features won't work.

---

## Step 3: Build Debug APK

### Method 1: Using Android Studio (Recommended)

1. Open Android Studio
2. Open the Voyagr project:
   - File → Open
   - Navigate to `C:\Users\Brian\OneDrive\Documents\augment-projects\Voyagr`
   - Click Open
3. Wait for Gradle sync to complete
4. Build the debug APK:
   - Build → Build Bundle(s) / APK(s) → Build APK(s)
5. Wait for build to complete (5-10 minutes)
6. Click "Locate" in the notification to find the APK

**Output Location:**
```
android/app/build/outputs/apk/debug/app-debug.apk
```

### Method 2: Using Command Line (Requires Gradle)

```bash
cd C:\Users\Brian\OneDrive\Documents\augment-projects\Voyagr\android
gradlew assembleDebug
```

**Output Location:**
```
android\app\build\outputs\apk\debug\app-debug.apk
```

### Method 3: Using PowerShell (If Gradle is installed)

```powershell
cd "C:\Users\Brian\OneDrive\Documents\augment-projects\Voyagr\android"
.\gradlew.bat assembleDebug
```

---

## Step 4: Prepare Your Android Device

### Enable USB Debugging

1. **On your Android device:**
   - Go to Settings → About Phone
   - Tap "Build Number" 7 times
   - Go back to Settings → Developer Options
   - Enable "USB Debugging"
   - Enable "Install via USB" (if available)

2. **Connect device to computer:**
   - Use USB cable to connect device
   - On device, tap "Allow" when prompted for USB debugging permission
   - Keep device unlocked during installation

### Verify ADB Connection

```bash
adb devices
```

**Expected output:**
```
List of attached devices
XXXXXXXXXXXXXXXX    device
```

If your device shows "unauthorized", disconnect and reconnect, then tap "Allow" on device.

---

## Step 5: Install Debug APK on Device

### Method 1: Using Android Studio (Easiest)

1. Connect device via USB
2. In Android Studio:
   - Run → Run 'app'
   - Select your device
   - Click OK
3. Android Studio will build and install the APK automatically

### Method 2: Using ADB Command Line

```bash
adb install android/app/build/outputs/apk/debug/app-debug.apk
```

**Expected output:**
```
Success
```

### Method 3: Manual Installation

1. Copy APK to device:
   ```bash
   adb push android/app/build/outputs/apk/debug/app-debug.apk /sdcard/Download/
   ```

2. On device:
   - Open Files app
   - Navigate to Downloads
   - Tap app-debug.apk
   - Tap "Install"
   - Grant permissions as prompted

---

## Step 6: Launch and Test the App

### First Launch

1. On device, find "Voyagr Navigation" app
2. Tap to launch
3. Grant permissions when prompted:
   - Location (Fine & Coarse)
   - Microphone (for voice commands)
   - Storage (for offline maps)

### Test Features

- **Navigation:** Enter start and end locations
- **Offline Maps:** Download a region
- **Traffic:** Check real-time traffic updates
- **Route Preferences:** Adjust route options
- **Voice Commands:** Test voice input
- **Route Sharing:** Generate QR code

### Monitor Logs

```bash
adb logcat | grep voyagr
```

This shows app logs for debugging.

---

## Step 7: Troubleshooting

### Build Fails

**Error:** "Gradle sync failed"

**Solution:**
1. File → Sync Now
2. If still fails, File → Invalidate Caches → Invalidate and Restart
3. Ensure JDK 17+ is installed

### APK Won't Install

**Error:** "INSTALL_FAILED_INVALID_APK"

**Solution:**
1. Rebuild APK: Build → Clean Project → Build APK(s)
2. Ensure device has enough storage (> 100MB free)
3. Uninstall previous version: `adb uninstall com.voyagr.navigation`

### Device Not Recognized

**Error:** "No devices found"

**Solution:**
1. Check USB cable (try different cable)
2. Enable USB Debugging on device
3. Tap "Allow" when prompted
4. Restart ADB: `adb kill-server && adb start-server`

### App Crashes on Launch

**Error:** "Unfortunately, Voyagr has stopped"

**Solution:**
1. Check logs: `adb logcat | grep voyagr`
2. Look for permission errors
3. Verify API keys are configured
4. Check for null pointer exceptions

### Maps Not Showing

**Error:** "Map is blank"

**Solution:**
1. Verify Google Maps API key is configured
2. Check internet connection
3. Verify location permission is granted
4. Check logcat for API errors

### Offline Maps Not Working

**Error:** "Cannot download offline maps"

**Solution:**
1. Verify MapBox API key is configured
2. Check internet connection
3. Ensure device has > 500MB free storage
4. Check logcat for MapBox errors

---

## Step 8: Uninstall App

### Using ADB

```bash
adb uninstall com.voyagr.navigation
```

### Using Device

1. Settings → Apps → Voyagr Navigation
2. Tap "Uninstall"
3. Confirm

---

## Performance Testing

### Monitor Performance

```bash
# Monitor memory usage
adb shell dumpsys meminfo com.voyagr.navigation

# Monitor battery usage
adb shell dumpsys batterystats

# Monitor CPU usage
adb shell top -n 1 | grep voyagr
```

### Profiling with Android Studio

1. Run app on device
2. View → Tool Windows → Profiler
3. Monitor:
   - CPU usage
   - Memory usage
   - Network activity
   - Battery drain

---

## Testing Checklist

- [ ] App launches without crashing
- [ ] Location permission granted
- [ ] GPS location detected
- [ ] Route calculation works
- [ ] Turn-by-turn navigation works
- [ ] Voice announcements work
- [ ] Offline maps download
- [ ] Traffic updates display
- [ ] Route preferences apply
- [ ] Route sharing works
- [ ] Battery usage is reasonable
- [ ] Memory usage is stable
- [ ] No crashes during 30-minute test

---

## Next Steps

### After Successful Testing

1. **Fix any issues found during testing**
2. **Run unit tests:** `./gradlew test`
3. **Run integration tests:** `./gradlew connectedAndroidTest`
4. **Build release APK:** `./gradlew assembleRelease`
5. **Submit to Google Play Store**

### Deployment

See `DEPLOYMENT_GUIDE.md` for instructions on:
- Creating keystore for release signing
- Generating signed release APK
- Submitting to Google Play Store

---

## Quick Reference

### Common Commands

```bash
# Build debug APK
./gradlew assembleDebug

# Install on device
adb install app/build/outputs/apk/debug/app-debug.apk

# Run app on device
./gradlew installDebug

# View logs
adb logcat | grep voyagr

# List connected devices
adb devices

# Uninstall app
adb uninstall com.voyagr.navigation

# Clear app data
adb shell pm clear com.voyagr.navigation

# Run tests
./gradlew test
./gradlew connectedAndroidTest
```

### File Locations

- **Project Root:** `C:\Users\Brian\OneDrive\Documents\augment-projects\Voyagr`
- **Android Project:** `C:\Users\Brian\OneDrive\Documents\augment-projects\Voyagr\android`
- **Debug APK:** `android\app\build\outputs\apk\debug\app-debug.apk`
- **Manifest:** `android\app\src\main\AndroidManifest.xml`
- **Build Config:** `android\app\build.gradle.kts`

---

## Support

For issues or questions:

1. Check logcat: `adb logcat | grep voyagr`
2. Review error messages in Android Studio
3. Check `TROUBLESHOOTING.md` for common issues
4. Review `IMPLEMENTATION_GUIDE.md` for architecture details

---

## Summary

You now have everything needed to:
1. ✅ Build a debug APK
2. ✅ Install on your Android device
3. ✅ Test all features
4. ✅ Monitor performance
5. ✅ Prepare for release

**Happy testing!** 🚀


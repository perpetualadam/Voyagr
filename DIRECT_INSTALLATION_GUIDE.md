# Voyagr Direct Installation Guide

**For Users Installing Without Google Play Store**

**Version**: 1.0.0  
**Last Updated**: October 2025

---

## 📱 OVERVIEW

This guide provides step-by-step instructions for installing Voyagr directly on your Android device without using Google Play Store. Choose the installation method that works best for you.

---

## ✅ PREREQUISITES

- **Android Device**: Android 5.0 or higher (API 21+)
- **APK File**: voyagr-1.0.0-debug.apk or voyagr-1.0.0-release.apk
- **Storage**: 200 MB free space
- **Internet**: Required for some installation methods

---

## 🔧 INSTALLATION METHODS

### Method 1: USB/ADB Installation (Recommended for Developers)

**Best For**: Developers, technical users with USB cable

**Step 1: Enable USB Debugging**
1. Open Settings on your Android device
2. Tap "About Phone"
3. Tap "Build Number" 7 times rapidly
4. Go back to Settings
5. Tap "Developer Options"
6. Enable "USB Debugging"

**Step 2: Connect Device**
1. Connect Android device to computer via USB cable
2. On device, tap "Allow" when prompted for USB debugging

**Step 3: Install APK**
```bash
# On computer terminal/command prompt
adb devices                                    # Verify device connected
adb install voyagr-1.0.0-debug.apk           # Install APK
adb install -r voyagr-1.0.0-debug.apk        # Reinstall if already installed
```

**Step 4: Verify Installation**
```bash
adb shell pm list packages | grep voyagr
```

**Troubleshooting**:
- "adb: command not found" → Install Android SDK Platform Tools
- "device not found" → Enable USB debugging, check USB cable
- "Installation failed" → Clear storage and retry

---

### Method 2: Direct APK Download (Sideloading - Easiest)

**Best For**: End users, no computer required

**Step 1: Enable Unknown Sources**

**Android 8.0 and Higher**:
1. Open Settings
2. Tap "Apps"
3. Tap "Special Access"
4. Tap "Install Unknown Apps"
5. Select your browser or file manager
6. Toggle "Allow from this source"

**Android 7.0 and Below**:
1. Open Settings
2. Tap "Security"
3. Toggle "Unknown Sources"
4. Tap "OK" to confirm

**Step 2: Download APK**
1. Download voyagr-1.0.0-debug.apk from GitHub Releases
2. Save to device Downloads folder
3. Wait for download to complete

**Step 3: Install APK**
1. Open file manager
2. Navigate to Downloads folder
3. Tap voyagr-1.0.0-debug.apk
4. Tap "Install" button
5. Wait for installation to complete

**Step 4: Grant Permissions**
1. Tap "Open" when installation completes
2. Grant requested permissions:
   - ✅ Location (Fine & Coarse)
   - ✅ Microphone (for voice)
   - ✅ Internet
   - ✅ Vibrate

**Troubleshooting**:
- "Installation blocked" → Enable Unknown Sources (see Step 1)
- "Parse error" → Re-download APK, check file integrity
- "App not installed" → Clear storage, try again
- "Insufficient storage" → Free up space and retry

---

### Method 3: WiFi Transfer (Local Network)

**Best For**: Users without USB cable, local network available

**On Computer**:
```bash
# Navigate to APK directory
cd /path/to/voyagr/bin

# Start HTTP server
python -m http.server 8000

# Note your computer IP address
# Windows: ipconfig | findstr IPv4
# macOS/Linux: ifconfig | grep inet
```

**On Android Device**:
1. Connect to same WiFi network as computer
2. Open browser
3. Navigate to: `http://<computer-ip>:8000/voyagr-1.0.0-debug.apk`
4. Download APK
5. Open Downloads folder
6. Tap APK to install
7. Grant permissions

---

### Method 4: Cloud Storage Transfer

**Best For**: Sharing with others, no local network needed

**Upload to Cloud**:
1. Upload voyagr-1.0.0-debug.apk to:
   - Google Drive
   - Dropbox
   - OneDrive
   - Any cloud storage service

**On Android Device**:
1. Open cloud storage app
2. Find voyagr-1.0.0-debug.apk
3. Download to device
4. Open Downloads folder
5. Tap APK to install
6. Grant permissions

---

### Method 5: QR Code Download

**Best For**: Quick sharing, no typing required

**Generate QR Code**:
```bash
python generate_qr.py
```

**On Android Device**:
1. Open camera app
2. Point at QR code
3. Tap notification to download
4. Open Downloads folder
5. Tap APK to install
6. Grant permissions

---

## 🔐 SECURITY & VERIFICATION

### APK Integrity Verification

**Get SHA256 Checksum**:
```bash
# Windows PowerShell
Get-FileHash voyagr-1.0.0-debug.apk -Algorithm SHA256

# Linux/macOS
sha256sum voyagr-1.0.0-debug.apk
```

**Verify Checksum**:
1. Compare checksum with official release notes
2. If different, re-download APK
3. Never install if checksum doesn't match

### Security Best Practices

- ✅ Only download from official GitHub repository
- ✅ Verify URL is correct before downloading
- ✅ Check APK checksum before installing
- ✅ Keep Android security updates current
- ✅ Review permissions before granting
- ✅ Don't install from untrusted sources

### Understanding Android Warnings

**"Play Protect Warning"**:
- Expected for sideloaded apps
- Tap "Install anyway" to proceed
- App is safe if downloaded from official source

**Permission Requests**:
- **Location**: Required for GPS navigation
- **Microphone**: Required for voice commands
- **Internet**: Required for routing and maps
- **Vibrate**: Used for alerts and notifications

---

## 📋 REQUIRED PERMISSIONS

| Permission | Purpose | Required |
|-----------|---------|----------|
| ACCESS_FINE_LOCATION | GPS navigation | ✅ Yes |
| ACCESS_COARSE_LOCATION | Network location | ✅ Yes |
| RECORD_AUDIO | Voice commands | ✅ Yes |
| INTERNET | Routing, maps, API calls | ✅ Yes |
| VIBRATE | Alerts, notifications | ✅ Yes |

---

## ❌ TROUBLESHOOTING

### Installation Issues

**"App not installed"**
- Clear app storage: Settings → Apps → Voyagr → Storage → Clear Storage
- Re-download APK
- Retry installation

**"Parse error"**
- APK file corrupted
- Re-download from official source
- Verify checksum matches

**"Installation blocked"**
- Unknown Sources not enabled
- Follow Step 1 of Method 2
- Retry installation

**"Insufficient storage"**
- Free up device storage
- Delete unnecessary files
- Retry installation

### Runtime Issues

**"GPS not working"**
- Enable location services
- Grant fine location permission
- Use high-accuracy GPS mode

**"Voice not working"**
- Grant microphone permission
- Check audio volume
- Verify TTS engine installed

**"App crashes on startup"**
- Clear app cache: Settings → Apps → Voyagr → Storage → Clear Cache
- Uninstall and reinstall
- Check Android version (5.0+)

**"Permissions not working"**
- Grant all permissions when prompted
- Check Settings → Apps → Voyagr → Permissions
- Manually enable missing permissions

---

## 🔄 UPDATING VOYAGR

**To Update**:
1. Download new APK version
2. Install using same method as original
3. Use `-r` flag with ADB: `adb install -r voyagr-1.0.0-release.apk`
4. App will update without losing settings

**To Uninstall**:
```bash
# Via ADB
adb uninstall org.voyagr

# Via Android
Settings → Apps → Voyagr → Uninstall
```

---

## 📞 SUPPORT

### Getting Help

1. Check troubleshooting section above
2. Review DEPLOYMENT_GUIDE.md for technical details
3. Check GitHub Issues for known problems
4. Report new issues with:
   - Android version
   - Device model
   - Error message
   - Steps to reproduce

### Reporting Issues

Include:
- Device model and Android version
- APK version number
- Error message or crash log
- Steps to reproduce issue
- Screenshots if applicable

---

## ✨ NEXT STEPS

1. **Install Voyagr** using preferred method above
2. **Grant permissions** when prompted
3. **Configure settings** (distance unit, currency, vehicle type)
4. **Enable voice** if desired
5. **Start navigating!**

---

## 📚 ADDITIONAL RESOURCES

- **DEPLOYMENT_GUIDE.md** - Technical deployment details
- **FEATURE_REFERENCE.md** - Feature documentation
- **README_COMPREHENSIVE.md** - Project overview
- **GitHub Releases** - Download APK files

---

**Status**: ✅ Ready for Installation

For technical support, see DEPLOYMENT_GUIDE.md or visit GitHub Issues.

---

**End of Direct Installation Guide**


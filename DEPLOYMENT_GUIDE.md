# Voyagr Deployment Guide

**Version**: 1.0.0  
**Last Updated**: October 2025

---

## 1. PREREQUISITES

### System Requirements
- **OS**: Windows, macOS, or Linux
- **Python**: 3.8 or higher
- **Java**: JDK 11 or higher
- **Android SDK**: API 31 (Android 12)
- **Android NDK**: Version 25b
- **Disk Space**: 5 GB minimum

### Required Tools
```bash
# Install Buildozer
pip install buildozer

# Install Cython (required by Buildozer)
pip install cython

# Install Java (if not installed)
# Windows: Download from oracle.com
# macOS: brew install openjdk@11
# Linux: sudo apt-get install openjdk-11-jdk
```

---

## 2. ANDROID DEPLOYMENT

### Step 1: Environment Setup

**Windows**:
```bash
# Set environment variables
set ANDROID_SDK_ROOT=C:\Android\sdk
set ANDROID_NDK_ROOT=C:\Android\ndk\25b
set JAVA_HOME=C:\Program Files\Java\jdk-11
```

**macOS/Linux**:
```bash
export ANDROID_SDK_ROOT=$HOME/Android/sdk
export ANDROID_NDK_ROOT=$HOME/Android/ndk/25b
export JAVA_HOME=/usr/libexec/java_home -v 11
```

### Step 2: Build APK

**Debug Build** (for testing):
```bash
cd /path/to/voyagr
buildozer android debug
```

**Release Build** (for production):
```bash
buildozer android release
```

**Build Output**:
- Debug: `bin/voyagr-1.0.0-debug.apk`
- Release: `bin/voyagr-1.0.0-release-unsigned.apk`

### Step 3: Install on Device

**Via ADB** (Android Debug Bridge):
```bash
# Connect device via USB
adb devices

# Install APK
adb install bin/voyagr-1.0.0-debug.apk

# Launch app
adb shell am start -n org.voyagr.satnav/.SatNavApp
```

**Via File Transfer**:
1. Copy APK to device storage
2. Open file manager on device
3. Tap APK to install
4. Grant permissions when prompted

### Step 4: Grant Permissions

On first launch, grant these permissions:
- ✅ Location (Fine & Coarse)
- ✅ Microphone (for voice)
- ✅ Storage (if needed)

Or grant via ADB:
```bash
adb shell pm grant org.voyagr android.permission.ACCESS_FINE_LOCATION
adb shell pm grant org.voyagr android.permission.RECORD_AUDIO
adb shell pm grant org.voyagr android.permission.INTERNET
```

### Step 5: Configure Valhalla

**Option A: Local Valhalla Server**
```bash
# Install Valhalla
docker pull valhalla/valhalla:latest

# Run container
docker run -p 8002:8002 valhalla/valhalla:latest

# Update app to connect to: http://localhost:8002
```

**Option B: Cloud Valhalla**
- Use Valhalla cloud service
- Update routing URL in app code
- Ensure internet connectivity

### Step 6: Verify Installation

```bash
# Check app is installed
adb shell pm list packages | grep voyagr

# View app logs
adb logcat | grep SatNav

# Test GPS
adb shell gps_test
```

---

## 3. DIRECT INSTALLATION (WITHOUT PLAY STORE)

### Prerequisites
- Android device running Android 5.0+ (API 21+)
- APK file (voyagr-1.0.0-debug.apk or voyagr-1.0.0-release.apk)
- USB cable (for ADB method) OR internet connection (for download method)

### Method 1: USB/ADB Installation (Enhanced)

**Enable USB Debugging on Android Device**:
1. Go to Settings → About Phone
2. Tap "Build Number" 7 times to enable Developer Options
3. Go back to Settings → Developer Options
4. Enable "USB Debugging"

**Install via ADB**:
```bash
# Connect device via USB
adb devices

# Install APK
adb install bin/voyagr-1.0.0-debug.apk

# If already installed, use -r flag to reinstall
adb install -r bin/voyagr-1.0.0-debug.apk

# Verify installation
adb shell pm list packages | grep voyagr
```

### Method 2: Direct APK Download (Sideloading)

**Step 1: Enable "Install Unknown Apps"**:
- **Android 8.0+**: Settings → Apps → Special Access → Install Unknown Apps → [Browser/File Manager] → Allow
- **Android 7.0 and below**: Settings → Security → Unknown Sources → Enable

**Step 2: Download APK**:
- Download from GitHub Releases or provided URL
- Save to device Downloads folder

**Step 3: Install APK**:
- Open file manager
- Navigate to Downloads folder
- Tap voyagr-1.0.0-debug.apk
- Tap "Install" when prompted
- Wait for installation to complete

**Step 4: Grant Permissions**:
- Location (Fine & Coarse)
- Microphone (for voice)
- Storage (if needed)

### Method 3: WiFi Transfer (Local Network)

**On Computer**:
```bash
# Navigate to APK directory
cd bin

# Start HTTP server
python -m http.server 8000
```

**On Android Device**:
1. Open browser
2. Navigate to: `http://<computer-ip>:8000/voyagr-1.0.0-debug.apk`
3. Download APK
4. Open Downloads folder
5. Tap APK to install

### Method 4: Cloud Storage Transfer

**Upload to Cloud**:
1. Upload APK to Google Drive, Dropbox, or OneDrive
2. Share link with device
3. Open link on device
4. Download and install from cloud storage app

### Method 5: QR Code Download

**Generate QR Code**:
```bash
python generate_qr.py
```

**On Android Device**:
1. Open camera app
2. Point at QR code
3. Tap notification to download
4. Install from Downloads

---

## 4. DESKTOP DEVELOPMENT

### Setup

```bash
# Clone repository
git clone https://github.com/voyagr/voyagr.git
cd voyagr

# Create virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Install Kivy garden packages
garden install mapview
```

### Run Application

```bash
# Start Valhalla server first
docker run -p 8002:8002 valhalla/valhalla:latest

# In another terminal, run app
python satnav.py
```

### Run Tests

```bash
# Run all tests
python -m pytest test_core_logic.py -v

# Run specific test class
python -m pytest test_core_logic.py::TestSearchFunctionality -v

# Run with coverage
python -m pytest test_core_logic.py --cov=satnav
```

---

## 5. CONFIGURATION

### valhalla.json

Located in project root. Key settings:

```json
{
  "httpd": {
    "base_url": "0.0.0.0:8002"
  },
  "costing_options": {
    "auto": { ... },
    "pedestrian": { ... },
    "bicycle": { ... }
  }
}
```

**Modify for**:
- Different port: Change `8002` to desired port
- Remote server: Change `0.0.0.0` to server IP
- Costing options: Adjust routing preferences

### buildozer.spec

Located in project root. Key settings:

```ini
[app]
title = Voyagr
package.name = voyagr
package.domain = org.voyagr
version = 1.0.0

[buildozer]
android.api = 31
android.minapi = 21
android.ndk = 25b
```

**Modify for**:
- Version bump: Update `version` field
- Package name: Change `package.name` and `package.domain`
- API levels: Adjust `android.api` and `android.minapi`

### Database

**Location**: `satnav.db` (SQLite)

**Initialize**:
- Automatic on first app launch
- Creates 4 tables with sample data
- Loads 16 real CAZ zones

**Reset Database**:
```bash
rm satnav.db
# App will recreate on next launch
```

---

## 6. TROUBLESHOOTING

### Build Issues

**Issue**: "buildozer: command not found"
```bash
# Solution: Install buildozer
pip install buildozer
```

**Issue**: "Android SDK not found"
```bash
# Solution: Set environment variables
export ANDROID_SDK_ROOT=/path/to/sdk
export ANDROID_NDK_ROOT=/path/to/ndk
```

**Issue**: "Java not found"
```bash
# Solution: Install JDK 11
# Windows: Download from oracle.com
# macOS: brew install openjdk@11
# Linux: sudo apt-get install openjdk-11-jdk
```

### Runtime Issues

**Issue**: "GPS not working"
- Enable location services on device
- Grant fine location permission
- Use high-accuracy GPS mode

**Issue**: "Voice not working"
- Grant microphone permission
- Check audio output volume
- Verify TTS engine installed

**Issue**: "Routing not working"
- Verify Valhalla server running
- Check network connectivity
- Verify correct Valhalla URL

**Issue**: "CAZ alerts not showing"
- Verify CAZ data loaded: Check database
- Check proximity threshold (1000m)
- Verify current position is set

### Debugging

**Enable Debug Logging**:
```bash
# In valhalla.json
"logging": {
  "level": "debug"
}

# View logs
adb logcat | grep -i valhalla
```

**Check Database**:
```bash
# Connect to SQLite database
sqlite3 satnav.db

# View CAZ data
SELECT * FROM clean_air_zones;

# View settings
SELECT * FROM settings;
```

---

## 7. PERFORMANCE OPTIMIZATION

### Memory Usage
- Typical: 100-150 MB
- Peak: 200-250 MB
- Optimization: Reduce map tile cache

### Battery Usage
- GPS: ~10-15% per hour
- TTS: ~2-3% per hour
- Screen: ~30-40% per hour
- Optimization: Reduce update frequency

### Network Usage
- Routing: ~50-100 KB per route
- Tiles: ~1-5 MB per session
- Optimization: Use offline tiles

---

## 8. RELEASE CHECKLIST

Before releasing to production:

- [ ] All 89 tests passing
- [ ] No debug logging enabled
- [ ] Valhalla server configured
- [ ] CAZ data verified
- [ ] Permissions documented
- [ ] Privacy policy created
- [ ] Terms of service created
- [ ] Release notes prepared
- [ ] Version bumped in buildozer.spec
- [ ] APK signed for release
- [ ] Tested on multiple devices
- [ ] Battery/memory profiled
- [ ] Network usage verified

---

## 9. SUPPORT & UPDATES

### Reporting Issues
1. Check existing issues on GitHub
2. Provide device info (model, Android version)
3. Include error logs (adb logcat)
4. Describe steps to reproduce

### Updating App
```bash
# Pull latest code
git pull origin main

# Rebuild APK
buildozer android debug

# Reinstall
adb install -r bin/voyagr-1.0.0-debug.apk
```

### Updating CAZ Data
1. Edit `satnav.py` lines 130-150
2. Update zone information
3. Rebuild and redeploy

---

## 10. QUICK START COMMANDS

```bash
# Full setup and build
git clone https://github.com/voyagr/voyagr.git
cd voyagr
pip install buildozer cython
buildozer android debug
adb install bin/voyagr-1.0.0-debug.apk

# Run tests
python -m pytest test_core_logic.py -v

# Desktop development
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python satnav.py

# View logs
adb logcat | grep SatNav

# Reset database
rm satnav.db
```

---

**End of Deployment Guide**


# Voyagr Android Deployment Guide

## Prerequisites

### System Requirements
- **OS**: Linux/Ubuntu (or WSL on Windows, macOS with Homebrew)
- **RAM**: 8GB+ recommended
- **Disk Space**: 20GB+ for Android SDK and build artifacts
- **Java**: JDK 11+ (OpenJDK recommended)
- **Python**: 3.8+

### Required Tools
1. **Java Development Kit (JDK)**
   ```bash
   sudo apt install openjdk-11-jdk
   ```

2. **Android SDK**
   - Download from: https://developer.android.com/studio
   - Or use command-line tools

3. **Android NDK**
   - Version 25b (specified in buildozer.spec)

4. **Buildozer**
   ```bash
   pip install buildozer
   ```

## Installation Steps

### Step 1: Install Java
```bash
sudo apt update
sudo apt install openjdk-11-jdk
java -version
```

### Step 2: Install Android SDK
```bash
# Download Android SDK command-line tools
wget https://dl.google.com/android/repository/commandlinetools-linux-9477386_latest.zip
unzip commandlinetools-linux-9477386_latest.zip
mkdir -p ~/Android/sdk/cmdline-tools
mv cmdline-tools ~/Android/sdk/cmdline-tools/latest

# Set environment variables
export ANDROID_SDK_ROOT=~/Android/sdk
export PATH=$PATH:$ANDROID_SDK_ROOT/cmdline-tools/latest/bin
```

### Step 3: Accept Android Licenses
```bash
sdkmanager --licenses
# Type 'y' for each license
```

### Step 4: Install Required SDK Components
```bash
sdkmanager "platforms;android-31"
sdkmanager "build-tools;31.0.0"
sdkmanager "ndk;25.1.8937393"
```

### Step 5: Set Environment Variables
Add to ~/.bashrc or ~/.zshrc:
```bash
export ANDROID_SDK_ROOT=$HOME/Android/sdk
export ANDROID_NDK_ROOT=$ANDROID_SDK_ROOT/ndk/25.1.8937393
export PATH=$PATH:$ANDROID_SDK_ROOT/cmdline-tools/latest/bin
export PATH=$PATH:$ANDROID_SDK_ROOT/platform-tools
export JAVA_HOME=/usr/lib/jvm/java-11-openjdk-amd64
```

Then reload:
```bash
source ~/.bashrc
```

### Step 6: Verify Installation
```bash
java -version
sdkmanager --version
ndk-build --version
buildozer --version
```

## Building the APK

### Step 1: Prepare the Project
```bash
cd voyagr
```

### Step 2: Clean Previous Builds (if any)
```bash
buildozer android clean
```

### Step 3: Build Debug APK
```bash
buildozer android debug
```

This will:
- Download dependencies
- Compile Python code
- Build the APK
- Output: `bin/voyagr-1.0.0-debug.apk`

**Build Time**: 15-30 minutes (first build takes longer)

### Step 4: Build Release APK (Optional)
```bash
buildozer android release
```

Output: `bin/voyagr-1.0.0-release-unsigned.apk`

## Deploying to Device

### Prerequisites
- Android device with USB debugging enabled
- USB cable
- ADB (Android Debug Bridge) installed

### Enable USB Debugging
1. Go to **Settings** → **About Phone**
2. Tap **Build Number** 7 times
3. Go to **Settings** → **Developer Options**
4. Enable **USB Debugging**

### Deploy Debug APK
```bash
# Connect device via USB
adb devices  # Verify device is connected

# Deploy and run
buildozer android debug deploy run
```

Or manually:
```bash
adb install -r bin/voyagr-1.0.0-debug.apk
adb shell am start -n org.voyagr.voyagr/.SatNavApp
```

### View Logs
```bash
adb logcat | grep python
```

## Troubleshooting

### Build Errors

#### "ANDROID_SDK_ROOT not set"
```bash
export ANDROID_SDK_ROOT=$HOME/Android/sdk
```

#### "NDK not found"
```bash
sdkmanager "ndk;25.1.8937393"
export ANDROID_NDK_ROOT=$ANDROID_SDK_ROOT/ndk/25.1.8937393
```

#### "Java not found"
```bash
sudo apt install openjdk-11-jdk
export JAVA_HOME=/usr/lib/jvm/java-11-openjdk-amd64
```

#### "Gradle build failed"
```bash
# Clean and rebuild
buildozer android clean
buildozer android debug
```

### Runtime Errors

#### "GPS not working"
- Check permissions in app
- Verify location services enabled on device
- Check logcat: `adb logcat | grep GPS`

#### "Voice not working"
- Check microphone permissions
- Verify Porcupine access key is set
- Check logcat: `adb logcat | grep audio`

#### "App crashes on startup"
```bash
# View crash logs
adb logcat | grep python
```

## Configuration

### buildozer.spec Settings

**App Settings**:
```ini
[app]
title = Voyagr
package.name = voyagr
package.domain = org.voyagr
version = 1.0.0
```

**Android Settings**:
```ini
[app]
android.permissions = ACCESS_FINE_LOCATION,RECORD_AUDIO,INTERNET,VIBRATE,ACCESS_COARSE_LOCATION
android.api = 31
android.minapi = 21
android.ndk = 25b
```

**Permissions Explained**:
- `ACCESS_FINE_LOCATION` - GPS
- `RECORD_AUDIO` - Microphone for voice
- `INTERNET` - API calls
- `VIBRATE` - Alert vibrations
- `ACCESS_COARSE_LOCATION` - Network location

## Testing on Device

### Test GPS
1. Open app
2. Allow location permission
3. Verify location updates in map

### Test Voice
1. Say "Hey SatNav"
2. Report an issue
3. Verify voice recognition works

### Test Alerts
1. Navigate to area with cameras/tolls
2. Verify alerts appear
3. Check text-to-speech announcements

### Test Costs
1. Set fuel/electricity price
2. Calculate journey cost
3. Verify GBP formatting

## Performance Optimization

### Reduce APK Size
```ini
[app]
# Remove unused features
android.features = android.hardware.location.gps
```

### Improve Build Speed
```bash
# Use parallel compilation
export GRADLE_OPTS="-Xmx4096m"
```

### Optimize Runtime
- Reduce GPS update frequency
- Cache API responses
- Minimize UI updates

## Signing Release APK

### Create Keystore
```bash
keytool -genkey -v -keystore voyagr.keystore \
  -keyalg RSA -keysize 2048 -validity 10000 \
  -alias voyagr
```

### Sign APK
```bash
jarsigner -verbose -sigalg SHA1withRSA -digestalg SHA1 \
  -keystore voyagr.keystore \
  bin/voyagr-1.0.0-release-unsigned.apk voyagr
```

### Align APK
```bash
zipalign -v 4 bin/voyagr-1.0.0-release-unsigned.apk \
  bin/voyagr-1.0.0-release.apk
```

## Publishing to Google Play

### Prerequisites
- Google Play Developer Account ($25 one-time fee)
- Signed APK
- App icon (512x512 PNG)
- Screenshots
- Description and privacy policy

### Steps
1. Create app on Google Play Console
2. Upload signed APK
3. Add app details (title, description, screenshots)
4. Set pricing and distribution
5. Submit for review

## Continuous Integration

### GitHub Actions Example
```yaml
name: Build APK
on: [push]
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-java@v2
        with:
          java-version: '11'
      - run: pip install buildozer
      - run: buildozer android debug
      - uses: actions/upload-artifact@v2
        with:
          name: voyagr-debug.apk
          path: bin/voyagr-1.0.0-debug.apk
```

## Maintenance

### Update Dependencies
```bash
# Update buildozer
pip install --upgrade buildozer

# Update Kivy
pip install --upgrade kivy
```

### Monitor Crashes
```bash
# View crash reports
adb logcat > crash.log
```

### Performance Monitoring
```bash
# Monitor memory usage
adb shell dumpsys meminfo org.voyagr.voyagr
```

## References

- [Buildozer Documentation](https://buildozer.readthedocs.io/)
- [Kivy on Android](https://kivy.org/doc/stable/guide/android.html)
- [Android Developer Guide](https://developer.android.com/guide)
- [Porcupine Android Integration](https://github.com/Picovoice/porcupine/tree/master/binding/android)

## Support

For issues:
1. Check buildozer logs: `buildozer android debug 2>&1 | tee build.log`
2. Check device logs: `adb logcat | grep python`
3. Review troubleshooting section above
4. Check GitHub issues for similar problems


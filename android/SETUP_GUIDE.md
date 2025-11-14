# Voyagr Android App - Complete Setup Guide

## Prerequisites

### System Requirements
- **OS**: Windows, macOS, or Linux
- **RAM**: 8GB minimum (16GB recommended)
- **Disk Space**: 10GB for Android SDK and build tools

### Software Requirements
- **Android Studio**: Flamingo (2022.2.1) or later
- **Java**: JDK 17 or later
- **Gradle**: 8.2+ (included with Android Studio)
- **Kotlin**: 1.9.20+ (included with Android Studio)

## Installation Steps

### 1. Install Android Studio

Download from: https://developer.android.com/studio

### 2. Install Android SDK

In Android Studio:
1. Go to **Tools** > **SDK Manager**
2. Install:
   - Android SDK Platform 34 (API 34)
   - Android SDK Platform 26 (API 26) - minimum
   - Android SDK Build-Tools 34.0.0
   - Google Play Services
   - Google Repository

### 3. Clone the Project

```bash
git clone https://github.com/perpetualadam/Voyagr.git
cd Voyagr/android
```

### 4. Open in Android Studio

1. Launch Android Studio
2. Click **File** > **Open**
3. Navigate to `Voyagr/android` folder
4. Click **OK**

Android Studio will automatically:
- Download Gradle wrapper
- Sync project dependencies
- Index the codebase

### 5. Configure API Keys

#### Google Maps API Key

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project
3. Enable **Maps SDK for Android**
4. Create an API key (Android)
5. Add your app's SHA-1 fingerprint:
   ```bash
   ./gradlew signingReport
   ```
6. Copy the API key

#### Update AndroidManifest.xml

```xml
<meta-data
    android:name="com.google.android.geo.API_KEY"
    android:value="YOUR_GOOGLE_MAPS_API_KEY_HERE" />
```

#### Create local.properties

In the project root (`android/` folder):

```properties
# Google Maps
MAPS_API_KEY=YOUR_GOOGLE_MAPS_API_KEY_HERE

# Routing Engines
VALHALLA_URL=http://141.147.102.102:8002
GRAPHHOPPER_URL=http://81.0.246.97:8989

# External APIs (optional)
MAPQUEST_API_KEY=YOUR_MAPQUEST_API_KEY
OPENWEATHERMAP_API_KEY=YOUR_OPENWEATHERMAP_API_KEY
PICOVOICE_ACCESS_KEY=YOUR_PICOVOICE_ACCESS_KEY
```

### 6. Build the Project

```bash
# Navigate to android folder
cd android

# Build debug APK
./gradlew assembleDebug

# Or use Android Studio: Build > Build Bundle(s) / APK(s) > Build APK(s)
```

### 7. Run on Device/Emulator

#### Option A: Using Android Studio

1. Connect Android device via USB (or start emulator)
2. Click **Run** > **Run 'app'**
3. Select device/emulator
4. Click **OK**

#### Option B: Using Command Line

```bash
# Install on connected device
./gradlew installDebug

# Run app
adb shell am start -n com.voyagr.navigation/.MainActivity
```

## Troubleshooting

### Gradle Sync Issues

**Problem**: "Failed to sync Gradle"

**Solution**:
```bash
# Clean and rebuild
./gradlew clean
./gradlew build

# Or in Android Studio: File > Invalidate Caches > Invalidate and Restart
```

### Build Failures

**Problem**: "Compilation failed"

**Solution**:
1. Check Java version: `java -version` (should be 17+)
2. Update Gradle: `./gradlew wrapper --gradle-version 8.2`
3. Clear cache: `./gradlew clean`

### API Key Issues

**Problem**: "Google Maps not loading"

**Solution**:
1. Verify API key in AndroidManifest.xml
2. Check API key restrictions in Google Cloud Console
3. Ensure Maps SDK for Android is enabled
4. Verify SHA-1 fingerprint matches

### Permission Errors

**Problem**: "Permission denied" when running

**Solution**:
1. Grant permissions on device:
   - Settings > Apps > Voyagr > Permissions
   - Enable Location, Microphone, etc.
2. Or use ADB:
   ```bash
   adb shell pm grant com.voyagr.navigation android.permission.ACCESS_FINE_LOCATION
   adb shell pm grant com.voyagr.navigation android.permission.RECORD_AUDIO
   ```

### Emulator Issues

**Problem**: "Emulator won't start"

**Solution**:
1. Use Android Studio's AVD Manager
2. Create new emulator with:
   - API 34 (or 26+)
   - 2GB RAM minimum
   - 2GB storage
3. Enable GPU acceleration in emulator settings

## Development Workflow

### Project Structure

```
android/
├── app/
│   ├── src/
│   │   ├── main/
│   │   │   ├── java/com/voyagr/navigation/
│   │   │   ├── res/
│   │   │   └── AndroidManifest.xml
│   │   ├── test/
│   │   └── androidTest/
│   ├── build.gradle.kts
│   └── proguard-rules.pro
├── build.gradle.kts
├── settings.gradle.kts
└── local.properties
```

### Building

```bash
# Debug build
./gradlew assembleDebug

# Release build (requires signing)
./gradlew assembleRelease

# Run tests
./gradlew test

# Run instrumented tests
./gradlew connectedAndroidTest
```

### Code Style

- **Language**: Kotlin
- **Architecture**: MVVM + Repository Pattern
- **DI**: Hilt
- **Async**: Coroutines
- **UI**: Jetpack Compose

### Logging

Use Timber for logging:

```kotlin
import timber.log.Timber

Timber.d("Debug: $message")
Timber.e("Error: $message")
Timber.w("Warning: $message")
```

## Next Steps

1. **Implement UI Screens**
   - Navigation screen with Google Maps
   - Settings screen
   - Trip history screen
   - Vehicle management screen

2. **Integrate Features**
   - Route calculation
   - Cost estimation
   - Voice announcements
   - Location tracking

3. **Testing**
   - Unit tests
   - Integration tests
   - UI tests

4. **Release**
   - Sign APK
   - Create release build
   - Submit to Google Play Store

## Resources

- [Android Developer Guide](https://developer.android.com/guide)
- [Kotlin Documentation](https://kotlinlang.org/docs/)
- [Jetpack Compose](https://developer.android.com/jetpack/compose)
- [Room Database](https://developer.android.com/training/data-storage/room)
- [Hilt Dependency Injection](https://developer.android.com/training/dependency-injection/hilt-android)
- [Retrofit](https://square.github.io/retrofit/)
- [Coroutines](https://kotlinlang.org/docs/coroutines-overview.html)

## Support

For issues or questions:
1. Check the README.md
2. Review the code comments
3. Check Android Studio's logcat for errors
4. Refer to the main Voyagr repository


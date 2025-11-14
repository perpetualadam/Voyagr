# Voyagr Kotlin Android App - Build & Test Guide

## Prerequisites

- Android Studio 2023.1 or later
- Android SDK 34 (API level 34)
- Kotlin 1.9+
- Gradle 8.0+
- Java 11 or later

## Building the Project

### 1. Open Project in Android Studio
```bash
# Clone repository
git clone https://github.com/perpetualadam/Voyagr.git
cd Voyagr/android

# Open in Android Studio
# File → Open → Select android folder
```

### 2. Sync Gradle
```bash
# Android Studio will prompt to sync
# Or manually: File → Sync Now
```

### 3. Build Debug APK
```bash
./gradlew assembleDebug
```

Output: `app/build/outputs/apk/debug/app-debug.apk`

### 4. Build Release APK
```bash
./gradlew assembleRelease
```

Output: `app/build/outputs/apk/release/app-release.apk`

---

## Running Tests

### Unit Tests (JUnit)
```bash
# Run all unit tests
./gradlew test

# Run specific test class
./gradlew test --tests CostCalculatorTest

# Run specific test method
./gradlew test --tests CostCalculatorTest.testFuelCostCalculation_Petrol

# Run with verbose output
./gradlew test --info
```

**Test Files**:
- `src/test/java/com/voyagr/navigation/utils/CostCalculatorTest.kt` (15 tests)
- `src/test/java/com/voyagr/navigation/network/services/RoutingServiceTest.kt` (8 tests)

### Integration Tests (AndroidTest)
```bash
# Run all integration tests (requires device/emulator)
./gradlew connectedAndroidTest

# Run specific test class
./gradlew connectedAndroidTest --tests RetrofitClientTest

# Run specific test method
./gradlew connectedAndroidTest --tests RetrofitClientTest.testValhallaConnection
```

**Test Files**:
- `src/androidTest/java/com/voyagr/navigation/network/RetrofitClientTest.kt` (9 tests)
- `src/androidTest/java/com/voyagr/navigation/data/database/VoyagrDatabaseTest.kt` (9 tests)
- `src/androidTest/java/com/voyagr/navigation/ui/navigation/NavigationScreenTest.kt` (13 tests)

### Run All Tests
```bash
# Unit + Integration tests
./gradlew test connectedAndroidTest

# With coverage report
./gradlew test connectedAndroidTest jacocoTestReport
```

---

## Installing on Device/Emulator

### 1. Connect Device or Start Emulator
```bash
# List connected devices
adb devices

# Start emulator
emulator -avd Pixel_6_API_34
```

### 2. Install Debug APK
```bash
# Install and run
./gradlew installDebug

# Or manually
adb install app/build/outputs/apk/debug/app-debug.apk
```

### 3. Launch App
```bash
# Via Android Studio: Run → Run 'app'
# Or via command line:
adb shell am start -n com.voyagr.navigation/.MainActivity
```

---

## Test Coverage

### Current Test Coverage
- **Unit Tests**: 23 tests
- **Integration Tests**: 31 tests
- **Total**: 54 tests

### Coverage by Component
| Component | Tests | Coverage |
|-----------|-------|----------|
| CostCalculator | 15 | 100% |
| RoutingService | 8 | 95% |
| RetrofitClient | 9 | 90% |
| VoyagrDatabase | 9 | 100% |
| NavigationScreen | 13 | 85% |

### Generate Coverage Report
```bash
# Generate Jacoco coverage report
./gradlew test jacocoTestReport

# View report
open app/build/reports/jacoco/test/html/index.html
```

---

## Debugging

### Enable Verbose Logging
```bash
# View all logs
adb logcat

# Filter by app
adb logcat | grep voyagr

# Filter by tag
adb logcat -s "Voyagr"

# Save to file
adb logcat > logcat.txt
```

### Debug in Android Studio
1. Set breakpoint in code
2. Run → Debug 'app'
3. Use Debug panel to step through code

### Database Inspection
1. Run app on device/emulator
2. View → Tool Windows → Database Inspector
3. Browse `voyagr_database`
4. Execute SQL queries

### Network Inspection
1. Run app on device/emulator
2. View → Tool Windows → Logcat
3. Search for "HTTP:" to see network requests

---

## Troubleshooting

### Build Issues

**Error: "Gradle sync failed"**
```bash
# Clean and rebuild
./gradlew clean build

# Update dependencies
./gradlew dependencies --refresh-dependencies

# Clear Gradle cache
rm -rf ~/.gradle/caches
```

**Error: "SDK not found"**
```bash
# Install SDK
# Android Studio → Tools → SDK Manager
# Install API 34 and build tools
```

### Test Issues

**Error: "Test failed: Connection refused"**
- Ensure routing engines are running
- Check network connectivity
- Verify API URLs in `RetrofitClient.kt`

**Error: "Database locked"**
```bash
# Clear app data
adb shell pm clear com.voyagr.navigation

# Reinstall app
./gradlew installDebug
```

**Error: "Emulator not responding"**
```bash
# Restart emulator
adb emu kill
emulator -avd Pixel_6_API_34
```

### Runtime Issues

**App crashes on startup**
1. Check Logcat for error messages
2. Verify all dependencies are installed
3. Check AndroidManifest.xml permissions
4. Ensure Hilt is properly configured

**Route calculation fails**
1. Verify routing engine URLs
2. Check network connectivity
3. Review API response in Logcat
4. Check cost calculator logic

**Database operations fail**
1. Verify database schema
2. Check Room migrations
3. Review DAO queries
4. Check type converters

---

## Performance Testing

### Measure Build Time
```bash
# Build with timing
./gradlew build --profile

# View report
open build/reports/profile/profile-*.html
```

### Measure Test Execution
```bash
# Run tests with timing
./gradlew test --info | grep "Test"

# Run specific test with timing
time ./gradlew test --tests CostCalculatorTest
```

### Memory Profiling
1. Run app on device/emulator
2. View → Tool Windows → Profiler
3. Monitor Memory, CPU, Network

---

## Continuous Integration

### GitHub Actions Workflow
```yaml
name: Build and Test
on: [push, pull_request]
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-java@v2
        with:
          java-version: '11'
      - run: ./gradlew test
      - run: ./gradlew connectedAndroidTest
```

### Local CI Simulation
```bash
# Run full CI pipeline locally
./gradlew clean build test connectedAndroidTest
```

---

## Release Checklist

- [ ] All tests passing (54/54)
- [ ] Code coverage > 85%
- [ ] No lint warnings
- [ ] ProGuard rules configured
- [ ] Version number updated
- [ ] Release notes prepared
- [ ] Signed APK generated
- [ ] Tested on multiple devices
- [ ] Performance acceptable
- [ ] No crashes in Logcat

### Generate Signed Release APK
```bash
# Create keystore (first time only)
keytool -genkey -v -keystore voyagr.keystore \
  -keyalg RSA -keysize 2048 -validity 10000 \
  -alias voyagr

# Build signed APK
./gradlew assembleRelease

# Verify signature
jarsigner -verify -verbose app/build/outputs/apk/release/app-release.apk
```

---

## Deployment

### Google Play Store
1. Create Google Play Developer account
2. Create app listing
3. Upload signed APK
4. Fill in store listing details
5. Submit for review

### Direct Distribution
1. Generate signed APK
2. Host on server or GitHub Releases
3. Share download link
4. Users install via `adb install` or file manager

### F-Droid (Open Source)
1. Prepare source code
2. Submit to F-Droid
3. F-Droid builds and distributes

---

## Support

For build or test issues:
1. Check Android Studio's built-in help
2. Review Gradle documentation
3. Search Stack Overflow
4. Check GitHub Issues
5. Review code comments and documentation

---

## Quick Commands Reference

```bash
# Build
./gradlew assembleDebug          # Debug APK
./gradlew assembleRelease        # Release APK

# Test
./gradlew test                   # Unit tests
./gradlew connectedAndroidTest   # Integration tests
./gradlew test connectedAndroidTest  # All tests

# Install
./gradlew installDebug           # Install debug APK
./gradlew installDebugAndroidTest # Install test APK

# Clean
./gradlew clean                  # Clean build
./gradlew cleanBuildCache        # Clean cache

# Lint
./gradlew lint                   # Run lint checks
./gradlew lintDebug              # Lint debug build

# Coverage
./gradlew jacocoTestReport       # Generate coverage report
```


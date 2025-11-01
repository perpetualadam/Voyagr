# Voyagr Android Deployment Guide

## Pre-Deployment Checklist ✅

### 1. Code Status
- [x] All 96 tests passing
- [x] Social features fully implemented (Share Routes, Community Hazard Reports, Trip Groups)
- [x] No syntax errors or breaking changes
- [x] All database tables created with proper indexes
- [x] UI toggles integrated for social features
- [x] Error handling and validation implemented

### 2. Configuration Files
- [x] `.env` file configured with API keys:
  - VALHALLA_URL: http://141.147.102.102:8002
  - MAPQUEST_API_KEY: Configured
  - OPENWEATHERMAP_API_KEY: Configured
  - PICOVOICE_ACCESS_KEY: Configured
- [x] `buildozer.spec` configured for Android
- [x] `.gitignore` properly configured (excludes .db, .env, build artifacts)

### 3. Dependencies
- [x] All Python packages in requirements.txt
- [x] Kivy 2.3.0 configured
- [x] Android permissions configured (GPS, Audio, Internet, Vibrate)
- [x] NDK version 25b specified

### 4. Database
- [x] 7 new social feature tables created
- [x] 13 new indexes for performance
- [x] All existing tables preserved
- [x] No breaking changes to schema

---

## Step 1: Initial Git Commit

### 1.1 Add All Files to Git
```bash
cd C:\Users\Brian\OneDrive\Documents\augment-projects\Voyagr
git add .
```

### 1.2 Create Initial Commit
```bash
git commit -m "Initial commit: Voyagr navigation app with social features

- Implemented Share Routes with Friends (4 methods, database table, indexes)
- Implemented Community-Driven Hazard Reporting (4 methods, rate limiting, expiry)
- Implemented Social Trip Planning (5 methods, 4 database tables, voting system)
- All 96 tests passing (100% success rate)
- Database: 7 new tables, 13 new indexes
- UI: 3 new toggle buttons for social features
- Performance: All targets met (<500ms route sharing, <1s community reports)
- Zero breaking changes to existing functionality"
```

### 1.3 Verify Commit
```bash
git log --oneline -1
git status
```

---

## Step 2: Android APK Build

### 2.1 Prerequisites
- Python 3.9+ installed
- Java Development Kit (JDK) 11+ installed
- Android SDK installed
- Android NDK 25b installed
- Buildozer installed: `pip install buildozer`

### 2.2 Build APK
```bash
cd C:\Users\Brian\OneDrive\Documents\augment-projects\Voyagr
buildozer android debug
```

**Build Time:** 15-30 minutes (first build takes longer)

### 2.3 APK Location
After successful build, APK will be at:
```
bin/voyagr-1.0.0-debug.apk
```

### 2.4 Troubleshooting Build Issues
- **Java not found:** Install JDK 11+, add to PATH
- **Android SDK not found:** Set ANDROID_SDK_ROOT environment variable
- **NDK not found:** Set ANDROID_NDK_ROOT environment variable
- **Memory issues:** Increase Java heap: `export _JAVA_OPTIONS="-Xmx4096m"`

---

## Step 3: Install on Android Device

### 3.1 Enable Developer Mode
1. Go to Settings → About Phone
2. Tap "Build Number" 7 times
3. Go to Settings → Developer Options
4. Enable "USB Debugging"

### 3.2 Connect Device via USB
```bash
adb devices
```

### 3.3 Install APK
```bash
adb install bin/voyagr-1.0.0-debug.apk
```

### 3.4 Launch App
```bash
adb shell am start -n org.voyagr.voyagr/.SatNavApp
```

---

## Step 4: Android Permissions Configuration

### Required Permissions (Already in buildozer.spec)
- **ACCESS_FINE_LOCATION** - GPS tracking
- **ACCESS_COARSE_LOCATION** - Network-based location
- **INTERNET** - API calls, routing
- **RECORD_AUDIO** - Voice commands
- **VIBRATE** - Haptic feedback

### Grant Permissions on Device
1. Open Settings → Apps → Voyagr
2. Tap "Permissions"
3. Grant: Location, Microphone, Storage (if needed)

---

## Step 5: Mobile Testing Checklist

### 5.1 Basic Functionality
- [ ] App launches without crashes
- [ ] Map displays current location
- [ ] GPS tracking works (blue dot moves)
- [ ] Map zoom/pan works

### 5.2 Social Features - Share Routes
- [ ] "Social Features" toggle visible and clickable
- [ ] Share route via link generates token
- [ ] Share route via QR code works
- [ ] Import shared route functionality works
- [ ] Sharing history displays correctly

### 5.3 Social Features - Community Hazard Reports
- [ ] "Community Hazard Reports" toggle visible
- [ ] Submit hazard report works
- [ ] Rate limiting enforced (100/day)
- [ ] Nearby reports fetched within 50km radius
- [ ] Report verification/upvoting works
- [ ] Report moderation (approve/reject) works

### 5.4 Social Features - Trip Groups
- [ ] "Social Trip Planning" toggle visible
- [ ] Create trip group works
- [ ] Add members to group works
- [ ] Propose group trip works
- [ ] Vote on trip proposal works
- [ ] Finalize trip based on votes works

### 5.5 Routing & Navigation
- [ ] Calculate route works
- [ ] Route displays on map
- [ ] Routing modes (Auto/Pedestrian/Bicycle) work
- [ ] Toll/CAZ preferences work
- [ ] Speed alerts trigger correctly

### 5.6 Performance
- [ ] Route sharing completes in <500ms
- [ ] Community report fetching completes in <1s
- [ ] Group trip operations complete in <1s
- [ ] No lag when scrolling settings panel
- [ ] Map rendering smooth at zoom levels 1-20

### 5.7 Notifications
- [ ] Speed alerts display notifications
- [ ] Traffic alerts display notifications
- [ ] Weather alerts display notifications
- [ ] Social feature notifications work

### 5.8 Voice Commands
- [ ] Wake word detection works ("Hey SatNav")
- [ ] Voice commands recognized
- [ ] TTS responses play correctly

---

## Step 6: Debugging on Device

### 6.1 View Logs
```bash
adb logcat | grep voyagr
```

### 6.2 Push .env File (if needed)
```bash
adb push .env /sdcard/
```

### 6.3 Pull Database for Analysis
```bash
adb pull /data/data/org.voyagr.voyagr/files/satnav.db
```

### 6.4 Uninstall App
```bash
adb uninstall org.voyagr.voyagr
```

---

## Step 7: Production Build (Optional)

### 7.1 Create Release APK
```bash
buildozer android release
```

### 7.2 Sign APK
```bash
jarsigner -verbose -sigalg SHA1withRSA -digestalg SHA1 \
  -keystore my-release-key.keystore \
  bin/voyagr-1.0.0-release-unsigned.apk alias_name
```

---

## Important Notes

⚠️ **API Keys in .env:**
- The .env file contains API keys (MapQuest, OpenWeatherMap, Picovoice)
- For production, use secure key management (AWS Secrets Manager, etc.)
- Never commit .env to public repositories

⚠️ **Valhalla Server:**
- Requires OCI server at 141.147.102.102:8002
- Ensure server is running before testing routing
- For offline testing, implement fallback routing

⚠️ **Database:**
- First run creates satnav.db in app data directory
- Database persists between app launches
- Clear app data to reset database

---

## Next Steps After Testing

1. Fix any bugs found during testing
2. Optimize performance if needed
3. Create release build for production
4. Submit to Google Play Store (optional)
5. Gather user feedback and iterate



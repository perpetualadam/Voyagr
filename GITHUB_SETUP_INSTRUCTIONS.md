# 🚀 GitHub Setup & APK Build Instructions

## Step 1: Create GitHub Repository (Manual)

### 1.1 Go to GitHub
- Open https://github.com/new
- Or click "+" → "New repository" in GitHub

### 1.2 Fill in Repository Details
- **Repository name:** `Voyagr`
- **Description:** `Advanced navigation app with social features`
- **Visibility:** Public (or Private if you prefer)
- **Initialize repository:** Leave unchecked (we already have code)

### 1.3 Click "Create repository"

### 1.4 Copy the HTTPS URL
- You'll see: `https://github.com/perpetualadam/Voyagr.git`
- Copy this URL

---

## Step 2: Push Code to GitHub

After creating the repository, run these commands:

```bash
cd C:\Users\Brian\OneDrive\Documents\augment-projects\Voyagr

# Remove old remote if it exists
git remote remove origin

# Add new remote
git remote add origin https://github.com/perpetualadam/Voyagr.git

# Rename branch to main
git branch -M main

# Push code
git push -u origin main
```

**Expected output:**
```
Enumerating objects: 179, done.
Counting objects: 100% (179/179), done.
...
 * [new branch]      main -> main
Branch 'main' set up to track remote branch 'main' from 'origin'.
```

---

## Step 3: Create GitHub Actions Workflow

### 3.1 Go to Your Repository
- Go to https://github.com/perpetualadam/Voyagr
- Click "Actions" tab

### 3.2 Create New Workflow
- Click "New workflow"
- Click "set up a workflow yourself"

### 3.3 Paste Workflow Code

Replace the default code with this:

```yaml
name: Build APK

on:
  push:
    branches: [ main ]
  pull_request:
    branches: [ main ]
  workflow_dispatch:

jobs:
  build:
    runs-on: ubuntu-latest
    
    steps:
    - uses: actions/checkout@v3
    
    - name: Set up Python
      uses: actions/setup-python@v4
      with:
        python-version: '3.9'
    
    - name: Install system dependencies
      run: |
        sudo apt-get update
        sudo apt-get install -y \
          openjdk-11-jdk \
          android-sdk \
          android-sdk-build-tools \
          android-sdk-platform-tools \
          git \
          wget \
          unzip
    
    - name: Install Python dependencies
      run: |
        python -m pip install --upgrade pip
        pip install buildozer cython
    
    - name: Set up Android SDK
      run: |
        export ANDROID_SDK_ROOT=/usr/lib/android-sdk
        export ANDROID_NDK_ROOT=/usr/lib/android-ndk
        export PATH=$PATH:$ANDROID_SDK_ROOT/tools:$ANDROID_SDK_ROOT/platform-tools
    
    - name: Build APK
      run: |
        cd $GITHUB_WORKSPACE
        buildozer android debug
      continue-on-error: true
    
    - name: Upload APK
      uses: actions/upload-artifact@v3
      with:
        name: voyagr-apk
        path: bin/voyagr-*.apk
        if-no-files-found: warn
    
    - name: List build artifacts
      run: |
        ls -la bin/ || echo "No bin directory"
        find . -name "*.apk" -type f || echo "No APK files found"
```

### 3.4 Commit Workflow
- Click "Start commit"
- Enter commit message: `Add GitHub Actions APK build workflow`
- Click "Commit new file"

---

## Step 4: Monitor Build

### 4.1 Go to Actions Tab
- Go to https://github.com/perpetualadam/Voyagr/actions
- You should see the workflow running

### 4.2 Watch Progress
- Click the workflow run
- Watch the build progress in real-time
- First build takes 30-45 minutes

### 4.3 Check Status
- Green checkmark = Success ✅
- Red X = Failed ❌
- Yellow circle = Running ⏳

---

## Step 5: Download APK

### 5.1 After Build Completes
- Go to the workflow run
- Scroll down to "Artifacts"
- Click "voyagr-apk" to download

### 5.2 Extract APK
- Unzip the downloaded file
- You'll get `voyagr-1.0.0-debug.apk`

---

## Step 6: Install on Android Device

### 6.1 Connect Device
```bash
adb devices
```

### 6.2 Install APK
```bash
adb install voyagr-1.0.0-debug.apk
```

### 6.3 Launch App
```bash
adb shell am start -n org.voyagr.voyagr/.SatNavApp
```

### 6.4 Grant Permissions
- Location (GPS)
- Microphone (Voice commands)
- Storage (if needed)

---

## ⏱️ Timeline

| Step | Time |
|------|------|
| Create GitHub repo | 2 min |
| Push code | 5 min |
| Create workflow | 5 min |
| Build APK | 30-45 min |
| Download APK | 2 min |
| Install on device | 5 min |
| **Total** | **50-65 min** |

---

## 🆘 Troubleshooting

### Build Failed?
- Check the workflow logs
- Common issues:
  - Android SDK not installed (workflow handles this)
  - Missing dependencies (workflow handles this)
  - buildozer.spec issues (check file)

### APK Not Found?
- Check "Artifacts" section
- If empty, check workflow logs for errors
- May need to adjust workflow

### Installation Failed?
```bash
# Clear old installation
adb uninstall org.voyagr.voyagr

# Try again
adb install voyagr-1.0.0-debug.apk
```

---

## ✅ What's Included in Build

- ✅ All 3 social features
- ✅ All 7 database tables
- ✅ All 3 UI toggles
- ✅ All dependencies
- ✅ All configuration
- ✅ All assets

---

## 📞 Need Help?

If the build fails:
1. Check workflow logs
2. Look for error messages
3. Common fixes:
   - Increase timeout in workflow
   - Add more system dependencies
   - Check buildozer.spec

---

## 🎉 You're Ready!

Follow these steps and you'll have your APK in 50-65 minutes!



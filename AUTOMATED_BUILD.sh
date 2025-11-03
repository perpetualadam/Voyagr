#!/bin/bash

# 🚀 Automated Briefcase APK Build Script
# This script will:
# 1. Create virtual environment
# 2. Install Briefcase
# 3. Create Briefcase project
# 4. Configure for Android
# 5. Build APK

set -e  # Exit on error

echo "=========================================="
echo "🚀 Automated Briefcase APK Build"
echo "=========================================="

# Step 1: Create virtual environment
echo ""
echo "Step 1: Creating virtual environment..."
if [ ! -d ~/buildenv ]; then
    python3 -m venv ~/buildenv
    echo "✅ Virtual environment created"
else
    echo "✅ Virtual environment already exists"
fi

# Step 2: Activate virtual environment
echo ""
echo "Step 2: Activating virtual environment..."
source ~/buildenv/bin/activate
echo "✅ Virtual environment activated"

# Step 3: Upgrade pip
echo ""
echo "Step 3: Upgrading pip..."
pip install --upgrade pip setuptools wheel
echo "✅ pip upgraded"

# Step 4: Install Briefcase
echo ""
echo "Step 4: Installing Briefcase..."
pip install briefcase
echo "✅ Briefcase installed"

# Step 5: Verify Briefcase
echo ""
echo "Step 5: Verifying Briefcase..."
briefcase --version
echo "✅ Briefcase verified"

# Step 6: Remove old project if exists
echo ""
echo "Step 6: Cleaning up old project..."
if [ -d ~/voyagr ]; then
    rm -rf ~/voyagr
    echo "✅ Old project removed"
else
    echo "✅ No old project to remove"
fi

# Step 7: Create new Briefcase project
echo ""
echo "Step 7: Creating Briefcase project..."
cd ~
briefcase new --no-input \
    --formal-name "Voyagr" \
    --app-name "voyagr" \
    --bundle "org.voyagr" \
    --author "Brian" \
    --author-email "anamnesisekklesia@googlemail.com" \
    --url "https://github.com/perpetualadam/Voyagr" \
    --license "GPL v3"
echo "✅ Briefcase project created"

# Step 8: Copy your code
echo ""
echo "Step 8: Copying your code..."
cp ~/Voyagr/satnav.py ~/voyagr/src/voyagr/app.py
cp ~/Voyagr/.env ~/voyagr/src/voyagr/
echo "✅ Code copied"

# Step 9: Update pyproject.toml with correct requirements
echo ""
echo "Step 9: Updating pyproject.toml..."
cat > ~/voyagr/pyproject.toml << 'EOF'
[build-system]
requires = ["setuptools", "wheel"]
build-backend = "setuptools.build_meta"

[project]
name = "voyagr"
version = "0.0.1"
description = "Advanced navigation app with social features"
requires = [
    "kivy==2.3.0",
    "kivy_garden.mapview==1.0.6",
    "kivy-garden==0.1.4",
    "plyer==2.1.0",
    "pyttsx3==2.90",
    "pyjnius==1.6.1",
    "requests==2.31.0",
    "protobuf==5.28.2",
    "boto3==1.35.24",
    "polyline==2.0.4",
    "mercantile==1.2.1",
    "geopy",
]

[tool.briefcase.app.voyagr.android]
requires = [
    "toga-android~=0.5.0",
    "kivy==2.3.0",
    "kivy_garden.mapview==1.0.6",
    "kivy-garden==0.1.4",
    "plyer==2.1.0",
    "pyttsx3==2.90",
    "pyjnius==1.6.1",
    "requests==2.31.0",
    "protobuf==5.28.2",
    "boto3==1.35.24",
    "polyline==2.0.4",
    "mercantile==1.2.1",
    "geopy",
]

base_theme = "Theme.MaterialComponents.Light.DarkActionBar"

build_gradle_dependencies = [
    "com.google.android.material:material:1.12.0",
]
EOF
echo "✅ pyproject.toml updated"

# Step 10: Build APK
echo ""
echo "Step 10: Building APK (this will take 30-45 minutes)..."
cd ~/voyagr
briefcase build android
echo "✅ APK build completed!"

# Step 11: Check for APK
echo ""
echo "Step 11: Checking for APK..."
if [ -f ~/voyagr/build/voyagr/android/gradle/app/build/outputs/apk/debug/app-debug.apk ]; then
    echo "✅ APK found!"
    ls -lh ~/voyagr/build/voyagr/android/gradle/app/build/outputs/apk/debug/app-debug.apk
else
    echo "❌ APK not found"
    exit 1
fi

# Step 12: Copy to Windows
echo ""
echo "Step 12: Copying APK to Windows..."
cp ~/voyagr/build/voyagr/android/gradle/app/build/outputs/apk/debug/app-debug.apk /mnt/c/Users/Brian/Downloads/voyagr-debug.apk
echo "✅ APK copied to Windows"
ls -lh /mnt/c/Users/Brian/Downloads/voyagr-debug.apk

echo ""
echo "=========================================="
echo "🎉 BUILD COMPLETE!"
echo "=========================================="
echo ""
echo "APK Location: C:\Users\Brian\Downloads\voyagr-debug.apk"
echo ""
echo "Next steps:"
echo "1. Open PowerShell"
echo "2. Run: adb install C:\Users\Brian\Downloads\voyagr-debug.apk"
echo "3. Run: adb shell am start -n org.voyagr.voyagr/.SatNavApp"
echo ""
echo "=========================================="


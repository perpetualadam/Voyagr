@echo off
REM 🚀 Automated APK Build Script for Windows
REM This script will build your Voyagr APK using WSL2 and Briefcase

echo.
echo ==========================================
echo 🚀 Automated Briefcase APK Build
echo ==========================================
echo.

REM Step 1: Open WSL and run the build
echo Step 1: Opening WSL terminal and starting build...
echo.

wsl bash -c "
set -e

echo '=========================================='
echo '🚀 Automated Briefcase APK Build'
echo '=========================================='
echo ''

echo 'Step 1: Creating virtual environment...'
if [ ! -d ~/buildenv ]; then
    /usr/bin/python3 -m venv ~/buildenv
    echo '✅ Virtual environment created'
else
    echo '✅ Virtual environment already exists'
fi

echo ''
echo 'Step 2: Activating virtual environment...'
source ~/buildenv/bin/activate
echo '✅ Virtual environment activated'

echo ''
echo 'Step 3: Upgrading pip...'
pip install --upgrade pip setuptools wheel
echo '✅ pip upgraded'

echo ''
echo 'Step 4: Installing Briefcase...'
pip install briefcase
echo '✅ Briefcase installed'

echo ''
echo 'Step 5: Verifying Briefcase...'
briefcase --version
echo '✅ Briefcase verified'

echo ''
echo 'Step 6: Cleaning up old project...'
if [ -d ~/voyagr ]; then
    rm -rf ~/voyagr
    echo '✅ Old project removed'
else
    echo '✅ No old project to remove'
fi

echo ''
echo 'Step 7: Creating Briefcase project...'
cd ~
briefcase new --no-input --formal-name 'Voyagr' --app-name 'voyagr' --bundle 'org.voyagr' --author 'Brian' --author-email 'anamnesisekklesia@googlemail.com' --url 'https://github.com/perpetualadam/Voyagr' --license 'GPL v3'
echo '✅ Briefcase project created'

echo ''
echo 'Step 8: Copying your code...'
cp /mnt/c/Users/Brian/OneDrive/Documents/augment-projects/Voyagr/satnav.py ~/voyagr/src/voyagr/app.py
cp /mnt/c/Users/Brian/OneDrive/Documents/augment-projects/Voyagr/.env ~/voyagr/src/voyagr/
echo '✅ Code copied'

echo ''
echo 'Step 9: Building APK (this will take 30-45 minutes)...'
cd ~/voyagr
briefcase build android
echo '✅ APK build completed!'

echo ''
echo 'Step 10: Checking for APK...'
if [ -f ~/voyagr/build/voyagr/android/gradle/app/build/outputs/apk/debug/app-debug.apk ]; then
    echo '✅ APK found!'
    ls -lh ~/voyagr/build/voyagr/android/gradle/app/build/outputs/apk/debug/app-debug.apk
else
    echo '❌ APK not found'
    exit 1
fi

echo ''
echo 'Step 11: Copying APK to Windows...'
cp ~/voyagr/build/voyagr/android/gradle/app/build/outputs/apk/debug/app-debug.apk /mnt/c/Users/Brian/Downloads/voyagr-debug.apk
echo '✅ APK copied to Windows'
ls -lh /mnt/c/Users/Brian/Downloads/voyagr-debug.apk

echo ''
echo '=========================================='
echo '🎉 BUILD COMPLETE!'
echo '=========================================='
echo ''
echo 'APK Location: C:\Users\Brian\Downloads\voyagr-debug.apk'
echo ''
echo 'Next steps:'
echo '1. Open PowerShell'
echo '2. Run: adb install C:\Users\Brian\Downloads\voyagr-debug.apk'
echo '3. Run: adb shell am start -n org.voyagr.voyagr/.SatNavApp'
echo ''
echo '=========================================='
"

echo.
echo ==========================================
echo Build script completed!
echo ==========================================
echo.
pause


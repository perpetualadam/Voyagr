# Voyagr Debug APK Installation Script
# This script builds and installs the debug APK on your Android device

param(
    [switch]$BuildOnly = $false,
    [switch]$InstallOnly = $false,
    [string]$DeviceId = ""
)

# Colors for output
$Green = [System.ConsoleColor]::Green
$Red = [System.ConsoleColor]::Red
$Yellow = [System.ConsoleColor]::Yellow
$Cyan = [System.ConsoleColor]::Cyan

function Write-Success {
    param([string]$Message)
    Write-Host "✓ $Message" -ForegroundColor $Green
}

function Write-Error-Custom {
    param([string]$Message)
    Write-Host "✗ $Message" -ForegroundColor $Red
}

function Write-Info {
    param([string]$Message)
    Write-Host "ℹ $Message" -ForegroundColor $Cyan
}

function Write-Warning-Custom {
    param([string]$Message)
    Write-Host "⚠ $Message" -ForegroundColor $Yellow
}

# Get script directory
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ScriptDir
$AndroidDir = $ScriptDir
$ApkPath = "$AndroidDir\app\build\outputs\apk\debug\app-debug.apk"

Write-Info "Voyagr Debug APK Installation Script"
Write-Info "======================================"
Write-Info ""

# Step 1: Check if gradlew exists
Write-Info "Step 1: Checking Gradle wrapper..."
if (-not (Test-Path "$AndroidDir\gradlew.bat")) {
    Write-Error-Custom "gradlew.bat not found in $AndroidDir"
    Write-Info "Please ensure you're in the Android project directory"
    exit 1
}
Write-Success "Gradle wrapper found"

# Step 2: Build debug APK (unless --install-only)
if (-not $InstallOnly) {
    Write-Info ""
    Write-Info "Step 2: Building debug APK..."
    Write-Info "This may take 5-10 minutes..."
    
    Push-Location $AndroidDir
    & .\gradlew.bat assembleDebug
    $BuildResult = $LASTEXITCODE
    Pop-Location
    
    if ($BuildResult -ne 0) {
        Write-Error-Custom "Build failed with exit code $BuildResult"
        exit 1
    }
    Write-Success "Debug APK built successfully"
}

# Step 3: Check if APK exists
Write-Info ""
Write-Info "Step 3: Verifying APK file..."
if (-not (Test-Path $ApkPath)) {
    Write-Error-Custom "APK not found at $ApkPath"
    Write-Info "Build may have failed. Check output above."
    exit 1
}

$ApkSize = (Get-Item $ApkPath).Length / 1MB
Write-Success "APK found: $ApkPath"
Write-Info "APK size: $([Math]::Round($ApkSize, 2)) MB"

# Step 4: Check for connected devices (unless --build-only)
if (-not $BuildOnly) {
    Write-Info ""
    Write-Info "Step 4: Checking for connected devices..."
    
    # Try to find adb
    $AdbPath = $null
    
    # Check common locations
    $PossiblePaths = @(
        "C:\Program Files\Android\android-sdk\platform-tools\adb.exe",
        "C:\Program Files (x86)\Android\android-sdk\platform-tools\adb.exe",
        "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe",
        "adb"
    )
    
    foreach ($Path in $PossiblePaths) {
        if (Test-Path $Path) {
            $AdbPath = $Path
            break
        }
    }
    
    if (-not $AdbPath) {
        Write-Error-Custom "ADB not found. Please install Android Studio or Android SDK."
        Write-Info "Download from: https://developer.android.com/studio"
        exit 1
    }
    
    Write-Success "ADB found: $AdbPath"
    
    # List devices
    Write-Info ""
    Write-Info "Connected devices:"
    & $AdbPath devices
    
    # Step 5: Install APK
    Write-Info ""
    Write-Info "Step 5: Installing APK on device..."
    
    if ($DeviceId) {
        & $AdbPath -s $DeviceId install -r $ApkPath
    } else {
        & $AdbPath install -r $ApkPath
    }
    
    $InstallResult = $LASTEXITCODE
    
    if ($InstallResult -eq 0) {
        Write-Success "APK installed successfully!"
        Write-Info ""
        Write-Info "Next steps:"
        Write-Info "1. Unlock your device"
        Write-Info "2. Find 'Voyagr Navigation' app"
        Write-Info "3. Tap to launch"
        Write-Info "4. Grant permissions when prompted"
        Write-Info ""
        Write-Success "Installation complete!"
    } else {
        Write-Error-Custom "Installation failed with exit code $InstallResult"
        Write-Info ""
        Write-Info "Troubleshooting:"
        Write-Info "1. Ensure USB Debugging is enabled on device"
        Write-Info "2. Tap 'Allow' when prompted on device"
        Write-Info "3. Try: adb kill-server && adb start-server"
        Write-Info "4. Try different USB cable"
        exit 1
    }
}

Write-Info ""
Write-Success "Done!"


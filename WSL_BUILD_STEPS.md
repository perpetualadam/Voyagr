# 🚀 WSL2 APK Build - Step by Step

## ✅ WSL2 Installed Successfully!

You're now in Ubuntu terminal. Let's build the APK!

---

## Step 1: Update System (5 min)

Copy and paste this command:

```bash
sudo apt-get update && sudo apt-get upgrade -y
```

Press Enter and wait for it to complete.

---

## Step 2: Install Dependencies (10 min)

Copy and paste this command:

```bash
sudo apt-get install -y \
  python3 python3-pip \
  openjdk-11-jdk \
  git wget unzip \
  build-essential \
  libssl-dev \
  libffi-dev
```

Press Enter and wait for it to complete.

---

## Step 3: Install Buildozer and Cython (5 min)

Copy and paste this command:

```bash
pip install buildozer cython
```

Press Enter and wait for it to complete.

---

## Step 4: Verify Installation (1 min)

Copy and paste this command to verify everything is installed:

```bash
buildozer --version
java -version
python3 --version
```

You should see version numbers for all three.

---

## Step 5: Copy Your Project (2 min)

Copy and paste this command:

```bash
cp -r /mnt/c/Users/Brian/OneDrive/Documents/augment-projects/Voyagr ~/Voyagr
cd ~/Voyagr
```

Verify the project is there:

```bash
ls -la
```

You should see: `satnav.py`, `buildozer.spec`, `.env`, etc.

---

## Step 6: Build APK (30-45 min)

Copy and paste this command:

```bash
buildozer android debug
```

**This will take 30-45 minutes. Be patient!**

You'll see lots of output. This is normal. Watch for:
- ✅ "BUILD SUCCESSFUL" = Success!
- ❌ "BUILD FAILED" = Error (we'll fix it)

---

## Step 7: Check for APK (1 min)

After build completes, check if APK was created:

```bash
ls -lh bin/
```

You should see: `voyagr-1.0.0-debug.apk`

---

## Step 8: Copy APK to Windows (2 min)

Copy the APK to your Windows Downloads folder:

```bash
cp bin/voyagr-1.0.0-debug.apk /mnt/c/Users/Brian/Downloads/
```

Verify it's there:

```bash
ls -lh /mnt/c/Users/Brian/Downloads/voyagr-1.0.0-debug.apk
```

---

## Step 9: Install on Android Device (5 min)

Open PowerShell (not WSL) and run:

```bash
adb install C:\Users\Brian\Downloads\voyagr-1.0.0-debug.apk
```

If successful, you'll see:
```
Success
```

---

## Step 10: Launch App on Device (2 min)

In PowerShell, run:

```bash
adb shell am start -n org.voyagr.voyagr/.SatNavApp
```

The app should launch on your device!

---

## ⏱️ Total Timeline

| Step | Time | Command |
|------|------|---------|
| 1. Update system | 5 min | `sudo apt-get update && sudo apt-get upgrade -y` |
| 2. Install deps | 10 min | `sudo apt-get install -y python3 python3-pip openjdk-11-jdk git wget unzip build-essential libssl-dev libffi-dev` |
| 3. Install buildozer | 5 min | `pip install buildozer cython` |
| 4. Verify | 1 min | `buildozer --version` |
| 5. Copy project | 2 min | `cp -r /mnt/c/Users/Brian/OneDrive/Documents/augment-projects/Voyagr ~/Voyagr` |
| 6. Build APK | 30-45 min | `buildozer android debug` |
| 7. Check APK | 1 min | `ls -lh bin/` |
| 8. Copy to Windows | 2 min | `cp bin/voyagr-1.0.0-debug.apk /mnt/c/Users/Brian/Downloads/` |
| 9. Install on device | 5 min | `adb install C:\Users\Brian\Downloads\voyagr-1.0.0-debug.apk` |
| 10. Launch app | 2 min | `adb shell am start -n org.voyagr.voyagr/.SatNavApp` |
| **Total** | **70-85 min** | **Ready!** |

---

## 🆘 Troubleshooting

### If Step 2 (Install deps) fails:
```bash
sudo apt-get update
sudo apt-get install -y python3 python3-pip
sudo apt-get install -y openjdk-11-jdk
sudo apt-get install -y git wget unzip build-essential
```

### If Step 3 (Buildozer) fails:
```bash
pip install --upgrade pip
pip install buildozer cython
```

### If Step 6 (Build) fails:
- Check the error message
- Common issues:
  - Missing Android SDK (buildozer downloads it)
  - Timeout (increase timeout in buildozer.spec)
  - Memory (close other apps)

### If Step 9 (Install) fails:
```bash
# Make sure device is connected
adb devices

# Clear old installation
adb uninstall org.voyagr.voyagr

# Try again
adb install C:\Users\Brian\Downloads\voyagr-1.0.0-debug.apk
```

---

## ✅ Success Indicators

- ✅ Step 4: See version numbers
- ✅ Step 5: See project files
- ✅ Step 6: See "BUILD SUCCESSFUL"
- ✅ Step 7: See voyagr-1.0.0-debug.apk
- ✅ Step 9: See "Success"
- ✅ Step 10: App launches on device

---

## 📞 Need Help?

If you get stuck:
1. Copy the error message
2. Let me know which step failed
3. I'll help you fix it

---

## 🎉 Ready to Start!

You're in Ubuntu terminal. Start with Step 1!

**Next command to run:**
```bash
sudo apt-get update && sudo apt-get upgrade -y
```

Go! 🚀



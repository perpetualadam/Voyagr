# 📋 Copy-Paste Commands for WSL2 Build

## You're in Ubuntu Terminal - Just Copy and Paste!

You should see: `brian@NucBoxM5PLUS:/mnt/c/Users/Brian$`

---

## ✅ Step 1: Update System (5 min)

**Copy this entire command and paste it in Ubuntu terminal:**

```bash
sudo apt-get update && sudo apt-get upgrade -y
```

Press Enter and wait for it to complete.

---

## ✅ Step 2: Install Dependencies (10 min)

**Copy this entire command and paste it in Ubuntu terminal:**

```bash
sudo apt-get install -y python3 python3-pip openjdk-11-jdk git wget unzip build-essential libssl-dev libffi-dev
```

Press Enter and wait for it to complete.

---

## ✅ Step 3: Install Buildozer (5 min)

**Copy this entire command and paste it in Ubuntu terminal:**

```bash
pip install buildozer cython
```

Press Enter and wait for it to complete.

---

## ✅ Step 4: Verify Installation (1 min)

**Copy this entire command and paste it in Ubuntu terminal:**

```bash
buildozer --version && java -version && python3 --version
```

You should see version numbers for all three.

---

## ✅ Step 5: Navigate to Project (1 min)

**Copy this entire command and paste it in Ubuntu terminal:**

```bash
cd ~/Voyagr
```

If it doesn't exist, copy this first:

```bash
cp -r /mnt/c/Users/Brian/OneDrive/Documents/augment-projects/Voyagr ~/Voyagr && cd ~/Voyagr
```

Verify files are there:

```bash
ls -la
```

You should see: `satnav.py`, `buildozer.spec`, `.env`, etc.

---

## ✅ Step 6: BUILD APK (30-45 min) ⏳

**This is the main build. Copy and paste:**

```bash
buildozer android debug
```

Press Enter and **WAIT 30-45 MINUTES**.

You'll see lots of output. This is normal!

**Watch for:**
- ✅ "BUILD SUCCESSFUL" = Success!
- ❌ "BUILD FAILED" = Error (tell me the error)

---

## ✅ Step 7: Check APK (1 min)

**After build completes, copy and paste:**

```bash
ls -lh bin/voyagr-1.0.0-debug.apk
```

You should see the APK file with its size.

---

## ✅ Step 8: Copy APK to Windows (2 min)

**Copy this entire command and paste it in Ubuntu terminal:**

```bash
cp bin/voyagr-1.0.0-debug.apk /mnt/c/Users/Brian/Downloads/
```

Verify it's there:

```bash
ls -lh /mnt/c/Users/Brian/Downloads/voyagr-1.0.0-debug.apk
```

---

## ✅ Step 9: Install on Android Device (5 min)

**Open PowerShell (NOT WSL) and copy-paste:**

```bash
adb install C:\Users\Brian\Downloads\voyagr-1.0.0-debug.apk
```

You should see: `Success`

---

## ✅ Step 10: Launch App (2 min)

**In PowerShell, copy-paste:**

```bash
adb shell am start -n org.voyagr.voyagr/.SatNavApp
```

The app should launch on your device!

---

## 🆘 If Something Goes Wrong

### Build fails at Step 6?
- Copy the error message
- Tell me what it says
- I'll help fix it

### APK not found at Step 7?
- Run: `ls -la bin/`
- Tell me what you see
- Check build output for errors

### Install fails at Step 9?
- Make sure device is connected: `adb devices`
- Try: `adb uninstall org.voyagr.voyagr`
- Then try install again

---

## ⏱️ Timeline

| Step | Time | What to Do |
|------|------|-----------|
| 1 | 5 min | Copy-paste update command |
| 2 | 10 min | Copy-paste install command |
| 3 | 5 min | Copy-paste buildozer command |
| 4 | 1 min | Copy-paste verify command |
| 5 | 1 min | Copy-paste cd command |
| 6 | 30-45 min | Copy-paste build command (WAIT!) |
| 7 | 1 min | Copy-paste check command |
| 8 | 2 min | Copy-paste copy command |
| 9 | 5 min | Copy-paste install command (PowerShell) |
| 10 | 2 min | Copy-paste launch command (PowerShell) |
| **Total** | **70-85 min** | **Done!** |

---

## 🎯 Quick Summary

1. **In Ubuntu terminal, run Steps 1-8**
2. **In PowerShell, run Steps 9-10**
3. **App launches on your device!**

---

## 🚀 START NOW!

You're in Ubuntu terminal. Copy and paste Step 1:

```bash
sudo apt-get update && sudo apt-get upgrade -y
```

Then follow the steps in order!

Good luck! 🎉



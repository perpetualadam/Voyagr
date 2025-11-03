# 🔧 Fix: Missing cmake

## ✅ Solution: Install Build Dependencies

The build failed because `cmake` and other build tools are missing. We need to install them.

---

## Step 1: Install Build Dependencies

**Make sure you're in Ubuntu terminal** (not in the build).

**Copy and paste this command:**

```bash
sudo apt install -y cmake build-essential autoconf automake libtool pkg-config
```

Press Enter and wait for it to complete.

---

## Step 2: Clean Previous Build

**Copy and paste this command:**

```bash
cd ~/Voyagr
rm -rf .buildozer
```

This removes the failed build so we can start fresh.

---

## Step 3: Try Build Again

**Copy and paste this command:**

```bash
buildozer android debug
```

This should work now!

---

## ⏱️ Timeline

| Step | Time | Command |
|------|------|---------|
| 1 | 5 min | `sudo apt install -y cmake build-essential autoconf automake libtool pkg-config` |
| 2 | 1 min | `rm -rf .buildozer` |
| 3 | 30-45 min | `buildozer android debug` |
| **Total** | **40-55 min** | **Ready!** |

---

## 📋 What to Expect

When you run `buildozer android debug` again:
- It will start fresh
- It will download and compile everything
- This takes 30-45 minutes
- Watch for "BUILD SUCCESSFUL" at the end

---

## ✅ Success Indicators

- ✅ No "cmake" errors
- ✅ See "BUILD SUCCESSFUL" at the end
- ✅ APK file created in `bin/voyagr-1.0.0-debug.apk`

---

## 🚀 Next Steps

1. **Run Step 1:** Install cmake and build tools
2. **Run Step 2:** Clean previous build
3. **Run Step 3:** Build APK (WAIT 30-45 minutes!)

---

## 🎉 Ready!

Start with Step 1:

```bash
sudo apt install -y cmake build-essential autoconf automake libtool pkg-config
```

Then Step 2:

```bash
rm -rf .buildozer
```

Then Step 3:

```bash
buildozer android debug
```

Go! 🚀



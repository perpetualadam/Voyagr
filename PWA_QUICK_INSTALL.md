# Voyagr PWA - Quick Installation (5 Minutes)

## 🚀 Super Quick Steps

### Step 1: Start Flask (On Your PC)
```bash
python voyagr_web.py
```

### Step 2: Find Your PC's IP
```powershell
ipconfig
```
Look for: `IPv4 Address: 192.168.x.x`

### Step 3: Open on Pixel 6
1. Open **Chrome**
2. Go to: `http://192.168.1.100:5000` (use your IP)
3. **Wait 10-15 seconds** for service worker to load

### Step 4: Install
1. Tap **⋮** (three dots) in Chrome
2. Tap **"Install app"**
3. Tap **"Install"**

### Step 5: Done! 🎉
- App appears on home screen
- Tap to launch like a native app
- Works offline with cached data

---

## 📱 What You Get

| Feature | Status |
|---------|--------|
| Route Calculation | ✅ Works |
| Cost Estimation | ✅ Works |
| Multi-Stop Routes | ✅ Works |
| Trip History | ✅ Works |
| Vehicle Profiles | ✅ Works |
| Offline Mode | ✅ Works |
| Notifications | ✅ Works |
| Full-Screen App | ✅ Works |

---

## ⚠️ Common Issues

### "Install app" not showing?
- **Wait 15 seconds** for service worker to load
- **Refresh** the page (pull down)
- Try again

### Can't connect to PC?
- Check **same WiFi network**
- Check **PC IP address** is correct
- Check **Flask is running**

### App not working offline?
- Use app **online first** to cache data
- Then it works offline

---

## 🔧 Troubleshooting

**Issue**: "Cannot connect to server"
```
Solution: Check your PC's IP address is correct
ipconfig → look for IPv4 Address
```

**Issue**: "Install option missing"
```
Solution: Wait 15 seconds, refresh, try again
```

**Issue**: "App crashes on startup"
```
Solution: Clear Chrome cache
Settings > Apps > Chrome > Storage > Clear Cache
```

---

## 📍 Network Setup

### Same WiFi (Easiest)
```
PC: 192.168.1.100:5000
Pixel 6: Connect to same WiFi
Open: http://192.168.1.100:5000
```

### Different Networks (Advanced)
Use **ngrok** for secure tunneling:
```bash
# On PC
ngrok http 5000

# Copy URL from ngrok output
# Open on Pixel 6: https://abc123.ngrok.io
```

---

## ✅ Verification Checklist

- [ ] Flask running on PC (`python voyagr_web.py`)
- [ ] PC IP address found (`ipconfig`)
- [ ] Pixel 6 on same WiFi
- [ ] Chrome opens `http://192.168.1.100:5000`
- [ ] Page loads (wait 15 seconds)
- [ ] Install option appears in Chrome menu
- [ ] App installed on home screen
- [ ] App launches in full-screen mode

---

## 🎯 Next Steps

1. **Create a vehicle profile** (add your car details)
2. **Calculate a test route** (London to Manchester)
3. **Check trip history** (see saved trips)
4. **Try offline mode** (turn off WiFi, use cached routes)
5. **Enable notifications** (get route alerts)

---

## 📞 Quick Help

| Problem | Solution |
|---------|----------|
| Can't find install button | Wait 15s, refresh, try again |
| Connection refused | Check PC IP, check WiFi |
| App won't load | Clear Chrome cache |
| Offline not working | Use app online first |
| Slow performance | First load is slow, subsequent loads are fast |

---

## 🎉 You're Done!

Your Voyagr PWA is now installed and ready to use!

**Enjoy navigation with:**
- ✅ Route calculation
- ✅ Cost estimation
- ✅ Trip tracking
- ✅ Offline support
- ✅ Full-screen app experience

Happy navigating! 🚗📍


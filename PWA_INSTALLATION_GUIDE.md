# Voyagr PWA Installation Guide

## Quick Start

Your Voyagr web app is a **Progressive Web App (PWA)** that can be installed on your mobile device like a native app!

---

## Step 1: Start the Flask Server

On your PC, run:

```bash
python voyagr_web.py
```

You should see:
```
============================================================
🚀 Voyagr Web App is running!
============================================================

📱 Access from your Pixel 6:
   1. Find your PC's IP address (usually 192.168.x.x)
   2. Open browser on Pixel 6
   3. Go to: http://YOUR_PC_IP:5000

💻 Or on this PC:
   http://localhost:5000

============================================================
```

---

## Step 2: Find Your PC's IP Address

### On Windows (PowerShell):
```powershell
ipconfig
```

Look for "IPv4 Address" under your network adapter (usually `192.168.x.x`)

### Example:
```
IPv4 Address. . . . . . . . . . : 192.168.1.100
```

---

## Step 3: Open Voyagr on Your Mobile

### On Your Pixel 6:

1. **Open Chrome browser**
2. **Go to**: `http://192.168.1.100:5000` (replace with your PC's IP)
3. **Wait for the page to load** (first load may take 10-15 seconds)

---

## Step 4: Install as PWA

### Android (Pixel 6):

**Method 1: Chrome Menu (Recommended)**
1. Tap the **three-dot menu** (⋮) in top-right corner
2. Tap **"Install app"** or **"Add to Home screen"**
3. Tap **"Install"** in the popup
4. The app will be added to your home screen

**Method 2: Chrome Address Bar**
1. Look for the **install icon** (⬇️ or 📱) in the address bar
2. Tap it
3. Tap **"Install"**

**Method 3: Long Press**
1. Long-press the Voyagr tab
2. Select **"Add to Home screen"**

---

## Step 5: Launch the App

1. **Go to your home screen**
2. **Find the "Voyagr" app icon** (purple "V" on blue background)
3. **Tap to launch** - it will open in full-screen mode like a native app!

---

## Features Available in PWA

✅ **Route Calculation** - Calculate routes with GraphHopper/Valhalla  
✅ **Cost Estimation** - Fuel, toll, CAZ, and energy costs  
✅ **Multi-Stop Routing** - Plan routes with multiple waypoints  
✅ **Trip History** - Track all your trips  
✅ **Vehicle Profiles** - Save multiple vehicle configurations  
✅ **Offline Support** - Works offline with cached data  
✅ **Notifications** - Get alerts for route updates  
✅ **Persistent Storage** - Data saved locally on device  

---

## Troubleshooting

### "Install app" option not showing?

**Solution 1: Wait for Service Worker**
- The app needs to load the service worker first
- Wait 10-15 seconds after the page loads
- Refresh the page (pull down to refresh)
- Try again

**Solution 2: Check Chrome Version**
- Make sure Chrome is up to date
- Go to Settings > About Chrome > Check for updates

**Solution 3: Clear Cache**
- Go to Settings > Apps > Chrome > Storage > Clear Cache
- Reload the page

### App not working offline?

**Solution:**
- The app needs to be used online first to cache data
- Use the app online for a few minutes
- Then it will work offline with cached routes

### Can't connect to PC?

**Check:**
1. PC and Pixel 6 are on the **same WiFi network**
2. PC's firewall allows port 5000
3. Flask server is still running on PC
4. You're using the correct IP address

**To check firewall (Windows):**
```powershell
# Allow port 5000 through firewall
netsh advfirewall firewall add rule name="Voyagr" dir=in action=allow protocol=tcp localport=5000
```

---

## Advanced: Access from Outside Your Network

To access Voyagr from outside your home network:

### Option 1: Use ngrok (Easiest)

1. **Install ngrok**: https://ngrok.com/download
2. **Run on your PC**:
   ```bash
   ngrok http 5000
   ```
3. **Copy the URL** (e.g., `https://abc123.ngrok.io`)
4. **Open on mobile**: Paste the URL in Chrome

### Option 2: Port Forwarding

1. Log into your router
2. Forward port 5000 to your PC's local IP
3. Find your public IP: https://whatismyipaddress.com
4. Access from mobile: `http://YOUR_PUBLIC_IP:5000`

⚠️ **Security Warning**: Port forwarding exposes your PC to the internet. Use ngrok instead for better security.

---

## PWA Capabilities

### What Makes Voyagr a PWA?

✅ **Service Worker** - Enables offline functionality  
✅ **Web Manifest** - Allows installation on home screen  
✅ **HTTPS Ready** - Secure connections (when deployed)  
✅ **Responsive Design** - Works on all screen sizes  
✅ **App-like Experience** - Full-screen, no browser UI  
✅ **Local Storage** - Persistent data on device  
✅ **Notifications** - Push notifications support  

---

## Uninstall

To remove Voyagr from your home screen:

1. **Long-press the Voyagr icon**
2. **Tap "Uninstall"** or **"Remove"**
3. **Confirm**

The app will be removed from your home screen but cached data remains in Chrome.

---

## Tips & Tricks

### Shortcut to Route Calculation
- The PWA includes a shortcut to quickly calculate routes
- Long-press the Voyagr icon and tap "Calculate Route"

### Share Locations
- Use the share feature to send routes to other apps
- Tap the share icon in the app

### Offline Maps
- Routes are cached for 1 hour
- Use the same routes offline without internet

### Update Notifications
- The app checks for updates every minute
- You'll see a notification when updates are available

---

## Performance Tips

1. **First Load**: May take 10-15 seconds (service worker caching)
2. **Subsequent Loads**: Should be instant
3. **Route Calculation**: 2-5 seconds depending on distance
4. **Offline Mode**: Instant (uses cached routes)

---

## Support

If you encounter issues:

1. **Check the browser console** (Chrome > Settings > Developer Tools)
2. **Check the Flask server logs** on your PC
3. **Verify network connectivity**
4. **Try clearing app cache** (Settings > Apps > Chrome > Storage > Clear Cache)

---

## Next Steps

After installing:

1. ✅ Create vehicle profiles for your cars
2. ✅ Calculate a test route
3. ✅ Check trip history
4. ✅ Try offline mode
5. ✅ Enable notifications

Enjoy using Voyagr! 🚗📍


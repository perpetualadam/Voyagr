# Voyagr PWA - Step-by-Step Installation

## 📋 Complete Visual Guide

---

## STEP 1: Start the Flask Server

### On Your PC (Windows):

1. **Open PowerShell or Command Prompt**
2. **Navigate to Voyagr folder**:
   ```bash
   cd C:\Users\Brian\OneDrive\Documents\augment-projects\Voyagr
   ```
3. **Start Flask**:
   ```bash
   python voyagr_web.py
   ```

### Expected Output:
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

✅ **Flask is now running!** Keep this window open.

---

## STEP 2: Find Your PC's IP Address

### On Your PC (PowerShell):

1. **Open a NEW PowerShell window** (don't close the Flask one!)
2. **Type**:
   ```powershell
   ipconfig
   ```
3. **Look for**:
   ```
   Ethernet adapter or WiFi adapter:
   IPv4 Address. . . . . . . . . . : 192.168.1.100
   ```

### Example Output:
```
Windows IP Configuration

Ethernet adapter Ethernet:
   Connection-specific DNS Suffix  . : 
   IPv4 Address. . . . . . . . . . : 192.168.1.100
   Subnet Mask . . . . . . . . . . : 255.255.255.0
   Default Gateway . . . . . . . . : 192.168.1.1
```

✅ **Note your IP address** (e.g., `192.168.1.100`)

---

## STEP 3: Connect Pixel 6 to Same WiFi

### On Your Pixel 6:

1. **Swipe down** from top (twice) to open Quick Settings
2. **Tap WiFi**
3. **Select your home WiFi network**
4. **Enter password if needed**
5. **Wait for "Connected" status**

✅ **Pixel 6 is now on same network as PC**

---

## STEP 4: Open Voyagr in Chrome

### On Your Pixel 6:

1. **Open Chrome browser**
2. **Tap the address bar**
3. **Type**: `http://192.168.1.100:5000`
   - Replace `192.168.1.100` with your PC's IP from Step 2
4. **Tap Enter**

### Expected:
- Page starts loading
- You see the Voyagr map interface
- **Wait 10-15 seconds** for service worker to load

✅ **Voyagr is now open in Chrome**

---

## STEP 5: Install as PWA

### On Your Pixel 6 (Chrome):

1. **Look at the address bar**
   - You should see a **download icon** (⬇️) or **install icon** (📱)
   - OR tap the **three-dot menu** (⋮)

2. **If you see install icon in address bar**:
   - Tap the **⬇️ or 📱 icon**
   - Tap **"Install"** in the popup
   - Done! Skip to Step 6

3. **If you see three-dot menu**:
   - Tap **⋮** (three dots, top-right)
   - Tap **"Install app"** or **"Add to Home screen"**
   - Tap **"Install"** in the popup
   - Done! Skip to Step 6

### What You'll See:
```
┌─────────────────────────────┐
│ Install Voyagr?             │
│                             │
│ [Cancel]        [Install]   │
└─────────────────────────────┘
```

✅ **App is being installed**

---

## STEP 6: Find Your App on Home Screen

### On Your Pixel 6:

1. **Press Home button** or **swipe up** from bottom
2. **Look for the Voyagr icon**:
   - Purple background
   - White "V" letter
   - Should be on your home screen or in app drawer

3. **If not visible**:
   - Swipe left to see all apps
   - Look for "Voyagr"

✅ **Found the Voyagr app!**

---

## STEP 7: Launch the App

### On Your Pixel 6:

1. **Tap the Voyagr icon**
2. **App launches in full-screen mode**
3. **No browser UI** - looks like a native app!
4. **Wait for map to load** (first time may take 5-10 seconds)

### You Should See:
- Map of UK
- Route calculation interface
- Vehicle profile selector
- Trip history button
- Settings button

✅ **Voyagr PWA is now running!**

---

## STEP 8: Test the App

### Try These Features:

1. **Calculate a Route**:
   - Enter start: `51.5074, -0.1278` (London)
   - Enter end: `53.4808, -2.2426` (Manchester)
   - Tap "Calculate Route"
   - See the route on the map

2. **Create a Vehicle Profile**:
   - Tap "Vehicles"
   - Add your car details
   - Save

3. **Check Trip History**:
   - Tap "History"
   - See all your trips

4. **Try Offline**:
   - Turn off WiFi
   - Try to view a cached route
   - It works offline!

✅ **All features working!**

---

## 🎉 Installation Complete!

Your Voyagr PWA is now installed and ready to use!

### What You Can Do Now:

✅ Calculate routes with GraphHopper/Valhalla  
✅ Estimate fuel, toll, and CAZ costs  
✅ Plan multi-stop routes  
✅ Track trip history  
✅ Save vehicle profiles  
✅ Use offline with cached data  
✅ Get notifications  
✅ Full-screen app experience  

---

## 🔧 Troubleshooting

### Problem: "Cannot connect to server"
**Solution**: 
- Check PC IP address is correct
- Check Pixel 6 is on same WiFi
- Check Flask is still running on PC

### Problem: "Install option not showing"
**Solution**:
- Wait 15 seconds for service worker
- Refresh the page (pull down)
- Try again

### Problem: "App crashes on startup"
**Solution**:
- Clear Chrome cache (Settings > Apps > Chrome > Storage > Clear Cache)
- Reload the page

---

## 📞 Need Help?

1. **Check Flask is running** on PC
2. **Check network connection** (same WiFi)
3. **Check IP address** is correct
4. **Wait 15 seconds** for service worker
5. **Refresh the page** (pull down)
6. **Clear Chrome cache** if needed

---

## 🚀 Next Steps

1. Create vehicle profiles for your cars
2. Calculate test routes
3. Check trip history
4. Try offline mode
5. Enable notifications

Enjoy using Voyagr! 🚗📍


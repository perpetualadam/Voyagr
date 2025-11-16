# Hazard Avoidance - Quick Test Guide 🚗

## ✅ What Was Fixed

The frontend now sends `enable_hazard_avoidance: true` to the backend when you toggle hazard preferences. This enables the backend to score routes based on proximity to cameras and other hazards.

## 🧪 Quick Test on Mobile

### Step 1: Open Settings
1. Open your Railway.app production URL on mobile
2. Tap the ⚙️ Settings button (bottom right)
3. Scroll to "⚠️ Hazard Avoidance" section

### Step 2: Enable Hazard Preferences
Toggle ON any of these:
- ✅ Avoid Speed Cameras
- ✅ Avoid Traffic Cameras
- ✅ Avoid Police Radars
- ✅ Avoid Roadworks
- ✅ Avoid Accidents

### Step 3: Calculate Route
1. Go back to Navigation tab
2. Enter start location: **London, UK** (or any city)
3. Enter end location: **10 km away**
4. Tap "Calculate Route"

### Step 4: Check Results
Look for these in the route preview:
- **Hazard Penalty**: Should show seconds (e.g., "1200s" = 20 min)
- **Hazard Count**: Should show number of cameras (e.g., "3")
- **Route Ranking**: Routes with fewer hazards should be ranked higher

## 🎯 Test Areas (High Camera Density)

### London, UK
- Start: 51.5074, -0.1278 (Piccadilly Circus)
- End: 51.5174, -0.1378 (1.5km away)
- Expected: Multiple cameras detected

### Birmingham, UK
- Start: 52.5086, -1.8853 (City Center)
- End: 52.5186, -1.8753 (1km away)
- Expected: Traffic cameras detected

### Manchester, UK
- Start: 53.4808, -2.2426 (City Center)
- End: 53.4908, -2.2326 (1km away)
- Expected: Speed cameras detected

## 📊 Expected Behavior

### ✅ Hazard Avoidance ENABLED:
```json
{
  "routes": [
    {
      "name": "Fastest",
      "distance_km": 1.65,
      "duration_minutes": 4,
      "hazard_penalty_seconds": 1200,
      "hazard_count": 3
    }
  ]
}
```

### ❌ Hazard Avoidance DISABLED:
```json
{
  "routes": [
    {
      "name": "Fastest",
      "distance_km": 1.65,
      "duration_minutes": 4,
      "hazard_penalty_seconds": 0,
      "hazard_count": 0
    }
  ]
}
```

## 🔍 Debugging

### Check if preferences are saved:
1. Open browser DevTools (F12)
2. Go to Application → Local Storage
3. Look for:
   - `pref_speedCameras: true`
   - `pref_trafficCameras: true`
   - etc.

### Check if backend receives parameter:
1. Open browser DevTools (F12)
2. Go to Network tab
3. Calculate a route
4. Click on `/api/route` request
5. Check Request body for `"enable_hazard_avoidance": true`

### Check if hazards are in database:
```bash
sqlite3 voyagr_web.db "SELECT COUNT(*) FROM cameras WHERE type='speed_camera';"
# Should return: 144528
```

## 🚀 What's Different Now

| Before | After |
|--------|-------|
| ❌ Preferences toggled but ignored | ✅ Preferences sent to backend |
| ❌ All routes same (no hazard scoring) | ✅ Routes scored by hazards |
| ❌ No hazard info in response | ✅ Hazard penalty & count included |
| ❌ Routes never avoided cameras | ✅ Routes actively avoid cameras |

## 📞 If It's Still Not Working

1. **Clear browser cache**: Ctrl+Shift+Delete
2. **Reload page**: Ctrl+F5
3. **Check preferences are saved**: DevTools → Local Storage
4. **Check backend is running**: Visit http://localhost:5000
5. **Check database**: `sqlite3 voyagr_web.db "SELECT COUNT(*) FROM cameras;"`

## ✨ Production Deployment

Changes are already deployed to Railway.app:
- ✅ Commit e2b2247: Frontend parameter fix
- ✅ Commit 2994c2f: Test suite
- ✅ Commit 4956315: Documentation

Just refresh your browser to get the latest version!

---

**Status**: ✅ READY FOR TESTING
**Last Updated**: 2025-11-16


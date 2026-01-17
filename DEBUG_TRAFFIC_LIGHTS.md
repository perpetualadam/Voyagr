# Traffic Lights Debugging Guide

## 🔍 Issue: Traffic Lights Not Displaying

### ✅ What's Working
1. ✅ Traffic lights module loaded (`traffic-lights.js`)
2. ✅ API endpoint exists (`/api/traffic-lights`)
3. ✅ Function is called (`plotTrafficLightsOnRoute`)
4. ✅ Feature enabled by default

### 🐛 Possible Causes

#### 1. **No Traffic Lights on Route**
- Traffic lights only show if OpenStreetMap has traffic signal data
- City routes should have traffic lights, but rural routes may not
- The API filters lights to only show those within ~50m of the route

#### 2. **Traffic Lights Disabled in Settings**
- Check localStorage: `trafficLightsEnabled`
- Default: `true` (enabled)

#### 3. **API Returns Empty Results**
- Long routes may skip traffic lights to avoid timeouts
- Overpass API may be slow or unavailable

#### 4. **Function Not Being Called**
- `plotTrafficLightsOnRoute` only called when selecting a route
- Not called during initial route calculation

---

## 🧪 Debug Steps

### Step 1: Open Browser Console
Press `F12` or `Ctrl+Shift+I` to open Developer Tools

### Step 2: Check if Module Loaded
```javascript
// Check if function exists
typeof plotTrafficLightsOnRoute
// Should return: "function"

// Check if enabled
localStorage.getItem('trafficLightsEnabled')
// Should return: null (default true) or "true"
```

### Step 3: Check Route Polyline
```javascript
// After calculating a route, check if polyline exists
routePolyline
// Should return: array of [lat, lng] coordinates

// Check length
routePolyline.length
// Should return: number > 0
```

### Step 4: Manually Trigger Traffic Lights
```javascript
// After calculating a route, manually call the function
plotTrafficLightsOnRoute(routePolyline)
```

### Step 5: Check Network Tab
1. Open Network tab in DevTools
2. Filter by "traffic-lights"
3. Calculate a route
4. Look for POST request to `/api/traffic-lights`
5. Check response:
   - `success: true`
   - `lights: [...]` (array of traffic lights)
   - `count: X` (number of lights found)

### Step 6: Check Console Logs
Look for these log messages:
```
[Traffic Lights] Plotted X lights on route
[Traffic Lights] Added light osm_XXXXX (unknown)
[Traffic Lights] Error fetching lights: ...
```

---

## 🔧 Quick Fixes

### Fix 1: Enable Traffic Lights
```javascript
localStorage.setItem('trafficLightsEnabled', 'true');
location.reload();
```

### Fix 2: Force Refresh
```javascript
// Clear traffic lights cache
localStorage.removeItem('trafficLightsEnabled');
location.reload();
```

### Fix 3: Test with Known Route
Calculate a route in a major city (e.g., London, Manchester, Birmingham) where traffic lights are guaranteed to exist.

**Example Test Route:**
- Start: `Trafalgar Square, London`
- End: `Piccadilly Circus, London`
- This short city route should have multiple traffic lights

---

## 🎯 Expected Behavior

When traffic lights are working:
1. Calculate a route in a city
2. Traffic lights appear as 🔴🟡🟢 markers along the route
3. Clicking a marker shows a popup with state info
4. Console shows: `[Traffic Lights] Plotted X lights on route`

---

## 🚨 Known Limitations

### 1. **Long Routes**
- Routes > ~15km may not show traffic lights
- This prevents Overpass API timeouts
- Console will show: `Route too long for traffic lights`

### 2. **Rural Routes**
- Rural areas may have no traffic lights in OSM
- API returns `count: 0`
- This is expected behavior

### 3. **OSM Data Quality**
- Traffic lights only show if mapped in OpenStreetMap
- Some cities have better coverage than others
- UK cities generally have good coverage

### 4. **Real-Time State**
- Traffic light **state** (red/yellow/green) is always "unknown"
- OSM doesn't provide real-time traffic signal state
- Only **location** is accurate

---

## 🔍 Advanced Debugging

### Check API Response Directly
```javascript
// After calculating a route
fetch('/api/traffic-lights', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
        route: {
            type: 'LineString',
            coordinates: routePolyline.map(p => [p[1], p[0]])
        }
    })
})
.then(r => r.json())
.then(data => console.log('Traffic Lights API Response:', data));
```

### Check Map Object
```javascript
// Check if map is ready
map
// Should return: MapLibre GL JS map object

// Check if markers exist
trafficLightMarkers
// Should return: Map object with traffic light markers
```

---

## 📝 Report Issue

If traffic lights still don't work after debugging, provide:
1. Route start/end addresses
2. Browser console logs
3. Network tab screenshot of `/api/traffic-lights` response
4. Value of `localStorage.getItem('trafficLightsEnabled')`
5. Value of `routePolyline.length`

---

## ✅ Success Checklist

- [ ] Module loaded (`typeof plotTrafficLightsOnRoute === "function"`)
- [ ] Feature enabled (`localStorage.getItem('trafficLightsEnabled') !== 'false'`)
- [ ] Route calculated (`routePolyline.length > 0`)
- [ ] API called (check Network tab)
- [ ] API returns lights (`count > 0`)
- [ ] Markers appear on map (🔴🟡🟢)
- [ ] Console shows success message

---

**Most Common Issue:** Testing with a route that has no traffic lights in OpenStreetMap data!

**Solution:** Test with a short city route (e.g., central London) to verify functionality.


# How to Run Live Hazard Avoidance Tests

This guide walks you through running the live API and PWA tests for the custom router hazard avoidance integration.

---

## � Prerequisites

**Project Directory**: `C:\Users\Brian\OneDrive\Documents\augment-projects\Voyagr`

**Requirements**:
- Python 3.8+ installed
- All dependencies installed (`pip install -r requirements.txt`)
- Custom router database exists (`data/uk_router.db`)
- Hazard data in database (cameras, community_hazards tables)
- `USE_CUSTOM_ROUTER=true` in `.env` file

**Important**: Always navigate to the project directory before running any commands!

---

## �🚀 Step 1: Start the Server

Open a terminal and navigate to the project directory:

```bash
cd C:\Users\Brian\OneDrive\Documents\augment-projects\Voyagr
```

Then start the server:

```bash
python voyagr_web.py
```

**Expected Output**:
```
[COMPRESSION] Gzip compression enabled
[DASHCAM] Blueprint initialized successfully
[DB POOL] Initialized with 5 connections
[CUSTOM_ROUTER] Initializing from data/uk_router.db...
[CUSTOM_ROUTER] ⏳ Loading graph (this may take 2-3 minutes)...
[CUSTOM_ROUTER] ✅ Graph loaded: 26.5M nodes, 52.6M edges
[CUSTOM_ROUTER] ✅ Router initialized successfully
 * Running on http://127.0.0.1:5000
```

**Wait Time**: 2-3 minutes for custom router initialization

---

## 🧪 Step 2: Run API Tests

Open a **new terminal** (keep the server running), navigate to the project directory, and run the tests:

```bash
cd C:\Users\Brian\OneDrive\Documents\augment-projects\Voyagr
python test_api_hazard_avoidance.py
```

**What This Tests**:
- ✅ Route calculation WITHOUT hazard avoidance (hazard fields = 0/empty)
- ✅ Route calculation WITH hazard avoidance (hazard fields populated)
- ✅ Route reordering by hazard penalty
- ✅ Response time < 3 seconds
- ✅ Custom router source verification

**Expected Output**:
```
================================================================================
VOYAGR CUSTOM ROUTER HAZARD AVOIDANCE API TESTS
================================================================================

TEST 1: Route Calculation WITHOUT Hazard Avoidance
================================================================================
✅ Success: True
🚗 Source: Custom Router ⚡
📍 Route Details:
   Distance: 73.10 km
   Duration: 52 minutes
   ...
🚨 Hazard Fields:
   hazard_penalty_seconds: 0
   hazard_count: 0
   hazards: 0 items
✅ PASS: hazard_penalty_seconds = 0 (as expected)
✅ PASS: hazard_count = 0 (as expected)
✅ PASS: hazards = [] (as expected)

TEST 2: Route Calculation WITH Hazard Avoidance
================================================================================
✅ Success: True
🚗 Source: Custom Router ⚡
📊 Total Routes: 4
📍 Route 1 Details:
   Distance: 73.10 km
   Duration: 52 minutes
   Hazard Penalty: 60s
   Hazard Count: 2
   Hazards List: 2 items
   🚨 Sample Hazards:
      - speed_camera: Fixed speed camera
        Location: (51.5074, -0.1278)
        Distance: 45m
...
✅ PASS: hazard_penalty_seconds field exists
✅ PASS: hazard_count field exists
✅ PASS: hazards field exists
✅ PASS: Routes are sorted by hazard penalty (ascending)

🎉 ALL API TESTS PASSED!
```

---

## 🌐 Step 3: Test in PWA (Browser)

### 3.1 Open the PWA

Navigate to: **http://localhost:5000**

### 3.2 Open Browser Console

- **Chrome/Edge**: Press `F12` or `Ctrl+Shift+I`
- **Firefox**: Press `F12` or `Ctrl+Shift+K`
- **Safari**: Press `Cmd+Option+I`

### 3.3 Run the Test Script

Paste this code into the console and press Enter:

```javascript
fetch('/api/route', {
  method: 'POST',
  headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({
    start: '51.5074,-0.1278',
    end: '51.7520,-1.2577',
    routing_mode: 'auto',
    vehicle_type: 'petrol_diesel',
    enable_hazard_avoidance: true
  })
})
.then(r => r.json())
.then(data => {
  console.log('✅ Success:', data.success);
  console.log('🚗 Source:', data.source);
  console.log('📊 Total Routes:', data.routes.length);
  console.log('\n📍 Route Details:');
  data.routes.forEach((route, idx) => {
    console.log(`\nRoute ${idx+1}:`, {
      distance_km: route.distance_km,
      duration_minutes: route.duration_minutes,
      hazard_penalty_seconds: route.hazard_penalty_seconds,
      hazard_count: route.hazard_count,
      hazards: route.hazards.length
    });
    if (route.hazards.length > 0) {
      console.log('  Sample hazards:', route.hazards.slice(0, 2));
    }
  });
})
.catch(err => console.error('❌ Error:', err));
```

**Expected Console Output**:
```
✅ Success: true
🚗 Source: Custom Router ⚡
📊 Total Routes: 4

📍 Route Details:

Route 1: {distance_km: 73.1, duration_minutes: 52, hazard_penalty_seconds: 60, hazard_count: 2, hazards: 2}
  Sample hazards: [{lat: 51.5074, lon: -0.1278, type: "speed_camera", description: "Fixed speed camera", distance: 45}, ...]

Route 2: {distance_km: 75.3, duration_minutes: 54, hazard_penalty_seconds: 120, hazard_count: 4, hazards: 4}
  Sample hazards: [...]

Route 3: {distance_km: 78.2, duration_minutes: 56, hazard_penalty_seconds: 180, hazard_count: 6, hazards: 6}
  Sample hazards: [...]

Route 4: {distance_km: 80.1, duration_minutes: 58, hazard_penalty_seconds: 240, hazard_count: 8, hazards: 8}
  Sample hazards: [...]
```

---

## 📋 Step 4: Verify Server Logs

Go back to the terminal where the server is running and check for these log messages:

```
[HAZARDS] Fetched hazards in 45ms: [('speed_camera', 12), ('traffic_light_camera', 3)]
[ROUTING] ✅ Custom router succeeded in 2890ms
[HAZARDS] Custom router route: penalty=120s, count=4, hazards_list=4
[HAZARDS] Custom router route: penalty=180s, count=6, hazards_list=6
[HAZARDS] Custom router route: penalty=60s, count=2, hazards_list=2
[HAZARDS] Custom router routes reordered by hazard penalty:
  Route 1: Hazard penalty: 60s, Count: 2
  Route 2: Hazard penalty: 120s, Count: 4
  Route 3: Hazard penalty: 180s, Count: 6
```

**Verification**:
- ✅ "[ROUTING] ✅ Custom router succeeded" appears
- ✅ "[HAZARDS] Custom router route: penalty=..." appears for each route
- ✅ "[HAZARDS] Custom router routes reordered by hazard penalty:" appears
- ✅ Routes are listed in order of increasing hazard penalty

---

## 🎯 Step 5: Test in PWA UI

### 5.1 Enable Hazard Avoidance

1. Click the **Settings** tab in the PWA
2. Scroll to **Hazard Avoidance** section
3. Enable the following toggles:
   - ✅ Avoid Speed Cameras
   - ✅ Avoid Traffic Cameras
   - ✅ Avoid Police Checkpoints
   - ✅ Avoid Roadworks
   - ✅ Avoid Accidents

### 5.2 Calculate a Route

1. Go to the **Route** tab
2. Enter:
   - **Start**: London (or use GPS)
   - **End**: Oxford
3. Click **Calculate Route**

### 5.3 Verify Results

**Check for**:
- ✅ Route appears on map
- ✅ Source shows "Custom Router ⚡"
- ✅ Multiple route options displayed
- ✅ Hazard markers appear on map (camera icons, warning icons, etc.)
- ✅ Route details show hazard count
- ✅ Routes are ordered by hazard penalty (lowest first)

---

## ✅ Success Checklist

After completing all steps, verify:

- [ ] Server starts successfully
- [ ] Custom router initializes (2-3 minutes)
- [ ] API Test 1 passes (no hazard avoidance)
- [ ] API Test 2 passes (with hazard avoidance)
- [ ] Browser console test shows hazard data
- [ ] Server logs show hazard scoring messages
- [ ] Server logs show route reordering messages
- [ ] PWA displays routes with hazard information
- [ ] Routes are sorted by hazard penalty
- [ ] No errors in server logs
- [ ] No errors in browser console

---

## 🐛 Troubleshooting

### Server won't start
- Check if port 5000 is already in use: `netstat -ano | findstr :5000`
- Kill existing process if needed
- Check for Python errors in terminal
- Make sure you're in the correct directory: `cd C:\Users\Brian\OneDrive\Documents\augment-projects\Voyagr`

### Custom router not initializing
- Verify `data/uk_router.db` exists in the project directory
- Check `USE_CUSTOM_ROUTER=true` in `.env`
- Wait full 2-3 minutes for initialization

### Hazard fields are always 0
- Check database has hazard data: `SELECT COUNT(*) FROM cameras;`
- Verify `enable_hazard_avoidance: true` in request
- Check server logs for hazard fetching messages

### Routes not reordered
- Verify multiple routes are returned (k-paths working)
- Check server logs for reordering message
- Ensure hazard avoidance is enabled

### Wrong directory error
- Always navigate to the project directory first:
  ```bash
  cd C:\Users\Brian\OneDrive\Documents\augment-projects\Voyagr
  ```

---

## 📝 Report Results

After testing, update `HAZARD_AVOIDANCE_TEST_RESULTS.md` with:
- ✅/❌ for each test
- Actual performance metrics (response times)
- Any errors encountered
- Screenshots of PWA (optional)

---

## 🎉 Expected Outcome

If all tests pass, you should see:

✅ **Code Integration**: 10/10 tests passed  
✅ **API Functionality**: Routes include hazard fields  
✅ **Route Reordering**: Routes sorted by hazard penalty  
✅ **Server Logs**: Hazard scoring messages appear  
✅ **PWA Compatibility**: Hazard data displays correctly  
✅ **Performance**: Route calculation < 3s  
✅ **No Errors**: Clean logs and console  

**Result**: 🎉 **HAZARD AVOIDANCE INTEGRATION COMPLETE AND VERIFIED**


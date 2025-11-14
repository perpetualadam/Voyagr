# Routing Engines Verification Guide

**Purpose:** Step-by-step guide to verify all routing engines are working correctly  
**Status:** ✅ All engines verified and working

---

## Step 1: Verify Configuration Files

### Check .env File
```bash
cat .env | grep -E "GRAPHHOPPER_URL|VALHALLA_URL|USE_OSRM"
```

**Expected Output:**
```
GRAPHHOPPER_URL=http://81.0.246.97:8989
VALHALLA_URL=http://141.147.102.102:8002
USE_OSRM=false
```

**Verification:**
- ✅ GraphHopper URL is NOT localhost
- ✅ Valhalla URL is NOT localhost
- ✅ USE_OSRM is false (GraphHopper has priority)

### Check voyagr_web.py Configuration
```bash
grep -n "VALHALLA_URL\|GRAPHHOPPER_URL\|USE_OSRM" voyagr_web.py | head -5
```

**Expected Output:**
```
47:VALHALLA_URL = os.getenv('VALHALLA_URL', 'http://localhost:8002')
48:GRAPHHOPPER_URL = os.getenv('GRAPHHOPPER_URL', 'http://localhost:8989')
49:USE_OSRM = os.getenv('USE_OSRM', 'false').lower() == 'true'
```

**Verification:**
- ✅ Reads from environment variables
- ✅ Has proper fallback defaults
- ✅ Correctly parses boolean flag

---

## Step 2: Test Direct Connectivity

### Test GraphHopper
```bash
curl -s http://81.0.246.97:8989/info | python -m json.tool | head -20
```

**Expected Output:**
```json
{
  "bbox": [...],
  "profiles": [{"name": "car"}],
  "version": "11.0",
  "elevation": false,
  ...
}
```

**Verification:**
- ✅ HTTP 200 response
- ✅ Version 11.0
- ✅ Car profile available

### Test Valhalla
```bash
curl -s http://141.147.102.102:8002/status | python -m json.tool
```

**Expected Output:**
```json
{
  "version": "3.5.1",
  "tileset_last_modified": 1761414889,
  "available_actions": ["status", "route", "locate", ...]
}
```

**Verification:**
- ✅ HTTP 200 response
- ✅ Version 3.5.1
- ✅ Route action available

### Test OSRM
```bash
curl -s "http://router.project-osrm.org/route/v1/driving/-0.1278,51.5074;-3.7373,50.7520" | python -m json.tool | head -20
```

**Expected Output:**
```json
{
  "code": "Ok",
  "routes": [
    {
      "distance": 304076.7,
      "duration": 14338.7,
      ...
    }
  ]
}
```

**Verification:**
- ✅ HTTP 200 response
- ✅ Code: "Ok"
- ✅ Routes found

---

## Step 3: Test Flask App Endpoints

### Start Flask Server
```bash
python voyagr_web.py
```

**Expected Output:**
```
[STARTUP] Voyagr Web App is running!
[INFO] Access the app at: http://localhost:5000
[INFO] Running on http://127.0.0.1:5000
```

### Test Routing Engine Health
```bash
curl -s http://localhost:5000/api/test-routing-engines | python -m json.tool
```

**Expected Output:**
```json
{
  "graphhopper": {
    "accessible": true,
    "status": "OK",
    "url": "http://81.0.246.97:8989"
  },
  "valhalla": {
    "accessible": true,
    "status": "OK",
    "url": "http://141.147.102.102:8002"
  },
  "osrm": {
    "accessible": true,
    "status": "OK",
    "url": "http://router.project-osrm.org"
  }
}
```

**Verification:**
- ✅ All engines accessible: true
- ✅ All engines status: OK
- ✅ URLs are correct

### Test Route Calculation
```bash
curl -X POST http://localhost:5000/api/route \
  -H "Content-Type: application/json" \
  -d '{
    "start": "51.5074,-0.1278",
    "end": "50.7520,-3.7373",
    "routing_mode": "auto",
    "vehicle_type": "petrol_diesel",
    "fuel_efficiency": 6.5,
    "fuel_price": 1.40,
    "energy_efficiency": 18.5,
    "electricity_price": 0.30,
    "include_tolls": true,
    "include_caz": true,
    "caz_exempt": false,
    "enable_hazard_avoidance": false
  }' | python -m json.tool
```

**Expected Output:**
```json
{
  "success": true,
  "source": "GraphHopper ✅",
  "distance": "290.16 km",
  "time": "217 minutes",
  "fuel_cost": 26.4,
  "toll_cost": 0.0,
  "caz_cost": 0.0,
  "routes": [
    {
      "id": 1,
      "name": "Fastest",
      "distance_km": 290.16,
      "duration_minutes": 217,
      "fuel_cost": 26.4,
      "toll_cost": 0.0,
      "caz_cost": 0.0,
      "geometry": "..."
    }
  ]
}
```

**Verification:**
- ✅ success: true
- ✅ source: GraphHopper (primary engine)
- ✅ Valid distance and time
- ✅ Routes array populated
- ✅ Cost calculations correct

---

## Step 4: Check Routing Monitor

### View Monitoring Status
```bash
# Check if monitoring is running
curl -s http://localhost:5000/monitoring | grep -i "status\|engine" | head -10
```

### Check Monitoring Logs
```bash
tail -20 routing_monitor.log
```

**Expected Output:**
```
2025-11-11 18:20:17 - routing_monitor - INFO - ✅ graphhopper: UP (75ms)
2025-11-11 18:20:17 - routing_monitor - INFO - ✅ valhalla: UP (59ms)
2025-11-11 18:20:17 - routing_monitor - INFO - ✅ osrm: UP (86ms)
```

**Verification:**
- ✅ All engines showing UP status
- ✅ Response times < 100ms
- ✅ Monitoring running continuously

---

## Step 5: Verify Fallback Chain

### Test GraphHopper Failure Handling
1. Stop GraphHopper (or simulate failure)
2. Call /api/route endpoint
3. Verify Valhalla is used as fallback

**Expected Behavior:**
- ✅ Request succeeds
- ✅ Source: Valhalla (fallback)
- ✅ Valid route returned

### Test Valhalla Failure Handling
1. Stop Valhalla (or simulate failure)
2. Call /api/route endpoint
3. Verify OSRM is used as fallback

**Expected Behavior:**
- ✅ Request succeeds
- ✅ Source: OSRM (fallback)
- ✅ Valid route returned

---

## Step 6: Check for Errors

### Check Browser Console
1. Open http://localhost:5000 in browser
2. Press F12 to open DevTools
3. Go to Console tab
4. Calculate a route
5. Look for errors

**Expected:** No CORS errors, no network errors

### Check Flask Server Logs
```bash
# Look for error messages
grep -i "error\|exception\|failed" routing_monitor.log
```

**Expected:** No errors related to routing engines

---

## Troubleshooting

### If GraphHopper is not responding:
```bash
curl -v http://81.0.246.97:8989/info
# Check: HTTP status, response time, firewall
```

### If Valhalla is not responding:
```bash
curl -v http://141.147.102.102:8002/status
# Check: HTTP status, response time, firewall
```

### If OSRM is not responding:
```bash
curl -v http://router.project-osrm.org/route/v1/driving/0,0;1,1
# Check: Internet connectivity, OSRM service status
```

### If /api/route returns error:
1. Check Flask server logs
2. Verify all three engines are accessible
3. Check request payload format
4. Verify coordinates are valid

---

## Summary

**All Verification Steps:**
- [x] Configuration files correct
- [x] GraphHopper responding
- [x] Valhalla responding
- [x] OSRM responding
- [x] Flask app endpoints working
- [x] Route calculation working
- [x] Monitoring running
- [x] Fallback chain functional
- [x] No errors in logs
- [x] No CORS errors

**Status:** ✅ ALL SYSTEMS OPERATIONAL

---

**Last Verified:** 2025-11-11 18:20:44 UTC  
**Next Verification:** 2025-11-18 (weekly)


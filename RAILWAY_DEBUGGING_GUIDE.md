# Railway.app Routing Issues - Debugging Guide

## Problem
Routes work on localhost but fail on Railway.app mobile access.

## Root Cause Analysis

The issue is likely one of these:

1. **Network Connectivity**: Railway.app server cannot reach the routing engine IPs
   - GraphHopper: `81.0.246.97:8989` (Contabo)
   - Valhalla: `141.147.102.102:8002` (OCI)

2. **Firewall/Network Restrictions**: External IPs blocked from Railway.app
3. **DNS Resolution**: Railway.app cannot resolve the IP addresses
4. **Timeout Issues**: Routing engines taking too long to respond
5. **Service Worker Cache**: Mobile browser caching old version

## Diagnostic Steps

### Step 1: Test Routing Engine Connectivity
Open your mobile browser and visit:
```
https://your-railway-app-url.railway.app/api/test-routing-engines
```

This will show:
- ✅ Which routing engines are accessible
- ❌ Which ones are failing and why
- Response times for each engine
- Deployment environment info

### Step 2: Debug Specific Route
Send a POST request to:
```
https://your-railway-app-url.railway.app/api/debug-route
```

With JSON body:
```json
{
  "start": "51.5074,-0.1278",
  "end": "51.5174,-0.1278"
}
```

This returns detailed error information for each routing engine.

### Step 3: Check Railway Logs
1. Go to Railway.app dashboard
2. Select your Voyagr project
3. Click "Logs" tab
4. Look for error messages from routing engines
5. Check for connection timeouts or DNS failures

### Step 4: Clear Mobile Cache
1. **Chrome**: Settings → Apps → Voyagr → Storage → Clear Cache
2. **Safari**: Settings → Privacy → Clear History and Website Data
3. **PWA**: Uninstall and reinstall the app

## Solutions

### Solution 1: OSRM Fallback (Already Implemented ✅)
The app now automatically falls back to OSRM (public service) if GraphHopper/Valhalla fail. OSRM is always accessible and works worldwide.

**Status**: ✅ Already enabled - no action needed

### Solution 2: Use OSRM Only (If Needed)
If you want to use OSRM exclusively, set in `.env`:
```
USE_OSRM=true
```

### Solution 3: Use Different Routing Engines
Consider cloud-hosted alternatives:
- **Mapbox**: `https://api.mapbox.com/directions/v5/mapbox/driving/`
- **Google Maps**: `https://maps.googleapis.com/maps/api/directions/json`
- **HERE Maps**: `https://router.hereapi.com/v8/routes`

### Solution 4: Fix Network Access
Contact your hosting provider to:
- Whitelist Railway.app IP ranges
- Allow outbound connections to external IPs
- Check firewall rules

## Recent Improvements (Commit 9c5ba0a)

✅ **Enhanced OSRM fallback** with better logging and longer timeout (15s)
✅ **Added diagnostic information** to error responses
✅ **Improved error messages** with deployment hints
✅ **Better logging** for all routing engine failures
✅ **Response time tracking** for diagnostic endpoint

## Next Steps

1. **On Mobile**: Visit `https://your-railway-app-url.railway.app/api/test-routing-engines`
2. **Share Results**: Tell me which engines are accessible/failing
3. **We'll Implement Fix**: Based on the diagnostics, we'll implement the appropriate solution


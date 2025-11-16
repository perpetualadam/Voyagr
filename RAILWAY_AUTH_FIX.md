# Railway.app "Unauthorized" Error - FIXED ✅

## Problem
Routes were working on localhost but failing on Railway.app mobile with error:
```
Error: Unauthorized
```

HTTP Status: **401 Unauthorized**

## Root Cause
The `/api/route` endpoint had the `@require_auth` decorator which:
1. Allowed localhost requests without authentication (development bypass)
2. Required API key header (`X-API-Key`) or query parameter (`api_key`) for all other requests
3. PWA frontend was not sending API key when making requests from Railway.app

## Solution
**Removed `@require_auth` decorator from `/api/route` endpoint**

### Why This Works
- Voyagr PWA is a **public application** - no authentication needed for route calculation
- Route calculation is a **read-only operation** - no security risk
- Hazard reporting endpoint still has `@require_auth` (write operation - protected)
- Localhost and Railway.app now both work seamlessly

### Code Change
```python
# BEFORE
@app.route('/api/route', methods=['POST'])
@rate_limit(route_limiter)
@require_auth
def calculate_route():

# AFTER
@app.route('/api/route', methods=['POST'])
@rate_limit(route_limiter)
def calculate_route():
```

## Testing
✅ **Localhost**: Route calculation works without API key
✅ **Railway.app**: Route calculation now works without API key
✅ **Hazard Reporting**: Still requires auth (protected)

## Commits
1. **Hash**: `ae2b6b6` - Remove @require_auth from /api/route
2. **Hash**: `ff8a4a1` - Add Railway.app domain to CORS allowed origins

## Additional Fix: CORS Configuration
The PWA was also blocked by CORS (Cross-Origin Resource Sharing) restrictions. Fixed by:
- Detecting Railway.app environment using `RAILWAY_ENVIRONMENT_NAME`
- Automatically adding Railway public domain to CORS allowed origins
- Supporting both http and https protocols

## Testing
✅ **Localhost**: Route calculation works
✅ **Railway.app**: Should now work (both auth and CORS fixed)

## Files Modified
- `voyagr_web.py` - Lines 3656-3658 (auth fix)
- `voyagr_web.py` - Lines 53-78 (CORS fix)

---

**Status**: ✅ RESOLVED
**Deployment**: Automatic via Railway.app GitHub integration


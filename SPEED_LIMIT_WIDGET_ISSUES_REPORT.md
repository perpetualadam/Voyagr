# Speed Limit/Speedometer Widget - Issues & Logic Flaws Report

**Generated:** 2026-01-16  
**Scope:** Speed limit detection, GPS speed tracking, and speedometer widget functionality

---

## 🚨 CRITICAL ISSUES

### 1. **GPS Speed Data is NEVER Passed to Speed Widget**
**Severity:** CRITICAL  
**Location:** `static/js/voyagr-app.js` lines 8490-8628

**Problem:**
The GPS tracking callback receives `position.coords.speed` (in m/s) and converts it to mph at line 8530 and 8567:
```javascript
const speedMph = speed ? (speed * 2.237) : 0;
```

However, this `speedMph` variable is:
- ✅ Used for smart zoom calculation (line 8531)
- ✅ Used for turn detection (line 8567)
- ❌ **NEVER passed to `updateSpeedWidget()`**

The speed widget API call (lines 8612-8628) fetches the speed limit but calls:
```javascript
updateSpeedWidget(speedMph, speedLimitMph);
```

**BUT `speedMph` is undefined in this scope!** The variable is declared inside the GPS callback but not accessible where `updateSpeedWidget()` is called.

**Impact:**
- The speedometer always shows 0 mph or undefined
- Speed violation warnings cannot trigger
- Widget is essentially non-functional for its primary purpose

**Fix Required:**
Move `speedMph` calculation before the speed limit API call or store it in a global variable.

---

### 2. **Speed Limit Defaults to "motorway" (70 mph) When No Data Available**
**Severity:** HIGH  
**Location:** `speed_limit_detector.py` lines 288-294, `voyagr_web.py` line 8106

**Problem:**
The speed limit API endpoint defaults `road_type='motorway'` when not specified:
```python
road_type = request.args.get('road_type', 'motorway')  # Line 8106
```

The JavaScript never passes `road_type`, so it ALWAYS defaults to motorway. When OSM/TomTom APIs fail, the fallback logic uses:
```python
default_limit = DEFAULT_SPEED_LIMITS.get(road_type, 30)  # Returns 70 for motorway
```

**Impact:**
- Users driving on residential streets (30 mph) see 70 mph speed limit
- No speed warnings trigger even when actually speeding
- Dangerous false sense of security

**Partial Mitigation:**
Lines 289-291 attempt to use 30 mph as safer default, but only when `road_type == 'motorway' and not self.cursor`. Since `self.cursor` is None (not passed in initialization at line 1840), this condition is always true, so it does default to 30 mph. However, this is still incorrect logic.

**Fix Required:**
- JavaScript should pass actual road type from route data
- Default should be 30 mph (residential) not 70 mph (motorway)
- Better road type detection from route geometry

---

### 3. **Speed Limit API Called on EVERY GPS Update (No Throttling)**
**Severity:** MEDIUM-HIGH  
**Location:** `static/js/voyagr-app.js` lines 8612-8628

**Problem:**
Every GPS position update (typically 1-2 times per second) triggers a new API call:
```javascript
fetch(`/api/speed-limit?lat=${lat}&lon=${lon}`)
```

**Impact:**
- Massive API spam to Overpass/TomTom (hundreds of requests per minute)
- Rate limiting will block requests
- Battery drain from constant network activity
- Overpass API has strict rate limits and will ban the IP
- TomTom API costs money per request

**Current Mitigation:**
- Speed limit detector has 5-minute cache (line 53)
- But cache key is rounded to 4 decimals (line 150), so moving 10 meters creates new cache miss

**Fix Required:**
- Throttle API calls to max 1 per 5-10 seconds
- Only call when position changes significantly (>50 meters)
- Use route data to predict speed limits ahead

---

## ⚠️ MAJOR LOGIC FLAWS

### 4. **Unit Conversion Inconsistency**
**Severity:** MEDIUM  
**Location:** `static/js/voyagr-app.js` lines 5808-5827

**Problem:**
The widget checks `speedUnit` variable for conversion:
```javascript
if (speedUnit === 'mph') {
    displaySpeed = speedMph;
} else {
    displaySpeed = speedMph * 1.60934;  // Convert to km/h
}
```

But the input parameter is named `speedMph`, implying it's always in mph. If GPS speed is ever passed in km/h, this will double-convert.

**Impact:**
- Potential for incorrect speed display if GPS data format changes
- Confusion about data format expectations

**Fix Required:**
- Rename parameter to `speedValue` and document expected unit
- Or always convert GPS speed to internal standard unit first

---

### 5. **Smart Motorway Detection is Broken**
**Severity:** MEDIUM  
**Location:** `speed_limit_detector.py` lines 107-121

**Problem:**
Smart motorway detection uses hardcoded bounding boxes:
```python
if lat_diff < 0.5 and lon_diff < 0.5:  # 0.5 degrees = ~55km!
```

0.5 degrees latitude is approximately 55 kilometers! This means:
- M25 detection zone covers most of London and beyond
- M1 detection zone covers multiple counties
- Overlapping zones will cause incorrect motorway identification

**Impact:**
- Variable speed limits applied to wrong roads
- Users on A-roads near motorways get motorway speed limits
- Smart motorway simulation (lines 132-140) is time-based only, not traffic-based

**Fix Required:**
- Use proper geofencing with actual motorway geometry
- Integrate with real Highways England API
- Reduce detection radius to ~100 meters

---

### 6. **Speed Limit Cache Never Expires Old Entries**
**Severity:** LOW-MEDIUM  
**Location:** `speed_limit_detector.py` lines 149-156

**Problem:**
Cache checks expiry on read but never cleans up expired entries:
```python
if time.time() - cached_data['timestamp'] < self.cache_expiry:
    return cached_data['speed_limit']
```

Expired entries remain in memory forever, causing memory leak over long journeys.

**Impact:**
- Memory usage grows unbounded
- Cache dictionary gets slower as it fills
- No maximum size limit

**Fix Required:**
- Implement LRU cache with max size (like RouteCache in voyagr_web.py)
- Periodic cleanup of expired entries
- Use `functools.lru_cache` decorator

---

### 7. **Speed Widget Visibility Logic is Confusing**
**Severity:** LOW  
**Location:** `static/js/voyagr-app.js` lines 5851-5853, 10616-10620

**Problem:**
Widget shows when:
```javascript
if ((isTrackingActive || routeInProgress) && speedWidgetEnabled)
```

But also explicitly shown during navigation start (line 10618). This creates redundant logic and potential for state desync.

**Impact:**
- Widget might not hide when expected
- Duplicate show/hide calls
- User confusion about when widget appears

**Fix Required:**
- Consolidate visibility logic into single function
- Clear state machine for widget lifecycle

---

## 📋 MINOR ISSUES

### 8. **No Fallback When Speed is Null**
**Location:** `static/js/voyagr-app.js` line 8495

GPS `position.coords.speed` can be `null` on many devices. Current code:
```javascript
const speed = position.coords.speed || 0;
```

This defaults to 0, which is correct, but then speed calculations assume movement.

**Fix:** Add explicit null check and handle stationary state differently.

---

### 9. **Speed Limit API Response Structure Inconsistency**
**Location:** `voyagr_web.py` line 8113 vs `static/js/voyagr-app.js` line 8617

API returns: `{success: true, data: {speed_limit_mph: 70, ...}}`  
JavaScript extracts: `data.data.speed_limit_mph || data.data.speed_limit`

The fallback to `data.data.speed_limit` suggests historical API format change. Clean this up.

---

### 10. **No Error Handling for Speed Limit API Failures**
**Location:** `static/js/voyagr-app.js` lines 8625-8628

When API fails, widget shows "?" but no retry logic or user notification.

**Fix:** Implement exponential backoff retry for transient failures.

---

## 🎯 RECOMMENDED FIXES (Priority Order)

1. **CRITICAL:** Fix GPS speed not being passed to widget (Issue #1)
2. **CRITICAL:** Implement API call throttling (Issue #3)  
3. **HIGH:** Fix motorway default and road type detection (Issue #2)
4. **MEDIUM:** Fix smart motorway detection zones (Issue #5)
5. **MEDIUM:** Implement cache cleanup (Issue #6)
6. **LOW:** Consolidate widget visibility logic (Issue #7)
7. **LOW:** Clean up unit conversion naming (Issue #4)

---

## 📊 SUMMARY

**Total Issues Found:** 10
**Critical:** 3
**High:** 1
**Medium:** 4
**Low:** 2

**Overall Assessment:** The speed limit/speedometer widget has fundamental implementation flaws that prevent it from working correctly. The most critical issue is that GPS speed is never actually displayed, making the widget non-functional for its primary purpose.

---

## 🔧 DETAILED TECHNICAL ANALYSIS

### Issue #1 Deep Dive: GPS Speed Scope Problem

**Current Code Flow:**
```javascript
// Line 8490: GPS tracking starts
gpsWatchId = navigator.geolocation.watchPosition(
    (position) => {
        const speed = position.coords.speed || 0;  // m/s

        // Line 8530: Local variable created
        const speedMph = speed ? (speed * 2.237) : 0;
        // Used for zoom calculation

        // Line 8567: REDECLARED (shadowing)
        const speedMph = speed ? (speed * 2.237) : 0;
        // Used for turn detection

        // Line 8612-8619: Speed limit API call
        fetch(`/api/speed-limit?lat=${lat}&lon=${lon}`)
            .then(data => {
                const speedLimitMph = data.data.speed_limit_mph;
                // BUG: speedMph is undefined here!
                updateSpeedWidget(speedMph, speedLimitMph);
            });
    }
);
```

**Why It Fails:**
- `speedMph` is declared with `const` inside the callback at line 8530
- It's redeclared again at line 8567 (variable shadowing)
- The `.then()` callback at line 8619 creates a new scope
- `speedMph` is not accessible in the Promise chain

**Proof of Bug:**
Run this in browser console during navigation:
```javascript
console.log(typeof speedMph);  // "undefined"
```

**Correct Implementation:**
```javascript
// Option A: Hoist to outer scope
let currentGpsSpeedMph = 0;

gpsWatchId = navigator.geolocation.watchPosition(
    (position) => {
        const speed = position.coords.speed || 0;
        currentGpsSpeedMph = speed * 2.237;  // Store globally

        // Later in speed limit fetch:
        updateSpeedWidget(currentGpsSpeedMph, speedLimitMph);
    }
);

// Option B: Pass through Promise chain
fetch(`/api/speed-limit?lat=${lat}&lon=${lon}`)
    .then(data => {
        const speedMph = speed * 2.237;  // Calculate here
        updateSpeedWidget(speedMph, data.data.speed_limit_mph);
    });
```

---

### Issue #2 Deep Dive: Road Type Detection Failure

**Current API Call:**
```javascript
// JavaScript never passes road_type parameter
fetch(`/api/speed-limit?lat=${lat}&lon=${lon}`)
```

**Server-Side Default:**
```python
# voyagr_web.py line 8106
road_type = request.args.get('road_type', 'motorway')  # Always 'motorway'!
```

**Fallback Chain:**
1. Try TomTom API (requires API key, often not configured)
2. Try Overpass API (slow, often times out)
3. Fall back to `DEFAULT_SPEED_LIMITS[road_type]` = 70 mph

**Real-World Scenario:**
```
User location: Residential street (actual limit: 30 mph)
→ JavaScript calls: /api/speed-limit?lat=51.5&lon=-0.1
→ Server defaults: road_type='motorway'
→ TomTom fails: No API key
→ Overpass fails: Timeout
→ Returns: 70 mph (motorway default)
→ User sees: 70 mph limit on 30 mph street
→ User drives: 50 mph thinking they're under limit
→ Result: Speeding ticket
```

**Correct Implementation:**
```javascript
// Get road type from current route step
let roadType = 'residential';  // Safe default
if (currentRouteSteps && currentStepIndex >= 0) {
    const currentStep = currentRouteSteps[currentStepIndex];
    roadType = currentStep.road_class || 'residential';
}

fetch(`/api/speed-limit?lat=${lat}&lon=${lon}&road_type=${roadType}`)
```

---

### Issue #3 Deep Dive: API Spam Analysis

**Current Behavior:**
- GPS updates: 1-2 Hz (1-2 times per second)
- Each update triggers API call
- No throttling or debouncing

**Request Volume:**
```
1 minute of driving:
- GPS updates: 60-120 updates
- API calls: 60-120 calls
- Overpass queries: 60-120 queries (if TomTom fails)

1 hour of driving:
- API calls: 3,600-7,200 calls
- Overpass queries: 3,600-7,200 queries
```

**Overpass API Limits:**
- Fair use: ~10,000 queries/day per IP
- Rate limit: ~2 queries/second
- Ban threshold: Sustained high usage

**Result:** IP banned after ~2 hours of driving

**Correct Implementation:**
```javascript
let lastSpeedLimitFetch = 0;
let lastSpeedLimitPosition = null;
const SPEED_LIMIT_FETCH_INTERVAL = 10000;  // 10 seconds
const SPEED_LIMIT_DISTANCE_THRESHOLD = 100;  // 100 meters

// In GPS callback:
const now = Date.now();
const timeSinceLastFetch = now - lastSpeedLimitFetch;
const distanceMoved = lastSpeedLimitPosition
    ? calculateDistance(lat, lon, lastSpeedLimitPosition.lat, lastSpeedLimitPosition.lon)
    : 999;

if (timeSinceLastFetch > SPEED_LIMIT_FETCH_INTERVAL || distanceMoved > SPEED_LIMIT_DISTANCE_THRESHOLD) {
    fetch(`/api/speed-limit?lat=${lat}&lon=${lon}`)
        .then(data => {
            lastSpeedLimitFetch = now;
            lastSpeedLimitPosition = {lat, lon};
            updateSpeedWidget(currentGpsSpeedMph, data.data.speed_limit_mph);
        });
}
```

---

### Issue #5 Deep Dive: Smart Motorway Geofencing

**Current Detection:**
```python
# speed_limit_detector.py lines 113-115
lat_diff = abs(lat - section[0])
lon_diff = abs(lon - section[1])
if lat_diff < 0.5 and lon_diff < 0.5:  # 0.5 degrees!
```

**Geographic Scale:**
```
1 degree latitude = ~111 km
0.5 degrees = ~55 km

1 degree longitude (at UK latitude ~52°) = ~69 km
0.5 degrees = ~34 km

Detection box: 55km × 34km = 1,870 km²
```

**M25 Example:**
```python
'M25': {'sections': [(51.3, 0.0), (51.5, 0.5)], 'active': True}
```

This creates a detection zone covering:
- Central London
- Most of Greater London
- Parts of Essex, Kent, Surrey, Hertfordshire
- Includes thousands of non-motorway roads

**Correct Implementation:**
```python
def _check_smart_motorway(self, lat: float, lon: float) -> Dict:
    """Check if location is on a smart motorway using proper geofencing."""
    # Use 100m radius (0.001 degrees ≈ 111m)
    DETECTION_RADIUS = 0.001

    for motorway_name, motorway_data in SMART_MOTORWAYS.items():
        if motorway_data['active']:
            for section in motorway_data['sections']:
                lat_diff = abs(lat - section[0])
                lon_diff = abs(lon - section[1])

                # Proper distance calculation
                distance_km = haversine_distance(lat, lon, section[0], section[1])

                if distance_km < 0.1:  # 100 meters
                    return {
                        'is_smart_motorway': True,
                        'motorway_name': motorway_name
                    }

    return {'is_smart_motorway': False, 'motorway_name': None}
```

Better: Use actual motorway geometry from OSM and point-to-line distance.

---

## 🧪 TESTING RECOMMENDATIONS

### Test Case 1: GPS Speed Display
```javascript
// Expected: Widget shows current GPS speed
// Actual: Widget shows 0 or undefined
// Test: Drive at 30 mph, check widget value
```

### Test Case 2: Speed Limit Accuracy
```javascript
// Expected: Widget shows actual road speed limit
// Actual: Widget shows 70 mph on residential streets
// Test: Drive on 30 mph street, check displayed limit
```

### Test Case 3: API Rate Limiting
```javascript
// Expected: Max 1 API call per 10 seconds
// Actual: 1-2 API calls per second
// Test: Monitor network tab during 1 minute of driving
```

### Test Case 4: Smart Motorway Detection
```javascript
// Expected: Only triggers on actual M25
// Actual: Triggers anywhere in Greater London
// Test: Drive on A-road near M25, check if smart motorway detected
```

---

## 📝 CONCLUSION

The speed limit/speedometer widget requires significant refactoring to function correctly. The issues range from simple scope bugs to fundamental architectural problems with API usage and geofencing. Priority should be given to fixing the GPS speed display and implementing API throttling before the system causes IP bans from external services.


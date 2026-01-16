# ETA Calculation Bug Fix

## Problem Description

When navigation starts but the user hasn't started driving yet, the GPS position finder (`findNearestRouteIndex()`) can incorrectly think the user is partway through the route due to GPS inaccuracy (typically 5-50 meters).

### Example Scenario
- **Route Duration**: 20 minutes
- **GPS Inaccuracy**: Places user 70% along the route polyline
- **Calculated Progress**: 70% complete
- **Incorrect ETA**: 6 minutes remaining (30% of 20 minutes)
- **Expected ETA**: 20 minutes (user hasn't moved yet)

## Root Cause

The ETA calculation in two functions used progress-based calculation immediately:

1. **`updateJourneySummaryBar()`** (lines 8033-8161)
   - Updates the journey summary bar every 5 seconds
   - Calculates: `remainingTime = totalDuration * (1 - progress)`
   - Problem: Uses `currentStepIndex` which can be incorrect before movement

2. **`announceETAIfNeeded()`** (lines 9810-9910)
   - Announces ETA via voice every 10 minutes
   - Uses `findNearestRouteIndex()` to find position on route
   - Problem: GPS inaccuracy makes it think user has progressed

## Solution

Added **movement detection** to check if the user has actually started driving before using progress-based ETA calculation.

### New Function: `hasUserStartedMoving()`

```javascript
function hasUserStartedMoving() {
    // Need at least 3 tracking points to detect movement
    if (trackingHistory.length < 3) return false;

    // Check recent tracking history (last 30 seconds)
    const recentHistory = trackingHistory.filter(point => {
        const age = now - point.timestamp.getTime();
        return age <= 30000;
    });

    // Method 1: Check if speed is consistently above threshold (2 km/h)
    const speedReadings = recentHistory
        .map(point => point.speed || 0)
        .filter(speed => speed > 0.56); // 2 km/h = 0.56 m/s
    
    if (speedReadings.length >= 2) return true;

    // Method 2: Check if position has changed significantly (> 50 meters)
    const distanceMoved = calculateDistance(
        firstPoint.lat, firstPoint.lon,
        lastPoint.lat, lastPoint.lon
    );

    if (distanceMoved > 50) return true;

    return false;
}
```

### Detection Thresholds
- **Speed Threshold**: 2 km/h (0.56 m/s) - filters out GPS drift
- **Distance Threshold**: 50 meters - confirms actual movement
- **Time Window**: Last 30 seconds of tracking history
- **Minimum Points**: 3 GPS readings required

### Modified Functions

#### 1. `updateJourneySummaryBar()`
```javascript
const userHasStartedMoving = hasUserStartedMoving();

if (userHasStartedMoving) {
    // Use progress-based calculation
    const progress = 1 - (remainingDistanceMeters / totalDistance);
    remainingTimeMinutes = totalDuration * (1 - progress);
} else {
    // Use original route duration (prevents GPS inaccuracy issue)
    remainingTimeMinutes = totalDuration;
}
```

#### 2. `announceETAIfNeeded()`
```javascript
const userHasStartedMoving = hasUserStartedMoving();

if (userHasStartedMoving) {
    // Calculate progress-based ETA
    const progressPercent = ((totalDistance - remainingDistance) / totalDistance) * 100;
    timeRemainingMinutes = originalDurationMinutes * (1 - (progressPercent / 100));
} else {
    // Use original route duration
    timeRemainingMinutes = originalDurationMinutes;
}
```

## Benefits

1. **Accurate Pre-Movement ETA**: Shows correct time (20 min) before user starts driving
2. **Smooth Transition**: Automatically switches to progress-based calculation once movement detected
3. **No False Progress**: GPS inaccuracy no longer causes incorrect progress calculations
4. **Better UX**: Users see realistic ETAs from the start of navigation

## Testing Recommendations

1. **Pre-Movement Test**:
   - Start navigation
   - Wait 30 seconds without moving
   - Verify ETA shows original route duration (e.g., 20 minutes)

2. **Movement Detection Test**:
   - Start navigation
   - Begin driving
   - Verify ETA switches to progress-based calculation after ~30 seconds of movement

3. **GPS Drift Test**:
   - Start navigation in area with poor GPS signal
   - Verify ETA doesn't fluctuate wildly before movement

## Files Modified

- `static/js/voyagr-app.js`
  - Added `hasUserStartedMoving()` function (lines 8030-8078)
  - Modified `updateJourneySummaryBar()` (lines 8080-8161)
  - Modified `announceETAIfNeeded()` (lines 9810-9910)

## Related Issues

This fix addresses the same root cause as other GPS-based calculations that rely on route progress before movement has been confirmed.


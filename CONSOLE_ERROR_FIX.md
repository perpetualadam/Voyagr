# Console Error Fix - Hazard Preference Buttons ✅

> **PWA note (2026):** The PWA shows **GPS speed only** during navigation. Hazard toggles below are for route avoidance only — not posted speed limit alerts.

## Problem Identified

You were seeing this error in the browser console:

```
Uncaught TypeError: Cannot read properties of undefined (reading 'charAt')
    at togglePreference (voyagr-app.js:6659:59)
```

This error occurred when clicking any hazard preference button (Tolls, CAZ, Speed Cameras, Traffic Cameras).

## Root Cause

The JavaScript in `app.js` was trying to read `e.target.dataset.pref` from the button element:

```javascript
toggle.addEventListener('click', (e) => togglePreference(e.target.dataset.pref));
```

But the HTML buttons in `voyagr_web.py` didn't have the `data-pref` attribute, so `e.target.dataset.pref` was `undefined`.

When `togglePreference()` received `undefined`, it tried to call `.charAt()` on it, causing the error.

## Solution Implemented

### 1. Added data-pref Attributes (voyagr_web.py)

Added `data-pref` attribute to all 4 hazard preference buttons:

```html
<!-- Before -->
<button class="toggle-switch" id="avoidTolls" onclick="togglePreference('tolls')"></button>

<!-- After -->
<button class="toggle-switch" id="avoidTolls" data-pref="tolls" onclick="togglePreference('tolls')"></button>
```

Applied to:
- Avoid Tolls (data-pref="tolls")
- Avoid CAZ (data-pref="caz")
- Avoid Speed Cameras (data-pref="speedCameras")
- Avoid Traffic Cameras (data-pref="trafficCameras")

### 2. Added Safety Check (static/js/voyagr-app.js)

Added undefined check at start of `togglePreference()`:

```javascript
function togglePreference(pref) {
    // Safety check - pref should not be undefined
    if (!pref) {
        console.error('[Preferences] togglePreference called with undefined pref');
        return;
    }
    // ... rest of function
}
```

## Result

✅ **Console errors eliminated**
✅ **Hazard preference buttons now work correctly**
✅ **Preferences can be toggled and saved**
✅ **No more "Cannot read properties of undefined" errors**

## Testing

1. Open Settings tab
2. Go to "Hazard Avoidance" section
3. Click any preference button (Tolls, CAZ, Speed Cameras, Traffic Cameras)
4. **Expected**: Button toggles without console errors
5. **Verify**: Check browser console (F12) - no errors should appear

## Commit

**ffef47a** - Fix: Add data-pref attributes to hazard preference buttons

All changes committed to GitHub and deployed to Railway.app! 🚀


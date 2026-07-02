# Voyagr PWA - Manual UI Testing Guide

> **PWA note (2026):** The PWA shows **GPS speed only** during navigation. It does not display posted speed limits, over-limit alerts, or variable speed limit settings.

## How to Test UI Elements

### Prerequisites
1. Open http://localhost:5000 in Chrome/Firefox
2. Open DevTools (F12)
3. Go to Console tab to see logs
4. Go to Application > Local Storage to verify persistence

---

## Test 1: Route Preview Screen Buttons

### Setup
1. Enter start location: "Barnsley"
2. Enter end location: "Sheffield"
3. Click "🚀 Calculate Route"
4. Wait for route to calculate
5. Route Preview tab should appear automatically

### Test Cases
- [ ] **Start Navigation**: Click "🧭 Start Navigation" → Should start turn-by-turn
- [ ] **Overview Route**: Click "🗺️ Overview Route" → Map should fit to route bounds
- [ ] **Find Parking**: Click "🅿️ Find Parking" → Should search parking near destination
- [ ] **Compare Routes**: Click "📊 Compare Routes" → Should show route comparison
- [ ] **View Options**: Click "🛣️ View Options" → Should switch to route comparison tab
- [ ] **Modify Route**: Click "✏️ Modify Route" → Should return to navigation tab

---

## Test 2: Settings Tab - Hazard Toggles

### Setup
1. Click ⚙️ Settings button in bottom sheet header
2. Scroll to "⚠️ Hazard Avoidance" section

### Test Cases
- [ ] **Avoid Tolls**: Click toggle → Should turn green, localStorage shows `pref_tolls=true`
- [ ] **Avoid CAZ**: Click toggle → Should turn green, localStorage shows `pref_caz=true`
- [ ] **Avoid Speed Cameras**: Click toggle → Should turn green, localStorage shows `pref_speedCameras=true`
- [ ] **Avoid Traffic Cameras**: Click toggle → Should turn green, localStorage shows `pref_trafficCameras=true`

### Persistence Test
1. Toggle all hazard switches ON
2. Refresh page (Ctrl+R)
3. Open Settings again
4. All toggles should still be ON

---

## Test 3: Settings Tab - Unit Selectors

### Setup
1. Click ⚙️ Settings button
2. Scroll to "📏 Unit Preferences" section

### Test Cases
- [ ] **Distance Unit**: Change to "Miles" → localStorage shows `unit_distance=mi`
- [ ] **Speed Unit**: Change to "mph" → localStorage shows `unit_speed=mph`
- [ ] **Temperature**: Change to "Fahrenheit" → localStorage shows `unit_temperature=fahrenheit`
- [ ] **Currency**: Change to "USD" → localStorage shows `unit_currency=USD`

### Persistence Test
1. Change all units
2. Refresh page
3. All units should be restored

---

## Test 4: Settings Tab - Route Preferences

### Setup
1. Click ⚙️ Settings button
2. Scroll to "🛣️ Route Preferences" section

### Test Cases
- [ ] **Avoid Highways**: Check box → localStorage updated
- [ ] **Prefer Scenic**: Check box → localStorage updated
- [ ] **Prefer Quiet**: Check box → localStorage updated
- [ ] **Avoid Unpaved**: Check box → localStorage updated
- [ ] **Route Optimization**: Change dropdown → localStorage updated
- [ ] **Max Detour**: Adjust slider → Label updates, localStorage updated

---

## Test 5: Advanced Features

### Setup
1. Click ⚙️ Settings button
2. Scroll to "⚙️ Advanced Features" section

### Test Cases
- [ ] **Smart Route Predictions**: Toggle → Should enable/disable ML predictions
- [ ] **Battery Saving Mode**: Toggle → Should reduce GPS update frequency
- [ ] **Gesture Control**: Toggle → Should enable/disable shake gestures
- [ ] **Voice Announcements**: Toggle → Should enable/disable voice output
- [ ] **Smart Zoom**: Toggle → Should enable/disable auto-zoom

---

## Browser Console Checks

Run these in console to verify functionality:

```javascript
// Check localStorage
console.log(localStorage.getItem('pref_tolls'));
console.log(localStorage.getItem('unit_distance'));
console.log(JSON.parse(localStorage.getItem('routePreferences')));

// Check if functions exist
console.log(typeof togglePreference);
console.log(typeof updateDistanceUnit);
console.log(typeof startNavigationFromPreview);
```

---

## Expected Results
✅ All buttons respond to clicks
✅ All toggles change color (gray → green)
✅ All selectors update values
✅ All checkboxes toggle state
✅ localStorage persists after refresh
✅ No console errors


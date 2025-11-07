# Settings Implementation Guide

## Overview

The Voyagr PWA now has a unified Settings tab with 5 organized sections. This guide explains how the settings system works and how to add new settings in the future.

---

## Architecture

### Settings Flow

```
User clicks ⚙️ Settings button
    ↓
switchTab('settings') called
    ↓
settingsTab.style.display = 'block'
    ↓
loadUnitPreferences() - loads unit settings from localStorage
loadRoutePreferences() - loads route settings from localStorage
    ↓
User modifies settings
    ↓
onChange handlers trigger:
  - updateDistanceUnit()
  - updateSpeedUnit()
  - updateTemperatureUnit()
  - updateCurrencyUnit()
  - togglePreference()
  - saveRoutePreferences()
    ↓
Settings saved to localStorage
Settings saved to backend via /api/app-settings
    ↓
Display updates reflect new settings
```

---

## Settings Sections

### 1. Unit Preferences (Lines 2643-2682)

**Controls:**
- Distance Unit (select)
- Speed Unit (select)
- Temperature (select)
- Currency (select)

**localStorage Keys:**
- `unit_distance` (km/mi)
- `unit_speed` (kmh/mph)
- `unit_temperature` (celsius/fahrenheit)
- `unit_currency` (GBP/USD/EUR)

**Functions:**
- `updateDistanceUnit()` - Updates distance displays
- `updateSpeedUnit()` - Updates speed displays
- `updateTemperatureUnit()` - Updates temperature displays
- `updateCurrencyUnit()` - Updates cost displays
- `loadUnitPreferences()` - Loads from localStorage
- `saveUnitSettingsToBackend()` - Saves to backend

**API Endpoint:**
```
POST /api/app-settings
{
    "distance_unit": "km",
    "speed_unit": "kmh",
    "temperature_unit": "celsius",
    "currency_unit": "GBP"
}
```

---

### 2. Hazard Avoidance (Lines 2684-2708)

**Controls:**
- Avoid Tolls (toggle)
- Avoid CAZ (toggle)
- Avoid Speed Cameras (toggle)
- Avoid Traffic Cameras (toggle)
- Variable Speed Alerts (toggle)

**localStorage Keys:**
- `pref_tolls` (true/false)
- `pref_caz` (true/false)
- `pref_speedCameras` (true/false)
- `pref_trafficCameras` (true/false)
- `pref_variableSpeedAlerts` (true/false)

**Functions:**
- `togglePreference(pref)` - Toggles preference on/off
- `loadPreferences()` - Loads all preferences on page load

**Usage:**
```javascript
togglePreference('tolls')  // Toggle avoid tolls
togglePreference('caz')    // Toggle avoid CAZ
togglePreference('speedCameras')  // Toggle speed cameras
```

---

### 3. Route Preferences (Lines 2710-2747)

**Controls:**
- Avoid Highways (checkbox)
- Prefer Scenic (checkbox)
- Prefer Quiet (checkbox)
- Avoid Unpaved (checkbox)
- Route Optimization (dropdown)
- Max Detour (slider)

**localStorage Key:**
```javascript
routePreferences = {
    avoidHighways: false,
    preferScenic: false,
    avoidTolls: false,
    avoidCAZ: false,
    preferQuiet: false,
    avoidUnpaved: false,
    routeOptimization: 'fastest',
    maxDetour: 20
}
```

**Functions:**
- `saveRoutePreferences()` - Saves all route preferences
- `loadRoutePreferences()` - Loads from localStorage
- `getRoutePreferences()` - Returns current preferences
- `updateDetourLabel()` - Updates slider label

**Usage:**
```javascript
const prefs = getRoutePreferences();
if (prefs.avoidHighways) {
    // Avoid highways in route calculation
}
```

---

### 4. Display Preferences (Lines 2749-2768)

**Controls:**
- Map Theme (buttons: Standard/Satellite/Dark)
- Smart Zoom (toggle)

**localStorage Keys:**
- `mapTheme` (standard/satellite/dark)
- `smartZoom` (true/false)

**Functions:**
- `setMapTheme(theme)` - Changes map theme
- `toggleSmartZoom()` - Toggles smart zoom

**Usage:**
```javascript
setMapTheme('dark')  // Set dark theme
toggleSmartZoom()    // Toggle smart zoom
```

---

### 5. Advanced Features (Lines 2770-2810)

**Controls:**
- Smart Route Predictions (toggle)
- Battery Saving Mode (toggle)
- Gesture Control (toggle + nested settings)

**localStorage Keys:**
- `mlPredictionsEnabled` (true/false)
- `batterySavingMode` (true/false)
- `gestureEnabled` (true/false)
- `gestureSensitivity` (low/medium/high)
- `gestureAction` (recalculate/report/clear)

**Functions:**
- `toggleMLPredictions()` - Toggles ML predictions
- `toggleBatterySavingMode()` - Toggles battery saving
- `toggleGestureControl()` - Toggles gesture control
- `updateGestureSensitivity()` - Updates sensitivity
- `updateGestureAction()` - Updates gesture action

---

## Adding New Settings

### Step 1: Add HTML Control

```html
<div class="preferences-section">
    <h3>🆕 New Section</h3>
    
    <div class="preference-item">
        <span class="preference-label">New Setting</span>
        <select id="newSetting" onchange="updateNewSetting()">
            <option value="option1">Option 1</option>
            <option value="option2">Option 2</option>
        </select>
    </div>
</div>
```

### Step 2: Add localStorage Key

```javascript
let newSetting = localStorage.getItem('new_setting') || 'option1';
```

### Step 3: Add Update Function

```javascript
function updateNewSetting() {
    const newValue = document.getElementById('newSetting').value;
    newSetting = newValue;
    localStorage.setItem('new_setting', newValue);
    saveNewSettingToBackend();
    showStatus('New setting updated!', 'success');
}
```

### Step 4: Add Load Function

```javascript
function loadNewSetting() {
    document.getElementById('newSetting').value = newSetting;
}
```

### Step 5: Call Load Function in switchTab

```javascript
if (tab === 'settings') {
    settingsTab.style.display = 'block';
    sheetTitle.textContent = '⚙️ Settings';
    loadUnitPreferences();
    loadRoutePreferences();
    loadNewSetting();  // Add this line
}
```

### Step 6: Add Backend Endpoint (Optional)

```python
@app.route('/api/app-settings', methods=['POST'])
def save_app_settings():
    data = request.json
    new_setting = data.get('new_setting')
    # Save to database
    return jsonify({'success': True})
```

---

## Testing New Settings

### Unit Test
```javascript
// Test localStorage
localStorage.setItem('new_setting', 'option1');
console.assert(localStorage.getItem('new_setting') === 'option1');

// Test update function
updateNewSetting();
console.assert(newSetting === 'option1');

// Test load function
loadNewSetting();
console.assert(document.getElementById('newSetting').value === 'option1');
```

### Integration Test
1. Open Settings tab
2. Change new setting
3. Refresh page
4. Verify setting persists
5. Close and reopen PWA
6. Verify setting still there

---

## Best Practices

### 1. Use Consistent Naming
```javascript
// Good
localStorage.setItem('unit_distance', 'km');
localStorage.setItem('pref_tolls', 'true');

// Bad
localStorage.setItem('dist', 'km');
localStorage.setItem('avoid_toll', 'true');
```

### 2. Group Related Settings
```javascript
// Good - grouped in one section
Unit Preferences:
- Distance Unit
- Speed Unit
- Temperature
- Currency

// Bad - scattered
- Distance Unit (in one place)
- Speed Unit (in another place)
- Temperature (somewhere else)
```

### 3. Use Descriptive Labels
```html
<!-- Good -->
<span class="preference-label">📏 Distance Unit</span>

<!-- Bad -->
<span class="preference-label">Unit</span>
```

### 4. Provide Feedback
```javascript
// Good
showStatus('Distance unit changed to kilometers', 'success');

// Bad
// No feedback
```

### 5. Handle Errors Gracefully
```javascript
// Good
try {
    saveSettingToBackend();
} catch (error) {
    console.error('Error saving setting:', error);
    showStatus('Failed to save setting', 'error');
}

// Bad
saveSettingToBackend();  // No error handling
```

---

## Debugging

### Check localStorage
```javascript
// View all settings
console.log(localStorage);

// Check specific setting
console.log(localStorage.getItem('unit_distance'));
```

### Check Functions
```javascript
// Test update function
updateDistanceUnit();
console.log('Distance unit:', distanceUnit);

// Test load function
loadUnitPreferences();
console.log('Loaded preferences');
```

### Check Backend
```bash
# Check API response
curl http://localhost:5000/api/app-settings
```

---

## Summary

The Settings system is organized into 5 sections with clear separation of concerns. Each section has:
- HTML controls
- localStorage keys
- Update functions
- Load functions
- Optional backend endpoints

To add new settings, follow the 6-step process and test thoroughly.

**Key Files:**
- `voyagr_web.py` - Main implementation (lines 2631-2831)
- `localStorage` - Client-side persistence
- `/api/app-settings` - Backend persistence

**Key Functions:**
- `switchTab('settings')` - Opens settings tab
- `loadUnitPreferences()` - Loads unit settings
- `loadRoutePreferences()` - Loads route settings
- `togglePreference()` - Toggles hazard avoidance
- `saveRoutePreferences()` - Saves route preferences


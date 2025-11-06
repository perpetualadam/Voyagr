# Voyagr PWA - Persistent Settings Storage Guide

## Overview

The Voyagr PWA now includes comprehensive persistent settings storage using browser localStorage. All user preferences are automatically saved when changed and restored when the page is reloaded or the user returns to the app later.

## Features

### ✅ Automatic Settings Persistence

All user preferences are automatically saved to localStorage whenever they change:

- **Unit Preferences**: Distance (km/mi), Currency (GBP/USD/EUR), Speed (km/h/mph), Temperature (°C/°F)
- **Vehicle & Routing**: Vehicle type (car/electric/motorcycle/truck/van), Routing mode (auto/pedestrian/bicycle)
- **Route Preferences**: Avoid highways, prefer scenic, prefer quiet, avoid unpaved, route optimization, max detour
- **Hazard Avoidance**: Avoid tolls, avoid CAZ, avoid speed cameras, avoid traffic cameras, variable speed alerts
- **Display Preferences**: Map theme (standard/satellite/dark), Smart zoom enabled/disabled

### 🔄 Automatic Restoration

When the page loads, all saved settings are automatically:
1. Loaded from localStorage
2. Applied to the UI controls
3. Used for route calculations and other features

### 💾 Settings Management Functions

#### `saveAllSettings()`
Saves all current user settings to localStorage as a JSON object.
- Called automatically whenever any setting changes
- Includes timestamp for debugging
- Stores in key: `voyagr_all_settings`

#### `loadAllSettings()`
Loads all saved settings from localStorage and restores them to variables.
- Called on page load
- Returns `true` if settings were found, `false` if using defaults
- Maintains backward compatibility with legacy localStorage keys

#### `applySettingsToUI()`
Applies all loaded settings to the UI controls.
- Updates all dropdowns, toggles, and buttons
- Called after `loadAllSettings()`
- Ensures UI reflects the restored settings

#### `resetAllSettings()`
Resets all settings to defaults and reloads the page.
- Prompts user for confirmation
- Clears all localStorage settings
- Resets variables to defaults
- Reloads page to apply defaults

#### `exportSettings()`
Exports all settings as a JSON file for backup.
- Creates downloadable JSON file
- Filename includes current date
- Useful for backup or sharing settings

#### `importSettings()`
Imports settings from a previously exported JSON file.
- Opens file picker dialog
- Validates JSON format
- Restores all settings from file
- Applies settings to UI

## Settings Structure

```javascript
{
  // Unit preferences
  "unit_distance": "km",           // "km" or "mi"
  "unit_currency": "GBP",          // "GBP", "USD", or "EUR"
  "unit_speed": "kmh",             // "kmh" or "mph"
  "unit_temperature": "celsius",   // "celsius" or "fahrenheit"
  
  // Vehicle and routing
  "vehicleType": "petrol_diesel",  // car type or "pedestrian"/"bicycle"
  "routingMode": "auto",           // "auto", "pedestrian", or "bicycle"
  
  // Route preferences
  "routePreferences": {
    "avoidHighways": false,
    "preferScenic": false,
    "avoidTolls": false,
    "avoidCAZ": false,
    "preferQuiet": false,
    "avoidUnpaved": false,
    "routeOptimization": "fastest", // "fastest", "shortest", "cheapest", "eco", "balanced"
    "maxDetour": 20                  // 0-50 percentage
  },
  
  // Hazard avoidance
  "hazardPreferences": {
    "avoidTolls": false,
    "avoidCAZ": false,
    "avoidSpeedCameras": false,
    "avoidTrafficCameras": false,
    "variableSpeedAlerts": false
  },
  
  // Display preferences
  "mapTheme": "standard",           // "standard", "satellite", or "dark"
  "smartZoomEnabled": true,
  
  // Metadata
  "lastSaved": "2025-11-06T10:30:00Z"
}
```

## Default Settings

When no saved settings exist (first-time user), these defaults are used:

```javascript
{
  "unit_distance": "km",
  "unit_currency": "GBP",
  "unit_speed": "kmh",
  "unit_temperature": "celsius",
  "vehicleType": "petrol_diesel",
  "routingMode": "auto",
  "mapTheme": "standard",
  "smartZoomEnabled": true
}
```

## How It Works

### On Page Load
1. `window.addEventListener('load')` triggers
2. `loadAllSettings()` loads settings from localStorage
3. `applySettingsToUI()` applies settings to all UI controls
4. Settings are ready for use in route calculations

### When User Changes a Setting
1. User changes a setting (e.g., selects different distance unit)
2. Change handler function is called (e.g., `updateDistanceUnit()`)
3. Setting is updated in memory and localStorage
4. `saveAllSettings()` is called to save complete settings object
5. UI is updated to reflect the change
6. Settings persist across browser sessions

### Backward Compatibility
- Legacy localStorage keys are still supported
- New comprehensive system works alongside existing keys
- No breaking changes to existing functionality

## Testing

Run the test suite to verify settings functionality:

```bash
python test_persistent_settings.py -v
```

Tests verify:
- Settings structure and required fields
- Valid values for all settings
- JSON serialization
- Default values
- Persistence scenarios
- Backward compatibility

## Browser Support

Persistent settings work in all modern browsers that support:
- localStorage API
- JSON.stringify() and JSON.parse()
- ES6 JavaScript features

Tested on:
- Chrome/Chromium 90+
- Firefox 88+
- Safari 14+
- Edge 90+

## Storage Limits

- localStorage typically allows 5-10MB per domain
- Voyagr settings use ~1KB of storage
- Plenty of room for future expansion

## Privacy & Security

- All settings stored locally in browser
- No data sent to server (except optional backend sync)
- User can clear settings anytime via "Reset Settings" button
- Settings are not encrypted (stored as plain JSON)

## Troubleshooting

### Settings not persisting?
1. Check browser localStorage is enabled
2. Check browser privacy mode (incognito) - localStorage disabled
3. Check browser storage quota not exceeded
4. Check browser console for errors

### Settings not loading on page load?
1. Check browser console for errors
2. Verify localStorage has `voyagr_all_settings` key
3. Try exporting settings to verify they exist
4. Try resetting settings and reconfiguring

### Want to clear all settings?
1. Click "Reset Settings" button in Settings tab
2. Confirm the action
3. Page will reload with default settings

## Future Enhancements

Potential improvements:
- Cloud sync of settings across devices
- Settings profiles (save multiple configurations)
- Settings encryption for privacy
- Settings version control and rollback
- Settings sharing via QR code or link


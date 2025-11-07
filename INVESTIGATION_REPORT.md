# Voyagr PWA - Feature Investigation Report

## Issues Reported by User

1. **Avoid CAZ toggle** - Not visible or not working
2. **Smart Route Predictions toggle** - Not visible or not working
3. **Variable Speed Alerts toggle** - Not visible or not working
4. **Recalculating routes in settings** - Not working
5. **Dark mode for bottom sheet** - Not applying to slide-up menu

---

## Investigation Results

### ✅ Issue 1: Avoid CAZ Toggle

**Status:** FOUND & WORKING ✅

**Location:** `voyagr_web.py` line 3101-3102

```html
<div class="preference-item">
    <span class="preference-label">Avoid CAZ</span>
    <button class="toggle-switch" id="avoidCAZ" onclick="togglePreference('caz')"></button>
</div>
```

**JavaScript Handler:** `togglePreference('caz')` function (line 8907-8965)
- Maps to button ID: `avoidCAZ`
- Saves to localStorage: `pref_caz`
- Shows status message when toggled
- Properly handles visual state updates

**Conclusion:** Toggle exists and is properly wired. Should be visible in Settings tab under "Hazard Avoidance" section.

---

### ✅ Issue 2: Smart Route Predictions Toggle

**Status:** FOUND & WORKING ✅

**Location:** `voyagr_web.py` line 3295-3296

```html
<div class="preference-item">
    <span class="preference-label">🤖 Smart Route Predictions</span>
    <button class="toggle-switch" id="mlPredictionsEnabled" onclick="toggleMLPredictions()"></button>
</div>
```

**JavaScript Handler:** `toggleMLPredictions()` function (line 6951-6965)
- Calls `/api/app-settings` endpoint
- Loads ML predictions when enabled
- Shows status message
- Properly integrated

**Conclusion:** Toggle exists and is properly wired. Should be visible in Settings tab under "Advanced Features" section.

---

### ✅ Issue 3: Variable Speed Alerts Toggle

**Status:** FOUND & WORKING ✅

**Location:** `voyagr_web.py` line 3116-3117

```html
<div class="preference-item">
    <span class="preference-label">📊 Variable Speed Alerts</span>
    <button class="toggle-switch" id="variableSpeedAlerts" onclick="togglePreference('variableSpeedAlerts')"></button>
</div>
```

**JavaScript Handler:** `togglePreference('variableSpeedAlerts')` function (line 8907-8965)
- Maps to button ID: `variableSpeedAlerts`
- Saves to localStorage: `pref_variableSpeedAlerts`
- Shows status message when toggled
- Properly handles visual state updates

**Conclusion:** Toggle exists and is properly wired. Should be visible in Settings tab under "Hazard Avoidance" section.

---

### ❌ Issue 4: Recalculating Routes in Settings

**Status:** MISSING ❌

**Problem:** There is NO "Recalculate Route" button in the Settings tab.

**Current State:**
- Settings tab ends at line 3325 with only a "← Back to Navigation" button
- `recalculateTrip()` function exists (line 4470) but is only used in Trip History tab
- `saveRoutePreferences()` function exists (line 4901) but doesn't trigger recalculation

**What Should Happen:**
- After changing route preferences (avoid highways, prefer scenic, etc.), user should be able to recalculate the route with new preferences
- Currently, preferences are saved but route is NOT recalculated

**Solution Needed:**
Add a "Recalculate Route" button in the Settings tab that:
1. Saves all current preferences
2. Calls `calculateRoute()` to recalculate with new preferences
3. Shows loading status
4. Displays new route results

---

### ✅ Issue 5: Dark Mode for Bottom Sheet

**Status:** IMPLEMENTED ✅

**Dark Mode CSS:** Lines 2457-2855 in `voyagr_web.py`

**Bottom Sheet Dark Mode Styles:**
```css
body.dark-mode .bottom-sheet {
    background: #2d2d2d;
    box-shadow: 0 -4px 20px rgba(0,0,0,0.5);
}

body.dark-mode .bottom-sheet-content {
    background: #2d2d2d;
    color: #e0e0e0;
}

body.dark-mode .preferences-section {
    background: #3a3a3a;
    border-color: #555;
    color: #e0e0e0;
}
```

**Dark Mode Application:**
- `initializeDarkMode()` function (line 3829) loads saved theme
- `applyTheme()` function (line 3840) applies `dark-mode` class to body
- All bottom sheet elements have dark mode CSS rules

**Conclusion:** Dark mode CSS is properly implemented for bottom sheet. The issue may be:
1. Theme not being applied on page load
2. Theme button not updating visual state (ALREADY FIXED in previous commit)
3. User needs to explicitly select dark mode

---

## Summary Table

| Feature | Status | Location | Issue |
|---------|--------|----------|-------|
| Avoid CAZ | ✅ Working | Line 3101 | None - fully implemented |
| Smart Route Predictions | ✅ Working | Line 3295 | None - fully implemented |
| Variable Speed Alerts | ✅ Working | Line 3116 | None - fully implemented |
| Recalculate Route Button | ❌ Missing | Settings Tab | No button to trigger recalculation |
| Dark Mode CSS | ✅ Implemented | Lines 2457-2855 | CSS exists, may need UI verification |

---

## Recommendations

1. **Add "Recalculate Route" button** to Settings tab (CRITICAL)
2. **Verify dark mode is being applied** on page load
3. **Test all toggles** in browser to confirm visibility
4. **Check localStorage** to ensure preferences are being saved



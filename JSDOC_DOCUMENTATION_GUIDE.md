# JSDoc Documentation Guide - Voyagr PWA

## Overview

Comprehensive JSDoc documentation for all JavaScript functions in voyagr_web.py HTML_TEMPLATE.

## JSDoc Format

### Basic Function Documentation
```javascript
/**
 * Brief description of what the function does.
 * 
 * @param {type} paramName - Description of parameter
 * @param {type} paramName2 - Description of parameter 2
 * @returns {type} Description of return value
 * @throws {Error} Description of error conditions
 * @example
 * // Usage example
 * const result = functionName(param1, param2);
 */
function functionName(paramName, paramName2) {
    // Implementation
}
```

## Key JavaScript Functions in HTML_TEMPLATE

### Navigation Functions
1. **calculateRoute()** - Calculate route between two points
2. **startNavigation()** - Begin turn-by-turn navigation
3. **updateLocation()** - Update current GPS location
4. **detectUpcomingTurn()** - Detect upcoming turns
5. **announceUpcomingTurn()** - Voice announcement for turns

### Map Functions
1. **initializeMap()** - Initialize Leaflet map
2. **updateMapView()** - Update map display
3. **drawRoute()** - Draw route on map
4. **updateMarker()** - Update location marker
5. **fitMapBounds()** - Fit route to map bounds

### UI Functions
1. **showBottomSheet()** - Show bottom sheet menu
2. **hideBottomSheet()** - Hide bottom sheet menu
3. **toggleTab()** - Switch between tabs
4. **updateUI()** - Update UI elements
5. **showNotification()** - Show user notification

### Settings Functions
1. **saveSettings()** - Save user preferences
2. **loadSettings()** - Load user preferences
3. **applyTheme()** - Apply color theme
4. **toggleDarkMode()** - Toggle dark mode
5. **resetSettings()** - Reset to defaults

### Voice Functions
1. **startVoiceRecognition()** - Start listening for voice
2. **stopVoiceRecognition()** - Stop listening
3. **processVoiceCommand()** - Process voice input
4. **speak()** - Text-to-speech output
5. **handleVoiceAction()** - Handle voice command action

### API Functions
1. **fetchRoute()** - Call /api/route endpoint
2. **fetchCostBreakdown()** - Call /api/cost-breakdown endpoint
3. **fetchHazards()** - Call /api/hazards/nearby endpoint
4. **reportHazard()** - Call /api/hazards/report endpoint
5. **fetchVehicles()** - Call /api/vehicles endpoint

### Utility Functions
1. **calculateDistance()** - Calculate distance between points
2. **calculateBearing()** - Calculate bearing between points
3. **formatDistance()** - Format distance for display
4. **formatTime()** - Format time for display
5. **formatCurrency()** - Format currency for display

## Documentation Standards

### Parameter Types
- `{string}` - Text string
- `{number}` - Numeric value
- `{boolean}` - True/false
- `{Object}` - JavaScript object
- `{Array}` - Array of values
- `{Function}` - Function reference
- `{Promise}` - Promise object
- `{null}` - Null value
- `{undefined}` - Undefined value

### Return Types
- `{void}` - No return value
- `{Promise<type>}` - Promise that resolves to type
- `{type|null}` - Type or null

### Special Tags
- `@deprecated` - Function is deprecated
- `@private` - Function is private
- `@static` - Static method
- `@async` - Async function
- `@throws` - Exceptions thrown
- `@example` - Usage example

## Implementation Status

### Completed ✅
- Python docstrings in all service modules
- Python docstrings in validation functions
- API endpoint documentation

### In Progress 🔄
- JSDoc comments for JavaScript functions
- Comprehensive examples for each function

### Recommended Approach

1. **Phase 1**: Document core navigation functions (5 functions)
2. **Phase 2**: Document map functions (5 functions)
3. **Phase 3**: Document UI functions (5 functions)
4. **Phase 4**: Document settings functions (5 functions)
5. **Phase 5**: Document voice functions (5 functions)
6. **Phase 6**: Document API functions (5 functions)
7. **Phase 7**: Document utility functions (5 functions)

## Tools

### IDE Support
- VS Code: Built-in JSDoc support
- WebStorm: Full JSDoc support
- Sublime Text: JSDoc plugin available

### Validation
```bash
# Check JSDoc syntax
npm install -g jsdoc
jsdoc voyagr_web.py
```

## Benefits

✅ Better IDE autocomplete  
✅ Improved code documentation  
✅ Easier debugging  
✅ Better team collaboration  
✅ Automated documentation generation  

## Conclusion

JSDoc documentation will significantly improve code quality and maintainability. Estimated 2-3 hours to document all functions. Recommended to implement incrementally.


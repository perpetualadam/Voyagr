# Voyagr Routing Modes - Pedestrian and Cycling Support

## Overview

Voyagr now supports three routing modes for different types of navigation:

1. **Auto (Car)** - Vehicle routing with toll support and cost calculation
2. **Pedestrian (Walking)** - Walking routes optimized for pedestrians
3. **Bicycle (Cycling)** - Cycling routes optimized for cyclists

---

## Features by Routing Mode

### Auto (Car) Mode
- ✅ Toll road cost estimation in GBP
- ✅ Fuel/energy cost calculation
- ✅ Vehicle type selection (petrol/diesel or electric)
- ✅ Fuel efficiency units (L/100km, mpg, kWh/100km, miles/kWh)
- ✅ Toll toggle and cost inputs
- ✅ ETA with cost breakdown
- ✅ Valhalla "auto" costing model

### Pedestrian (Walking) Mode
- ✅ Walking distance and time estimation
- ✅ Pedestrian-friendly paths and sidewalks
- ✅ No toll costs (not applicable)
- ✅ No fuel/energy costs (not applicable)
- ✅ Cost inputs hidden
- ✅ Toll toggle hidden
- ✅ ETA format: "Walking: 3.5 km, 45 min"
- ✅ Valhalla "pedestrian" costing model
- ✅ Optimized for walking routes

### Bicycle (Cycling) Mode
- ✅ Cycling distance and time estimation
- ✅ Bike lanes and cycling-friendly routes
- ✅ No toll costs (not applicable)
- ✅ No fuel/energy costs (not applicable)
- ✅ Cost inputs hidden
- ✅ Toll toggle hidden
- ✅ ETA format: "Cycling: 15.0 km, 30 min"
- ✅ Valhalla "bicycle" costing model
- ✅ Optimized for cycling routes

---

## UI Implementation

### Routing Mode Toggle Buttons

Three new toggle buttons in the settings panel:

```
┌─────────────────────────────────────┐
│ Auto (Car)                          │  ← Selected by default
├─────────────────────────────────────┤
│ Pedestrian (Walking)                │
├─────────────────────────────────────┤
│ Bicycle (Cycling)                   │
└─────────────────────────────────────┘
```

### Dynamic UI Updates

**When Auto Mode is Selected:**
- ✅ Show fuel efficiency inputs
- ✅ Show fuel price input
- ✅ Show energy efficiency inputs
- ✅ Show electricity price input
- ✅ Show toll toggle button
- ✅ Show vehicle type selection (petrol/diesel or electric)

**When Pedestrian Mode is Selected:**
- ❌ Hide fuel efficiency inputs
- ❌ Hide fuel price input
- ❌ Hide energy efficiency inputs
- ❌ Hide electricity price input
- ❌ Hide toll toggle button
- ❌ Hide vehicle type selection
- ✅ Show walking distance and time

**When Bicycle Mode is Selected:**
- ❌ Hide fuel efficiency inputs
- ❌ Hide fuel price input
- ❌ Hide energy efficiency inputs
- ❌ Hide electricity price input
- ❌ Hide toll toggle button
- ❌ Hide vehicle type selection
- ✅ Show cycling distance and time

---

## Valhalla Integration

### Costing Models

Each routing mode uses a specific Valhalla costing model:

| Mode | Costing Model | Description |
|------|---------------|-------------|
| Auto | `auto` | Vehicle routing with toll support |
| Pedestrian | `pedestrian` | Walking-optimized routing |
| Bicycle | `bicycle` | Cycling-optimized routing |

### Configuration (valhalla.json)

```json
{
  "costing_options": {
    "auto": { ... },
    "pedestrian": {
      "toll_factor": 0.0,
      "motorway_factor": 0.0,
      "min_road_class": "living_street",
      "disable_toll_intersection": true
    },
    "bicycle": {
      "toll_factor": 0.0,
      "motorway_factor": 0.0,
      "min_road_class": "living_street",
      "disable_toll_intersection": true,
      "use_bike_lanes": true,
      "use_roads": true,
      "use_living_streets": true
    }
  }
}
```

---

## Cost Calculation Logic

### Auto Mode
```
Total Cost = Fuel/Energy Cost + Toll Cost
```

**Example:**
- Distance: 100 km
- Fuel efficiency: 6.5 L/100km
- Fuel price: £1.40/L
- Fuel cost: (100 × 6.5 / 100) × £1.40 = £9.10
- Toll cost: £2.50
- **Total: £11.60**

### Pedestrian Mode
```
Total Cost = £0 (no costs)
```

### Bicycle Mode
```
Total Cost = £0 (no costs)
```

---

## ETA Announcements

### Auto Mode
```
"Driving: 100.00 km, 120 min, £11.60"
```

### Pedestrian Mode
```
"Walking: 3.50 km, 45 min"
```

### Bicycle Mode
```
"Cycling: 15.00 km, 30 min"
```

---

## Database Schema

The `settings` table now includes:

```sql
CREATE TABLE settings (
    distance_unit TEXT,
    temperature_unit TEXT,
    vehicle_type TEXT,
    fuel_unit TEXT,
    fuel_efficiency REAL,
    fuel_price_gbp REAL,
    energy_efficiency REAL,
    electricity_price_gbp REAL,
    include_tolls INTEGER,
    routing_mode TEXT  -- NEW: 'auto', 'pedestrian', 'bicycle'
)
```

---

## API Methods

### Set Routing Mode
```python
def set_routing_mode(self, mode):
    """Set routing mode (auto, pedestrian, bicycle)."""
    if mode in ['auto', 'pedestrian', 'bicycle']:
        self.routing_mode = mode
        self.save_settings()
        self.speak(f"Routing mode: {mode}")
```

### Get Valhalla Costing
```python
def get_valhalla_costing(self):
    """Get Valhalla costing model based on routing mode."""
    costing_map = {
        'auto': 'auto',
        'pedestrian': 'pedestrian',
        'bicycle': 'bicycle'
    }
    return costing_map.get(self.routing_mode, 'auto')
```

### Check if Cost Inputs Should Show
```python
def should_show_cost_inputs(self):
    """Check if cost inputs should be shown (only for auto mode)."""
    return self.routing_mode == 'auto'
```

### Get Route Summary
```python
def get_route_summary(self):
    """Get route summary based on routing mode."""
    if self.routing_mode == 'pedestrian':
        return f"Walking: {distance_str}, {time_str}"
    elif self.routing_mode == 'bicycle':
        return f"Cycling: {distance_str}, {time_str}"
    else:
        return f"Driving: {distance_str}, {time_str}, £{total_cost:.2f}"
```

---

## Testing

### Test Coverage

19 new unit tests added for routing modes:

- ✅ Routing mode selection (auto, pedestrian, bicycle)
- ✅ Valhalla costing model mapping
- ✅ Cost input visibility (shown for auto, hidden for others)
- ✅ Toll toggle visibility (shown for auto, hidden for others)
- ✅ Route summary formatting for each mode
- ✅ Cost calculation disabled for non-auto modes
- ✅ Toll calculation disabled for non-auto modes

### Running Tests

```bash
# Run all tests
python -m pytest test_core_logic.py -v

# Run only routing mode tests
python -m pytest test_core_logic.py::TestRoutingModes -v

# Expected result: 62 tests passing (43 original + 19 new)
```

---

## Usage Examples

### Switching to Pedestrian Mode

1. Tap "Pedestrian (Walking)" button
2. App announces: "Routing mode: pedestrian"
3. Cost inputs are hidden
4. Toll toggle is hidden
5. Route shows: "Walking: 3.5 km, 45 min"

### Switching to Bicycle Mode

1. Tap "Bicycle (Cycling)" button
2. App announces: "Routing mode: bicycle"
3. Cost inputs are hidden
4. Toll toggle is hidden
5. Route shows: "Cycling: 15.0 km, 30 min"

### Switching Back to Auto Mode

1. Tap "Auto (Car)" button
2. App announces: "Routing mode: auto"
3. Cost inputs are shown
4. Toll toggle is shown
5. Route shows: "Driving: 100.00 km, 120 min, £11.60"

---

## Implementation Details

### Files Modified

1. **satnav.py**
   - Added `routing_mode` attribute
   - Added routing mode toggle buttons
   - Added `set_routing_mode()` method
   - Added `get_valhalla_costing()` method
   - Added `should_show_cost_inputs()` method
   - Added `should_show_toll_toggle()` method
   - Added `get_route_summary()` method
   - Updated database schema
   - Updated load_settings() and save_settings()

2. **valhalla.json**
   - Added pedestrian costing options
   - Added bicycle costing options
   - Configured toll_factor = 0.0 for non-auto modes
   - Configured motorway_factor = 0.0 for non-auto modes

3. **test_core_logic.py**
   - Added TestRoutingModes class
   - Added 19 comprehensive unit tests

---

## Future Enhancements

- [ ] Elevation/gradient information for cycling mode
- [ ] Accessibility features for pedestrian mode
- [ ] Weather-based route suggestions
- [ ] Estimated calories burned for pedestrian/bicycle modes
- [ ] Integration with public transport for pedestrian mode
- [ ] Bike rental station information for bicycle mode
- [ ] Accessibility features (wheelchair routes) for pedestrian mode

---

## Backward Compatibility

✅ All existing auto mode functionality is preserved:
- Toll cost estimation works as before
- EV support unchanged
- Fuel efficiency calculations unchanged
- All existing tests pass (43/43)
- Default routing mode is 'auto'

---

## Summary

Voyagr now supports pedestrian and cycling routing modes alongside the existing auto mode. Each mode has:

- ✅ Appropriate Valhalla costing model
- ✅ Mode-specific UI (cost inputs hidden for non-auto modes)
- ✅ Mode-specific ETA announcements
- ✅ Persistent storage in database
- ✅ Comprehensive unit tests (19 new tests)
- ✅ Full backward compatibility

**Total Tests: 62 passing ✅**
- Original tests: 43
- New routing mode tests: 19

---

**Last Updated**: October 2025  
**Version**: 1.1.0  
**Status**: ✅ COMPLETE


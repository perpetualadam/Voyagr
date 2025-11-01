# Routing Modes Implementation Guide

## Quick Start

Voyagr now supports three routing modes. Here's how to use them:

---

## 1. Routing Mode Selection

### UI Toggle Buttons

Three new toggle buttons appear at the top of the settings panel:

```
┌──────────────────────────────────────┐
│ 🚗 Auto (Car)                        │  ← Default
├──────────────────────────────────────┤
│ 🚶 Pedestrian (Walking)              │
├──────────────────────────────────────┤
│ 🚴 Bicycle (Cycling)                 │
└──────────────────────────────────────┘
```

### Programmatic Selection

```python
# Set routing mode
app.set_routing_mode('pedestrian')  # or 'bicycle' or 'auto'

# Get current routing mode
current_mode = app.routing_mode  # Returns: 'auto', 'pedestrian', or 'bicycle'

# Get Valhalla costing model
costing = app.get_valhalla_costing()  # Returns: 'auto', 'pedestrian', or 'bicycle'
```

---

## 2. Mode-Specific Features

### Auto Mode (Default)
```python
# All features enabled
app.set_routing_mode('auto')

# Cost calculation works
cost = app.calculate_cost(100)  # Returns: £9.10 for 100km

# Toll calculation works
toll_cost = app.calculate_toll_cost()  # Returns: £2.50

# UI shows cost inputs
if app.should_show_cost_inputs():
    # Show fuel efficiency, fuel price, energy efficiency, electricity price
    pass

# UI shows toll toggle
if app.should_show_toll_toggle():
    # Show "Include Tolls" toggle button
    pass
```

### Pedestrian Mode
```python
# Switch to pedestrian mode
app.set_routing_mode('pedestrian')

# Cost inputs are hidden
if not app.should_show_cost_inputs():
    # Cost inputs are hidden
    pass

# Toll toggle is hidden
if not app.should_show_toll_toggle():
    # Toll toggle is hidden
    pass

# Route summary shows walking info
summary = app.get_route_summary()
# Returns: "Walking: 3.5 km, 45 min"
```

### Bicycle Mode
```python
# Switch to bicycle mode
app.set_routing_mode('bicycle')

# Cost inputs are hidden
if not app.should_show_cost_inputs():
    # Cost inputs are hidden
    pass

# Toll toggle is hidden
if not app.should_show_toll_toggle():
    # Toll toggle is hidden
    pass

# Route summary shows cycling info
summary = app.get_route_summary()
# Returns: "Cycling: 15.0 km, 30 min"
```

---

## 3. Valhalla Integration

### Routing Request

When making a routing request to Valhalla, use the costing model:

```python
# Get the appropriate costing model
costing = app.get_valhalla_costing()

# Make routing request
routing_request = {
    "locations": [
        {"lat": 53.5526, "lon": -1.4797},  # Start
        {"lat": 53.6, "lon": -1.5}          # End
    ],
    "costing": costing,  # 'auto', 'pedestrian', or 'bicycle'
    "costing_options": {
        costing: {
            # Mode-specific options from valhalla.json
        }
    }
}
```

### Costing Models

| Mode | Costing | Features |
|------|---------|----------|
| Auto | `auto` | Toll support, motorways, highways |
| Pedestrian | `pedestrian` | Sidewalks, living streets, no tolls |
| Bicycle | `bicycle` | Bike lanes, living streets, no tolls |

---

## 4. Database Persistence

### Saving Settings

```python
# Routing mode is automatically saved
app.set_routing_mode('pedestrian')
app.save_settings()  # Saves to database

# Load settings on startup
app.load_settings()  # Restores routing_mode from database
```

### Database Schema

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

## 5. ETA Announcements

### Auto Mode
```python
# ETA includes cost breakdown
summary = app.get_route_summary()
# Output: "Driving: 100.00 km, 120 min, £11.60"

# Announced via TTS
app.speak(summary)
```

### Pedestrian Mode
```python
# ETA shows walking time
summary = app.get_route_summary()
# Output: "Walking: 3.5 km, 45 min"

# Announced via TTS
app.speak(summary)
```

### Bicycle Mode
```python
# ETA shows cycling time
summary = app.get_route_summary()
# Output: "Cycling: 15.0 km, 30 min"

# Announced via TTS
app.speak(summary)
```

---

## 6. Cost Calculation Logic

### Auto Mode
```python
# Calculate fuel/energy cost
fuel_cost = app.calculate_cost(distance_km)

# Calculate toll cost
toll_cost = app.calculate_toll_cost()

# Total cost
total_cost = fuel_cost + toll_cost
```

### Pedestrian & Bicycle Modes
```python
# Cost is always 0 for non-auto modes
if app.routing_mode != 'auto':
    cost = 0  # No fuel, energy, or toll costs
```

---

## 7. Testing

### Run All Tests
```bash
python -m pytest test_core_logic.py -v
# Expected: 62 tests passing (43 original + 19 new)
```

### Run Routing Mode Tests Only
```bash
python -m pytest test_core_logic.py::TestRoutingModes -v
# Expected: 19 tests passing
```

### Test Coverage

- ✅ Routing mode selection
- ✅ Valhalla costing model mapping
- ✅ Cost input visibility
- ✅ Toll toggle visibility
- ✅ Route summary formatting
- ✅ Cost calculation disabled for non-auto modes
- ✅ Toll calculation disabled for non-auto modes

---

## 8. UI Implementation Details

### Toggle Button Binding

```python
# Routing mode toggles
self.toggles['routing_auto'].bind(on_press=lambda x: self.set_routing_mode('auto'))
self.toggles['routing_pedestrian'].bind(on_press=lambda x: self.set_routing_mode('pedestrian'))
self.toggles['routing_bicycle'].bind(on_press=lambda x: self.set_routing_mode('bicycle'))
```

### Dynamic UI Updates

```python
# Show/hide cost inputs based on routing mode
if app.should_show_cost_inputs():
    # Show: fuel_efficiency, fuel_price, energy_efficiency, electricity_price
else:
    # Hide cost inputs

# Show/hide toll toggle based on routing mode
if app.should_show_toll_toggle():
    # Show: include_tolls toggle
else:
    # Hide toll toggle
```

---

## 9. Voice Announcements

### Mode Change Announcement
```python
# When user switches routing mode
app.set_routing_mode('pedestrian')
# Announces: "Routing mode: pedestrian"
```

### ETA Announcement
```python
# Periodic ETA announcements
summary = app.get_route_summary()
app.speak(summary)

# Auto: "Driving: 100.00 km, 120 min, £11.60"
# Pedestrian: "Walking: 3.5 km, 45 min"
# Bicycle: "Cycling: 15.0 km, 30 min"
```

---

## 10. Configuration

### valhalla.json

Pedestrian costing options:
```json
"pedestrian": {
  "toll_factor": 0.0,
  "motorway_factor": 0.0,
  "min_road_class": "living_street",
  "disable_toll_intersection": true
}
```

Bicycle costing options:
```json
"bicycle": {
  "toll_factor": 0.0,
  "motorway_factor": 0.0,
  "min_road_class": "living_street",
  "disable_toll_intersection": true,
  "use_bike_lanes": true,
  "use_roads": true,
  "use_living_streets": true
}
```

---

## 11. Backward Compatibility

✅ All existing functionality preserved:
- Auto mode works exactly as before
- Toll cost estimation unchanged
- EV support unchanged
- Fuel efficiency calculations unchanged
- All 43 original tests still pass
- Default routing mode is 'auto'

---

## 12. Files Modified

1. **satnav.py** - Added routing mode support
2. **valhalla.json** - Added pedestrian and bicycle costing
3. **test_core_logic.py** - Added 19 routing mode tests

---

## 13. Summary

Voyagr now supports:

| Feature | Auto | Pedestrian | Bicycle |
|---------|------|-----------|---------|
| Routing | ✅ | ✅ | ✅ |
| Cost Calculation | ✅ | ❌ | ❌ |
| Toll Support | ✅ | ❌ | ❌ |
| ETA | ✅ | ✅ | ✅ |
| Voice Announcements | ✅ | ✅ | ✅ |
| UI Toggles | ✅ | ✅ | ✅ |
| Database Persistence | ✅ | ✅ | ✅ |

**Tests: 62 passing ✅**

---

**Last Updated**: October 2025  
**Version**: 1.1.0  
**Status**: ✅ COMPLETE


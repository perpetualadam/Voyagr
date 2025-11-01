# Clean Air Zone (CAZ) Avoidance Feature

## Overview

Voyagr now includes comprehensive Clean Air Zone (CAZ) avoidance functionality for both UK and European Union clean air zones. This feature helps drivers avoid or prepare for CAZ charges and provides real-time alerts when approaching restricted areas.

## Features

### 1. CAZ Database Management

The application includes a comprehensive database of major UK and EU clean air zones:

**UK Clean Air Zones (GBP charges)**:
- London ULEZ (Ultra Low Emission Zone) - £12.50 daily charge (24/7)
- London Congestion Charge Zone - £15.00 daily charge (Mon-Fri 07:00-18:00)
- Birmingham CAZ - £8.00 daily charge (Mon-Fri 07:00-20:00)
- Bath CAZ - £9.00 daily charge (Mon-Fri 07:00-20:00)
- Bristol CAZ - £9.00 daily charge (Mon-Fri 07:00-20:00)
- Portsmouth CAZ - £10.00 daily charge (Mon-Fri 06:00-19:00)

**EU Clean Air Zones (EUR charges)**:
- Paris Low Emission Zone (France) - €68 fine
- Berlin Environmental Zone (Germany) - €100 fine
- Milan Area C (Italy) - €5.00 charge
- Madrid Central (Spain) - €90 fine
- Amsterdam Environmental Zone (Netherlands) - €95 fine

### 2. CAZ Avoidance Toggle

Users can enable CAZ avoidance via the UI toggle button:
- **Toggle**: "Avoid CAZ" in settings panel
- **Default**: Disabled (False)
- **Effect**: When enabled, routes will avoid CAZ areas (via Valhalla exclude_polygons)
- **Feedback**: Voice announcement and notification when toggled

### 3. CAZ Proximity Alerts

The application monitors proximity to CAZ boundaries:
- **Alert Distance**: 1000 meters (1 km) before entering zone
- **Check Interval**: Every 5 seconds
- **Alert Format**: "CAZ Alert: {zone_name} {distance} ahead, {charge}"
- **Voice Announcement**: Includes currency name (pounds, euros, etc.)
- **Exemption Note**: Shows "(exempt vehicle - no charge)" if vehicle is exempt

### 4. CAZ Cost Calculation

CAZ charges are automatically calculated and included in route summaries:
- **Calculation**: Checks if route passes through CAZ boundaries
- **Exemption**: Returns £0 if vehicle is CAZ exempt
- **Currency Conversion**: Converts EUR to GBP when needed (approximate 0.85 conversion)
- **Route Summary**: Includes CAZ costs in total journey cost breakdown

### 5. Vehicle Exemptions

Users can mark their vehicle as CAZ exempt:
- **Toggle**: "CAZ Exempt Vehicle" in settings panel
- **Default**: Not exempt (False)
- **Effect**: CAZ charges not included in cost calculations
- **Alerts**: Still shows CAZ proximity alerts with exemption note

### 6. Database Schema

```sql
CREATE TABLE clean_air_zones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    zone_name TEXT NOT NULL,
    city TEXT NOT NULL,
    country TEXT NOT NULL,
    lat REAL NOT NULL,
    lon REAL NOT NULL,
    zone_type TEXT,
    charge_amount REAL,
    currency_code TEXT DEFAULT 'GBP',
    active INTEGER DEFAULT 1,
    operating_hours TEXT,
    boundary_coords TEXT
)
```

## Usage Examples

### Enable CAZ Avoidance

```python
app.set_caz_avoidance(True)
# Voice: "Clean Air Zone avoidance: enabled"
# Notification: "CAZ avoidance enabled"
```

### Mark Vehicle as Exempt

```python
app.set_caz_exemption(True)
# Voice: "Vehicle CAZ status: exempt"
# Notification: "Vehicle is exempt"
```

### Route Summary with CAZ

```
Driving: 100.00 km, 120 min, £23.60 (£9.10 + £2.50 tolls + £12.50 CAZ)
```

### CAZ Proximity Alert

```
Notification: "CAZ Alert: London ULEZ 800 meters ahead, £12.50"
Voice: "Clean Air Zone: London ULEZ 800 meters ahead, 12 pounds 50 charge"
```

## API Methods

### `calculate_caz_cost()`
Returns total CAZ charges for current route (0 if exempt or no CAZs on route).

### `set_caz_avoidance(enabled)`
Enable/disable CAZ avoidance. Updates settings and provides feedback.

### `set_caz_exemption(exempt)`
Mark vehicle as CAZ exempt/non-exempt. Updates settings and provides feedback.

### `check_caz_proximity(dt)`
Periodic check for CAZ proximity. Called every 5 seconds.

### `_load_caz_data()`
Loads CAZ data from database into memory cache.

## Settings Persistence

CAZ preferences are stored in the SQLite database:
- `avoid_caz` - Boolean (0/1) for CAZ avoidance preference
- `vehicle_caz_exempt` - Boolean (0/1) for vehicle exemption status

Settings are automatically saved when toggled and restored on app restart.

## Currency Support

- **GBP (£)**: UK CAZs use British pounds
- **EUR (€)**: EU CAZs use euros
- **Automatic Conversion**: EUR charges converted to GBP when needed (0.85 factor)
- **Display**: Uses selected currency unit for formatting

## Testing

Comprehensive test suite included:
- `test_caz_database_initialization` - Verify CAZ table and sample data
- `test_caz_proximity_detection` - Verify 1000m alert distance
- `test_caz_cost_calculation` - Verify cost calculations
- `test_caz_cost_with_exemption` - Verify exempt vehicles have £0 cost
- `test_caz_avoidance_toggle` - Verify toggle functionality
- `test_route_summary_with_caz` - Verify CAZ costs in summary
- `test_route_summary_without_caz` - Verify no CAZ when not applicable
- `test_caz_currency_formatting_gbp` - Verify £ formatting
- `test_caz_currency_formatting_eur` - Verify € formatting

**Test Results**: 89 tests passing (80 original + 9 new CAZ tests)

## Backward Compatibility

✅ 100% backward compatible:
- Default: CAZ avoidance disabled (avoid_caz=False)
- Default: Vehicle not exempt (vehicle_caz_exempt=False)
- Existing routes unaffected when CAZ avoidance disabled
- All existing tests still pass

## Performance Considerations

- CAZ data cached in memory after loading from database
- Proximity checks limited to CAZs within reasonable distance
- Efficient bounding box checks before detailed calculations
- Minimal impact on route calculation performance

## Future Enhancements

- Real-time CAZ boundary updates from OpenStreetMap
- Support for additional EU countries
- Vehicle type-specific exemptions (electric, disabled, historic)
- CAZ charge history and statistics
- Integration with payment systems for automatic CAZ payment


# Toll & CAZ Cost Calculation Fix - Complete Summary

## Problem Identified
The toll and CAZ costs were always calculating as £0.00 because route coordinates were not being passed to the cost calculation functions. The functions `calculate_toll_cost()` and `calculate_caz_cost()` require route coordinates to detect if a route passes through known toll roads or CAZ zones.

### Root Cause
In `voyagr_web.py`, the `CostCalculator.calculate_costs()` method was calling:
```python
toll_cost = calculate_toll_cost(distance_km, 'motorway', route_coords=None)
caz_cost = calculate_caz_cost(distance_km, vehicle_type, caz_exempt, route_coords=None)
```

The `route_coords=None` parameter meant these functions always returned 0.0 (conservative approach).

## Solution Implemented

### 1. Added Route Geometry Decoder
Created `decode_route_geometry()` function to convert encoded polyline strings to coordinate lists:
```python
def decode_route_geometry(geometry: str) -> List[Tuple[float, float]]:
    """Decode route geometry (polyline) to list of coordinates."""
```

### 2. Updated Cost Calculator Signature
Modified `CostCalculator.calculate_costs()` to accept optional route coordinates:
```python
def calculate_costs(self, ..., route_coords: Optional[List[Tuple[float, float]]] = None)
```

### 3. Updated All Route Calculation Endpoints
Modified three routing engine implementations to pass coordinates:

#### GraphHopper (lines 3935-3948)
```python
route_coords = decode_route_geometry(route_geometry)
costs = cost_calculator.calculate_costs(..., route_coords=route_coords)
```

#### Valhalla (lines 4079-4092)
```python
route_coords = decode_route_geometry(route_geometry)
costs = cost_calculator.calculate_costs(..., route_coords=route_coords)
```

#### OSRM (lines 4239-4259)
```python
route_coords = decode_route_geometry(route_geometry)
toll_cost = calculate_toll_cost(..., route_coords=route_coords)
caz_cost = calculate_caz_cost(..., route_coords=route_coords)
```

## Test Results

### Test: M6 Toll Detection
- **Route**: Birmingham area (M6 Toll coordinates)
- **Distance**: 10 km
- **Fuel Cost**: £0.91
- **Toll Cost (with coords)**: £3.50 ✓
- **Toll Cost (without coords)**: £0.00 ✓

### Test: London CAZ Detection
- **Route**: Central London (CAZ coordinates)
- **Distance**: 10 km
- **Fuel Cost**: £0.91
- **CAZ Cost (with coords)**: £15.00 ✓
- **CAZ Cost (without coords)**: £0.00 ✓

## Backward Compatibility
- When no route coordinates are provided, costs remain 0 (conservative)
- Existing code that doesn't pass coordinates continues to work
- No breaking changes to API or function signatures

## Files Modified
- `voyagr_web.py`: Added decoder, updated cost calculator, updated all route endpoints
- `test_toll_caz_fix.py`: New test file verifying the fix

## Commit
- **Hash**: 3567e7a
- **Message**: "Fix: Pass route coordinates to toll/CAZ cost calculations"
- **Status**: ✓ Pushed to GitHub main branch

## Next Steps
1. Test on Railway.app production URL with mobile device
2. Verify toll costs appear for routes through M6 Toll, Dartford Crossing, etc.
3. Verify CAZ costs appear for routes through London, Birmingham, Leeds, etc.
4. Monitor for any edge cases or issues


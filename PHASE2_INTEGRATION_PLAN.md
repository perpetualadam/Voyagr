# Phase 2 Integration Plan - Detailed Steps

## Overview
This document provides step-by-step instructions for integrating the refactored service modules into voyagr_web.py.

## Current Status
- ✓ All service modules created and tested (11/11 tests passing)
- ✓ All blueprint modules created
- ✓ Imports already added to voyagr_web.py (lines 61-82)
- → Ready for integration

## Integration Steps

### Step 1: Replace calculate_route() Function (30 minutes)

**Location**: voyagr_web.py, lines 10831-11324

**Current Implementation**: 500+ lines with duplicate routing engine calls

**New Implementation**: Use calculate_route_refactored.py as reference

**Changes**:
1. Replace entire calculate_route() function with refactored version
2. Remove duplicate GraphHopper/Valhalla/OSRM API calls
3. Use routing_manager.calculate_route() instead
4. Use cost_service.calculate_all_costs() instead of duplicate cost code
5. Use hazard_service.fetch_hazards_for_route() instead of duplicate hazard code

**Key Points**:
- Maintain all existing error handling
- Keep route caching logic
- Keep database caching logic
- Preserve response format for backward compatibility
- Keep all logging statements

**Testing After**:
```bash
curl -X POST http://localhost:5000/api/route \
  -H "Content-Type: application/json" \
  -d '{
    "start": "51.5074,-0.1278",
    "end": "53.5526,-1.4797",
    "routing_mode": "auto",
    "vehicle_type": "petrol_diesel"
  }'
```

### Step 2: Replace calculate_multi_stop_route() Function (20 minutes)

**Location**: voyagr_web.py, lines 11326+

**Current Implementation**: Duplicate routing and cost code

**New Implementation**: Use route_calculator.calculate_multi_stop_route()

**Changes**:
1. Replace function with route_calculator call
2. Remove duplicate routing engine calls
3. Remove duplicate cost calculations
4. Maintain response format

**Testing After**:
```bash
curl -X POST http://localhost:5000/api/multi-stop-route \
  -H "Content-Type: application/json" \
  -d '{
    "waypoints": [
      "51.5074,-0.1278",
      "52.2053,-0.1218",
      "53.5526,-1.4797"
    ],
    "routing_mode": "auto"
  }'
```

### Step 3: Update Cost Calculation Endpoints (15 minutes)

**Endpoints to Update**:
- /api/calculate-cost
- /api/cost-breakdown
- /api/fuel-cost
- /api/toll-cost
- /api/caz-cost

**Changes**:
1. Replace duplicate cost code with cost_service calls
2. Maintain response format
3. Keep error handling

**Example**:
```python
# Before
fuel_cost = (distance_km / 100) * fuel_efficiency * fuel_price

# After
costs = cost_service.calculate_all_costs(
    distance_km, vehicle_type, fuel_efficiency, fuel_price,
    energy_efficiency, electricity_price, include_tolls, include_caz, caz_exempt
)
fuel_cost = costs['fuel_cost']
```

### Step 4: Update Hazard Endpoints (15 minutes)

**Endpoints to Update**:
- /api/hazards/nearby
- /api/hazards/report
- /api/hazards/score-route

**Changes**:
1. Replace duplicate hazard code with hazard_service calls
2. Maintain response format
3. Keep error handling

**Example**:
```python
# Before
hazards = fetch_hazards_for_route(lat1, lon1, lat2, lon2)

# After
hazards = hazard_service.fetch_hazards_for_route(lat1, lon1, lat2, lon2)
```

### Step 5: Register Blueprint Modules (10 minutes)

**Location**: voyagr_web.py, after app initialization (around line 100)

**Add**:
```python
# Register blueprint modules
try:
    from routes_blueprint import routes_bp
    app.register_blueprint(routes_bp)
    print("[BLUEPRINTS] Registered routes blueprint")
except ImportError as e:
    print(f"[BLUEPRINTS] Failed to register routes blueprint: {e}")

try:
    from vehicles_blueprint import vehicles_bp
    app.register_blueprint(vehicles_bp)
    print("[BLUEPRINTS] Registered vehicles blueprint")
except ImportError as e:
    print(f"[BLUEPRINTS] Failed to register vehicles blueprint: {e}")

try:
    from hazards_blueprint import hazards_bp
    app.register_blueprint(hazards_bp)
    print("[BLUEPRINTS] Registered hazards blueprint")
except ImportError as e:
    print(f"[BLUEPRINTS] Failed to register hazards blueprint: {e}")
```

## Testing Phase

### Unit Tests (10 minutes)
```bash
python -m pytest test_refactored_services.py -v
```
Expected: 11/11 passing

### Integration Tests (30 minutes)
```bash
python -m pytest test_phase5_integration.py -v
```
Expected: All existing tests passing

### Manual Testing (30 minutes)
1. Test route calculation
2. Test cost calculations
3. Test hazard detection
4. Test multi-stop routes
5. Test vehicle management
6. Test hazard management

### Regression Testing (30 minutes)
1. Test all API endpoints
2. Verify response formats unchanged
3. Check error handling
4. Verify caching works
5. Check database operations

## Cleanup Phase

### Remove Duplicate Code (30 minutes)
1. Remove old routing engine API calls
2. Remove old cost calculation code
3. Remove old hazard detection code
4. Remove old database code

### Update Documentation (20 minutes)
1. Update API documentation
2. Update architecture documentation
3. Add migration notes

### Code Review (30 minutes)
1. Self-review all changes
2. Check code style consistency
3. Verify error handling
4. Check for security issues

## Rollback Plan

If issues occur:
1. Revert to previous commit
2. Restore from backup
3. Investigate root cause
4. Fix and re-test
5. Re-deploy

## Success Criteria

✓ All tests passing (100%)
✓ No breaking changes
✓ Performance maintained or improved
✓ Code quality improved
✓ Documentation updated
✓ Backward compatibility maintained

## Timeline

- Pre-Integration Review: 15 minutes
- Integration Steps: 1.5 hours
- Testing Phase: 2 hours
- Cleanup Phase: 1.5 hours
- Final Verification: 30 minutes
- **Total: ~5.5 hours**

## Files to Modify

1. voyagr_web.py
   - Replace calculate_route() (lines 10831-11324)
   - Replace calculate_multi_stop_route() (lines 11326+)
   - Update cost endpoints
   - Update hazard endpoints
   - Register blueprints (after line 100)

## Files to Reference

1. calculate_route_refactored.py - New implementation
2. routing_engines.py - Routing manager
3. cost_service.py - Cost calculations
4. hazard_service.py - Hazard detection
5. route_calculator.py - Route calculation
6. test_refactored_services.py - Unit tests

## Next Steps

1. Review this plan
2. Start with Step 1 (calculate_route)
3. Test after each step
4. Proceed to next step only if tests pass
5. Complete all steps
6. Run full test suite
7. Commit changes


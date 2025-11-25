# Custom Router Hazard Avoidance - Before & After Comparison

## 📊 Visual Comparison

### ❌ BEFORE (Lines 4648-4681)

```python
# Calculate costs for all routes
for route_item in routes:
    distance_km = route_item.get('distance_km', 0)
    fuel_cost = (distance_km / fuel_efficiency) * fuel_price if fuel_efficiency > 0 else 0
    toll_cost = distance_km * 0.15 if include_tolls else 0
    caz_cost = 8.0 if include_caz and vehicle_type == 'petrol_diesel' else 0

    route_item['fuel_cost'] = round(fuel_cost, 2)
    route_item['toll_cost'] = round(toll_cost, 2)
    route_item['caz_cost'] = round(caz_cost, 2)
    route_item['total_cost'] = round(fuel_cost + toll_cost + caz_cost, 2)

response_data = {
    'success': True,
    'routes': routes,  # ❌ NO HAZARD DATA
    'source': 'Custom Router ⚡',
    'distance': f'{route.get("distance_km", 0):.2f} km',
    'time': f'{route.get("duration_minutes", 0):.0f} minutes',
    'geometry': route.get('geometry', ''),
    'fuel_cost': route.get('fuel_cost', 0),
    'toll_cost': route.get('toll_cost', 0),
    'caz_cost': route.get('caz_cost', 0),
    'response_time_ms': custom_elapsed,
    'cached': False,
    'start_lat': start_lat,
    'start_lon': start_lon,
    'end_lat': end_lat,
    'end_lon': end_lon
}

# Cache the route
route_cache.set(start_lat, start_lon, end_lat, end_lon, routing_mode, vehicle_type, response_data, enable_hazard_avoidance)
update_custom_router_stats(custom_elapsed, True)
return jsonify(response_data)
```

**Problems:**
- ❌ No hazard penalty scoring
- ❌ No hazard count tracking
- ❌ No hazards list
- ❌ Routes not reordered by hazard penalty
- ❌ PWA cannot display hazard information for custom router routes

---

### ✅ AFTER (Lines 4648-4709)

```python
# Calculate costs for all routes
for route_item in routes:
    distance_km = route_item.get('distance_km', 0)
    fuel_cost = (distance_km / fuel_efficiency) * fuel_price if fuel_efficiency > 0 else 0
    toll_cost = distance_km * 0.15 if include_tolls else 0
    caz_cost = 8.0 if include_caz and vehicle_type == 'petrol_diesel' else 0

    route_item['fuel_cost'] = round(fuel_cost, 2)
    route_item['toll_cost'] = round(toll_cost, 2)
    route_item['caz_cost'] = round(caz_cost, 2)
    route_item['total_cost'] = round(fuel_cost + toll_cost + caz_cost, 2)

# ================================================================
# ✅ NEW: HAZARD AVOIDANCE - Score routes by hazard penalty
# ================================================================
for route_item in routes:
    hazard_penalty = 0
    hazard_count = 0
    hazards_list = []
    if enable_hazard_avoidance and hazards:
        route_geometry = decode_route_geometry(route_item.get('polyline', ''))
        hazard_penalty, hazard_count = score_route_by_hazards(route_geometry, hazards)
        hazards_list = get_hazards_on_route(route_geometry, hazards)
        logger.debug(f"[HAZARDS] Custom router route: penalty={hazard_penalty:.0f}s, count={hazard_count}, hazards_list={len(hazards_list)}")

    route_item['hazard_penalty_seconds'] = hazard_penalty
    route_item['hazard_count'] = hazard_count
    route_item['hazards'] = hazards_list

# ================================================================
# ✅ NEW: HAZARD AVOIDANCE - Reorder routes by hazard penalty
# ================================================================
if enable_hazard_avoidance and hazards:
    # Sort routes by hazard penalty (ascending - fewer hazards first)
    routes_sorted = sorted(routes, key=lambda r: (r.get('hazard_penalty_seconds', 0), r.get('duration_minutes', 0)))
    logger.info(f"[HAZARDS] Custom router routes reordered by hazard penalty:")
    for idx, route in enumerate(routes_sorted):
        logger.info(f"  Route {idx+1}: Hazard penalty: {route.get('hazard_penalty_seconds', 0):.0f}s, Count: {route.get('hazard_count', 0)}")
    routes = routes_sorted

response_data = {
    'success': True,
    'routes': routes,  # ✅ NOW INCLUDES HAZARD DATA
    'source': 'Custom Router ⚡',
    'distance': f'{route.get("distance_km", 0):.2f} km',
    'time': f'{route.get("duration_minutes", 0):.0f} minutes',
    'geometry': route.get('geometry', ''),
    'fuel_cost': route.get('fuel_cost', 0),
    'toll_cost': route.get('toll_cost', 0),
    'caz_cost': route.get('caz_cost', 0),
    'response_time_ms': custom_elapsed,
    'cached': False,
    'start_lat': start_lat,
    'start_lon': start_lon,
    'end_lat': end_lat,
    'end_lon': end_lon
}

# Cache the route
route_cache.set(start_lat, start_lon, end_lat, end_lon, routing_mode, vehicle_type, response_data, enable_hazard_avoidance)
update_custom_router_stats(custom_elapsed, True)
return jsonify(response_data)
```

**Improvements:**
- ✅ Full hazard penalty scoring
- ✅ Hazard count tracking
- ✅ Complete hazards list with lat/lon/type/description
- ✅ Routes automatically reordered by hazard penalty (when enabled)
- ✅ PWA can display hazard information for custom router routes
- ✅ Feature parity with GraphHopper, Valhalla, and OSRM

---

## 📈 Impact Summary

| Metric | Before | After |
|--------|--------|-------|
| Lines of code | 33 lines | 61 lines (+28) |
| Hazard scoring | ❌ No | ✅ Yes |
| Route reordering | ❌ No | ✅ Yes |
| PWA compatibility | ❌ Partial | ✅ Full |
| Feature parity | ❌ 0% | ✅ 100% |

---

## 🎯 Example Response

### Before (No Hazard Data)
```json
{
  "success": true,
  "routes": [
    {
      "distance_km": 73.1,
      "duration_minutes": 52,
      "fuel_cost": 7.89,
      "toll_cost": 10.97,
      "caz_cost": 0,
      "total_cost": 18.86
    }
  ],
  "source": "Custom Router ⚡"
}
```

### After (With Hazard Data)
```json
{
  "success": true,
  "routes": [
    {
      "distance_km": 73.1,
      "duration_minutes": 52,
      "fuel_cost": 7.89,
      "toll_cost": 10.97,
      "caz_cost": 0,
      "total_cost": 18.86,
      "hazard_penalty_seconds": 120,
      "hazard_count": 4,
      "hazards": [
        {
          "lat": 51.5074,
          "lon": -0.1278,
          "type": "speed_camera",
          "description": "Fixed speed camera",
          "distance": 45
        },
        {
          "lat": 51.5174,
          "lon": -0.1378,
          "type": "traffic_light_camera",
          "description": "Red light camera",
          "distance": 12
        }
      ]
    }
  ],
  "source": "Custom Router ⚡"
}
```


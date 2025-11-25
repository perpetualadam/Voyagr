# Testing Custom Router Hazard Avoidance

## 🧪 How to Test the Integration

### Prerequisites
1. Custom router initialized and running
2. Hazard data in database (cameras, roadworks, etc.)
3. PWA or API client ready to make requests

---

## 📋 Test Cases

### Test 1: Basic Route Calculation (No Hazard Avoidance)

**Request:**
```bash
curl -X POST http://localhost:5000/api/route \
  -H "Content-Type: application/json" \
  -d '{
    "start": "51.5074,-0.1278",
    "end": "51.7520,-1.2577",
    "routing_mode": "auto",
    "vehicle_type": "petrol_diesel",
    "enable_hazard_avoidance": false
  }'
```

**Expected Response:**
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
      "hazard_penalty_seconds": 0,
      "hazard_count": 0,
      "hazards": []
    }
  ],
  "source": "Custom Router ⚡"
}
```

**Verification:**
- ✅ `hazard_penalty_seconds` = 0
- ✅ `hazard_count` = 0
- ✅ `hazards` = empty array

---

### Test 2: Route Calculation WITH Hazard Avoidance

**Request:**
```bash
curl -X POST http://localhost:5000/api/route \
  -H "Content-Type: application/json" \
  -d '{
    "start": "51.5074,-0.1278",
    "end": "51.7520,-1.2577",
    "routing_mode": "auto",
    "vehicle_type": "petrol_diesel",
    "enable_hazard_avoidance": true
  }'
```

**Expected Response:**
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

**Verification:**
- ✅ `hazard_penalty_seconds` > 0
- ✅ `hazard_count` > 0
- ✅ `hazards` array contains hazard objects with lat/lon/type/description

---

### Test 3: Multiple Routes with Hazard Reordering

**Request:**
```bash
curl -X POST http://localhost:5000/api/route \
  -H "Content-Type: application/json" \
  -d '{
    "start": "51.5074,-0.1278",
    "end": "51.7520,-1.2577",
    "routing_mode": "auto",
    "vehicle_type": "petrol_diesel",
    "enable_hazard_avoidance": true
  }'
```

**Expected Behavior:**
- Routes should be returned in order of **lowest hazard penalty first**
- Route 1 should have fewer hazards than Route 2, Route 3, etc.
- Check server logs for reordering confirmation:
  ```
  [HAZARDS] Custom router routes reordered by hazard penalty:
    Route 1: Hazard penalty: 60s, Count: 2
    Route 2: Hazard penalty: 120s, Count: 4
    Route 3: Hazard penalty: 180s, Count: 6
  ```

**Verification:**
- ✅ Routes are sorted by `hazard_penalty_seconds` (ascending)
- ✅ Route with lowest penalty is first
- ✅ Server logs show reordering message

---

## 🔍 Server Log Verification

When hazard avoidance is enabled, you should see these log messages:

```
[HAZARDS] Fetched hazards in 45ms: [('speed_camera', 12), ('traffic_light_camera', 3)]
[ROUTING] ✅ Custom router succeeded in 2890ms
[HAZARDS] Custom router route: penalty=120s, count=4, hazards_list=4
[HAZARDS] Custom router route: penalty=180s, count=6, hazards_list=6
[HAZARDS] Custom router route: penalty=60s, count=2, hazards_list=2
[HAZARDS] Custom router routes reordered by hazard penalty:
  Route 1: Hazard penalty: 60s, Count: 2
  Route 2: Hazard penalty: 120s, Count: 4
  Route 3: Hazard penalty: 180s, Count: 6
```

---

## 🎯 PWA Testing

### Test in Browser Console

```javascript
// Test route calculation with hazard avoidance
fetch('/api/route', {
  method: 'POST',
  headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({
    start: '51.5074,-0.1278',
    end: '51.7520,-1.2577',
    routing_mode: 'auto',
    vehicle_type: 'petrol_diesel',
    enable_hazard_avoidance: true
  })
})
.then(r => r.json())
.then(data => {
  console.log('Routes:', data.routes.length);
  data.routes.forEach((route, idx) => {
    console.log(`Route ${idx+1}:`, {
      distance: route.distance_km,
      duration: route.duration_minutes,
      hazard_penalty: route.hazard_penalty_seconds,
      hazard_count: route.hazard_count,
      hazards: route.hazards.length
    });
  });
});
```

**Expected Console Output:**
```
Routes: 4
Route 1: {distance: 73.1, duration: 52, hazard_penalty: 60, hazard_count: 2, hazards: 2}
Route 2: {distance: 75.3, duration: 54, hazard_penalty: 120, hazard_count: 4, hazards: 4}
Route 3: {distance: 78.2, duration: 56, hazard_penalty: 180, hazard_count: 6, hazards: 6}
Route 4: {distance: 80.1, duration: 58, hazard_penalty: 240, hazard_count: 8, hazards: 8}
```

---

## ✅ Success Criteria

The integration is working correctly if:

1. ✅ Routes include `hazard_penalty_seconds`, `hazard_count`, and `hazards` fields
2. ✅ When `enable_hazard_avoidance=false`, all hazard values are 0/empty
3. ✅ When `enable_hazard_avoidance=true`, hazard values are calculated
4. ✅ Routes are reordered by hazard penalty (lowest first)
5. ✅ Server logs show hazard scoring and reordering messages
6. ✅ PWA displays hazard information for custom router routes
7. ✅ No errors in server logs or browser console

---

## 🐛 Troubleshooting

### Issue: Hazard fields are missing
**Solution:** Check that `enable_hazard_avoidance=true` in request

### Issue: Hazard values are always 0
**Solution:** Verify hazard data exists in database:
```sql
SELECT COUNT(*) FROM cameras;
SELECT COUNT(*) FROM community_hazards;
```

### Issue: Routes not reordered
**Solution:** Check server logs for reordering message. Verify multiple routes are returned.

### Issue: Custom router not being used
**Solution:** Check `USE_CUSTOM_ROUTER=true` in .env file and custom router initialized successfully


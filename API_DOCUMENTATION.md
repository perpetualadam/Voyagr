# 🔌 Voyagr PWA - API Documentation

## Base URL
```
http://localhost:5000
http://192.168.0.111:5000  (from Pixel 6)
```

---

## 🗺️ Routing Endpoints

### Calculate Single Route
```
POST /api/route
Content-Type: application/json

{
  "start": "51.5074,-0.1278",
  "end": "51.5174,-0.1278",
  "routing_mode": "auto",
  "vehicle_type": "petrol_diesel",
  "fuel_efficiency": 6.5,
  "fuel_price": 1.40,
  "energy_efficiency": 18.5,
  "electricity_price": 0.30,
  "include_tolls": true,
  "include_caz": true,
  "caz_exempt": false
}

Response:
{
  "success": true,
  "distance": "1.34 km",
  "time": "4 minutes",
  "fuel_cost": 0.50,
  "toll_cost": 0.20,
  "caz_cost": 0.00,
  "total_cost": 0.70,
  "geometry": [[51.5074, -0.1278], ...],
  "source": "Valhalla"
}
```

### Calculate Multi-Stop Route
```
POST /api/multi-stop-route
Content-Type: application/json

{
  "waypoints": [
    "51.5074,-0.1278",
    "51.5174,-0.1278",
    "51.5274,-0.1378"
  ],
  "routing_mode": "auto"
}

Response:
{
  "success": true,
  "distance": "5.42 km",
  "time": "15 minutes",
  "waypoints": 3,
  "source": "Valhalla"
}
```

---

## 🚗 Vehicle Management

### Get All Vehicles
```
GET /api/vehicles

Response:
{
  "success": true,
  "vehicles": [
    {
      "id": 1,
      "name": "My Tesla",
      "vehicle_type": "electric",
      "fuel_efficiency": 0,
      "fuel_price": 0,
      "energy_efficiency": 18.5,
      "electricity_price": 0.30,
      "caz_exempt": false
    }
  ]
}
```

### Create Vehicle
```
POST /api/vehicles
Content-Type: application/json

{
  "name": "My Car",
  "vehicle_type": "petrol_diesel",
  "fuel_efficiency": 6.5,
  "fuel_price": 1.40,
  "energy_efficiency": 0,
  "electricity_price": 0,
  "caz_exempt": false
}

Response:
{
  "success": true,
  "vehicle_id": 1
}
```

---

## 📍 Trip History

### Get Trip History
```
GET /api/trip-history

Response:
{
  "success": true,
  "trips": [
    {
      "id": 1,
      "start_lat": 51.5074,
      "start_lon": -0.1278,
      "start_address": "London",
      "end_lat": 51.5174,
      "end_lon": -0.1278,
      "end_address": "London",
      "distance_km": 1.34,
      "duration_minutes": 4,
      "fuel_cost": 0.50,
      "toll_cost": 0.20,
      "caz_cost": 0.00,
      "routing_mode": "auto",
      "timestamp": "2025-11-02 10:30:00"
    }
  ]
}
```

### Save Trip
```
POST /api/trip-history
Content-Type: application/json

{
  "start_lat": 51.5074,
  "start_lon": -0.1278,
  "start_address": "London",
  "end_lat": 51.5174,
  "end_lon": -0.1278,
  "end_address": "London",
  "distance_km": 1.34,
  "duration_minutes": 4,
  "fuel_cost": 0.50,
  "toll_cost": 0.20,
  "caz_cost": 0.00,
  "routing_mode": "auto"
}

Response:
{
  "success": true,
  "trip_id": 1
}
```

---

## ⚡ Charging Stations

### Find Nearby Stations
```
GET /api/charging-stations?lat=51.5074&lon=-0.1278&radius=5

Response:
{
  "success": true,
  "stations": [
    {
      "id": 1,
      "name": "Tesla Supercharger",
      "lat": 51.5174,
      "lon": -0.1178,
      "connector": "Tesla",
      "power_kw": 150,
      "cost_per_kwh": 0.35,
      "availability": "available"
    }
  ]
}
```

---

## 🌤️ Weather

### Get Weather
```
GET /api/weather?lat=51.5074&lon=-0.1278

Response:
{
  "success": true,
  "temperature": 15.5,
  "description": "Partly cloudy",
  "humidity": 65,
  "wind_speed": 12.5,
  "icon": "02d"
}
```

---

## 📊 Analytics

### Get Trip Statistics
```
GET /api/analytics

Response:
{
  "success": true,
  "total_trips": 42,
  "total_distance_km": 234.56,
  "total_fuel_cost": 45.23,
  "total_toll_cost": 12.50,
  "total_caz_cost": 8.00,
  "average_distance_km": 5.58,
  "average_duration_minutes": 12.3,
  "routing_modes": {
    "auto": 35,
    "pedestrian": 5,
    "bicycle": 2
  }
}
```

---

## 🚦 Speed Limit

### Get Speed Limit
```
GET /api/speed-limit?lat=51.5074&lon=-0.1278

Response:
{
  "success": true,
  "speed_limit_mph": 30,
  "road_type": "residential",
  "unit": "mph"
}
```

---

## 📦 PWA Files

### Get Manifest
```
GET /manifest.json

Response: JSON manifest file
```

### Get Service Worker
```
GET /service-worker.js

Response: JavaScript service worker
```

---

## 🔧 Error Responses

All endpoints return errors in this format:

```json
{
  "success": false,
  "error": "Error message describing what went wrong"
}
```

### Common Errors
- `Missing start or end location` - Coordinates not provided
- `Invalid coordinates` - Coordinates not in lat,lon format
- `Routing service unavailable` - Both Valhalla and OSRM failed
- `Weather API not configured` - OpenWeatherMap key missing

---

## 📝 Parameter Reference

### Routing Modes
- `auto` - Car/vehicle routing
- `pedestrian` - Walking routes
- `bicycle` - Cycling routes

### Vehicle Types
- `petrol_diesel` - Petrol or diesel car
- `electric` - Electric vehicle
- `hybrid` - Hybrid vehicle

### Road Types
- `motorway` - Motorway (70 mph)
- `a_road` - A-road (60 mph)
- `b_road` - B-road (50 mph)
- `residential` - Residential (30 mph)
- `urban` - Urban (20 mph)

### Connector Types
- `Tesla` - Tesla Supercharger
- `CCS` - Combined Charging System
- `Type 2` - Type 2 connector
- `CHAdeMO` - CHAdeMO connector

---

## 🔐 Security Notes

- All data stored locally (no cloud sync)
- No authentication required (local use)
- HTTPS recommended for production
- Service worker caches sensitive data

---

## 📊 Rate Limits

- No rate limits (local service)
- OSRM: 600 requests/minute
- Valhalla: Unlimited (self-hosted)
- OpenWeatherMap: Depends on API key

---

## 🚀 Integration Examples

### JavaScript
```javascript
// Calculate route
const response = await fetch('/api/route', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    start: '51.5074,-0.1278',
    end: '51.5174,-0.1278',
    routing_mode: 'auto'
  })
});
const data = await response.json();
```

### Python
```python
import requests

response = requests.post('http://localhost:5000/api/route', json={
    'start': '51.5074,-0.1278',
    'end': '51.5174,-0.1278',
    'routing_mode': 'auto'
})
data = response.json()
```

### cURL
```bash
curl -X POST http://localhost:5000/api/route \
  -H "Content-Type: application/json" \
  -d '{
    "start": "51.5074,-0.1278",
    "end": "51.5174,-0.1278",
    "routing_mode": "auto"
  }'
```

---

## 📞 Support

For API issues:
1. Check error message
2. Verify parameters
3. Check browser console (F12)
4. Restart app if needed


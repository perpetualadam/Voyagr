# 🎯 VOYAGR - DETAILED FEATURES BREAKDOWN

---

## 1️⃣ ROUTING & NAVIGATION

### Valhalla Routing Engine
**What it does**: Calculates optimal routes between two points

**Supported modes**:
- **Auto (Car)**: Fastest route for vehicles
  - Toll avoidance/inclusion toggle
  - Ferry support
  - Speed: ~60 km/h average
  
- **Pedestrian (Walking)**: Safest route for pedestrians
  - Walking speed: 5.1 km/h
  - Ferry support
  - Avoids highways
  
- **Bicycle (Cycling)**: Bike-friendly route
  - Cycling speed: 25 km/h
  - Bike lane preference
  - Road support
  - Ferry support

**Features**:
- Route caching (1-hour expiry)
- Exponential backoff retry logic
- Health checks (cached 60 seconds)
- Fallback to offline calculation
- Distance & time estimation

**Configuration**:
```
Server: OCI instance (141.147.102.102:8002)
Timeout: 30 seconds
Retries: 3 attempts
Retry delay: 1 second (exponential backoff)
```

---

## 2️⃣ COST ESTIMATION

### Fuel/Energy Cost Calculation

**Petrol/Diesel Vehicles**:
- Input: Fuel efficiency (L/100km or MPG)
- Input: Fuel price (£/L)
- Calculation: (distance × efficiency) / 100 × price
- Example: 100 km × 6.5 L/100km × £1.40/L = £9.10

**Electric Vehicles**:
- Input: Energy efficiency (kWh/100km or miles/kWh)
- Input: Electricity price (£/kWh)
- Calculation: (distance × efficiency) / 100 × price
- Example: 100 km × 18.5 kWh/100km × £0.30/kWh = £5.55

**Unit Conversions**:
- L/100km ↔ MPG: 235.214 / value
- kWh/100km ↔ miles/kWh: 62.1371 / value
- km ↔ miles: × 0.621371
- °C ↔ °F: (C × 9/5) + 32

### Toll Cost Calculation
- Database: M6 Toll (£7.00), Dartford Crossing (£2.50)
- Detection: Proximity-based (within 100m)
- Accumulation: Sum of all tolls on route

### CAZ (Clean Air Zone) Cost
- 16 verified zones (UK & EU)
- Charges: £7-£100 depending on zone
- Exemption: Toggle for exempt vehicles
- Currency: GBP or EUR (auto-converted)

**Example Route Cost Breakdown**:
```
Fuel cost:     £9.10
Toll cost:     £7.00 (M6 Toll)
CAZ cost:      £12.50 (London ULEZ)
─────────────────────
Total cost:    £28.60
```

---

## 3️⃣ TRAFFIC ALERTS

### Alert Types & Triggers

**Hazard Alerts** (500m radius)
- Potholes
- Debris
- Accidents
- User-reported via voice

**Incident Alerts** (500m radius)
- Road closures
- Congestion
- Accidents
- User-reported via voice

**Camera Alerts** (500m radius)
- Speed cameras
- Traffic cameras
- Red light cameras
- User-reported via voice

**Toll Alerts** (500m radius)
- Upcoming toll roads
- Cost display
- Toll name and location

**CAZ Alerts** (1km radius)
- Clean Air Zone proximity
- Zone name and city
- Charge amount
- Exemption status
- Operating hours

**Weather Alerts** (Periodic)
- Severe weather warnings
- Temperature display
- Severity levels: moderate, severe, extreme

### Alert Delivery
- **Notification**: System notification popup
- **Voice**: Text-to-speech announcement (if enabled)
- **Frequency**: Periodic checks (5-60 seconds)

---

## 4️⃣ HANDS-FREE OPERATION

### Voice Wake Word Detection
- **Keyword**: "Hey SatNav"
- **Technology**: Porcupine (Picovoice)
- **Sensitivity**: 0.5 (configurable)
- **Trigger**: Starts voice report mode

### Voice Reporting
**Report Types** (auto-detected from speech):
- Pothole
- Debris
- Accident
- Incident/Closure
- Camera
- Toll
- Other

**Process**:
1. User says "Hey SatNav"
2. App responds "Report now"
3. User describes hazard
4. App logs report with:
   - Current location (lat/lon)
   - Report type
   - Description
   - Timestamp

### Gesture Recognition
- **Trigger**: 2-shake detection
- **Acceleration threshold**: 15 m/s²
- **Time window**: 1 second
- **Action**: Starts voice report mode

### Text-to-Speech
- **Android**: Native Android TTS
- **Desktop**: pyttsx3 library
- **Features**:
  - Route announcements
  - Alert notifications
  - ETA updates
  - Cost breakdowns

---

## 5️⃣ SEARCH & FAVORITES

### Location Search
- **API**: Nominatim (OpenStreetMap)
- **Rate limit**: 1 request/second
- **Results**: Up to 10 locations
- **Info returned**:
  - Name
  - Address
  - Coordinates
  - Distance from current location
  - Category/type

**Example Search**:
```
Query: "Pizza near me"
Results:
1. Mario's Pizza - 0.5 km away
2. Domino's - 1.2 km away
3. Pizza Hut - 1.8 km away
```

### Search History
- **Storage**: SQLite database
- **Limit**: Last 50 searches
- **Info stored**:
  - Search query
  - Result name
  - Coordinates
  - Timestamp

### Favorite Locations
- **Storage**: SQLite database
- **Info stored**:
  - Name
  - Address
  - Coordinates
  - Category
  - Timestamp
- **Features**:
  - Add from search results
  - Quick access
  - Voice confirmation

---

## 6️⃣ MULTI-UNIT SUPPORT

### Distance Units
- **Kilometers** (km): Default
- **Miles** (mi): Alternative
- **Conversion**: 1 km = 0.621371 miles

### Temperature Units
- **Celsius** (°C): Default
- **Fahrenheit** (°F): Alternative
- **Conversion**: °F = (°C × 9/5) + 32

### Currency Units
- **GBP** (£): Default
- **USD** ($): Alternative
- **EUR** (€): Alternative
- **Conversion**: EUR to GBP ≈ × 0.85

### Fuel Efficiency Units
**Petrol/Diesel**:
- **L/100km**: Liters per 100 kilometers (default)
- **MPG**: Miles per gallon (alternative)
- **Conversion**: 235.214 / value

**Electric**:
- **kWh/100km**: Kilowatt-hours per 100 km (default)
- **miles/kWh**: Miles per kilowatt-hour (alternative)
- **Conversion**: 62.1371 / value

---

## 7️⃣ CLEAN AIR ZONES (CAZ)

### 16 Verified Zones

**UK Zones** (8):
1. London ULEZ - £12.50/day
2. London Congestion - £15.00/day
3. Birmingham CAZ - £8.00/day
4. Bath CAZ - £9.00/day
5. Bristol CAZ - £9.00/day
6. Portsmouth CAZ - £10.00/day
7. Sheffield CAZ - £10.00/day
8. Bradford CAZ - £7.00/day

**EU Zones** (8):
1. Paris LEZ - €68.00/day
2. Berlin Environmental - €100.00/day
3. Milan Area C - €5.00/day
4. Madrid Central - €90.00/day
5. Amsterdam Environmental - €95.00/day
6. Brussels LEZ - €35.00/day
7. Rome ZTL - €87.50/day
8. Barcelona LEZ - €100.00/day

### CAZ Features
- **Avoidance**: Toggle to avoid CAZ zones
- **Exemption**: Mark vehicle as exempt
- **Operating hours**: Zone-specific hours
- **Boundary coords**: Zone boundary polygons
- **Alerts**: Proximity warnings (1km radius)

---

## 8️⃣ SETTINGS & CUSTOMIZATION

### User Preferences (Persistent)
All settings saved to SQLite database:

**Routing**:
- Routing mode (auto/pedestrian/bicycle)
- Include tolls (yes/no)
- Avoid CAZ (yes/no)
- Vehicle CAZ exempt (yes/no)

**Units**:
- Distance unit (km/mi)
- Temperature unit (C/F)
- Currency unit (GBP/USD/EUR)
- Fuel unit (L/100km/MPG/kWh/miles)

**Vehicle**:
- Vehicle type (petrol/diesel/electric)
- Fuel efficiency (customizable)
- Fuel price (customizable)
- Energy efficiency (customizable)
- Electricity price (customizable)

### Input Validation
- **Fuel efficiency**: 1-20 L/100km or 10-100 MPG
- **Fuel price**: £0.50-£3.00/L
- **Energy efficiency**: 10-30 kWh/100km or 2-6 miles/kWh
- **Electricity price**: £0.10-£1.00/kWh

---

## 9️⃣ DATABASE PERSISTENCE

### 6 SQLite Tables

**Settings Table**:
- User preferences
- Vehicle configuration
- Unit selections

**Tolls Table**:
- Toll road locations
- Toll costs
- Road names

**Reports Table**:
- User-reported hazards
- Location and type
- Description and timestamp

**Clean Air Zones Table**:
- 16 verified zones
- Zone boundaries
- Operating hours
- Charges

**Search History Table**:
- Last 50 searches
- Query and results
- Timestamps

**Favorite Locations Table**:
- User-saved places
- Coordinates and category
- Timestamps

---

## 🔟 PERFORMANCE OPTIMIZATIONS

### Caching
- **Route cache**: 1-hour expiry
- **Health checks**: 60-second cache
- **Search history**: Last 50 queries

### Retry Logic
- **Exponential backoff**: 1s, 2s, 4s, 8s...
- **Max retries**: 3 attempts
- **Timeout**: 30 seconds per request

### Periodic Checks
- **Hazard/incident**: Every 10 seconds
- **Camera**: Every 5 seconds
- **Toll**: Every 5 seconds
- **CAZ**: Every 5 seconds
- **Weather**: Every 60 seconds
- **ETA**: Every 5 minutes

### Resource Management
- **GPS**: 1000ms update interval
- **Accelerometer**: 100ms check interval
- **Audio stream**: Efficient buffer management
- **Database**: Connection pooling

---

**Status**: ✅ **FULLY FEATURED & PRODUCTION READY**

**End of Detailed Features Breakdown**


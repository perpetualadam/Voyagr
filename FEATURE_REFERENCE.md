# Voyagr Feature Reference Guide

**Version**: 1.0.0  
**Last Updated**: October 2025

---

## 1. ROUTING MODES

### Auto (Car) Mode
**Description**: Optimized for vehicle navigation with cost calculations

**Features**:
- Toll road detection and cost estimation
- Fuel/energy cost calculation
- Vehicle type selection (petrol/diesel or electric)
- CAZ avoidance option
- Cost breakdown display

**Settings**:
- Vehicle Type: Petrol/Diesel or Electric
- Fuel Efficiency: L/100km or mpg
- Fuel Price: £/liter
- Energy Efficiency: kWh/100km or miles/kWh
- Electricity Price: £/kWh
- Include Tolls: Toggle on/off
- Avoid CAZ: Toggle on/off

**Output Example**:
```
Driving: 100.00 km, 120 min, £23.60 (£9.10 + £2.50 tolls + £12.50 CAZ)
```

### Pedestrian (Walking) Mode
**Description**: Optimized for walking routes

**Features**:
- Walking-optimized paths
- No cost calculations
- Distance and time estimation
- Accessible route preferences

**Output Example**:
```
Walking: 5.00 km, 60 min
```

### Bicycle (Cycling) Mode
**Description**: Optimized for cycling routes

**Features**:
- Bike lane preferences
- Cycling-optimized paths
- No cost calculations
- Distance and time estimation

**Output Example**:
```
Cycling: 8.00 km, 30 min
```

---

## 2. COST CALCULATIONS

### Fuel Cost (Petrol/Diesel)
**Formula**: `distance_km × (fuel_efficiency / 100) × fuel_price_gbp`

**Example**:
- Distance: 100 km
- Efficiency: 6.5 L/100km
- Price: £1.40/liter
- Cost: 100 × (6.5/100) × 1.40 = £9.10

**Units**:
- L/100km (default)
- mpg (conversion: 1 mpg = 235.214 / L/100km)

### Energy Cost (Electric)
**Formula**: `distance_km × (energy_efficiency / 100) × electricity_price_gbp`

**Example**:
- Distance: 100 km
- Efficiency: 18.5 kWh/100km
- Price: £0.30/kWh
- Cost: 100 × (18.5/100) × 0.30 = £5.55

**Units**:
- kWh/100km (default)
- miles/kWh (conversion: 1 miles/kWh = 62.1371 / kWh/100km)

### Toll Cost
**Detection**: Route proximity to toll locations

**UK Tolls**:
- M6 Toll: £7.00
- Dartford Crossing: £2.50

**Calculation**: Sum of all tolls on route

**Toggle**: Enable/disable in settings

### CAZ (Clean Air Zone) Cost
**Coverage**: 16 zones (8 UK, 8 EU)

**UK Zones** (GBP):
- London ULEZ: £12.50 daily
- London Congestion: £15.00 daily
- Birmingham: £8.00 daily
- Bath: £9.00 daily
- Bristol: £9.00 daily
- Portsmouth: £10.00 daily
- Sheffield: £10.00 daily
- Bradford: £7.00 daily

**EU Zones** (EUR):
- Paris: €68.00
- Berlin: €100.00
- Milan: €5.00
- Madrid: €90.00
- Amsterdam: €95.00
- Brussels: €35.00
- Rome: €87.50
- Barcelona: €100.00

**Exemption**: Mark vehicle as exempt for £0 charge

---

## 3. ALERT SYSTEMS

### Traffic Camera Alerts
- **Detection**: 500m proximity
- **Frequency**: Every 5 seconds
- **Output**: Camera location, distance, speed limit
- **Feedback**: Notification + voice

### Hazard Alerts
- **Types**: Accident, roadwork, weather, debris
- **Detection**: 1000m proximity
- **Frequency**: Every 10 seconds
- **Output**: Hazard type, location, distance
- **Feedback**: Notification + voice

### Incident Alerts
- **Types**: Congestion, closure, delays
- **Detection**: 1000m proximity
- **Frequency**: Every 10 seconds
- **Output**: Incident type, location, distance
- **Feedback**: Notification + voice

### Toll Alerts
- **Detection**: 500m proximity
- **Frequency**: Every 5 seconds
- **Output**: Toll road name, distance, cost
- **Feedback**: Notification + voice

### CAZ Alerts
- **Detection**: 1000m proximity
- **Frequency**: Every 5 seconds
- **Output**: Zone name, city, distance, charge
- **Feedback**: Notification + voice

---

## 4. UNIT SUPPORT

### Distance Units
| Unit | Symbol | Conversion |
|------|--------|-----------|
| Kilometers | km | 1 km = 0.621371 mi |
| Miles | mi | 1 mi = 1.60934 km |

### Temperature Units
| Unit | Symbol | Conversion |
|------|--------|-----------|
| Celsius | °C | °F = (°C × 9/5) + 32 |
| Fahrenheit | °F | °C = (°F - 32) × 5/9 |

### Currency Units
| Unit | Symbol | Conversion |
|------|--------|-----------|
| British Pounds | £ | GBP (default) |
| US Dollars | $ | USD |
| Euros | € | EUR (0.85 to GBP) |

### Fuel Efficiency Units
| Unit | Conversion |
|------|-----------|
| L/100km | Default |
| mpg | 1 mpg = 235.214 / L/100km |

### Energy Efficiency Units
| Unit | Conversion |
|------|-----------|
| kWh/100km | Default |
| miles/kWh | 1 miles/kWh = 62.1371 / kWh/100km |

---

## 5. VOICE & GESTURE CONTROL

### Voice Control
**Wake Word**: "Hey SatNav"

**Announcements**:
- Route summaries
- Alert notifications
- ETA updates
- Cost breakdowns
- Currency names

**TTS Engines**:
- Android: Native TextToSpeech
- Desktop: pyttsx3

### Gesture Control
**Gesture**: 2-shake detection

**Sensor**: Accelerometer

**Actions**:
- Trigger voice guidance
- Toggle features
- Acknowledge alerts

---

## 6. SETTINGS & PREFERENCES

### Display Settings
- Distance Unit: km / miles
- Temperature Unit: °C / °F
- Currency Unit: GBP / USD / EUR

### Vehicle Settings
- Vehicle Type: Petrol/Diesel / Electric
- Fuel Efficiency: L/100km or mpg
- Fuel Price: £/liter
- Energy Efficiency: kWh/100km or miles/kWh
- Electricity Price: £/kWh

### Routing Settings
- Routing Mode: Auto / Pedestrian / Bicycle
- Include Tolls: On / Off
- Avoid CAZ: On / Off
- CAZ Exempt Vehicle: On / Off

### Voice Settings
- Voice Guidance: On / Off
- Wake Word Detection: On / Off

---

## 7. DATABASE SCHEMA

### Settings Table
Stores user preferences and vehicle information

### Tolls Table
Stores UK toll road locations and costs

### Reports Table
Stores user-submitted hazard and incident reports

### Clean Air Zones Table
Stores 16 real CAZ zones with:
- Zone name and location
- Charge amount and currency
- Operating hours
- Boundary coordinates

---

## 8. DEFAULT VALUES

| Setting | Default |
|---------|---------|
| Distance Unit | km |
| Temperature Unit | °C |
| Currency Unit | GBP |
| Vehicle Type | Petrol/Diesel |
| Fuel Efficiency | 6.5 L/100km |
| Fuel Price | £1.40/liter |
| Energy Efficiency | 18.5 kWh/100km |
| Electricity Price | £0.30/kWh |
| Include Tolls | On |
| Routing Mode | Auto |
| Avoid CAZ | Off |
| CAZ Exempt | Off |
| Voice Guidance | On |
| Current Location | Barnsley, UK |

---

## 9. KEYBOARD SHORTCUTS (Desktop)

| Action | Shortcut |
|--------|----------|
| Toggle Distance Unit | D |
| Toggle Temperature Unit | T |
| Toggle Currency Unit | C |
| Toggle Vehicle Type | V |
| Toggle Routing Mode | R |
| Toggle Tolls | L |
| Toggle CAZ Avoidance | Z |
| Toggle Voice | S |
| Quit | Q |

---

## 10. EXAMPLE WORKFLOWS

### Calculate Route Cost
1. Select Auto mode
2. Set vehicle type (Petrol/Diesel or Electric)
3. Enter fuel/energy efficiency
4. Enter fuel/electricity price
5. Toggle "Include Tolls" if needed
6. Toggle "Avoid CAZ" if needed
7. Route calculated with cost breakdown

### Enable Voice Guidance
1. Tap "Voice Guidance" toggle
2. Say "Hey SatNav" to activate
3. App announces route and alerts
4. Shake device to trigger voice

### Report Hazard
1. Tap "Report" button
2. Select hazard type
3. Add description
4. Submit report
5. Report stored in database

### Switch Distance Units
1. Tap "Distance Unit" toggle
2. Select km or miles
3. All distances update immediately
4. Setting persists in database

---

## 11. TROUBLESHOOTING

### Route Not Calculating
- Verify Valhalla server running
- Check internet connectivity
- Verify GPS location set
- Check routing mode selected

### Costs Not Showing
- Verify "Include Tolls" enabled
- Check vehicle type selected
- Verify fuel/energy price entered
- Check routing mode is "Auto"

### Voice Not Working
- Grant microphone permission
- Check audio volume
- Verify TTS engine installed
- Check "Voice Guidance" enabled

### Alerts Not Showing
- Verify proximity threshold
- Check alert type enabled
- Verify current location set
- Check notification permission

---

**End of Feature Reference**


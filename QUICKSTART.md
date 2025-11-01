# Voyagr Quick Start Guide

## 5-Minute Setup

### 1. Install Dependencies
```bash
pip install -r requirements.txt
```

### 2. Run Tests
```bash
python -m pytest test_core_logic.py -v
```

Expected output: **43 passed** ✅

### 3. Run the App (Desktop)
```bash
python satnav.py
```

## Configuration

### Set Your Preferences

The app stores settings in `satnav.db`. On first run, defaults are:

**Location**: Barnsley (53.5526, -1.4797)  
**Vehicle**: Petrol/Diesel  
**Fuel Efficiency**: 6.5 L/100km  
**Fuel Price**: £1.40/L  
**Tolls**: Enabled  

### Change Settings in App

1. Toggle distance unit: **Kilometers** ↔ **Miles**
2. Toggle temperature: **Celsius** ↔ **Fahrenheit**
3. Toggle vehicle: **Petrol/Diesel** ↔ **Electric**
4. Toggle fuel unit: **L/100km** ↔ **mpg** (or **kWh/100km** ↔ **miles/kWh** for EV)
5. Enter fuel/electricity price in GBP
6. Toggle tolls: **Include Tolls** on/off

## Example Scenarios

### Scenario 1: Petrol Car Journey (Barnsley to London)
- Distance: 200 km
- Fuel efficiency: 6.5 L/100km
- Fuel price: £1.40/L
- Tolls: M6 Toll (£7.00) + Dartford Crossing (£2.50)

**Calculation**:
- Fuel: (200 × 6.5) / 100 = 13 litres
- Fuel cost: 13 × £1.40 = **£18.20**
- Toll cost: **£9.50**
- **Total: £27.70**

### Scenario 2: Electric Car Journey (Barnsley to London)
- Distance: 200 km
- Energy efficiency: 18.5 kWh/100km
- Electricity price: £0.30/kWh
- Tolls: M6 Toll (£7.00) + Dartford Crossing (£2.50)

**Calculation**:
- Energy: (200 × 18.5) / 100 = 37 kWh
- Energy cost: 37 × £0.30 = **£11.10**
- Toll cost: **£9.50**
- **Total: £20.60**

### Scenario 3: Unit Conversion
- Fuel efficiency: 43.5 mpg (UK standard)
- Convert to L/100km: 235.214 / 43.5 = **5.41 L/100km**

## Voice Commands

### Activate Voice Reporting
Say: **"Hey SatNav"** or shake device twice

### Report Issues
- "pothole" → Pothole report
- "debris" → Debris report
- "accident" → Accident report
- "camera" → Camera report
- "toll" → Toll report
- "incident" → Incident report

## Alerts

### Alert Types
- **Speed Cameras**: Within 500m
- **Traffic Light Cameras**: Within 500m
- **Hazards**: Potholes, debris, fallen trees
- **Incidents**: Road closures, accidents
- **Weather**: Severe weather warnings

### Alert Frequency
- Hazard/Incident checks: Every 10 seconds
- Camera checks: Every 5 seconds
- Toll checks: Every 5 seconds
- Weather checks: Every 60 seconds
- ETA announcements: Every 5 minutes

## Troubleshooting

### App Won't Start
```bash
# Check dependencies
pip install -r requirements.txt

# Check Python version (3.8+)
python --version

# Check database permissions
rm satnav.db  # Reset database
```

### GPS Not Working
- Enable location permissions
- Check GPS is enabled on device
- App defaults to Barnsley if GPS unavailable

### Voice Not Working
- Check microphone permissions
- Verify Porcupine access key is set in satnav.py
- Check audio output device

### Toll Data Not Updating
- Check internet connection
- Verify Overpass API is accessible
- Tolls are cached for 1 hour

## Android Deployment

### Build APK
```bash
pip install buildozer
buildozer android debug
```

### Deploy to Device
```bash
buildozer android debug deploy run
```

### Permissions Required
- ACCESS_FINE_LOCATION (GPS)
- RECORD_AUDIO (voice)
- INTERNET (API calls)
- VIBRATE (alerts)

## API Keys (Optional)

For full functionality, set these in `hazard_parser.py`:

```python
MAPQUEST_KEY = "<your-mapquest-api-key>"
WEATHER_KEY = "<your-openweathermap-api-key>"
```

And in `satnav.py`:

```python
self.porcupine = pvporcupine.create(
    access_key="<your-picovoice-access-key>",
    ...
)
```

## File Structure

```
voyagr/
├── satnav.py                 # Main app
├── hazard_parser.py          # Data fetching
├── test_core_logic.py        # Unit tests (43 tests)
├── test_satnav.py            # Integration tests
├── requirements.txt          # Dependencies
├── buildozer.spec            # Android config
├── valhalla.json             # Routing config
├── README.md                 # Full documentation
├── VALHALLA_SETUP.md         # Valhalla guide
├── PROJECT_SUMMARY.md        # Project overview
├── QUICKSTART.md             # This file
└── .gitignore                # Git ignore rules
```

## Key Metrics

- **Test Coverage**: 43/43 tests passing ✅
- **Code Size**: 1000+ lines (satnav.py)
- **Features**: 8 major features
- **Cost**: $0 (open-source)
- **Deployment**: Android ready
- **Performance**: GPS every 1s, alerts every 5-10s

## Next Steps

1. **Customize Settings**: Edit fuel/electricity prices for your region
2. **Add Tolls**: Add custom tolls to `satnav.db`
3. **Set API Keys**: Configure MapQuest, OpenWeatherMap, Porcupine
4. **Deploy to Android**: Follow buildozer instructions
5. **Test on Device**: Verify GPS, voice, and alerts

## Support

- **Issues**: Check README.md troubleshooting section
- **Documentation**: See README.md and VALHALLA_SETUP.md
- **Tests**: Run `pytest test_core_logic.py -v`

## License

Open-source (specify license in LICENSE file)

---

**Happy navigating with Voyagr! 🗺️**


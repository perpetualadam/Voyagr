# Voyagr - Open-Source Sat Nav Mobile Application

A feature-rich, cost-free satellite navigation application with toll road cost estimation, electric vehicle support, and hands-free operation.

## Features

### Core Navigation
- **Routing Engine**: Valhalla for route calculation
- **Map Rendering**: Kivy with MapView for interactive maps
- **GPS Integration**: Real-time location tracking

### Toll Road Support
- **Toll Cost Estimation**: Estimates toll costs in GBP (£) for routes
- **Static Database**: Pre-loaded UK toll data (M6 Toll, Dartford Crossing, etc.)
- **Dynamic Updates**: Fetches toll data from OpenStreetMap via Overpass API
- **Route Integration**: Matches route segments to toll roads
- **User Control**: Toggle toll inclusion in journey costs

### Electric Vehicle Support
- **Vehicle Type Selection**: Petrol/Diesel or Electric
- **Energy Efficiency Units**:
  - kWh/100 km (European standard, default: 18.5)
  - Miles per kWh (UK-friendly alternative)
- **Charging Cost Calculation**: Based on electricity price (default: £0.30/kWh)
- **Unit Conversion**: Automatic conversion between efficiency units
- **Validation**: Input validation for efficiency (10-30 kWh/100km, 2-6 miles/kWh)

### Fuel/Energy Cost Calculation
- **Fuel Efficiency Units**:
  - L/100 km (default: 6.5)
  - Miles per gallon (mpg)
- **Fuel Price**: Configurable in GBP/L (default: £1.40)
- **Journey Cost**: Displays total fuel/energy cost in GBP
- **ETA Announcements**: Includes fuel/energy and toll costs

### Traffic Alerts
- **Speed Cameras**: Alerts for speed cameras within 500m
- **Traffic Light Cameras**: Red light camera detection
- **Hazards**: Potholes, debris, fallen trees
- **Incidents**: Road closures, accidents
- **Weather Alerts**: Severe weather warnings with temperature

### Hands-Free Operation
- **Voice Wake Word**: "Hey SatNav" activation (Porcupine)
- **Gesture Control**: Two-shake detection for reporting
- **Voice Reporting**: Report hazards, cameras, tolls, incidents
- **Text-to-Speech**: Audio announcements (Android TTS or pyttsx3)
- **Contextual Prompts**: Automatic prompts for reporting

### Units and Localization
- **Distance**: Kilometers or Miles
- **Temperature**: Celsius or Fahrenheit
- **Fuel Efficiency**: L/100km or mpg
- **Energy Efficiency**: kWh/100km or miles/kWh
- **Currency**: All costs in GBP (£)

### Data Sources
- **OpenStreetMap**: Map data, hazards, incidents, cameras, tolls
- **Overpass API**: Real-time hazard/incident/camera/toll queries
- **MapQuest Traffic API**: Traffic incident reports (free tier)
- **OpenWeatherMap**: Weather alerts (free tier)
- **SQLite**: Local storage for reports, settings, tolls

## Installation

### Prerequisites
- Python 3.8+
- pip or conda
- Git

### Desktop Setup

1. Clone the repository:
```bash
git clone https://github.com/yourusername/voyagr.git
cd voyagr
```

2. Install dependencies:
```bash
pip install -r requirements.txt
```

3. Configure API keys (optional):
   - Edit `hazard_parser.py` and set:
     - `MAPQUEST_KEY`: Your MapQuest API key
     - `WEATHER_KEY`: Your OpenWeatherMap API key
     - Porcupine access key in `satnav.py`

4. Run the app:
```bash
python satnav.py
```

### Android Deployment

1. Install Buildozer:
```bash
pip install buildozer
```

2. Build APK:
```bash
buildozer android debug
```

3. Deploy to device:
```bash
buildozer android debug deploy run
```

## Configuration

### Settings
All settings are stored in SQLite (`satnav.db`):
- Distance unit (km/mi)
- Temperature unit (°C/°F)
- Vehicle type (petrol_diesel/electric)
- Fuel/energy efficiency
- Fuel/electricity price
- Toll inclusion toggle

### Toll Data
Pre-loaded UK tolls:
- M6 Toll: £7.00
- Dartford Crossing: £2.50
- Severn Bridge: £6.70
- Humber Bridge: £1.50

Add custom tolls via the SQLite `tolls` table.

### EV Efficiency Defaults
- kWh/100 km: 18.5 (Nissan Leaf typical)
- Miles per kWh: 3.4
- Electricity price: £0.30/kWh (October 2025 estimate)

### Fuel Efficiency Defaults
- L/100 km: 6.5 (typical petrol car)
- mpg: 43.5
- Fuel price: £1.40/L

## Usage

### Basic Navigation
1. Launch the app
2. Select vehicle type (Petrol/Diesel or Electric)
3. Set fuel/energy efficiency and price
4. Toggle toll inclusion
5. View map and receive alerts

### Voice Reporting
1. Say "Hey SatNav" or shake device twice
2. Report issue: "pothole", "debris", "accident", "camera", "toll", etc.
3. Report logged with location and timestamp

### Unit Switching
- Toggle distance: Kilometers ↔ Miles
- Toggle temperature: Celsius ↔ Fahrenheit
- Toggle fuel: L/100km ↔ mpg
- Toggle energy: kWh/100km ↔ miles/kWh

### ETA Announcements
- Automatic every 5 minutes
- Includes: ETA, distance, fuel/energy, cost, tolls
- Example: "ETA: 30 min, 45.50 km, 3.00 litres, £4.20 + £7.00 tolls"

## Error Handling

- **GPS Error**: Falls back to Barnsley (53.5526, -1.4797)
- **TTS Error**: Displays notification instead of speaking
- **Invalid Input**: Reverts to default values with notification
- **API Error**: Gracefully handles network failures
- **Toll Data Unavailable**: Notifies user, continues without toll cost

## Performance

- **GPS Updates**: Every 1 second
- **Alert Checks**: Every 5-10 seconds
- **Data Fetches**: Every 5 minutes (10km radius)
- **ETA Announcements**: Every 5 minutes
- **Voice Recognition**: 5-second timeout

## Cost

**$0** - Uses only open-source tools and free APIs:
- Kivy (UI framework)
- Valhalla (routing)
- Plyer (device APIs)
- OpenStreetMap (map data)
- Overpass API (free queries)
- MapQuest (free tier)
- OpenWeatherMap (free tier)

## Safety

- Hands-free operation complies with UK driving laws
- Voice guidance only when not listening to user input
- Alerts within 500m of current position
- No distraction during active reporting

## Troubleshooting

### App crashes on startup
- Check Python version (3.8+)
- Verify all dependencies installed: `pip install -r requirements.txt`
- Check database file permissions

### GPS not working
- Enable location permissions on device
- Check GPS is enabled
- App defaults to Barnsley if GPS unavailable

### Voice not working
- Check microphone permissions
- Verify Porcupine access key is set
- Check audio output device

### Toll data not updating
- Verify internet connection
- Check Overpass API is accessible
- Tolls cached for 1 hour

## Contributing

Contributions welcome! Please:
1. Fork the repository
2. Create a feature branch
3. Submit a pull request

## License

Open-source (specify license)

## Support

For issues, questions, or suggestions:
- GitHub Issues: [link]
- Email: [contact]

## Roadmap

- [ ] Real-time traffic integration
- [ ] Route optimization with toll avoidance
- [ ] Charging station finder for EVs
- [ ] Crowd-sourced hazard reports
- [ ] Multi-language support
- [ ] Offline map support
- [ ] Advanced EV charging cost calculation


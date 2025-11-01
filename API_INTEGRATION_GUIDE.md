# Voyagr - Missing API Integration Guide
**Date**: October 29, 2025  
**Status**: Integration Instructions

---

## 📋 OVERVIEW

This guide provides step-by-step instructions for obtaining and configuring the three missing API services:

1. **MapQuest API** - Traffic incidents and real-time traffic data
2. **OpenWeatherMap API** - Weather alerts and conditions
3. **Porcupine Wake Word** - Voice activation ("Hey SatNav")

---

## 🔑 API 1: MapQuest API Integration

### What It Does
- Fetches real-time traffic incidents (accidents, road closures, congestion)
- Provides traffic flow data for route optimization
- Helps avoid traffic delays

### Step 1: Obtain API Key

**Registration Link**: https://developer.mapquest.com/

**Steps**:
1. Go to https://developer.mapquest.com/
2. Click "Sign Up" (top right)
3. Create a free account with email
4. Verify your email
5. Log in to your account
6. Go to "Manage Keys" (in dashboard)
7. Click "Create a New Key"
8. Select "Web" as the application type
9. Name it "Voyagr Navigation"
10. Copy the API key (looks like: `xxxxxxxxxxxxxxxxxxxxx`)

**Free Tier Limits**:
- 15,000 requests per month
- Sufficient for personal navigation use

### Step 2: Add to .env File

Add this line to `.env`:
```
MAPQUEST_API_KEY=your_actual_key_here
```

**Example**:
```
MAPQUEST_API_KEY=abc123def456ghi789jkl012mno345pqr
```

### Step 3: Verify Integration

The code will automatically use the key from `.env` file. Test with:
```python
from hazard_parser import HazardParser
parser = HazardParser()
incidents = parser.get_incidents(lat=51.5074, lon=-0.1278, radius_km=10)
print(incidents)
```

---

## 🌤️ API 2: OpenWeatherMap API Integration

### What It Does
- Fetches current weather conditions
- Provides weather alerts (rain, snow, storms)
- Helps with route planning and safety warnings

### Step 1: Obtain API Key

**Registration Link**: https://openweathermap.org/api

**Steps**:
1. Go to https://openweathermap.org/api
2. Click "Sign Up" (top right)
3. Create a free account with email
4. Verify your email
5. Log in to your account
6. Go to "API keys" (in account menu)
7. Copy the "Default" API key (looks like: `xxxxxxxxxxxxxxxxxxxxx`)
8. If needed, create a new key with name "Voyagr"

**Free Tier Limits**:
- 1,000 calls per day
- 60 calls per minute
- Sufficient for personal navigation use

### Step 2: Add to .env File

Add this line to `.env`:
```
OPENWEATHERMAP_API_KEY=your_actual_key_here
```

**Example**:
```
OPENWEATHERMAP_API_KEY=abc123def456ghi789jkl012mno345pqr
```

### Step 3: Verify Integration

The code will automatically use the key from `.env` file. Test with:
```python
from hazard_parser import HazardParser
parser = HazardParser()
weather = parser.get_weather(lat=51.5074, lon=-0.1278)
print(weather)
```

---

## 🎤 API 3: Porcupine Wake Word Integration

### What It Does
- Enables voice activation with "Hey SatNav" wake word
- Allows hands-free navigation control
- Works offline (processes audio locally)

### Step 1: Obtain Access Key

**Registration Link**: https://console.picovoice.ai/

**Steps**:
1. Go to https://console.picovoice.ai/
2. Click "Sign Up" (top right)
3. Create a free account with email
4. Verify your email
5. Log in to your account
6. Go to "AccessKey" (in left menu)
7. Click "Create New AccessKey"
8. Name it "Voyagr Navigation"
9. Copy the access key (looks like: `xxxxxxxxxxxxxxxxxxxxx`)

**Free Tier Limits**:
- Unlimited local processing
- No cloud calls required
- Sufficient for personal navigation use

### Step 2: Add to .env File

Add this line to `.env`:
```
PICOVOICE_ACCESS_KEY=your_actual_key_here
```

**Example**:
```
PICOVOICE_ACCESS_KEY=abc123def456ghi789jkl012mno345pqr
```

### Step 3: Verify Integration

The code will automatically use the key from `.env` file. Test with:
```python
# Voice activation will start automatically when app launches
# Say "Hey SatNav" to activate voice commands
```

---

## 📝 .env File Template

After obtaining all three keys, your `.env` file should look like:

```
# Valhalla Routing Engine Configuration
VALHALLA_URL=http://141.147.102.102:8002
VALHALLA_TIMEOUT=30
VALHALLA_RETRIES=3
VALHALLA_RETRY_DELAY=1

# MapQuest API for traffic incidents
MAPQUEST_API_KEY=your_mapquest_key_here

# OpenWeatherMap API for weather alerts
OPENWEATHERMAP_API_KEY=your_openweathermap_key_here

# Picovoice Access Key for wake word detection
PICOVOICE_ACCESS_KEY=your_picovoice_key_here
```

---

## ✅ VERIFICATION CHECKLIST

After adding all keys:

- [ ] MapQuest API key obtained and added to .env
- [ ] OpenWeatherMap API key obtained and added to .env
- [ ] Picovoice Access Key obtained and added to .env
- [ ] Code updated to read from .env (automatic)
- [ ] All tests passing (run: `pytest test_core_logic.py -v`)
- [ ] Traffic incidents working (test: `parser.get_incidents()`)
- [ ] Weather alerts working (test: `parser.get_weather()`)
- [ ] Voice activation working (test: say "Hey SatNav")

---

## 🔒 SECURITY NOTES

**Important**:
- ✅ Never commit `.env` file to git
- ✅ Never share API keys publicly
- ✅ Rotate keys periodically
- ✅ Use free tier limits to prevent unexpected charges
- ✅ Monitor API usage in each service's dashboard

**`.gitignore` should include**:
```
.env
.env.local
*.key
```

---

## 🆘 TROUBLESHOOTING

### MapQuest API Not Working
- Verify key is correct in `.env`
- Check MapQuest dashboard for API usage
- Ensure you're within free tier limits
- Test with: `curl "https://www.mapquestapi.com/traffic/v2/incidents?key=YOUR_KEY&boundingBox=51.5,0,51.6,-0.1"`

### OpenWeatherMap API Not Working
- Verify key is correct in `.env`
- Wait 10 minutes after creating key (activation delay)
- Check OpenWeatherMap dashboard for API usage
- Test with: `curl "https://api.openweathermap.org/data/2.5/weather?lat=51.5&lon=0&appid=YOUR_KEY"`

### Porcupine Wake Word Not Working
- Verify access key is correct in `.env`
- Check microphone permissions
- Ensure PyAudio is installed: `pip install pyaudio`
- Test with: `python -c "import pvporcupine; print('Porcupine OK')"`

---

## 📞 SUPPORT LINKS

- **MapQuest**: https://developer.mapquest.com/documentation
- **OpenWeatherMap**: https://openweathermap.org/api
- **Picovoice**: https://picovoice.ai/docs/

---

## ⏱️ ESTIMATED TIME

- MapQuest: 5-10 minutes
- OpenWeatherMap: 5-10 minutes
- Porcupine: 5-10 minutes
- **Total**: 15-30 minutes

---

## 🎯 NEXT STEPS

1. Follow steps above to obtain all three API keys
2. Add keys to `.env` file
3. Run tests to verify: `pytest test_core_logic.py -v`
4. Test each integration manually
5. Update INTEGRATION_STATUS_AUDIT.md

**All integrations will be automatically enabled once keys are added to `.env`**


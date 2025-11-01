# 🚀 Quick Start - API Key Configuration
**Get your Voyagr APIs working in 30 minutes!**

---

## 📋 3 SIMPLE STEPS

### Step 1️⃣: Get MapQuest API Key (5 min)
```
1. Go to: https://developer.mapquest.com/
2. Sign Up → Create Account → Verify Email
3. Log in → Manage Keys → Create New Key
4. Copy your API key
```

### Step 2️⃣: Get OpenWeatherMap API Key (5 min)
```
1. Go to: https://openweathermap.org/api
2. Sign Up → Create Account → Verify Email
3. Log in → API keys → Copy Default key
```

### Step 3️⃣: Get Picovoice Access Key (5 min)
```
1. Go to: https://console.picovoice.ai/
2. Sign Up → Create Account → Verify Email
3. Log in → AccessKey → Create New AccessKey
4. Copy your access key
```

---

## 📝 ADD KEYS TO .env FILE

Open `.env` file and add your keys:

```
MAPQUEST_API_KEY=your_mapquest_key_here
OPENWEATHERMAP_API_KEY=your_openweathermap_key_here
PICOVOICE_ACCESS_KEY=your_picovoice_key_here
```

**Example**:
```
MAPQUEST_API_KEY=abc123def456ghi789jkl012mno345pqr
OPENWEATHERMAP_API_KEY=xyz789abc456def123ghi789jkl012mno
PICOVOICE_ACCESS_KEY=key123abc456def789ghi012jkl345mno
```

---

## ✅ VERIFY IT WORKS

Run tests:
```bash
pytest test_core_logic.py -v
```

Expected output:
```
===================== 96 passed in 1.77s =====================
```

---

## 🎯 WHAT YOU GET

| API | Feature | Status |
|-----|---------|--------|
| MapQuest | Real-time traffic incidents | ✅ Ready |
| OpenWeatherMap | Weather alerts | ✅ Ready |
| Picovoice | Voice activation ("Hey SatNav") | ✅ Ready |

---

## 🔒 SECURITY

- ✅ Never commit `.env` to git
- ✅ Never share API keys
- ✅ Rotate keys periodically
- ✅ Monitor API usage

---

## 📞 NEED HELP?

See detailed guides:
- `API_INTEGRATION_GUIDE.md` - Full instructions
- `API_INTEGRATION_SETUP.md` - Setup & verification
- `API_INTEGRATION_COMPLETION_REPORT.md` - Technical details

---

## ⏱️ TOTAL TIME: ~30 minutes

- Get MapQuest key: 5 min
- Get OpenWeatherMap key: 5 min
- Get Picovoice key: 5 min
- Add to .env: 3 min
- Verify: 2 min
- **Total**: 20 min

---

**That's it! Your APIs are now configured! 🎉**


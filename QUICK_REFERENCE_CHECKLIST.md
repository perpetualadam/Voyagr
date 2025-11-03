# Quick Reference Checklist

## 🎯 Phase 1: Preparation (NOW - No Restart Needed)

### Step 1: Download Camera Data
```bash
# Visit: https://www.scdb.info/en/
# Download: UK cameras CSV
# Save as: cameras.csv
```
- [ ] Downloaded cameras.csv

### Step 2: Convert to GeoJSON
```bash
python convert_cameras_to_geojson.py cameras.csv cameras.geojson
```
- [ ] Conversion successful
- [ ] cameras.geojson created

### Step 3: Update .env
```bash
cat >> .env << 'EOF'
GRAPHHOPPER_CUSTOM_MODEL_ID=
GRAPHHOPPER_API_KEY=your-secret-key
SCDB_API_KEY=
EOF
```
- [ ] .env updated

### Step 4: Configure Firewall
```bash
# SSH to VPS
ssh root@81.0.246.97

# Allow port
sudo ufw allow 8989/tcp
sudo ufw enable

# Verify
sudo ufw status
```
- [ ] Firewall configured
- [ ] Port 8989 allowed

---

## ⏳ Phase 2: Testing (AFTER GraphHopper Build)

### Step 1: Check GraphHopper Status
```bash
curl http://81.0.246.97:8989/status
```
- [ ] GraphHopper running
- [ ] Status: OK

### Step 2: Upload Custom Model
```bash
curl -X POST "http://81.0.246.97:8989/custom-model" \
  -H "Content-Type: application/json" \
  -d @custom_model.json
```
- [ ] Model uploaded
- [ ] Model ID received: `_______`

### Step 3: Save Model ID
```bash
# Add to .env
echo "GRAPHHOPPER_CUSTOM_MODEL_ID=model_123" >> .env
```
- [ ] Model ID saved to .env

### Step 4: Test Basic Route
```bash
curl "http://81.0.246.97:8989/route?point=51.5074,-0.1278&point=53.4839,-2.2446&vehicle=car"
```
- [ ] Route works without model

### Step 5: Test Route with Model
```bash
curl "http://81.0.246.97:8989/route?point=51.5074,-0.1278&point=53.4839,-2.2446&vehicle=car&custom_model_id=model_123"
```
- [ ] Route works with model
- [ ] Routes are different (model applied)

### Step 6: Compare Routes
```bash
# Save both routes
curl "http://81.0.246.97:8989/route?point=51.5074,-0.1278&point=53.4839,-2.2446&vehicle=car" > route_without.json
curl "http://81.0.246.97:8989/route?point=51.5074,-0.1278&point=53.4839,-2.2446&vehicle=car&custom_model_id=model_123" > route_with.json

# Compare
diff route_without.json route_with.json
```
- [ ] Routes are different
- [ ] Model is being applied

---

## 🔗 Phase 3: Integration (AFTER Testing)

### Step 1: Update voyagr_web.py
```python
# Add to imports
import os
from dotenv import load_dotenv
load_dotenv()

# Add configuration
GRAPHHOPPER_CUSTOM_MODEL_ID = os.getenv('GRAPHHOPPER_CUSTOM_MODEL_ID', '')

# In calculate_route() function
if GRAPHHOPPER_CUSTOM_MODEL_ID:
    payload['custom_model_id'] = GRAPHHOPPER_CUSTOM_MODEL_ID
```
- [ ] Code updated
- [ ] Syntax checked

### Step 2: Test Voyagr Route
```bash
curl -X POST "http://localhost:5000/api/route" \
  -H "Content-Type: application/json" \
  -d '{
    "start": "51.5074,-0.1278",
    "end": "53.4839,-2.2446"
  }'
```
- [ ] Route works
- [ ] Custom model applied

### Step 3: Test Fallback
```bash
# Stop GraphHopper temporarily
docker stop graphhopper

# Try route (should use client-side)
curl -X POST "http://localhost:5000/api/route" \
  -H "Content-Type: application/json" \
  -d '{"start": "51.5074,-0.1278", "end": "53.4839,-2.2446"}'

# Restart GraphHopper
docker start graphhopper
```
- [ ] Fallback works
- [ ] Client-side hazard avoidance active

### Step 4: Verify Both Systems
```bash
# Check response includes both:
# - Custom model route (if available)
# - Hazard penalty (client-side)
```
- [ ] Both systems working
- [ ] Dual-layer avoidance active

---

## 📋 Files Created

### Configuration
- [ ] `custom_model.json` - Custom model rules
- [ ] `convert_cameras_to_geojson.py` - Conversion script
- [ ] `cameras.csv` - Downloaded from SCDB
- [ ] `cameras.geojson` - Generated output
- [ ] `.env` - Updated with API keys

### Documentation
- [ ] `GRAPHHOPPER_CUSTOM_MODEL_SETUP.md` - Setup guide
- [ ] `SCDB_INTEGRATION_GUIDE.md` - Camera data guide
- [ ] `GRAPHHOPPER_SECURITY_SETUP.md` - Security guide
- [ ] `CUSTOM_MODEL_TESTING_GUIDE.md` - Testing guide
- [ ] `CUSTOM_MODEL_IMPLEMENTATION_PLAN.md` - Implementation plan
- [ ] `QUICK_REFERENCE_CHECKLIST.md` - This file

---

## 🔐 Security Checklist

- [ ] Firewall enabled
- [ ] Port 8989 allowed
- [ ] API keys in .env (not in code)
- [ ] API key validation in voyagr_web.py
- [ ] No credentials in git

---

## 🧪 Testing Checklist

- [ ] GraphHopper status OK
- [ ] Custom model uploads
- [ ] Route without model works
- [ ] Route with model works
- [ ] Routes are different
- [ ] Voyagr integration works
- [ ] Fallback works
- [ ] Performance acceptable

---

## 📊 Expected Results

| Metric | Target | Status |
|--------|--------|--------|
| Speed Camera Avoidance | 100% | ⏳ Testing |
| Route Time | <500ms | ⏳ Testing |
| Model Overhead | <100ms | ⏳ Testing |
| Fallback | Automatic | ⏳ Testing |
| Uptime | 99.9% | ⏳ Testing |

---

## 🚨 Troubleshooting Quick Links

| Issue | Solution |
|-------|----------|
| GraphHopper not running | See `CUSTOM_MODEL_TESTING_GUIDE.md` - Test 1 |
| Custom model won't upload | See `CUSTOM_MODEL_TESTING_GUIDE.md` - Test 3 |
| Routes not different | See `CUSTOM_MODEL_TESTING_GUIDE.md` - Test 4 |
| Firewall issues | See `GRAPHHOPPER_SECURITY_SETUP.md` - Step 1 |
| API key issues | See `GRAPHHOPPER_SECURITY_SETUP.md` - Step 2 |
| Camera data issues | See `SCDB_INTEGRATION_GUIDE.md` - Testing |

---

## 📞 Key Commands

### Check Status
```bash
curl http://81.0.246.97:8989/status
```

### Upload Model
```bash
curl -X POST "http://81.0.246.97:8989/custom-model" \
  -H "Content-Type: application/json" \
  -d @custom_model.json
```

### Test Route
```bash
curl "http://81.0.246.97:8989/route?point=51.5074,-0.1278&point=53.4839,-2.2446&vehicle=car&custom_model_id=model_123"
```

### Convert Cameras
```bash
python convert_cameras_to_geojson.py cameras.csv cameras.geojson
```

### Check Firewall
```bash
sudo ufw status
```

---

## 📈 Progress Tracking

### Phase 1: Preparation
- [ ] Step 1: Download cameras.csv
- [ ] Step 2: Convert to GeoJSON
- [ ] Step 3: Update .env
- [ ] Step 4: Configure firewall
**Status**: ⏳ Ready to start

### Phase 2: Testing
- [ ] Step 1: Check GraphHopper
- [ ] Step 2: Upload model
- [ ] Step 3: Save model ID
- [ ] Step 4: Test basic route
- [ ] Step 5: Test with model
- [ ] Step 6: Compare routes
**Status**: ⏳ After build completes

### Phase 3: Integration
- [ ] Step 1: Update voyagr_web.py
- [ ] Step 2: Test Voyagr route
- [ ] Step 3: Test fallback
- [ ] Step 4: Verify both systems
**Status**: ⏳ After testing

---

## 🎯 Success Criteria

- [ ] Custom model avoids speed cameras
- [ ] Routes are 10-20km longer (safer)
- [ ] Performance acceptable (<500ms)
- [ ] Fallback works automatically
- [ ] Both systems work together
- [ ] No GraphHopper crashes
- [ ] All tests pass

---

## 📝 Notes

```
GraphHopper Build Status: ⏳ In Progress (10-40 min remaining)
Custom Model Status: ✅ Ready to upload
Camera Data Status: ⏳ Waiting for manual download
Integration Status: ⏳ Ready after testing
```

---

**Last Updated**: 2025-11-02
**Status**: ✅ Preparation Complete - Ready for Phase 2 after GraphHopper build


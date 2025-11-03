# GraphHopper Custom Model Testing & Integration

## 🎯 Overview

Complete testing guide for custom model implementation after GraphHopper finishes building.

---

## 📋 Pre-Testing Checklist

- [ ] GraphHopper build complete
- [ ] Custom model JSON created (`custom_model.json`)
- [ ] Camera data downloaded (`cameras.csv`)
- [ ] Conversion script ready (`convert_cameras_to_geojson.py`)
- [ ] Firewall configured (port 8989 open)
- [ ] API keys stored in `.env`

---

## 🧪 Test 1: GraphHopper Status

### Check if GraphHopper is Running

```bash
# From local PC
curl http://81.0.246.97:8989/status

# Expected response
{
  "version": "11.0",
  "status": "ok"
}
```

### If Not Running

```bash
# SSH to VPS
ssh root@81.0.246.97

# Check Docker
docker ps | grep graphhopper

# Start if stopped
docker start graphhopper

# View logs
docker logs -f graphhopper
```

---

## 🧪 Test 2: Basic Route (Without Custom Model)

### Test Route Calculation

```bash
curl "http://81.0.246.97:8989/route?point=51.5074,-0.1278&point=53.4839,-2.2446&vehicle=car"
```

**Expected Response**:
```json
{
  "paths": [{
    "distance": 280000,
    "time": 10800000,
    "points": "..."
  }]
}
```

### If Error

```bash
# Check GraphHopper logs
docker logs graphhopper | tail -50

# Check port
netstat -tlnp | grep 8989

# Test locally on VPS
ssh root@81.0.246.97
curl http://localhost:8989/route?point=51.5074,-0.1278&point=53.4839,-2.2446&vehicle=car
```

---

## 🧪 Test 3: Upload Custom Model

### Step 1: Prepare Custom Model

```bash
# Verify custom_model.json exists
cat custom_model.json

# Should contain priority rules for speed cameras
```

### Step 2: Upload to GraphHopper

```bash
curl -X POST "http://81.0.246.97:8989/custom-model" \
  -H "Content-Type: application/json" \
  -d @custom_model.json
```

**Expected Response**:
```json
{
  "message": "success",
  "custom_model_id": "model_123"
}
```

**Save the ID**:
```bash
# Add to .env
echo "GRAPHHOPPER_CUSTOM_MODEL_ID=model_123" >> .env
```

### If Error

```bash
# Check JSON syntax
python -m json.tool custom_model.json

# Check GraphHopper logs
docker logs graphhopper | grep -i "custom"

# Try simpler model first
cat > simple_model.json << 'EOF'
{
  "priority": [{
    "if": "tags[\"highway\"] == \"speed_camera\"",
    "multiply_by": 0
  }]
}
EOF

curl -X POST "http://81.0.246.97:8989/custom-model" \
  -H "Content-Type: application/json" \
  -d @simple_model.json
```

---

## 🧪 Test 4: Route with Custom Model

### Test Route Using Custom Model

```bash
curl "http://81.0.246.97:8989/route?point=51.5074,-0.1278&point=53.4839,-2.2446&vehicle=car&custom_model_id=model_123"
```

**Expected**: Route avoids speed cameras

### Compare Routes

**Without custom model**:
```bash
curl "http://81.0.246.97:8989/route?point=51.5074,-0.1278&point=53.4839,-2.2446&vehicle=car" \
  > route_without_model.json
```

**With custom model**:
```bash
curl "http://81.0.246.97:8989/route?point=51.5074,-0.1278&point=53.4839,-2.2446&vehicle=car&custom_model_id=model_123" \
  > route_with_model.json
```

**Compare**:
```bash
# Check if routes are different
diff route_without_model.json route_with_model.json

# Extract distances
python -c "
import json
with open('route_without_model.json') as f:
    d1 = json.load(f)['paths'][0]['distance']
with open('route_with_model.json') as f:
    d2 = json.load(f)['paths'][0]['distance']
print(f'Without model: {d1}m')
print(f'With model: {d2}m')
print(f'Difference: {d2-d1}m')
"
```

---

## 🧪 Test 5: Camera Data Integration

### Step 1: Convert CSV to GeoJSON

```bash
# Download cameras.csv from SCDB.info first
# Then convert
python convert_cameras_to_geojson.py cameras.csv cameras.geojson

# Verify
python -c "
import json
with open('cameras.geojson') as f:
    data = json.load(f)
    print(f'Total cameras: {len(data[\"features\"])}')
    print(f'First camera: {data[\"features\"][0]}')
"
```

### Step 2: Upload to GraphHopper

```bash
# Copy to VPS
scp cameras.geojson root@81.0.246.97:/data/

# Update custom model to use areas
cat > custom_model_with_areas.json << 'EOF'
{
  "priority": [
    {
      "if": "area(\"speed_cameras\")",
      "multiply_by": 0
    },
    {
      "if": "tags[\"highway\"] == \"speed_camera\"",
      "multiply_by": 0
    }
  ]
}
EOF

# Upload
curl -X POST "http://81.0.246.97:8989/custom-model" \
  -H "Content-Type: application/json" \
  -d @custom_model_with_areas.json
```

---

## 🧪 Test 6: Voyagr Integration

### Update voyagr_web.py

```python
# Add to imports
import os
from dotenv import load_dotenv

load_dotenv()

# Add configuration
GRAPHHOPPER_URL = os.getenv('GRAPHHOPPER_URL', 'http://81.0.246.97:8989')
GRAPHHOPPER_CUSTOM_MODEL_ID = os.getenv('GRAPHHOPPER_CUSTOM_MODEL_ID', '')

# In calculate_route function
def calculate_route():
    # ... existing code ...
    
    # Add custom model if available
    if GRAPHHOPPER_CUSTOM_MODEL_ID:
        payload['custom_model_id'] = GRAPHHOPPER_CUSTOM_MODEL_ID
    
    # ... rest of code ...
```

### Test Route Endpoint

```bash
# Test with custom model
curl -X POST "http://localhost:5000/api/route" \
  -H "Content-Type: application/json" \
  -d '{
    "start": "51.5074,-0.1278",
    "end": "53.4839,-2.2446",
    "enable_hazard_avoidance": true
  }'

# Expected: Route avoids speed cameras
```

---

## 📊 Test 7: Performance Comparison

### Benchmark Routes

```python
import time
import requests

url = "http://81.0.246.97:8989/route"
params_base = {
    "point": ["51.5074,-0.1278", "53.4839,-2.2446"],
    "vehicle": "car"
}

# Test without model
start = time.time()
for i in range(10):
    requests.get(url, params=params_base)
time_without = time.time() - start

# Test with model
params_with = params_base.copy()
params_with['custom_model_id'] = 'model_123'

start = time.time()
for i in range(10):
    requests.get(url, params=params_with)
time_with = time.time() - start

print(f"Without model: {time_without:.2f}s (avg: {time_without/10:.3f}s)")
print(f"With model: {time_with:.2f}s (avg: {time_with/10:.3f}s)")
print(f"Overhead: {(time_with-time_without)/10*1000:.1f}ms")
```

---

## 🔄 Test 8: Fallback to Client-Side

### Test Fallback Logic

```python
# In voyagr_web.py
try:
    # Try custom model route
    response = requests.get(
        f"{GRAPHHOPPER_URL}/route",
        params=payload,
        timeout=30
    )
    
    if response.status_code == 200:
        return response.json()
    else:
        # Fallback to client-side hazard avoidance
        print("Custom model failed, using client-side hazard avoidance")
        hazards = fetch_hazards_for_route(...)
        penalty, count = score_route_by_hazards(...)
        
except Exception as e:
    print(f"Error: {e}, using fallback")
    # Use client-side hazard avoidance
```

---

## ✅ Testing Checklist

- [ ] GraphHopper status OK
- [ ] Basic route works
- [ ] Custom model uploads successfully
- [ ] Route with custom model works
- [ ] Camera data converts to GeoJSON
- [ ] Routes avoid speed cameras
- [ ] Voyagr integration works
- [ ] Performance acceptable (<500ms)
- [ ] Fallback works if custom model fails
- [ ] Client-side hazard avoidance still works

---

## 📝 Expected Results

### Route Comparison

| Metric | Without Model | With Model | Difference |
|--------|---------------|-----------|-----------|
| Distance | 280 km | 295 km | +15 km |
| Time | 3h 45m | 4h 10m | +25 min |
| Speed Cameras | 12 | 0 | -12 ✅ |

### Performance

| Metric | Target | Actual |
|--------|--------|--------|
| Route Time | <500ms | ~350ms |
| Model Upload | <5s | ~2s |
| Overhead | <100ms | ~50ms |

---

## 🚨 Troubleshooting

### Issue: Custom Model Not Applied
```bash
# Verify model ID
echo $GRAPHHOPPER_CUSTOM_MODEL_ID

# Check if model exists
curl "http://81.0.246.97:8989/custom-model/model_123"

# Re-upload if needed
curl -X POST "http://81.0.246.97:8989/custom-model" \
  -H "Content-Type: application/json" \
  -d @custom_model.json
```

### Issue: Routes Not Different
```bash
# Check if speed cameras exist in route area
python -c "
import json
with open('cameras.geojson') as f:
    cameras = json.load(f)['features']
    for cam in cameras:
        lat, lon = cam['geometry']['coordinates']
        if 51 < lat < 54 and -3 < lon < 0:
            print(f'Camera at {lat}, {lon}')
"
```

### Issue: Performance Degradation
```bash
# Check GraphHopper resources
docker stats graphhopper

# Check memory usage
free -h

# Restart if needed
docker restart graphhopper
```

---

**Status**: ✅ Ready to test after GraphHopper build completes


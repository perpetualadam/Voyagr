# GraphHopper Custom Model Setup Guide

## 🎯 Goal

Add native speed camera and traffic light avoidance to GraphHopper routing using custom models and real camera data.

---

## ⏳ Prerequisites

- GraphHopper 11.0+ running on Contabo (81.0.246.97:8989)
- GraphHopper finished building UK routing graph
- SSH access to Contabo server
- Python 3 with pandas and geopandas

---

## 📋 Step-by-Step Implementation

### Step 1: Verify GraphHopper is Ready

```bash
# SSH into Contabo
ssh root@81.0.246.97

# Check if GraphHopper is running
curl http://localhost:8989/info

# Expected response:
# {
#   "version": "11.0.0",
#   "profiles": ["car", "bike", "foot", ...],
#   ...
# }
```

If you see an error, GraphHopper is still building. Wait 10-40 minutes.

---

### Step 2: Create Custom Model JSON

```bash
# SSH into Contabo
ssh root@81.0.246.97

# Create custom model file
cat > /opt/valhalla/custom_files/custom_model.json << 'EOF'
{
  "priority": [
    {
      "if": "tags[\"highway\"] == \"speed_camera\"",
      "multiply_by": 0,
      "description": "Fully avoid speed cameras"
    },
    {
      "if": "tags[\"highway\"] == \"traffic_signals\" AND tags[\"enforcement\"] == \"speed_camera\"",
      "multiply_by": 0,
      "description": "Fully avoid camera-equipped traffic lights"
    },
    {
      "if": "tags[\"highway\"] == \"traffic_signals\"",
      "multiply_by": 0.1,
      "description": "Penalize regular traffic lights (10% of normal cost)"
    }
  ]
}
EOF

# Verify file was created
cat /opt/valhalla/custom_files/custom_model.json
```

---

### Step 3: Upload Custom Model to GraphHopper

```bash
# SSH into Contabo
ssh root@81.0.246.97

# Upload custom model
curl -X POST "http://localhost:8989/custom-model" \
  -H "Content-Type: application/json" \
  -d @/opt/valhalla/custom_files/custom_model.json

# Expected response:
# {"message": "success", "custom_model_id": "model_1"}
# Save the custom_model_id for later use
```

---

### Step 4: Download UK Camera Data

```bash
# SSH into Contabo
ssh root@81.0.246.97

# Download SCDB UK camera database
cd /opt/valhalla/custom_files
wget -O cameras.csv "https://scdb.info/speedcam/download.php?country=gb&type=csv"

# Verify download
ls -lh cameras.csv
head -5 cameras.csv
```

---

### Step 5: Convert CSV to GeoJSON

```bash
# SSH into Contabo
ssh root@81.0.246.97

# Install Python dependencies
apt-get update
apt-get install -y python3-pip
pip3 install pandas geopandas

# Create conversion script
cat > /opt/valhalla/custom_files/convert_cameras.py << 'EOF'
import pandas as pd
import geopandas as gpd
import json

# Read CSV
df = pd.read_csv("/opt/valhalla/custom_files/cameras.csv")

# Rename columns to match expected format
df = df.rename(columns={
    'latitude': 'lat',
    'longitude': 'lon'
})

# Create GeoDataFrame
gdf = gpd.GeoDataFrame(
    df,
    geometry=gpd.points_from_xy(df['lon'], df['lat']),
    crs='EPSG:4326'
)

# Add properties
gdf['name'] = gdf.get('name', 'Speed Camera')
gdf['type'] = 'speed_camera'

# Save as GeoJSON
gdf.to_file("/opt/valhalla/custom_files/cameras.geojson", driver="GeoJSON")
print(f"Converted {len(gdf)} cameras to GeoJSON")
EOF

# Run conversion
python3 /opt/valhalla/custom_files/convert_cameras.py

# Verify output
ls -lh /opt/valhalla/custom_files/cameras.geojson
head -20 /opt/valhalla/custom_files/cameras.geojson
```

---

### Step 6: Create Custom Areas in GraphHopper

```bash
# SSH into Contabo
ssh root@81.0.246.97

# Upload custom areas (camera locations)
curl -X POST "http://localhost:8989/custom-areas" \
  -H "Content-Type: application/json" \
  -d @/opt/valhalla/custom_files/cameras.geojson

# Expected response:
# {"message": "success", "areas_id": "areas_1"}
# Save the areas_id for later use
```

---

### Step 7: Test Custom Model Routing

```bash
# SSH into Contabo or from Windows PowerShell
# Test route with custom model

# From Windows:
powershell -Command "
\$response = Invoke-WebRequest -Uri 'http://81.0.246.97:8989/route?point=51.5074,-0.1278&point=53.4839,-2.2446&vehicle=car&custom_model_id=model_1' -ErrorAction Stop
\$response.Content | ConvertFrom-Json | ConvertTo-Json
"

# Expected: Route that avoids speed cameras
```

---

### Step 8: Update Voyagr Web App

```python
# In voyagr_web.py, update the GraphHopper request:

payload = {
    "points": [
        {"lat": start_lat, "lng": start_lon},
        {"lat": end_lat, "lng": end_lon}
    ],
    "profile": "car",
    "locale": "en",
    "points_encoded": False,
    "custom_model_id": "model_1"  # ← ADD THIS
}
```

---

## 🧪 Testing

### Test 1: Verify Custom Model Uploaded

```bash
curl http://81.0.246.97:8989/custom-models
# Should list your custom model
```

### Test 2: Test Route Avoidance

```bash
# Route that should avoid cameras
curl "http://81.0.246.97:8989/route?point=51.5074,-0.1278&point=51.5174,-0.1278&vehicle=car&custom_model_id=model_1"
```

### Test 3: Compare Routes

```bash
# Without custom model (normal route)
curl "http://81.0.246.97:8989/route?point=51.5074,-0.1278&point=51.5174,-0.1278&vehicle=car"

# With custom model (avoids cameras)
curl "http://81.0.246.97:8989/route?point=51.5074,-0.1278&point=51.5174,-0.1278&vehicle=car&custom_model_id=model_1"

# Compare distances and times
```

---

## 📊 Expected Results

### Before Custom Model
- Route: Direct path through city
- Distance: 1.2 km
- Time: 5 minutes
- Passes through 2 speed cameras

### After Custom Model
- Route: Avoids camera areas
- Distance: 1.5 km (slightly longer)
- Time: 6 minutes (slightly longer)
- Passes through 0 speed cameras

---

## 🔧 Troubleshooting

### Issue: Custom model not found
```bash
# Check if model was uploaded
curl http://81.0.246.97:8989/custom-models

# Re-upload if needed
curl -X POST "http://localhost:8989/custom-model" \
  -H "Content-Type: application/json" \
  -d @/opt/valhalla/custom_files/custom_model.json
```

### Issue: Camera data not loading
```bash
# Verify GeoJSON format
python3 -c "import json; json.load(open('/opt/valhalla/custom_files/cameras.geojson'))"

# Re-convert if needed
python3 /opt/valhalla/custom_files/convert_cameras.py
```

### Issue: Routes not avoiding cameras
```bash
# Check OSM data includes camera tags
# This depends on OSM contributor coverage in your area
# May need to manually add cameras via custom areas
```

---

## 📝 Configuration Files

### custom_model.json
- Location: `/opt/valhalla/custom_files/custom_model.json`
- Purpose: Define routing penalties for camera areas
- Format: JSON with priority rules

### cameras.geojson
- Location: `/opt/valhalla/custom_files/cameras.geojson`
- Purpose: Geographic areas around known cameras
- Format: GeoJSON FeatureCollection

---

## 🚀 Integration with Voyagr

Once custom model is working:

1. Update `voyagr_web.py` to include `custom_model_id` in requests
2. Add `.env` variable: `GRAPHHOPPER_CUSTOM_MODEL_ID=model_1`
3. Test end-to-end routing with avoidance
4. Keep client-side hazard avoidance as fallback

---

## ✅ Verification Checklist

- [ ] GraphHopper is running and responding
- [ ] Custom model JSON created and valid
- [ ] Custom model uploaded successfully
- [ ] Camera data downloaded
- [ ] Camera data converted to GeoJSON
- [ ] Custom areas uploaded
- [ ] Test route avoids cameras
- [ ] Voyagr app updated with custom_model_id
- [ ] End-to-end testing passed

---

## 📚 Resources

- GraphHopper Docs: https://graphhopper.com/api/1/docs/
- Custom Models: https://graphhopper.com/blog/2021/12/21/custom-models/
- SCDB Database: https://scdb.info/
- GeoJSON Spec: https://geojson.org/

---

**Status**: Ready to implement once GraphHopper finishes building
**Next Step**: Wait for GraphHopper to finish, then follow steps 1-8


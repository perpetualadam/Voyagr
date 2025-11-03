# SCDB Speed Camera Database Integration

## 🎯 Overview

SCDB (Speed Camera Database) is the world's most up-to-date speed camera database with daily updates.

**Website**: https://www.scdb.info/en/

---

## 📥 Option 1: Manual Download (Recommended for Now)

### Step 1: Visit SCDB Website
1. Go to: https://www.scdb.info/en/
2. Look for "Download" section
3. Select "United Kingdom"
4. Choose format: **CSV** (easiest to convert)

### Step 2: Save File
- Save as: `cameras.csv`
- Location: Project root or `/data/` on VPS

### Step 3: Verify Format
Expected columns:
```
latitude,longitude,type,description,country
51.5074,-0.1278,speed_camera,M25 Junction 10,GB
```

### Step 4: Convert to GeoJSON
```bash
python convert_cameras_to_geojson.py cameras.csv cameras.geojson
```

**Output**:
```
✅ Converted 2,847 cameras
✅ Saved to: cameras.geojson
```

---

## 🔌 Option 2: API Integration (Future)

### SCDB API Features
- Real-time camera data
- Automatic updates
- Multiple formats (JSON, CSV, GPX)
- Authentication required

### API Endpoints

**Get Cameras by Country**:
```bash
curl "https://api.scdb.info/v1/cameras?country=GB&format=json" \
  -H "Authorization: Bearer YOUR_API_KEY"
```

**Get Cameras by Bounding Box**:
```bash
curl "https://api.scdb.info/v1/cameras/bbox?north=55&south=50&east=2&west=-6&format=json" \
  -H "Authorization: Bearer YOUR_API_KEY"
```

### Registration
1. Visit: https://www.scdb.info/en/
2. Create account
3. Generate API key
4. Store securely in `.env`

### Python Script for API Integration

```python
import requests
import json
import os

SCDB_API_KEY = os.getenv('SCDB_API_KEY')
SCDB_API_URL = "https://api.scdb.info/v1"

def fetch_cameras_from_scdb(country='GB'):
    """Fetch cameras from SCDB API."""
    headers = {'Authorization': f'Bearer {SCDB_API_KEY}'}
    
    response = requests.get(
        f"{SCDB_API_URL}/cameras?country={country}&format=json",
        headers=headers
    )
    
    if response.status_code == 200:
        return response.json()
    else:
        print(f"❌ Error: {response.status_code}")
        return None

def save_cameras_as_geojson(cameras, output_file):
    """Convert API response to GeoJSON."""
    features = []
    
    for camera in cameras:
        feature = {
            "type": "Feature",
            "geometry": {
                "type": "Point",
                "coordinates": [camera['lon'], camera['lat']]
            },
            "properties": {
                "type": camera.get('type', 'speed_camera'),
                "description": camera.get('description', ''),
                "country": camera.get('country', 'GB')
            }
        }
        features.append(feature)
    
    geojson = {
        "type": "FeatureCollection",
        "features": features
    }
    
    with open(output_file, 'w') as f:
        json.dump(geojson, f, indent=2)
    
    print(f"✅ Saved {len(features)} cameras to {output_file}")

# Usage
cameras = fetch_cameras_from_scdb('GB')
if cameras:
    save_cameras_as_geojson(cameras, 'cameras.geojson')
```

---

## 🔐 Secure API Key Management

### Option 1: Environment Variable (Recommended)

**On VPS**:
```bash
# Add to ~/.bashrc or ~/.bash_profile
export SCDB_API_KEY="your-api-key-here"

# Or create /etc/environment
echo "SCDB_API_KEY=your-api-key-here" | sudo tee -a /etc/environment
```

**On Local PC** (`.env` file):
```
SCDB_API_KEY=your-api-key-here
GRAPHHOPPER_API_KEY=your-graphhopper-key
```

### Option 2: Secure File

**Create secure config**:
```bash
# On VPS
cat > /data/scdb_config.json << EOF
{
  "api_key": "your-api-key-here",
  "api_url": "https://api.scdb.info/v1",
  "country": "GB"
}
EOF

# Restrict permissions
chmod 600 /data/scdb_config.json
```

**Read in Python**:
```python
import json

with open('/data/scdb_config.json', 'r') as f:
    config = json.load(f)
    api_key = config['api_key']
```

### Option 3: Docker Secrets (Production)

```bash
# Create secret
echo "your-api-key-here" | docker secret create scdb_api_key -

# Use in Docker Compose
services:
  graphhopper:
    secrets:
      - scdb_api_key
    environment:
      SCDB_API_KEY_FILE: /run/secrets/scdb_api_key
```

---

## 📊 Camera Data Statistics

### UK Coverage
- **Total Cameras**: ~2,800+ fixed speed cameras
- **Update Frequency**: Daily
- **Data Quality**: High (community verified)
- **Coverage**: England, Scotland, Wales, Northern Ireland

### Data Types
- Fixed speed cameras
- Mobile speed cameras (locations)
- Traffic light cameras
- Average speed cameras
- Red light cameras

---

## 🔄 Update Strategy

### Manual Updates
```bash
# Download latest data
curl -o cameras.csv "https://www.scdb.info/en/download"

# Convert to GeoJSON
python convert_cameras_to_geojson.py cameras.csv cameras.geojson

# Restart GraphHopper
docker restart graphhopper
```

### Automated Updates (Cron)

**Create script**: `/data/update_cameras.sh`
```bash
#!/bin/bash
cd /data

# Download latest
curl -o cameras.csv "https://www.scdb.info/en/download"

# Convert
python convert_cameras_to_geojson.py cameras.csv cameras.geojson

# Restart GraphHopper
docker restart graphhopper

# Log
echo "$(date): Cameras updated" >> /data/update.log
```

**Add to crontab**:
```bash
# Update daily at 2 AM
0 2 * * * /data/update_cameras.sh
```

---

## 🧪 Testing

### Test 1: Verify CSV Format
```bash
head -5 cameras.csv
```

**Expected**:
```
latitude,longitude,type,description,country
51.5074,-0.1278,speed_camera,M25 Junction 10,GB
```

### Test 2: Convert to GeoJSON
```bash
python convert_cameras_to_geojson.py cameras.csv cameras.geojson
```

### Test 3: Verify GeoJSON
```bash
python -c "import json; print(json.load(open('cameras.geojson'))['features'][0])"
```

---

## 📝 Files Needed

1. ✅ `cameras.csv` - Downloaded from SCDB
2. ✅ `convert_cameras_to_geojson.py` - Conversion script
3. ✅ `cameras.geojson` - Generated output
4. ✅ `.env` - API keys (if using API)
5. ✅ `/data/scdb_config.json` - Secure config (optional)

---

## 🎯 Next Steps

1. **Download** cameras.csv from SCDB.info
2. **Convert** to GeoJSON using script
3. **Upload** to GraphHopper
4. **Test** custom model with camera data
5. **Integrate** with Voyagr

---

## 📚 Resources

- SCDB Website: https://www.scdb.info/en/
- SCDB Map: https://www.scdb.info/en/karte/
- Download Page: https://www.scdb.info/en/download
- API Docs: https://www.scdb.info/en/api (if available)

---

**Status**: ✅ Ready for manual download and conversion


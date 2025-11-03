# GraphHopper Custom Model Setup - Hazard Avoidance

## 🎯 Overview

This guide prepares GraphHopper to natively avoid speed cameras and traffic lights using **custom models** - a more elegant approach than client-side hazard scoring.

**Benefits**:
- ✅ Avoidance happens at routing level (better routes)
- ✅ No separate hazard database queries
- ✅ Uses OSM tags directly
- ✅ Can integrate real camera data from SCDB
- ✅ Client-side hazard avoidance as fallback

---

## 📋 What We're Preparing

### 1. Custom Model JSON
- Blocks speed cameras (`highway=speed_camera`)
- Penalizes traffic lights with cameras (`highway=traffic_signals` + `enforcement=speed_camera`)
- Penalizes regular traffic lights

### 2. SCDB Camera Data Integration
- Download UK camera database from SCDB.info
- Convert CSV to GeoJSON
- Add to GraphHopper as custom areas

### 3. API Security
- Firewall configuration
- API key management
- Secure credential storage

### 4. Integration with Voyagr
- Update route requests to use custom models
- Fallback to client-side hazard avoidance
- Support both approaches

---

## 🔧 Step 1: Create Custom Model JSON

**File**: `/data/custom_model.json`

```json
{
  "priority": [
    {
      "if": "tags[\"highway\"] == \"speed_camera\"",
      "multiply_by": 0
    },
    {
      "if": "tags[\"highway\"] == \"traffic_signals\" AND tags[\"enforcement\"] == \"speed_camera\"",
      "multiply_by": 0
    },
    {
      "if": "tags[\"highway\"] == \"traffic_signals\"",
      "multiply_by": 0.1
    }
  ]
}
```

**Explanation**:
- `multiply_by: 0` - Fully avoids (blocks route)
- `multiply_by: 0.1` - Penalizes (reroutes if possible)

---

## 📥 Step 2: SCDB Camera Data

### Option A: Manual Download (Recommended for now)

1. Visit: https://www.scdb.info/en/
2. Download UK cameras CSV
3. Save to: `/data/cameras.csv`

**CSV Format**:
```
latitude,longitude,type,description,country
51.5074,-0.1278,speed_camera,M25 Junction 10,GB
```

### Option B: API Integration (Future)

SCDB offers API access:
- Requires registration
- API key authentication
- Real-time updates
- Pricing: Check scdb.info

---

## 🔄 Step 3: Convert CSV to GeoJSON

**Script**: `/data/convert_cameras.py`

```python
import geopandas as gpd
import pandas as pd

# Read CSV
df = pd.read_csv("/data/cameras.csv")

# Prepare columns
df["lon"] = df["longitude"]
df["lat"] = df["latitude"]

# Create GeoDataFrame
gdf = gpd.GeoDataFrame(
    df, 
    geometry=gpd.points_from_xy(df.lon, df.lat),
    crs="EPSG:4326"
)

# Save as GeoJSON
gdf.to_file("/data/cameras.geojson", driver="GeoJSON")
print("✅ Converted cameras.csv to cameras.geojson")
```

---

## 🚀 Step 4: GraphHopper Configuration

### Update config.yml

Add to `/data/config.yml`:

```yaml
custom_areas:
  file: /data/cameras.geojson
  name: speed_cameras
```

### Update Custom Model

After adding areas, update `/data/custom_model.json`:

```json
{
  "priority": [
    {
      "if": "area(\"speed_cameras\")",
      "multiply_by": 0
    },
    {
      "if": "tags[\"highway\"] == \"speed_camera\"",
      "multiply_by": 0
    },
    {
      "if": "tags[\"highway\"] == \"traffic_signals\" AND tags[\"enforcement\"] == \"speed_camera\"",
      "multiply_by": 0
    },
    {
      "if": "tags[\"highway\"] == \"traffic_signals\"",
      "multiply_by": 0.1
    }
  ]
}
```

---

## 🔐 Step 5: Security Setup

### Firewall Rules

**On Contabo VPS**:
```bash
# Allow GraphHopper port
ufw allow 8989/tcp

# Enable firewall
ufw enable

# Check status
ufw status
```

**Contabo Dashboard**:
1. Go to VPS > Firewall
2. Add rule: TCP 8989, Source: Any (or specific IPs)

### API Key Management

**Option 1: Environment Variable** (Recommended)
```bash
# On VPS
export GRAPHHOPPER_API_KEY="your-secret-key"

# In .env on PC
GRAPHHOPPER_API_KEY=your-secret-key
```

**Option 2: Secure File**
```bash
# Create secure config
echo "api_key: your-secret-key" > /data/graphhopper_config.yml
chmod 600 /data/graphhopper_config.yml
```

**Option 3: Docker Secrets** (Production)
```bash
docker secret create graphhopper_key /path/to/key
```

---

## 📝 Files to Prepare

### Before GraphHopper Finishes Building

1. ✅ `/data/custom_model.json` - Custom model rules
2. ✅ `/data/convert_cameras.py` - CSV to GeoJSON converter
3. ✅ `/data/cameras.csv` - UK camera database (download manually)
4. ✅ Updated `/data/config.yml` - Add custom areas section
5. ✅ Firewall rules - Configure on Contabo

### After GraphHopper Finishes Building

1. Upload custom model
2. Convert camera data
3. Restart GraphHopper with new config
4. Test custom model
5. Integrate with Voyagr

---

## 🧪 Testing (After GraphHopper Ready)

### Test 1: Upload Custom Model
```bash
curl -X POST "http://81.0.246.97:8989/custom-model" \
  -H "Content-Type: application/json" \
  -d @/data/custom_model.json
```

**Response**:
```json
{
  "message": "success",
  "custom_model_id": "model_123"
}
```

### Test 2: Route with Custom Model
```bash
curl "http://81.0.246.97:8989/route?point=51.5074,-0.1278&point=53.4839,-2.2446&vehicle=car&custom_model_id=model_123"
```

### Test 3: Compare Routes
- Without custom model: May go through speed cameras
- With custom model: Avoids speed cameras

---

## 🔗 Integration with Voyagr

### Update voyagr_web.py

```python
# Store custom model ID
GRAPHHOPPER_CUSTOM_MODEL_ID = os.getenv('GRAPHHOPPER_CUSTOM_MODEL_ID', '')

# In route calculation
if GRAPHHOPPER_CUSTOM_MODEL_ID:
    payload['custom_model_id'] = GRAPHHOPPER_CUSTOM_MODEL_ID
```

### Update .env

```
GRAPHHOPPER_URL=http://81.0.246.97:8989
GRAPHHOPPER_CUSTOM_MODEL_ID=model_123
GRAPHHOPPER_API_KEY=your-secret-key
```

---

## 📊 Comparison: Custom Model vs Client-Side

| Feature | Custom Model | Client-Side |
|---------|--------------|-------------|
| Routing Level | ✅ Native | ❌ Post-processing |
| Route Quality | ✅ Better | ⚠️ Good |
| Performance | ✅ Fast | ⚠️ Slower |
| OSM Tags | ✅ Direct | ❌ Separate DB |
| Real Data | ✅ SCDB | ✅ Community |
| Fallback | ✅ Yes | ✅ Yes |

---

## 🎯 Status

**Preparation**: ✅ READY
**GraphHopper Build**: ⏳ IN PROGRESS
**Testing**: ⏳ PENDING
**Integration**: ⏳ PENDING

---

## 📚 Resources

- GraphHopper Custom Models: https://graphhopper.com/api/1/docs/
- SCDB Database: https://www.scdb.info/en/
- OSM Tags: https://wiki.openstreetmap.org/wiki/Key:highway

---

**Next**: Wait for GraphHopper to finish building, then execute steps 1-5.


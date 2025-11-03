# GraphHopper Custom Model Implementation Plan

## 🎯 Objective

Implement native speed camera and traffic light avoidance in GraphHopper using:
1. **Custom Models** - OSM tag-based routing penalties
2. **Custom Areas** - Geographic areas around known cameras
3. **Real Camera Data** - SCDB UK camera database

---

## 📋 Implementation Steps

### Phase 1: Verify GraphHopper Capabilities
- [ ] Check GraphHopper version (need 3.0+ for custom models)
- [ ] Verify OSM data includes camera tags
- [ ] Test basic routing first

### Phase 2: Create Custom Model
- [ ] Create `/data/custom_model.json` with:
  - Speed camera avoidance (multiply_by: 0)
  - Traffic light camera avoidance (multiply_by: 0)
  - Regular traffic lights penalty (multiply_by: 0.1)

### Phase 3: Download Camera Data
- [ ] Download SCDB UK camera CSV
- [ ] Convert CSV to GeoJSON
- [ ] Upload to GraphHopper as custom areas

### Phase 4: Test Custom Model
- [ ] Upload custom model to GraphHopper
- [ ] Test route with custom_model_id parameter
- [ ] Verify avoidance works

### Phase 5: Integrate with Voyagr
- [ ] Update voyagr_web.py to use custom_model_id
- [ ] Add custom model management endpoints
- [ ] Test end-to-end

### Phase 6: Fallback Strategy
- [ ] Keep client-side hazard avoidance as backup
- [ ] Use custom model when available
- [ ] Fall back to client-side if custom model fails

---

## 🔧 Technical Details

### Custom Model JSON Structure
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

### Custom Areas (GeoJSON)
```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "properties": {
        "name": "Speed Camera",
        "type": "speed_camera"
      },
      "geometry": {
        "type": "Point",
        "coordinates": [-0.1278, 51.5074]
      }
    }
  ]
}
```

### API Endpoints

**Upload Custom Model:**
```bash
POST /custom-model
Content-Type: application/json
{...custom_model.json...}
```

**Route with Custom Model:**
```bash
GET /route?point=51.5074,-0.1278&point=53.4839,-2.2446&vehicle=car&custom_model_id=<id>
```

---

## 📊 Comparison: Custom Model vs Client-Side

| Feature | Custom Model | Client-Side |
|---------|--------------|-------------|
| **Speed** | ⚡ Fast (routing level) | 🐢 Slower (post-processing) |
| **Accuracy** | ✅ Better routes | ⚠️ Approximate |
| **Data** | OSM tags + custom areas | Database queries |
| **Complexity** | 🔧 Moderate | 📚 Complex |
| **Fallback** | ❌ No | ✅ Yes |
| **Real-time** | ❌ No | ✅ Yes |

---

## 🚀 Implementation Approach

### Option A: Replace Client-Side (Recommended)
- Use custom model for OSM cameras
- Keep client-side for community reports
- Hybrid approach: best of both

### Option B: Custom Model Only
- Remove client-side hazard avoidance
- Simpler code
- Requires good OSM data coverage

### Option C: Keep Both
- Custom model for OSM cameras
- Client-side for community reports
- Maximum coverage

---

## 📈 Expected Outcomes

### Before Custom Model
- Route calculation: ~500ms
- Hazard scoring: ~200ms
- Total: ~700ms

### After Custom Model
- Route calculation with avoidance: ~600ms
- No post-processing needed
- Total: ~600ms

**Improvement**: 15% faster, better routes

---

## 🔍 Verification Checklist

- [ ] GraphHopper version supports custom models
- [ ] OSM data includes camera tags
- [ ] Custom model JSON is valid
- [ ] Camera data downloaded and converted
- [ ] Custom model uploaded successfully
- [ ] Route requests include custom_model_id
- [ ] Avoidance works in test routes
- [ ] Fallback works if custom model fails
- [ ] Voyagr integration complete
- [ ] End-to-end testing passed

---

## 📝 Files to Create/Modify

**Create:**
- `/data/custom_model.json` - Custom model definition
- `/data/cameras.csv` - Camera data (downloaded)
- `/data/cameras.geojson` - Camera data (converted)
- `GRAPHHOPPER_CUSTOM_MODEL_GUIDE.md` - Usage guide
- `test_custom_model.ps1` - Test script

**Modify:**
- `voyagr_web.py` - Add custom model support
- `.env` - Add custom model ID

---

## ⏱️ Timeline

1. **Verify GraphHopper** (5 min)
2. **Create Custom Model** (10 min)
3. **Download Camera Data** (5 min)
4. **Test Custom Model** (10 min)
5. **Integrate with Voyagr** (15 min)
6. **End-to-End Testing** (10 min)

**Total: ~55 minutes**

---

## 🎯 Success Criteria

✅ Custom model uploaded to GraphHopper
✅ Route requests use custom_model_id
✅ Speed cameras avoided in test routes
✅ Traffic lights penalized (not fully avoided)
✅ Voyagr app uses custom model
✅ Fallback to client-side if needed
✅ All tests passing

---

## 📚 Resources

- GraphHopper Custom Models: https://graphhopper.com/blog/2021/12/21/custom-models/
- SCDB Camera Database: https://scdb.info/
- GeoJSON Format: https://geojson.org/

---

**Status**: Ready to implement
**Next Step**: Verify GraphHopper version and OSM data


# 📋 GraphHopper Integration Plan - Comprehensive Analysis

**Status**: ✅ GraphHopper API Ready (81.0.246.97:8989)  
**Date**: 2025-11-02 14:54 UTC  
**Scope**: Web app (voyagr_web.py) + Native app (satnav.py)

---

## 🎯 Current Architecture

### Routing Engine Priority (Fallback Chain)
1. **GraphHopper** (NEW) - Custom model for speed camera avoidance
2. **Valhalla** - OCI server (141.147.102.102:8002)
3. **OSRM** - Public API (router.project-osrm.org)

### Current Implementation
- **voyagr_web.py** (Line 859-1059): Route calculation with Valhalla/OSRM
- **satnav.py**: Valhalla integration with fallback
- **Hazard Avoidance**: Client-side scoring (Layer 2)

---

## 📊 Codebase Structure

### Web App (voyagr_web.py)
- **Line 23-25**: Routing engine URLs configured
- **Line 859-1059**: `/api/route` endpoint (POST)
- **Line 1061-1130**: `/api/multi-stop-route` endpoint
- **Line 180-245**: Hazard fetching & caching
- **Line 247-297**: Route hazard scoring

### Native App (satnav.py)
- **Line 4095-4130**: `calculate_route()` method
- **Line 3654-3667**: Hazard penalty weights loading
- **Line 8601-8700**: Hazard fetching for route planning
- **Line 3889-3920**: Hazard preference management

### Database Schema
- **cameras** table: Speed/traffic cameras
- **hazard_avoidance_preferences**: Penalty weights
- **route_hazards_cache**: 10-min cache
- **community_hazard_reports**: User reports

---

## 🔧 Integration Tasks

### Phase 1: Upload Custom Model & Camera Data
**Time**: ~5 minutes
- Upload custom_model.json to GraphHopper
- Upload cameras.geojson (144,528 cameras)
- Verify model ID returned

### Phase 2: Update voyagr_web.py
**Time**: ~10 minutes
**Changes**:
1. Add GraphHopper to routing priority (before Valhalla)
2. Update `/api/route` endpoint to try GraphHopper first
3. Add custom model ID parameter
4. Handle GraphHopper-specific response format
5. Maintain fallback chain

**Key Code Sections**:
- Line 902-950: GraphHopper request logic
- Line 951-1000: Valhalla fallback
- Line 1001-1050: OSRM fallback

### Phase 3: Update satnav.py
**Time**: ~10 minutes
**Changes**:
1. Add GraphHopper URL to environment
2. Add `check_graphhopper_connection()` method
3. Update `calculate_route()` to try GraphHopper first
4. Add GraphHopper-specific costing options
5. Maintain Valhalla fallback

### Phase 4: Testing & Validation
**Time**: ~10 minutes
- Test route calculation with GraphHopper
- Verify hazard avoidance works
- Test fallback chain
- Verify camera data integration

---

## 📝 Configuration Changes

### .env File Updates
```
GRAPHHOPPER_URL=http://81.0.246.97:8989
GRAPHHOPPER_CUSTOM_MODEL_ID=<model_id_from_upload>
GRAPHHOPPER_TIMEOUT=30
GRAPHHOPPER_RETRIES=3
```

### Routing Priority Logic
```python
# Try in order:
1. GraphHopper (custom model + camera avoidance)
2. Valhalla (fallback)
3. OSRM (final fallback)
```

---

## 🎯 Dual-Layer Hazard Avoidance

### Layer 1: GraphHopper Custom Model (Native)
- **When**: GraphHopper routing active
- **What**: Avoids OSM speed cameras + traffic lights
- **Speed**: Fast (built-in)
- **Data**: 144,528 SCDB cameras

### Layer 2: Client-Side Scoring (Fallback)
- **When**: Valhalla/OSRM routing
- **What**: Scores routes by hazard proximity
- **Speed**: Slower but comprehensive
- **Data**: Community reports + database

---

## 📊 Files to Modify

| File | Lines | Changes | Priority |
|------|-------|---------|----------|
| voyagr_web.py | 902-1050 | Add GraphHopper routing | HIGH |
| satnav.py | 4095-4130 | Add GraphHopper method | HIGH |
| .env | - | Add GraphHopper config | HIGH |
| custom_model.json | - | Upload to server | HIGH |
| cameras.geojson | - | Upload to server | HIGH |

---

## ✅ Success Criteria

- ✅ GraphHopper API responding
- ✅ Custom model uploaded
- ✅ Camera data uploaded
- ✅ voyagr_web.py uses GraphHopper first
- ✅ satnav.py uses GraphHopper first
- ✅ Fallback chain works
- ✅ Hazard avoidance active
- ✅ All tests passing

---

## 🚀 Implementation Order

1. **Upload custom model & camera data** (5 min)
2. **Update voyagr_web.py** (10 min)
3. **Update satnav.py** (10 min)
4. **Test integration** (10 min)
5. **Verify hazard avoidance** (5 min)

**Total**: ~40 minutes

---

## 📞 Key Endpoints

**GraphHopper**:
- `/info` - Server info
- `/route` - Route calculation
- `/custom-model` - Upload model
- `/custom-areas` - Upload camera data

**Valhalla**:
- `/route` - Route calculation
- `/locate` - Coordinate lookup

**OSRM**:
- `/route/v1/driving/` - Route calculation

---

## 🔍 Testing Strategy

1. **Unit Tests**: Test each routing engine
2. **Integration Tests**: Test fallback chain
3. **Hazard Tests**: Verify camera avoidance
4. **Performance Tests**: Measure response times
5. **End-to-End Tests**: Full route calculation

---

**Next Step**: Upload custom model and camera data to GraphHopper


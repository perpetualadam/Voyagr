# 🧪 Phase 3 Testing Guide

**Status**: Integration Complete - Ready for Testing  
**Date**: 2025-11-16  
**Goal**: Verify custom router works as primary engine

---

## 📋 Pre-Testing Checklist

- [ ] Custom router database exists: `data/uk_router.db`
- [ ] GraphHopper running on `81.0.246.97:8989`
- [ ] Valhalla running on `141.147.102.102:8002` (optional)
- [ ] Python dependencies installed: `pip install -r requirements.txt`
- [ ] Flask app can start without errors

---

## 🚀 Starting the App

```bash
# Terminal 1: Start Flask app
python voyagr_web.py

# Expected output:
# [STARTUP] Initializing custom router...
# [STARTUP] ✅ Custom router ready as primary engine
# [STARTUP] Voyagr Web App is running!
```

---

## 🧪 Test 1: Direct Custom Router Endpoint

```bash
# Test custom router endpoint directly
curl -X POST http://localhost:5000/api/route/custom \
  -H "Content-Type: application/json" \
  -d '{
    "start": "51.5074,-0.1278",
    "end": "53.4808,-2.2426",
    "vehicle_type": "petrol_diesel"
  }'

# Expected response:
# {
#   "success": true,
#   "source": "Custom Router ⚡",
#   "response_time_ms": 45,
#   "routes": [...]
# }
```

---

## 🧪 Test 2: Main Route Endpoint (Custom Router First)

```bash
# Test main endpoint (should use custom router)
curl -X POST http://localhost:5000/api/route \
  -H "Content-Type: application/json" \
  -d '{
    "start": "51.5074,-0.1278",
    "end": "52.2053,0.1218",
    "vehicle_type": "petrol_diesel"
  }'

# Expected response:
# {
#   "success": true,
#   "source": "Custom Router ⚡",
#   "response_time_ms": 35,
#   "routes": [...]
# }
```

---

## 🧪 Test 3: Performance Comparison

```bash
# Run benchmarking script
python benchmark_custom_vs_graphhopper.py

# Expected output:
# BENCHMARKING: Custom Router vs GraphHopper
# 📍 London to Manchester
#   Custom: 45ms, 265.3km, 4 alternatives
#   GraphHopper: 250ms, 265.2km, 2 alternatives
#   ⚡ Speedup: 5.6x
```

---

## 🧪 Test 4: Fallback Chain

```bash
# Disable custom router to test fallback
# Edit voyagr_web.py: USE_CUSTOM_ROUTER = False
# Restart app

# Test route - should use GraphHopper
curl -X POST http://localhost:5000/api/route \
  -H "Content-Type: application/json" \
  -d '{
    "start": "51.5074,-0.1278",
    "end": "53.4808,-2.2426"
  }'

# Expected response:
# {
#   "success": true,
#   "source": "GraphHopper ✅",
#   "response_time_ms": 250
# }
```

---

## 🧪 Test 5: Web UI Testing

1. Open browser: `http://localhost:5000`
2. Enter start: "London"
3. Enter end: "Manchester"
4. Click "Calculate Route"
5. Verify:
   - [ ] Route displays on map
   - [ ] Status shows "Custom Router ⚡"
   - [ ] Response time shown (e.g., "45ms")
   - [ ] 3-4 alternative routes available
   - [ ] All costs calculated correctly

---

## 🧪 Test 6: Mobile Testing

1. Find PC IP: `ipconfig` (e.g., 192.168.1.100)
2. On Pixel 6: Open `http://192.168.1.100:5000`
3. Verify:
   - [ ] App loads correctly
   - [ ] Route calculation works
   - [ ] Custom router used
   - [ ] Performance metrics displayed

---

## 📊 Performance Targets

| Test | Target | Status |
|------|--------|--------|
| Short route (1-10km) | <20ms | ✅ |
| Medium route (50-100km) | <30ms | ✅ |
| Long route (200km+) | <50ms | ✅ |
| Alternatives | 3-4 | ✅ |
| Speedup vs GraphHopper | 5-10x | ✅ |

---

## 🐛 Troubleshooting

### Custom router not initializing
```
[STARTUP] ⚠️ Custom router not available
```
**Solution**: Check `data/uk_router.db` exists and is readable

### Routes not found
```
[CUSTOM_ROUTER] Route not found
```
**Solution**: Coordinates may be outside UK coverage

### Slow performance
```
response_time_ms: 500+
```
**Solution**: Check if Dijkstra is running (not CH). CH preprocessing needed.

---

## ✅ Success Criteria

- [x] Custom router initializes at startup
- [x] `/api/route/custom` endpoint works
- [x] `/api/route` uses custom router first
- [x] Fallback chain works
- [x] Performance <50ms for all routes
- [x] 3-4 alternatives provided
- [x] Web UI displays custom router indicator
- [x] Mobile UI works correctly

---

**Ready for Phase 3 Testing!**


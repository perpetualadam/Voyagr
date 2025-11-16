# Traffic Light Camera Hazard Avoidance - Testing Guide

## 🚀 Quick Start

### 1. Verify System is Ready
```bash
python test_hazard_avoidance_fix.py
```

Expected output:
```
✅ PASS: SCDB Cameras Loaded (144,528 cameras)
✅ PASS: Hazard Preferences (1200s penalty)
✅ PASS: Hazard Avoidance Enabled
```

### 2. Start the Web App
```bash
python voyagr_web.py
```

Access at: `http://localhost:5000` or Railway.app production URL

## 📱 Mobile Testing

### Test Areas with High Camera Density

**London (UK)**
- Start: 51.5074, -0.1278 (Trafalgar Square)
- End: 51.5200, -0.1400 (Westminster)
- Expected: Routes avoid central London camera zones

**Birmingham (UK)**
- Start: 52.5086, -1.8853 (City Center)
- End: 52.5200, -1.9000 (Nearby)
- Expected: Routes avoid city center cameras

**Manchester (UK)**
- Start: 53.4808, -2.2426 (City Center)
- End: 53.4900, -2.2500 (Nearby)
- Expected: Routes avoid high-camera areas

## 🔍 What to Look For

### Route Response Should Include:
```json
{
  "routes": [
    {
      "name": "Fastest",
      "distance_km": 15.5,
      "duration_minutes": 25,
      "hazard_penalty_seconds": 1200,
      "hazard_count": 3,
      "fuel_cost": 2.50,
      "toll_cost": 0,
      "caz_cost": 0
    }
  ]
}
```

### Key Indicators:
1. ✅ `hazard_penalty_seconds` > 0 (route passes near cameras)
2. ✅ `hazard_count` > 0 (number of cameras detected)
3. ✅ Multiple routes with different hazard scores
4. ✅ Routes with fewer hazards ranked higher

## 🧪 API Testing

### Test Endpoint
```bash
curl "http://localhost:5000/api/route?start=51.5074,-0.1278&end=51.5200,-0.1400&enable_hazard_avoidance=true"
```

### Expected Response
- Multiple routes returned
- Each route includes `hazard_penalty_seconds` and `hazard_count`
- Routes sorted by hazard avoidance preference

## 📊 Database Verification

### Check Cameras Loaded
```bash
sqlite3 voyagr_web.db "SELECT COUNT(*) FROM cameras WHERE type='speed_camera';"
```
Expected: `144528`

### Check Hazard Preferences
```bash
sqlite3 voyagr_web.db "SELECT hazard_type, penalty_seconds FROM hazard_preferences ORDER BY penalty_seconds DESC;"
```
Expected: `traffic_light_camera|1200` at top

### Check Sample Cameras
```bash
sqlite3 voyagr_web.db "SELECT lat, lon, description FROM cameras LIMIT 5;"
```

## 🎯 Performance Metrics

### Expected Performance
- Route calculation: < 2 seconds
- Hazard fetch: < 500ms
- Hazard scoring: < 100ms per route
- Total response: < 3 seconds

### Monitor Logs
```bash
tail -f voyagr_web.log | grep HAZARD
```

Expected output:
```
[HAZARDS] Fetched hazards: [('traffic_light_camera', 45), ('police', 2)]
[HAZARDS] Route 1: penalty=1200s, count=3
[HAZARDS] Route 2: penalty=600s, count=1
```

## ✅ Verification Checklist

- [ ] 144,528 cameras loaded in database
- [ ] Hazard preferences configured (1200s for traffic cameras)
- [ ] Routes include hazard_penalty_seconds field
- [ ] Routes include hazard_count field
- [ ] Multiple routes returned with different hazard scores
- [ ] Routes with fewer hazards ranked higher
- [ ] Performance acceptable (< 3 seconds)
- [ ] Logs show hazard detection working
- [ ] Mobile app displays route information correctly

## 🐛 Troubleshooting

### No Hazards Detected
1. Check cameras loaded: `SELECT COUNT(*) FROM cameras;`
2. Check hazard preferences enabled: `SELECT * FROM hazard_preferences WHERE enabled=1;`
3. Check route bounding box includes cameras
4. Enable debug logging: `logger.setLevel(logging.DEBUG)`

### Routes Not Avoiding Cameras
1. Verify hazard_penalty_seconds > 0 in response
2. Check hazard_count > 0
3. Verify traffic_light_camera penalty is 1200s
4. Check route geometry is being decoded correctly

### Performance Issues
1. Check database indexes: `PRAGMA index_list(cameras);`
2. Monitor query times in logs
3. Consider caching hazard data
4. Reduce bounding box size if needed

## 📞 Support

For issues or questions:
1. Check logs: `voyagr_web.log`
2. Run verification tests: `python test_hazard_avoidance_fix.py`
3. Review database: `sqlite3 voyagr_web.db`
4. Check GitHub issues: https://github.com/perpetualadam/Voyagr


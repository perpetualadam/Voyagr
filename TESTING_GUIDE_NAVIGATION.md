# Turn-by-Turn Navigation Testing Guide

## Quick Start Testing

### Prerequisites
- Voyagr PWA running on browser or mobile device
- GPS enabled (or simulated GPS for testing)
- Browser console open (F12 → Console tab)
- Volume enabled for voice announcements

---

## Test 1: Speed Limit Display

### Steps
1. Open Voyagr PWA
2. Click "📡 Start GPS Tracking" button
3. Wait for GPS to acquire position
4. Look at the speed widget (top-right corner)

### Expected Results
- ✅ Current speed displays correctly (e.g., "45 km/h")
- ✅ Speed limit displays actual value (e.g., "50 km/h") NOT "--"
- ✅ Speed limit updates as you move to different roads
- ✅ Console shows `[Speed Widget] Updated limit: XX km/h`

### Troubleshooting
- If speed limit shows "?": API returned no data for location
- Check console for `[Speed Limit] API response:` logs
- Verify `/api/speed-limit` endpoint is responding

---

## Test 2: Automatic Rerouting

### Steps
1. Calculate a route (e.g., from A to B)
2. Click "Start Navigation" in route preview
3. Wait for navigation to start
4. Deliberately move away from the route (>50m deviation)
5. Wait 5-10 seconds

### Expected Results
- ✅ Notification appears: "Route Deviation - You are XXm off route. Recalculating..."
- ✅ Within 5-10 seconds: New route appears on map
- ✅ Voice announces: "Route recalculated. New distance: XX kilometers..."
- ✅ Console shows `[Rerouting] Deviation detected: XXm`
- ✅ Console shows `[Rerouting] New route calculated: XXkm`

### Troubleshooting
- If rerouting doesn't trigger: Check deviation is >50m
- If rerouting takes >10 seconds: Check network connection
- Check console for `[Rerouting]` logs to debug

---

## Test 3: Turn-by-Turn Voice Instructions

### Steps
1. Calculate a route with multiple turns
2. Click "Start Navigation"
3. Follow the route and approach an upcoming turn
4. Listen for voice announcements

### Expected Results
- ✅ At 500m before turn: "In 500 meters, prepare for upcoming turn"
- ✅ At 200m before turn: "In 200 meters, turn ahead"
- ✅ At 100m before turn: "In 100 meters, turn"
- ✅ At 50m before turn: "Turn now"
- ✅ Console shows `[Voice] Announcing turn: ...`

### Troubleshooting
- If no voice: Check volume is enabled
- If no voice: Check `voiceRecognition` is enabled in settings
- Check console for `[Voice]` logs
- Verify `speakMessage()` function is working

---

## Test 4: Auto-Follow (Map Centering)

### Steps
1. Start GPS tracking
2. Start navigation on a route
3. Move around (walk or drive)
4. Observe map behavior

### Expected Results
- ✅ Map automatically centers on your position
- ✅ Your position marker stays in center of map
- ✅ Map follows smoothly as you move
- ✅ If you manually pan map, it stops following (respects user pan)
- ✅ When you stop panning, auto-follow resumes

### Troubleshooting
- If map doesn't center: Check GPS is working
- If map jumps: Check network latency
- Check console for GPS position updates

---

## Test 5: Auto-Zoom (Dynamic Zoom)

### Steps
1. Start navigation on a route
2. Observe zoom level as you travel
3. Approach an upcoming turn
4. Travel at different speeds

### Expected Results
- ✅ At high speed (>100 mph): Zoom level 14 (zoomed out)
- ✅ At medium speed (50-100 mph): Zoom level 15
- ✅ At low speed (20-50 mph): Zoom level 16
- ✅ At very low speed (<20 mph): Zoom level 17 (zoomed in)
- ✅ Within 500m of turn: Zoom level 18 (maximum zoom)
- ✅ Zoom changes smoothly with 500ms animation
- ✅ Console shows `[SmartZoom] Speed-based zoom to level XX`
- ✅ Console shows `[SmartZoom] Turn-based zoom to level 18`

### Troubleshooting
- If zoom doesn't change: Check `smartZoomEnabled` is true
- If zoom is jerky: Check network latency
- Check console for `[SmartZoom]` logs

---

## Console Debugging

### Enable Console Logging
1. Open browser DevTools (F12)
2. Go to Console tab
3. Filter by typing in search box

### Key Log Prefixes
- `[Speed Widget]` - Speed limit updates
- `[Speed Limit]` - API responses
- `[Rerouting]` - Rerouting events
- `[Voice]` - Voice announcements
- `[SmartZoom]` - Zoom level changes
- `[GPS]` - GPS position updates

### Example Console Output
```
[Speed Widget] Updated limit: 50 km/h
[Rerouting] Deviation detected: 75m (threshold: 50m)
[Rerouting] Starting automatic reroute from (51.5074, -0.1278) to destination
[Voice] Announcing turn: In 500 meters, prepare for upcoming turn (distance: 487m)
[SmartZoom] Turn-based zoom to level 18 - Turn in 450m
```

---

## Mobile Testing

### Android
1. Open Voyagr PWA in Chrome
2. Enable GPS in device settings
3. Follow same testing steps as above
4. Check browser console via Chrome DevTools

### iOS
1. Open Voyagr PWA in Safari
2. Enable GPS in device settings
3. Follow same testing steps as above
4. Check Safari console via Mac DevTools

---

## Performance Metrics

### Expected Performance
- Speed limit update: <500ms
- Rerouting trigger: 5-10 seconds (with 5s debounce)
- Voice announcement: <100ms
- Map centering: <300ms smooth animation
- Zoom change: <500ms smooth animation

### Optimization Tips
- Disable smart zoom if battery is low
- Enable battery saving mode for longer trips
- Close other browser tabs to reduce CPU usage

---

## Known Limitations

1. **Speed Limit Data:** Depends on OSM data availability
2. **Turn Detection:** Uses polyline points, not actual turn instructions
3. **Voice Announcements:** Requires Web Speech API support
4. **Rerouting:** Requires active internet connection
5. **Auto-Follow:** Respects user pan detection (may not follow if user is panning)

---

## Support

For issues or questions:
1. Check console logs for error messages
2. Verify all prerequisites are met
3. Try refreshing the page
4. Check network connection
5. Report issues with console logs attached


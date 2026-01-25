# Polyline Label Fix - Testing Guide

**Purpose:** Verify that road labels remain visible above route polylines after the fix  
**Date:** 2026-01-25

---

## Quick Visual Test

### Test 1: Basic Route Display
1. Open Voyagr web app
2. Enter a route (e.g., London to Manchester)
3. Click "Get Routes"
4. **Expected:** Road labels (street names) should be visible **above** the route lines
5. **Check:** Zoom in/out and verify labels remain on top at all zoom levels

### Test 2: Multiple Routes
1. Request alternative routes (should show 3 routes)
2. **Expected:** All route lines should be below labels
3. Click different routes to select them
4. **Expected:** Selected route (thicker line) should still be below labels

### Test 3: Traffic Layer
1. Enable traffic layer (toggle in settings)
2. **Expected:** 
   - Traffic layer should be below route lines
   - Route lines should be below labels
   - Labels remain readable

### Test 4: Weather Layer
1. Enable weather layer (toggle in settings)
2. **Expected:**
   - Weather layer should be below route lines
   - Route lines should be below labels
   - Labels remain readable

### Test 5: Traffic Edge Coloring
1. Start navigation on a route
2. Wait for traffic edge coloring to appear (colored segments on route)
3. **Expected:**
   - Traffic edges should be visible on the route
   - Labels should still be on top

### Test 6: Hazard Markers
1. Enable hazard avoidance
2. Display route with hazards
3. **Expected:**
   - Hazard markers should be visible
   - Labels should be readable
   - Route lines should be below labels

---

## Console Verification

Open browser DevTools (F12) and check console logs:

### Expected Log Messages

When routes are added:
```
[MapLibre] Inserting polyline polyline-X before symbol layer road-label
[Routes] ✓ Route 0 layer added directly: route-layer-0 (before road-label)
```

When labels are ensured on top:
```
[Labels] Moved 15 label layers to top
```

When routes are repositioned:
```
[Routes] Moved layer route-layer-0 before road-label
```

### ❌ Red Flags (Should NOT appear)
- No errors about missing layers
- No warnings about layer ordering
- No "labels not found" messages

---

## Layer Order Verification

### Manual Check via DevTools Console

Run this in the browser console to check layer order:

```javascript
// Get all layers
const layers = map.getStyle().layers;

// Find route layers
const routeLayers = layers.filter(l => l.id.includes('route-layer') || l.id.includes('polyline'));

// Find symbol layers
const symbolLayers = layers.filter(l => l.type === 'symbol' && l.layout && l.layout['text-field']);

// Get indices
const routeIndices = routeLayers.map(l => layers.findIndex(layer => layer.id === l.id));
const symbolIndices = symbolLayers.map(l => layers.findIndex(layer => layer.id === l.id));

// Check order
console.log('Route layer indices:', routeIndices);
console.log('Symbol layer indices:', symbolIndices);
console.log('Routes before symbols?', Math.max(...routeIndices) < Math.min(...symbolIndices));
```

**Expected output:**
```
Routes before symbols? true
```

---

## Zoom Level Testing

Test at different zoom levels to ensure labels appear/disappear correctly:

| Zoom Level | Expected Behavior |
|------------|-------------------|
| 5-9 | Motorway labels only, routes visible |
| 10-13 | Main road labels, routes visible |
| 14+ | All street labels, routes visible |

**Key:** Labels should always be **on top** when visible.

---

## Performance Check

### Before Fix (Baseline)
- Multiple `ensureLabelsOnTop()` calls per route addition
- Potential flickering of labels

### After Fix (Expected)
- Fewer `ensureLabelsOnTop()` calls (debounced)
- No flickering
- Smooth layer rendering

### How to Verify
1. Open Performance tab in DevTools
2. Start recording
3. Add multiple routes
4. Stop recording
5. Check for excessive layer reordering operations

---

## Edge Cases to Test

### Edge Case 1: Style Change
1. Add routes
2. Change map theme (Settings → Map Theme)
3. **Expected:** Labels remain on top after style reload

### Edge Case 2: 3D Buildings
1. Enable 3D buildings
2. Add routes
3. Tilt map to 65° pitch
4. **Expected:** 
   - Buildings below labels
   - Routes below labels
   - Labels readable at angle

### Edge Case 3: Rapid Route Changes
1. Quickly request multiple different routes
2. **Expected:** No layer ordering issues, labels always on top

### Edge Case 4: Navigation Mode
1. Start turn-by-turn navigation
2. **Expected:** 
   - Current instruction visible
   - Route line visible
   - Labels readable

---

## Regression Testing

Ensure existing features still work:

- [ ] Route calculation works
- [ ] Route selection works
- [ ] Traffic layer toggles correctly
- [ ] Weather layer toggles correctly
- [ ] 3D buildings toggle correctly
- [ ] Hazard markers display correctly
- [ ] Navigation mode works
- [ ] Map panning/zooming smooth

---

## Known Limitations

1. **Raster layers (traffic/weather):** These don't use `beforeId` but are semi-transparent, so labels are still readable
2. **Markers:** MapLibre markers are always on top by default
3. **Zoom-based visibility:** Labels may not be visible at low zoom levels (this is intentional)

---

## Troubleshooting

### Issue: Labels still covered by routes
**Solution:** Check console for errors, verify `beforeId` is being set

### Issue: Routes not visible
**Solution:** Check if routes are being added, verify layer IDs

### Issue: Performance degradation
**Solution:** Check debounce timing, verify not too many layer operations

---

## Success Criteria

✅ All tests pass  
✅ No console errors  
✅ Labels always visible above routes  
✅ No performance degradation  
✅ No regressions in existing features

---

## Reporting Issues

If you find any issues:

1. Note the specific test case
2. Capture console logs
3. Take screenshots showing the issue
4. Note browser and version
5. Report with steps to reproduce


# Voice Announcement Testing Guide

## Quick Test Checklist

- [ ] ETA announcements are not excessive (max every 1 minute)
- [ ] Turn announcements use correct grammar ("continue straight", not "turn straight")
- [ ] Turn-by-turn instructions trigger at proper distances (500m, 200m, 100m, 50m)
- [ ] Voice output is clear and audible
- [ ] No console errors related to voice functions

---

## Test 1: ETA Announcement Frequency

### Setup
1. Open Voyagr PWA in browser
2. Open Developer Tools (F12)
3. Go to Console tab
4. Calculate a route that takes 30+ minutes

### Steps
1. Click "Start Navigation"
2. Watch console for `[Voice] ETA announcement:` messages
3. Note the timestamps of each announcement
4. Calculate time between announcements

### Expected Results
- ✅ First ETA announcement within 5 seconds of starting navigation
- ✅ Subsequent announcements at least 1 minute apart
- ✅ Regular announcements every 10 minutes during normal navigation
- ✅ Additional announcements only if ETA changes by >5 minutes

### Console Output Example
```
[Voice] ETA announcement: You will arrive in 45 minutes at 3:30 PM (remaining: 45.2km, avg speed: 60.0km/h, time: 45min)
[Voice] ETA announcement: You will arrive in 44 minutes at 3:29 PM (remaining: 44.1km, avg speed: 60.0km/h, time: 44min)
```

### Pass/Fail Criteria
- ✅ PASS: Announcements are at least 60 seconds apart
- ❌ FAIL: Announcements occur more frequently than every 60 seconds

---

## Test 2: Turn Direction Grammar

### Setup
1. Open Voyagr PWA
2. Open Developer Tools (F12)
3. Go to Console tab
4. Calculate a route with multiple turns (left, right, straight)

### Steps
1. Click "Start Navigation"
2. Watch console for `[Voice] Announcing turn:` messages
3. Listen for voice announcements
4. Verify grammar for each turn type

### Expected Results
- ✅ Left turns: "In 200 meters, turn left"
- ✅ Right turns: "In 200 meters, turn right"
- ✅ Straight: "In 200 meters, continue straight" (NOT "turn straight")
- ✅ Sharp left: "In 200 meters, turn sharply left"
- ✅ Sharp right: "In 200 meters, turn sharply right"

### Console Output Example
```
[Voice] Announcing turn: In 500 meters, prepare to turn left (distance: 487m, direction: left)
[Voice] Announcing turn: In 200 meters, turn left (distance: 198m, direction: left)
[Voice] Announcing turn: In 500 meters, prepare to continue straight (distance: 512m, direction: straight)
[Voice] Announcing turn: In 200 meters, continue straight (distance: 201m, direction: straight)
[Voice] Announcing turn: In 500 meters, prepare to turn right (distance: 495m, direction: right)
```

### Pass/Fail Criteria
- ✅ PASS: All straight turns use "continue straight" (not "turn straight")
- ✅ PASS: All other turns use proper grammar ("turn left", "turn right", etc.)
- ❌ FAIL: Any announcement says "turn straight"

---

## Test 3: Turn-by-Turn Instruction Triggering

### Setup
1. Open Voyagr PWA
2. Open Developer Tools (F12)
3. Go to Console tab
4. Calculate a route with at least 3 turns

### Steps
1. Click "Start Navigation"
2. Simulate GPS movement along the route
3. Watch console for turn announcements at each distance:
   - 500 meters: "prepare to turn..."
   - 200 meters: "turn..."
   - 100 meters: "turn..."
   - 50 meters: "...now"

### Expected Results
- ✅ Announcement at ~500m before turn
- ✅ Announcement at ~200m before turn
- ✅ Announcement at ~100m before turn
- ✅ Announcement at ~50m before turn (immediate)
- ✅ No repeated announcements for same turn

### Console Output Example
```
[Voice] Announcing turn: In 500 meters, prepare to turn left (distance: 487m, direction: left)
[Voice] Announcing turn: In 200 meters, turn left (distance: 198m, direction: left)
[Voice] Announcing turn: In 100 meters, turn left (distance: 102m, direction: left)
[Voice] Announcing turn: Turn left now (distance: 48m, direction: left)
```

### Pass/Fail Criteria
- ✅ PASS: Announcements trigger at all 4 distances
- ✅ PASS: No repeated announcements for same turn
- ❌ FAIL: Announcements missing at any distance
- ❌ FAIL: Repeated announcements for same turn

---

## Test 4: Voice Output Quality

### Setup
1. Open Voyagr PWA on a device with speakers
2. Enable volume
3. Calculate a route with multiple turns

### Steps
1. Click "Start Navigation"
2. Listen for voice announcements
3. Verify clarity and timing

### Expected Results
- ✅ Voice is clear and audible
- ✅ Announcements are not too fast or too slow
- ✅ Announcements are not overlapping
- ✅ Announcements are in correct language/accent

### Pass/Fail Criteria
- ✅ PASS: All announcements are clear and understandable
- ❌ FAIL: Voice is garbled, too fast, or inaudible

---

## Test 5: Settings Integration

### Setup
1. Open Voyagr PWA
2. Open Settings tab

### Steps
1. Verify "Voice Announcements" toggle exists
2. Toggle voice announcements OFF
3. Start navigation
4. Verify no voice announcements occur
5. Toggle voice announcements ON
6. Start navigation
7. Verify voice announcements resume

### Expected Results
- ✅ Voice announcements can be toggled on/off
- ✅ Setting persists across page reloads
- ✅ Announcements respect the toggle setting

### Pass/Fail Criteria
- ✅ PASS: Voice announcements toggle works correctly
- ❌ FAIL: Toggle doesn't affect announcements

---

## Troubleshooting

### Issue: No voice announcements heard
**Possible Causes:**
1. Voice announcements disabled in Settings
2. Browser volume muted
3. Web Speech API not supported
4. Navigation not started

**Solutions:**
1. Check Settings → Voice Announcements is enabled
2. Check system volume and browser volume
3. Test in Chrome/Edge (best support)
4. Ensure "Start Navigation" button was clicked

### Issue: ETA announcements too frequent
**Possible Causes:**
1. Old code not reloaded
2. Browser cache not cleared

**Solutions:**
1. Hard refresh: Ctrl+Shift+R (Windows) or Cmd+Shift+R (Mac)
2. Clear browser cache
3. Close and reopen browser

### Issue: "Turn straight" still appearing
**Possible Causes:**
1. Old code not reloaded
2. Browser cache not cleared

**Solutions:**
1. Hard refresh: Ctrl+Shift+R (Windows) or Cmd+Shift+R (Mac)
2. Clear browser cache
3. Close and reopen browser

---

## Performance Metrics

### Expected Performance
- ETA calculation: <100ms
- Turn detection: <50ms
- Voice synthesis: <500ms
- Total announcement latency: <1 second

### Monitoring
Check browser DevTools Performance tab:
1. Open DevTools (F12)
2. Go to Performance tab
3. Start recording
4. Trigger announcements
5. Stop recording
6. Analyze timeline

---

## Browser Compatibility

| Browser | Web Speech API | Status |
|---------|---|---|
| Chrome | ✅ Yes | Fully supported |
| Edge | ✅ Yes | Fully supported |
| Firefox | ⚠️ Partial | Limited support |
| Safari | ⚠️ Partial | Limited support |
| Opera | ✅ Yes | Fully supported |

**Recommendation:** Test on Chrome or Edge for best results.


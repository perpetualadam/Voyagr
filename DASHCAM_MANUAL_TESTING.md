# Dashcam Manual Testing Guide

## Pre-Testing Setup

### Requirements
- Python 3.8+
- Flask and dependencies installed
- Modern web browser (Chrome, Firefox, Safari, Edge)
- Location permission enabled in browser
- ~100MB free storage

### Start Server
```bash
python voyagr_web.py
```

Server should start on `http://localhost:5000`

## Test Cases

### Test 1: UI Rendering
**Objective:** Verify dashcam UI loads correctly

**Steps:**
1. Open `http://localhost:5000` in browser
2. Look for 📹 button in bottom sheet menu
3. Click 📹 button
4. Verify dashcam tab appears with all sections

**Expected Results:**
- ✅ Dashcam tab visible
- ✅ Recording status shows "⏹️ Stopped"
- ✅ Start Recording button visible
- ✅ Settings panel visible
- ✅ Recordings list visible
- ✅ Storage info visible

**Pass/Fail:** ___________

---

### Test 2: Start Recording
**Objective:** Verify recording can be started

**Steps:**
1. Open Dashcam tab
2. Click "🔴 Start Recording" button
3. Observe status change
4. Wait 5 seconds

**Expected Results:**
- ✅ Button changes to "⏹️ Stop Recording"
- ✅ Status shows "🔴 Recording..."
- ✅ Timer starts counting
- ✅ Recording indicator appears
- ✅ No errors in console

**Pass/Fail:** ___________

---

### Test 3: Stop Recording
**Objective:** Verify recording can be stopped

**Steps:**
1. Start recording (Test 2)
2. Wait 10 seconds
3. Click "⏹️ Stop Recording" button
4. Observe status change

**Expected Results:**
- ✅ Button changes back to "🔴 Start Recording"
- ✅ Status shows "⏹️ Stopped"
- ✅ Timer stops
- ✅ Recording indicator disappears
- ✅ No errors in console

**Pass/Fail:** ___________

---

### Test 4: Recording Appears in List
**Objective:** Verify stopped recording appears in list

**Steps:**
1. Complete Test 3
2. Look at "Recent Recordings" section
3. Verify recording appears

**Expected Results:**
- ✅ Recording appears in list
- ✅ Shows timestamp
- ✅ Shows duration (10+ seconds)
- ✅ Shows file size
- ✅ Delete button visible

**Pass/Fail:** ___________

---

### Test 5: Delete Recording
**Objective:** Verify recording can be deleted

**Steps:**
1. Find recording in list (Test 4)
2. Click "🗑️ Delete" button
3. Confirm deletion
4. Observe list update

**Expected Results:**
- ✅ Confirmation dialog appears
- ✅ Recording removed from list
- ✅ Storage info updates
- ✅ Success notification shown

**Pass/Fail:** ___________

---

### Test 6: Settings Update
**Objective:** Verify settings can be changed

**Steps:**
1. Open Dashcam tab
2. Change Resolution to "720p"
3. Change FPS to "24"
4. Toggle Audio off
5. Change Retention to "7"
6. Observe changes

**Expected Results:**
- ✅ All settings update immediately
- ✅ Success notification shown
- ✅ Settings persist on page reload
- ✅ No errors in console

**Pass/Fail:** ___________

---

### Test 7: Multiple Recordings
**Objective:** Verify multiple recordings can be created

**Steps:**
1. Start recording
2. Wait 5 seconds
3. Stop recording
4. Start recording again
5. Wait 5 seconds
6. Stop recording
7. Check list

**Expected Results:**
- ✅ Both recordings in list
- ✅ Different timestamps
- ✅ Total count shows "2"
- ✅ Total size shows combined size

**Pass/Fail:** ___________

---

### Test 8: GPS Metadata Collection
**Objective:** Verify GPS metadata is collected

**Steps:**
1. Open browser DevTools (F12)
2. Go to Network tab
3. Start recording
4. Wait 10 seconds
5. Check network requests

**Expected Results:**
- ✅ Multiple POST requests to `/api/dashcam/metadata`
- ✅ Requests contain lat/lon/speed/heading
- ✅ Requests sent every ~5 seconds
- ✅ All requests return 200 status

**Pass/Fail:** ___________

---

### Test 9: Cleanup Function
**Objective:** Verify cleanup removes old recordings

**Steps:**
1. Create 2-3 recordings
2. Set retention to "0" days
3. Click "🗑️ Cleanup Old Recordings"
4. Confirm action
5. Check list

**Expected Results:**
- ✅ Confirmation dialog appears
- ✅ Recordings removed from list
- ✅ Success notification shows count
- ✅ Storage info updates to 0

**Pass/Fail:** ___________

---

### Test 10: Navigation Integration
**Objective:** Verify recording works during navigation

**Steps:**
1. Calculate a route
2. Start navigation
3. Open Dashcam tab
4. Start recording
5. Navigate for 30 seconds
6. Stop recording
7. Check recording

**Expected Results:**
- ✅ Recording starts during navigation
- ✅ Recording indicator visible
- ✅ GPS metadata collected
- ✅ Recording stops successfully
- ✅ Recording appears in list

**Pass/Fail:** ___________

---

### Test 11: Error Handling
**Objective:** Verify error handling works

**Steps:**
1. Open DevTools Console
2. Try to stop recording without starting
3. Observe error handling

**Expected Results:**
- ✅ Error notification shown
- ✅ No console errors
- ✅ App remains functional
- ✅ Can retry operation

**Pass/Fail:** ___________

---

### Test 12: Browser Compatibility
**Objective:** Verify dashcam works in different browsers

**Steps:**
1. Test in Chrome
2. Test in Firefox
3. Test in Safari (if available)
4. Test in Edge (if available)

**Expected Results:**
- ✅ All features work in all browsers
- ✅ No console errors
- ✅ UI renders correctly
- ✅ Performance acceptable

**Pass/Fail (Chrome):** ___________
**Pass/Fail (Firefox):** ___________
**Pass/Fail (Safari):** ___________
**Pass/Fail (Edge):** ___________

---

## Performance Tests

### Test 13: Recording Duration
**Objective:** Verify timer accuracy

**Steps:**
1. Start recording
2. Wait exactly 60 seconds
3. Stop recording
4. Check duration in list

**Expected Results:**
- ✅ Duration shows ~60 seconds
- ✅ Accuracy within ±2 seconds
- ✅ Timer display smooth

**Pass/Fail:** ___________

---

### Test 14: Storage Usage
**Objective:** Verify storage calculations

**Steps:**
1. Create 3 recordings of 30 seconds each
2. Check total size in storage info
3. Verify math: 3 × ~30s = ~90s

**Expected Results:**
- ✅ Total size calculated correctly
- ✅ Individual sizes shown
- ✅ No storage errors

**Pass/Fail:** ___________

---

## Stress Tests

### Test 15: Rapid Start/Stop
**Objective:** Verify stability with rapid operations

**Steps:**
1. Start recording
2. Stop after 2 seconds
3. Start recording
4. Stop after 2 seconds
5. Repeat 5 times
6. Check all recordings in list

**Expected Results:**
- ✅ All recordings created successfully
- ✅ No crashes or errors
- ✅ All recordings appear in list
- ✅ App remains responsive

**Pass/Fail:** ___________

---

### Test 16: Long Recording
**Objective:** Verify stability with long recordings

**Steps:**
1. Start recording
2. Wait 5 minutes
3. Stop recording
4. Check recording details

**Expected Results:**
- ✅ Recording completes successfully
- ✅ Duration shows ~300 seconds
- ✅ File size reasonable (~50-100MB)
- ✅ No memory leaks

**Pass/Fail:** ___________

---

## Summary

**Total Tests:** 16
**Passed:** _____
**Failed:** _____
**Pass Rate:** _____%

### Issues Found
(List any issues discovered during testing)

1. ___________________________________________
2. ___________________________________________
3. ___________________________________________

### Recommendations
(Any improvements or fixes needed)

1. ___________________________________________
2. ___________________________________________
3. ___________________________________________

### Sign-Off
- Tester: ___________________
- Date: ___________________
- Status: ☐ PASS ☐ FAIL


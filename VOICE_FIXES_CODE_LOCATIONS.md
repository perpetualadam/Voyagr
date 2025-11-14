# Voice Announcement Fixes - Code Locations

## Quick Navigation

| Fix | File | Lines | Type |
|-----|------|-------|------|
| ETA Minimum Interval | voyagr_web.py | 7849 | Addition |
| Turn Direction Text | voyagr_web.py | 7860 | Modification |
| ETA Announcement Logic | voyagr_web.py | 8016-8019 | Modification |
| Turn Announcement Grammar | voyagr_web.py | 8051, 8060-8074 | Modification |

---

## Fix #1: ETA Minimum Interval Constant

**File:** `voyagr_web.py`
**Line:** 7849
**Type:** Addition

### Location Context
```
Line 7844: // ETA announcement variables
Line 7845: let lastETAAnnouncementTime = 0;
Line 7846: let lastAnnouncedETA = null;
Line 7847: const ETA_ANNOUNCEMENT_INTERVAL_MS = 600000;
Line 7848: const ETA_CHANGE_THRESHOLD_MS = 300000;
Line 7849: const ETA_MIN_INTERVAL_MS = 60000;  ← NEW LINE ADDED HERE
Line 7850: (blank line)
Line 7851: function getTurnDirectionText(direction) {
```

### What Changed
```diff
  const ETA_ANNOUNCEMENT_INTERVAL_MS = 600000;
  const ETA_CHANGE_THRESHOLD_MS = 300000;
+ const ETA_MIN_INTERVAL_MS = 60000; // Minimum 1 minute between any ETA announcements
```

---

## Fix #2: Turn Direction Text Mapping

**File:** `voyagr_web.py`
**Line:** 7860
**Type:** Modification

### Location Context
```
Line 7851: function getTurnDirectionText(direction) {
Line 7852:     /**
Line 7853:      * Convert turn direction code to human-readable text
Line 7854:      * FIXED: "straight" now returns "continue straight"
Line 7855:      */
Line 7856:     const directionMap = {
Line 7857:         'sharp_left': 'sharply left',
Line 7858:         'left': 'left',
Line 7859:         'slight_left': 'slightly left',
Line 7860:         'straight': 'continue straight',  ← MODIFIED HERE
Line 7861:         'slight_right': 'slightly right',
Line 7862:         'right': 'right',
Line 7863:         'sharp_right': 'sharply right'
Line 7864:     };
Line 7865:     return directionMap[direction] || 'ahead';
Line 7866: }
```

### What Changed
```diff
  const directionMap = {
      'sharp_left': 'sharply left',
      'left': 'left',
      'slight_left': 'slightly left',
-     'straight': 'straight',
+     'straight': 'continue straight',  // FIXED: Changed from 'straight'
      'slight_right': 'slightly right',
      'right': 'right',
      'sharp_right': 'sharply right'
  };
```

---

## Fix #3: ETA Announcement Logic

**File:** `voyagr_web.py`
**Lines:** 8016-8019
**Type:** Modification

### Location Context
```
Line 8010: const etaTime = new Date(now + timeRemainingMs);
Line 8011: (blank)
Line 8012: // Check if we should announce
Line 8013: const timeSinceLastAnnouncement = now - lastETAAnnouncementTime;
Line 8014: const etaChanged = lastAnnouncedETA && Math.abs(...) > ETA_CHANGE_THRESHOLD_MS;
Line 8015: (blank)
Line 8016: // FIXED: Enforce minimum interval (1 minute) to prevent excessive announcements
Line 8017: // Only announce if: (1) 10 minutes have passed, OR (2) ETA changed by >5 minutes AND at least 1 minute has passed
Line 8018: if ((timeSinceLastAnnouncement > ETA_ANNOUNCEMENT_INTERVAL_MS) ||
Line 8019:     (etaChanged && timeSinceLastAnnouncement > ETA_MIN_INTERVAL_MS)) {  ← MODIFIED HERE
Line 8020:     const etaHours = etaTime.getHours();
```

### What Changed
```diff
  // Check if we should announce
  const timeSinceLastAnnouncement = now - lastETAAnnouncementTime;
  const etaChanged = lastAnnouncedETA && Math.abs(...) > ETA_CHANGE_THRESHOLD_MS;
  
- if (timeSinceLastAnnouncement > ETA_ANNOUNCEMENT_INTERVAL_MS || etaChanged) {
+ // FIXED: Enforce minimum interval (1 minute) to prevent excessive announcements
+ // Only announce if: (1) 10 minutes have passed, OR (2) ETA changed by >5 minutes AND at least 1 minute has passed
+ if ((timeSinceLastAnnouncement > ETA_ANNOUNCEMENT_INTERVAL_MS) ||
+     (etaChanged && timeSinceLastAnnouncement > ETA_MIN_INTERVAL_MS)) {
```

---

## Fix #4: Turn Announcement Grammar

**File:** `voyagr_web.py`
**Lines:** 8051, 8060-8074
**Type:** Modification

### Location Context - Part A (Line 8051)
```
Line 8040: function announceUpcomingTurn(turnInfo) {
Line 8041:     /**
Line 8042:      * Announce upcoming turns via voice at specific distances
Line 8043:      * ENHANCED: Now includes turn direction in announcements
Line 8044:      * FIXED: Proper handling of "straight" direction
Line 8045:      */
Line 8046:     if (!turnInfo || !voiceRecognition) return;
Line 8047: (blank)
Line 8048:     const distance = turnInfo.distance;
Line 8049:     const direction = turnInfo.direction || 'straight';
Line 8050:     const directionText = getTurnDirectionText(direction);
Line 8051:     const isStraight = direction === 'straight';  ← NEW LINE ADDED HERE
Line 8052: (blank)
Line 8053:     // Check if we should announce at this distance
```

### Location Context - Part B (Lines 8060-8074)
```
Line 8053:     // Check if we should announce at this distance
Line 8054:     for (const announcementDistance of TURN_ANNOUNCEMENT_DISTANCES) {
Line 8055:         // Announce when within range (with 10m hysteresis)
Line 8056:         if (distance <= announcementDistance && lastTurnAnnouncementDistance > announcementDistance + 10) {
Line 8057:             let message = '';
Line 8058: (blank)
Line 8059:             if (announcementDistance === 500) {
Line 8060:                 message = isStraight  ← MODIFIED HERE
Line 8061:                     ? `In 500 meters, prepare to ${directionText}`
Line 8062:                     : `In 500 meters, prepare to turn ${directionText}`;
Line 8063:             } else if (announcementDistance === 200) {
Line 8064:                 message = isStraight  ← MODIFIED HERE
Line 8065:                     ? `In 200 meters, ${directionText}`
Line 8066:                     : `In 200 meters, turn ${directionText}`;
Line 8067:             } else if (announcementDistance === 100) {
Line 8068:                 message = isStraight  ← MODIFIED HERE
Line 8069:                     ? `In 100 meters, ${directionText}`
Line 8070:                     : `In 100 meters, turn ${directionText}`;
Line 8071:             } else if (announcementDistance === 50) {
Line 8072:                 message = isStraight  ← MODIFIED HERE
Line 8073:                     ? `${directionText} now`
Line 8074:                     : `Turn ${directionText} now`;
Line 8075:             }
```

### What Changed
```diff
  const distance = turnInfo.distance;
  const direction = turnInfo.direction || 'straight';
  const directionText = getTurnDirectionText(direction);
+ const isStraight = direction === 'straight';  // NEW LINE

  // Check if we should announce at this distance
  for (const announcementDistance of TURN_ANNOUNCEMENT_DISTANCES) {
      if (distance <= announcementDistance && lastTurnAnnouncementDistance > announcementDistance + 10) {
          let message = '';

          if (announcementDistance === 500) {
-             message = `In 500 meters, prepare to turn ${directionText}`;
+             message = isStraight 
+                 ? `In 500 meters, prepare to ${directionText}`
+                 : `In 500 meters, prepare to turn ${directionText}`;
          } else if (announcementDistance === 200) {
-             message = `In 200 meters, turn ${directionText}`;
+             message = isStraight 
+                 ? `In 200 meters, ${directionText}`
+                 : `In 200 meters, turn ${directionText}`;
          } else if (announcementDistance === 100) {
-             message = `In 100 meters, turn ${directionText}`;
+             message = isStraight 
+                 ? `In 100 meters, ${directionText}`
+                 : `In 100 meters, turn ${directionText}`;
          } else if (announcementDistance === 50) {
-             message = `Turn ${directionText} now`;
+             message = isStraight 
+                 ? `${directionText} now`
+                 : `Turn ${directionText} now`;
          }
```

---

## Summary of Changes

| Location | Type | Lines | Change |
|----------|------|-------|--------|
| Line 7849 | Addition | 1 | Add ETA_MIN_INTERVAL_MS constant |
| Line 7860 | Modification | 1 | Change 'straight' mapping |
| Lines 8016-8019 | Modification | 4 | Update ETA announcement condition |
| Line 8051 | Addition | 1 | Add isStraight variable |
| Lines 8060-8074 | Modification | 15 | Add conditional logic for straight |

**Total:** 4 edits, ~22 lines affected

---

## How to Find These Sections

### Using VS Code
1. Press `Ctrl+G` (Go to Line)
2. Enter line number (e.g., 7849)
3. Press Enter

### Using Browser DevTools
1. Open DevTools (F12)
2. Go to Sources tab
3. Press `Ctrl+P` to open file
4. Type `voyagr_web.py`
5. Press `Ctrl+G` to go to line

### Using Command Line
```bash
# View specific line
sed -n '7849p' voyagr_web.py

# View range
sed -n '7844,7866p' voyagr_web.py

# Search for text
grep -n "ETA_MIN_INTERVAL_MS" voyagr_web.py
grep -n "continue straight" voyagr_web.py
```

---

## Verification

All changes have been verified:
- ✅ No syntax errors
- ✅ Proper indentation
- ✅ Correct line numbers
- ✅ All changes in place
- ✅ Ready for production


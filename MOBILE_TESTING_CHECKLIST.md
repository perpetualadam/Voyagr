# Voyagr Mobile Testing Checklist

## Test Environment
- **Device:** Android phone (API 21+)
- **App Version:** 1.0.0
- **Build Type:** Debug APK
- **Test Date:** [Date]
- **Tester:** [Name]

---

## 1. Installation & Launch ✅

### Installation
- [ ] APK installed successfully via `adb install`
- [ ] App icon appears on home screen
- [ ] App launches without crashes
- [ ] Permissions dialog appears on first launch
- [ ] User can grant all required permissions

### Initial Launch
- [ ] App loads within 5 seconds
- [ ] Map displays current location
- [ ] Settings panel scrolls smoothly
- [ ] No error messages on startup
- [ ] Database initializes correctly

---

## 2. Basic Navigation Features

### Map Display
- [ ] Map shows current location (blue dot)
- [ ] Map zoom works (pinch gesture)
- [ ] Map pan works (swipe gesture)
- [ ] Double-tap zooms to current location
- [ ] Map tiles load without artifacts
- [ ] Zoom levels 1-20 all work

### GPS Tracking
- [ ] GPS acquires location within 10 seconds
- [ ] Location updates every 1-5 seconds
- [ ] Blue dot moves smoothly as you walk/drive
- [ ] Accuracy indicator shows (if available)
- [ ] GPS works indoors and outdoors

### Route Calculation
- [ ] Can enter destination address
- [ ] Route calculates successfully
- [ ] Route displays on map as polyline
- [ ] ETA displays correctly
- [ ] Distance displays correctly
- [ ] Route respects routing mode (auto/pedestrian/bicycle)

---

## 3. Social Features - Share Routes

### Feature Toggle
- [ ] "Social Features" toggle visible in settings
- [ ] Toggle can be turned on/off
- [ ] Toggle state persists after app restart
- [ ] Enabling toggle doesn't crash app

### Share Route via Link
- [ ] "Share Route" button appears when route calculated
- [ ] Clicking generates share token
- [ ] Share token displays (32 characters)
- [ ] Token can be copied to clipboard
- [ ] Token expires after 24 hours (verify in database)
- [ ] Notification shows "Route Shared"

### Share Route via QR Code
- [ ] QR code generates successfully
- [ ] QR code displays on screen
- [ ] QR code can be scanned with another device
- [ ] QR code contains route data
- [ ] QR code expires after 24 hours

### Import Shared Route
- [ ] Can paste share token
- [ ] Route imports successfully
- [ ] Imported route displays on map
- [ ] Imported route shows correct destination
- [ ] Expired tokens rejected with error message
- [ ] Invalid tokens rejected with error message

### Sharing History
- [ ] "View Sharing History" shows all shared routes
- [ ] History displays sender, recipient, timestamp
- [ ] History shows expiry time
- [ ] Can delete old shared routes
- [ ] History persists across app restarts

---

## 4. Social Features - Community Hazard Reports

### Feature Toggle
- [ ] "Community Hazard Reports" toggle visible
- [ ] Toggle can be turned on/off
- [ ] Enabling toggle doesn't crash app

### Submit Hazard Report
- [ ] "Submit Hazard Report" button appears
- [ ] Dialog opens with form fields
- [ ] Can select hazard type (7 types):
  - [ ] Accident
  - [ ] Roadwork
  - [ ] Police
  - [ ] Hazard
  - [ ] Congestion
  - [ ] Weather
  - [ ] Closure
- [ ] Can enter description (text input)
- [ ] Can select severity (low/medium/high)
- [ ] Current location auto-fills coordinates
- [ ] Can manually enter coordinates
- [ ] Submit button creates report
- [ ] Notification shows "Report Submitted"
- [ ] Report ID displays

### Rate Limiting
- [ ] Can submit up to 100 reports per day
- [ ] 101st report shows error: "Rate limit exceeded"
- [ ] Rate limit resets at midnight
- [ ] User can see remaining reports for today

### Nearby Reports
- [ ] "View Nearby Reports" button appears
- [ ] Fetches reports within 50km radius
- [ ] Reports display with:
  - [ ] Hazard type
  - [ ] Distance from current location
  - [ ] Severity level
  - [ ] Verification count
  - [ ] Timestamp
- [ ] Reports sorted by verification count (highest first)
- [ ] Can filter by hazard type
- [ ] Can filter by severity
- [ ] Fetching completes in <1 second

### Report Verification
- [ ] Can upvote/verify reports
- [ ] Verification count increases
- [ ] Can only verify once per report
- [ ] Verification persists across app restarts

### Report Moderation
- [ ] Can approve reports (if admin)
- [ ] Can reject reports (if admin)
- [ ] Can remove reports (if admin)
- [ ] Moderation actions logged

### Report Display on Map
- [ ] Hazard reports show as markers on map
- [ ] Markers color-coded by severity:
  - [ ] Red = High
  - [ ] Orange = Medium
  - [ ] Yellow = Low
- [ ] Clicking marker shows report details
- [ ] Reports expire after 48 hours (auto-removed)

---

## 5. Social Features - Trip Groups

### Feature Toggle
- [ ] "Social Trip Planning" toggle visible
- [ ] Toggle can be turned on/off
- [ ] Enabling toggle doesn't crash app

### Create Trip Group
- [ ] "Create Group" button appears
- [ ] Dialog opens with form fields
- [ ] Can enter group name
- [ ] Can add members (by user ID)
- [ ] Creator automatically added as member
- [ ] Group created successfully
- [ ] Group ID displays
- [ ] Notification shows "Group Created"

### Group Management
- [ ] Can view all groups user is member of
- [ ] Can view group members
- [ ] Can add new members to group
- [ ] Can remove members from group
- [ ] Can delete group (creator only)
- [ ] Group list persists across app restarts

### Propose Trip
- [ ] "Propose Trip" button appears in group
- [ ] Dialog opens with form fields
- [ ] Can enter destination name
- [ ] Can enter destination coordinates
- [ ] Can set departure time
- [ ] Trip proposal created successfully
- [ ] Proposal ID displays
- [ ] Notification shows "Trip Proposed"

### Vote on Trip
- [ ] Can see all trip proposals for group
- [ ] Can vote "Yes", "No", or "Maybe"
- [ ] Vote count updates in real-time
- [ ] Can change vote
- [ ] Vote persists across app restarts
- [ ] Can see who voted what (if privacy allows)

### Finalize Trip
- [ ] Trip finalizes when majority votes "Yes"
- [ ] Trip status changes to "Confirmed"
- [ ] Notification shows "Trip Confirmed"
- [ ] Trip displays on calendar/schedule
- [ ] Can view confirmed trip details
- [ ] Can navigate to confirmed trip destination

### Trip History
- [ ] Can view past trips
- [ ] Can view trip details (destination, date, participants)
- [ ] Can rate past trips
- [ ] Can leave comments on past trips

---

## 6. Routing Modes

### Auto (Car) Mode
- [ ] Toggle "Auto (Car)" works
- [ ] Route optimizes for car travel
- [ ] Toll costs calculated
- [ ] Fuel costs calculated
- [ ] CAZ charges calculated
- [ ] Speed limits respected

### Pedestrian Mode
- [ ] Toggle "Pedestrian (Walking)" works
- [ ] Route optimizes for walking
- [ ] Avoids highways
- [ ] No toll/fuel/energy costs shown
- [ ] Walking time estimates accurate

### Bicycle Mode
- [ ] Toggle "Bicycle (Cycling)" works
- [ ] Route optimizes for cycling
- [ ] Avoids highways
- [ ] No toll/fuel/energy costs shown
- [ ] Cycling time estimates accurate

---

## 7. Alerts & Notifications

### Speed Alerts
- [ ] Speed alert toggle works
- [ ] Alert triggers when speeding
- [ ] Notification shows current/limit speeds
- [ ] Voice alert plays (if enabled)
- [ ] Alert cooldown prevents spam (5 seconds)

### Traffic Alerts
- [ ] Traffic alert toggle works
- [ ] Alert triggers for heavy traffic
- [ ] Notification shows traffic severity
- [ ] Can view traffic on map

### Weather Alerts
- [ ] Weather alert toggle works
- [ ] Alert triggers for severe weather
- [ ] Notification shows weather condition
- [ ] Can view weather on map

### Maintenance Alerts
- [ ] Maintenance alert toggle works
- [ ] Alert triggers when maintenance due
- [ ] Notification shows maintenance type
- [ ] Can view maintenance schedule

### Fuel/Battery Alerts
- [ ] Fuel/battery alert toggle works
- [ ] Alert triggers when low
- [ ] Notification shows remaining range
- [ ] Can find nearby gas/charging stations

---

## 8. Voice Commands

### Wake Word Detection
- [ ] "Hey SatNav" wake word detected
- [ ] Listening indicator appears
- [ ] Microphone activates
- [ ] Voice command recognized

### Voice Commands
- [ ] "Navigate to [location]" works
- [ ] "Go to [location]" works
- [ ] "Find gas stations" works
- [ ] "Find charging stations" works
- [ ] "What's my ETA?" works
- [ ] "Show traffic" works

### Voice Feedback
- [ ] TTS responses play
- [ ] Voice is clear and understandable
- [ ] Responses are contextually appropriate

---

## 9. Performance Testing

### Startup Time
- [ ] App launches in <5 seconds
- [ ] Map displays in <3 seconds
- [ ] Settings panel loads in <2 seconds

### Route Calculation
- [ ] Route calculates in <2 seconds
- [ ] Multi-stop route calculates in <5 seconds
- [ ] Re-routing completes in <3 seconds

### Social Features Performance
- [ ] Share route completes in <500ms
- [ ] Fetch nearby reports completes in <1s
- [ ] Create trip group completes in <500ms
- [ ] Vote on trip completes in <500ms

### Map Performance
- [ ] Smooth scrolling at 60 FPS
- [ ] Zoom transitions smooth
- [ ] No lag when adding markers
- [ ] No lag when removing markers
- [ ] Marker clustering works (if >100 markers)

### Memory Usage
- [ ] App doesn't exceed 200MB RAM
- [ ] No memory leaks after 1 hour use
- [ ] No crashes due to memory

### Battery Usage
- [ ] Battery saving mode reduces drain
- [ ] GPS polling adaptive (0.5s-5s)
- [ ] Background tasks don't drain battery
- [ ] App doesn't overheat device

---

## 10. Crash & Error Testing

### Error Handling
- [ ] Invalid coordinates rejected gracefully
- [ ] Empty descriptions rejected gracefully
- [ ] Network errors handled gracefully
- [ ] GPS timeout handled gracefully
- [ ] API errors handled gracefully

### Crash Testing
- [ ] No crashes on app launch
- [ ] No crashes when enabling features
- [ ] No crashes when disabling features
- [ ] No crashes when submitting reports
- [ ] No crashes when calculating routes
- [ ] No crashes when voting on trips

### Recovery
- [ ] App recovers from network disconnection
- [ ] App recovers from GPS loss
- [ ] App recovers from API timeout
- [ ] App state preserved after crash

---

## 11. Data Persistence

### Database
- [ ] Routes saved to database
- [ ] Shared routes persist across restarts
- [ ] Hazard reports persist across restarts
- [ ] Trip groups persist across restarts
- [ ] User preferences persist across restarts

### Settings
- [ ] Routing mode persists
- [ ] Unit preferences persist
- [ ] Currency preferences persist
- [ ] Alert settings persist
- [ ] Feature toggles persist

---

## 12. Permissions

### Location Permissions
- [ ] Fine location permission requested
- [ ] Coarse location permission requested
- [ ] User can grant/deny permissions
- [ ] App works with permissions granted
- [ ] App gracefully handles denied permissions

### Audio Permissions
- [ ] Microphone permission requested
- [ ] User can grant/deny permission
- [ ] Voice commands work with permission
- [ ] App handles denied permission

### Internet Permissions
- [ ] Internet permission requested
- [ ] API calls work with permission
- [ ] App handles no internet gracefully

---

## 13. UI/UX Testing

### Layout
- [ ] All buttons visible and clickable
- [ ] Text readable (font size appropriate)
- [ ] Colors accessible (contrast sufficient)
- [ ] No overlapping elements
- [ ] Responsive to screen rotation

### Usability
- [ ] Buttons have clear labels
- [ ] Error messages are helpful
- [ ] Success messages are clear
- [ ] Navigation is intuitive
- [ ] Settings are easy to find

### Accessibility
- [ ] Text size adjustable
- [ ] High contrast mode works
- [ ] Screen reader compatible (if available)
- [ ] Touch targets large enough (>48dp)

---

## 14. Summary

### Total Tests: _____ / _____
### Passed: _____ / _____
### Failed: _____ / _____
### Blocked: _____ / _____

### Critical Issues Found:
- [ ] None
- [ ] List issues below:

### Major Issues Found:
- [ ] None
- [ ] List issues below:

### Minor Issues Found:
- [ ] None
- [ ] List issues below:

### Recommendations:
[Space for tester notes]

### Sign-Off
- **Tester Name:** _________________
- **Date:** _________________
- **Status:** [ ] Ready for Release [ ] Needs Fixes [ ] Blocked



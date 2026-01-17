# Bottom Sheet Icons Guide

## 📍 What Are These Icons?

The bottom sheet header has **8 clickable icons** that open different tabs/features:

```
┌────────────────────────────────────────────────────────────┐
│ 🗺️ Navigation  [⭐][📊][🔗][🛣️][📋][📹][⚙️][▼]          │
└────────────────────────────────────────────────────────────┘
```

---

## Icon Reference

| Icon | Name | Function | Status |
|------|------|----------|--------|
| ⭐ | **Saved Routes** | View and use saved routes | ✅ Working |
| 📊 | **Analytics** | View trip statistics | ⚠️ Needs trips |
| 🔗 | **Share Route** | Share current route | ✅ Working |
| 🛣️ | **Route Options** | Compare route alternatives | ✅ Working |
| 📋 | **Trip History** | View past trips | ⚠️ Needs trips |
| 📹 | **Dashcam** | Dashcam recording | ✅ Working |
| ⚙️ | **Settings** | App settings | ✅ Working |
| ▼ | **Collapse** | Collapse bottom sheet | ✅ Working |

---

## 1️⃣ ⭐ Saved Routes

**What it does:** Save and reuse your favorite routes

**How to save a route:**
1. Calculate a route
2. Go to Route Preview tab
3. Scroll down to "Save This Route" section
4. Enter a route name (e.g., "Home to Work")
5. Click "💾 Save Route"

**How to use a saved route:**
1. Click ⭐ icon
2. See list of saved routes
3. Click "🚀 Use This Route" on any route
4. Route loads into navigation tab
5. Click "🚀 Calculate Route" to recalculate

**Storage:** Routes saved in browser localStorage (not database)

**Why it's empty:** You haven't saved any routes yet!

---

## 2️⃣ 📊 Analytics

**What it does:** Shows trip statistics and analytics

**What you'll see:**
- Total trips count
- Total distance traveled
- Total cost (fuel + tolls + CAZ)
- Average trip duration
- Cost breakdown (fuel/tolls/CAZ)
- Most frequent routes

**Why it's empty:** No trips in database yet!

**How trips are saved:**
- Trips are saved when you **complete navigation**
- Must use "🧭 Start Navigation" and finish the journey
- Trips saved to database via `/api/trip-history` endpoint

**To populate analytics:**
1. Calculate a route
2. Click "🧭 Start Navigation"
3. Complete the journey
4. Trip automatically saved
5. Analytics will show data

---

## 3️⃣ 🔗 Share Route

**What it does:** Share your current route with others

**Sharing methods:**
- 📧 Email
- 📱 SMS
- 📋 Copy link
- 🔗 QR code

**How to share:**
1. Calculate a route
2. Click 🔗 icon
3. Choose sharing method
4. Share link/QR code with others

**What gets shared:**
- Start location
- End location
- Route geometry
- Distance & duration
- Cost breakdown

---

## 4️⃣ 🛣️ Route Options

**What it does:** Compare alternative routes

**What you'll see:**
- All calculated route options
- Different route types (fastest, shortest, balanced)
- Hazard counts per route
- Cost comparison
- Distance & duration

**How to use:**
1. Calculate a route (multiple routes returned)
2. Click 🛣️ icon
3. See all route options
4. Click "🗺️ Show All Routes" to see them on map
5. Click any route to select it

**Route types:**
- Fastest route
- Shortest route
- Balanced route
- Scenic route (if available)

---

## 5️⃣ 📋 Trip History

**What it does:** View all past trips

**What you'll see:**
- List of completed trips
- Start → End locations
- Distance & duration
- Cost breakdown
- Timestamp

**Why it's empty:** No trips completed yet!

**How trips are recorded:**
1. Start navigation ("🧭 Start Navigation")
2. Complete the journey
3. Trip automatically saved to database
4. Appears in trip history

**Trip data includes:**
- Start/end coordinates
- Start/end addresses
- Distance (km)
- Duration (minutes)
- Fuel cost
- Toll cost
- CAZ cost
- Routing mode (auto/pedestrian/bicycle)
- Timestamp

---

## 6️⃣ 📹 Dashcam

**What it does:** Record your journey with dashcam

**Features:**
- Video recording
- GPS metadata
- Speed tracking
- Heading tracking
- Playback

**How to use:**
1. Click 📹 icon
2. Click "Start Recording"
3. Drive your route
4. Click "Stop Recording"
5. View recordings in list

**Storage:** Recordings saved to database

---

## 7️⃣ ⚙️ Settings

**What it does:** Configure app preferences

**Settings categories:**
- 🚗 Vehicle settings
- 🚦 Hazard avoidance
- 🅿️ Parking preferences
- 🗺️ Map preferences
- 🔊 Voice settings
- 📏 Units (km/mi, mph/km/h)
- 💰 Currency

**How to use:**
1. Click ⚙️ icon
2. Scroll through settings
3. Toggle switches or adjust sliders
4. Settings auto-save

---

## 8️⃣ ▼ Collapse

**What it does:** Collapses the bottom sheet to show more map

**How to use:**
- Click ▼ to collapse
- Click handle or header to expand again

---

## 🎯 Quick Summary

### Working Features ✅
- ⭐ Saved Routes (save/load routes)
- 🔗 Share Route (share via email/SMS/link)
- 🛣️ Route Options (compare routes)
- 📹 Dashcam (record journeys)
- ⚙️ Settings (configure app)

### Empty Because No Data ⚠️
- 📊 Analytics (needs completed trips)
- 📋 Trip History (needs completed trips)

### How to Populate Trip Data
1. Calculate a route
2. Click "🧭 Start Navigation"
3. Complete the journey
4. Trip auto-saves
5. Analytics & History will populate

---

## 📝 Notes

**Saved Routes vs Trip History:**
- **Saved Routes** = Routes you manually save for reuse (localStorage)
- **Trip History** = Trips you actually completed (database)

**Why use Saved Routes?**
- Save your daily commute
- Save routes to favorite places
- Quick access without re-entering addresses

**Why use Trip History?**
- Track your driving habits
- Analyze costs over time
- See where you've been
- Export trip data

---

**Need Help?** All features are fully functional - just need data to display!


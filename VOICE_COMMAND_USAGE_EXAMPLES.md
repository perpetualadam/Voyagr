# 🎤 Voice Command Usage Examples

---

## 📍 SCENARIO 1: Navigate to a City

**User Goal**: Drive to Manchester from current location

```
User: "Hey SatNav"
App: "Report now"
User: "Navigate to Manchester"
App: "Navigating to Manchester"
App: [Searches for Manchester]
App: "Route to Manchester calculated. 45 km, 52 minutes, £3.50"
UI: [Map shows route, distance, time, cost]
```

**What Happens Behind the Scenes**:
1. Wake word detected → `listen_wake_word()`
2. User speaks → `on_voice_report()` called
3. `parse_voice_command()` recognizes "navigate to manchester"
4. `search_location("manchester")` finds location
5. `calculate_route()` computes route
6. `speak()` announces result
7. `route_summary()` formats output

---

## ⛽ SCENARIO 2: Find Nearest Gas Station

**User Goal**: Find nearby fuel station

```
User: "Hey SatNav"
App: "Report now"
User: "Find nearest gas station"
App: "Searching for nearest gas station"
App: [Searches nearby]
App: "Found Shell Petrol Station 2.3 km away"
UI: [Shows location on map]
```

**What Happens**:
1. `parse_voice_command()` recognizes "find nearest gas station"
2. Maps "gas station" to search term
3. `search_location("gas station")` finds nearby stations
4. Calculates distance using `geodesic()`
5. `speak()` announces result

---

## 🔌 SCENARIO 3: Find EV Charging Station

**User Goal**: Locate charging point for electric vehicle

```
User: "Hey SatNav"
App: "Report now"
User: "Find nearest charging station"
App: "Searching for nearest charging station"
App: [Searches nearby]
App: "Found Tesla Supercharger 5.1 km away"
UI: [Shows charging station on map]
```

**What Happens**:
1. `parse_voice_command()` recognizes "find nearest charging station"
2. Maps "charging station" to search term
3. `search_location("charging station")` finds chargers
4. Calculates distance
5. `speak()` announces result

---

## 💰 SCENARIO 4: Get Cost Breakdown

**User Goal**: Know how much the journey will cost

```
User: "Hey SatNav"
App: "Report now"
User: "How much will this cost?"
App: [Calculates costs]
App: "Journey cost: £3.50 plus £1.20 tolls plus £0.00 CAZ"
UI: [Shows cost breakdown]
```

**What Happens**:
1. `parse_voice_command()` recognizes "how much will this cost"
2. Checks if route exists
3. `calculate_cost()` gets fuel/energy cost
4. `calculate_toll_cost()` gets toll charges
5. `calculate_caz_cost()` gets CAZ charges
6. `speak()` announces breakdown

---

## ⏱️ SCENARIO 5: Check ETA

**User Goal**: Know when you'll arrive

```
User: "Hey SatNav"
App: "Report now"
User: "What's my ETA?"
App: [Checks route]
App: "Estimated time of arrival: 52 minutes"
UI: [Shows ETA on screen]
```

**What Happens**:
1. `parse_voice_command()` recognizes "what's my eta"
2. Checks if route exists
3. Gets ETA from `current_route`
4. `speak()` announces time

---

## 🚫 SCENARIO 6: Avoid Tolls

**User Goal**: Skip toll roads

```
User: "Hey SatNav"
App: "Report now"
User: "Avoid tolls"
App: "Toll avoidance enabled"
UI: [Toggle switches to ON]
```

**What Happens**:
1. `parse_voice_command()` recognizes "avoid tolls"
2. `set_include_tolls(False)` disables tolls
3. `speak()` confirms action
4. Settings saved to database

---

## 🟢 SCENARIO 7: Select Fastest Route

**User Goal**: Get to destination quickly

```
User: "Hey SatNav"
App: "Report now"
User: "Fastest route"
App: "Fastest route selected"
UI: [Route preference updated]
```

**What Happens**:
1. `parse_voice_command()` recognizes "fastest route"
2. Sets route preference
3. `speak()` confirms selection
4. Next route calculation uses this preference

---

## 💚 SCENARIO 8: Avoid Clean Air Zone

**User Goal**: Skip CAZ zones

```
User: "Hey SatNav"
App: "Report now"
User: "Avoid CAZ"
App: "Clean Air Zone avoidance enabled"
UI: [CAZ toggle switches to ON]
```

**What Happens**:
1. `parse_voice_command()` recognizes "avoid caz"
2. `set_caz_avoidance(True)` enables avoidance
3. `speak()` confirms action
4. Settings saved to database

---

## 🚗 SCENARIO 9: Include Tolls

**User Goal**: Use toll roads for faster route

```
User: "Hey SatNav"
App: "Report now"
User: "Include tolls"
App: "Tolls included in route"
UI: [Toll toggle switches to ON]
```

**What Happens**:
1. `parse_voice_command()` recognizes "include tolls"
2. `set_include_tolls(True)` enables tolls
3. `speak()` confirms action
4. Settings saved to database

---

## 🚦 SCENARIO 10: Check Traffic

**User Goal**: Know current traffic conditions

```
User: "Hey SatNav"
App: "Report now"
User: "What's the traffic like?"
App: [Checks traffic]
App: "Traffic is moderate"
UI: [Shows traffic conditions]
```

**What Happens**:
1. `parse_voice_command()` recognizes "what's the traffic like"
2. Checks if route exists
3. `_get_traffic_conditions()` fetches real-time data
4. `speak()` announces conditions

---

## ❌ SCENARIO 11: Unrecognized Command

**User Goal**: Speak something that's not a command

```
User: "Hey SatNav"
App: "Report now"
User: "There's a pothole ahead"
App: "Command not recognized. Please try again."
App: [Falls back to hazard reporting]
App: "Report logged: pothole"
```

**What Happens**:
1. `parse_voice_command()` doesn't recognize input
2. Returns False
3. `on_voice_report()` treats as hazard report
4. Saves to database as pothole report

---

## 🎯 TIPS FOR BEST RESULTS

✅ Speak clearly and naturally  
✅ Use complete phrases  
✅ Wait for "Report now" prompt  
✅ Commands are case-insensitive  
✅ Location names can be flexible  
✅ Unrecognized commands become reports  

---

## 📞 SUPPORT

For more information:
- `VOICE_COMMAND_SYSTEM_GUIDE.md` - Complete guide
- `VOICE_COMMANDS_QUICK_REFERENCE.md` - Quick reference
- `VOICE_COMMAND_IMPLEMENTATION_SUMMARY.md` - Technical details


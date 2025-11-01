# 🏗️ VOYAGR - ARCHITECTURE & CODE STRUCTURE

---

## 📐 APPLICATION ARCHITECTURE

### High-Level Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    VOYAGR APPLICATION                       │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌──────────────────────────────────────────────────────┐   │
│  │              USER INTERFACE (Kivy)                   │   │
│  │  ┌─────────────┐  ┌──────────────┐  ┌────────────┐  │   │
│  │  │  Map View   │  │ Toggle Btns  │  │ Input Flds │  │   │
│  │  └─────────────┘  └──────────────┘  └────────────┘  │   │
│  └──────────────────────────────────────────────────────┘   │
│                           ▲                                   │
│                           │                                   │
│  ┌──────────────────────────────────────────────────────┐   │
│  │           CORE APPLICATION LOGIC                     │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌────────────┐ │   │
│  │  │  Routing     │  │  Cost Calc   │  │  Alerts    │ │   │
│  │  │  Engine      │  │  System      │  │  System    │ │   │
│  │  └──────────────┘  └──────────────┘  └────────────┘ │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌────────────┐ │   │
│  │  │  Search      │  │  Voice/      │  │  Settings  │ │   │
│  │  │  System      │  │  Gesture     │  │  Manager   │ │   │
│  │  └──────────────┘  └──────────────┘  └────────────┘ │   │
│  └──────────────────────────────────────────────────────┘   │
│                           ▲                                   │
│                           │                                   │
│  ┌──────────────────────────────────────────────────────┐   │
│  │           EXTERNAL INTEGRATIONS                      │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌────────────┐ │   │
│  │  │  Valhalla    │  │  Nominatim   │  │  Android   │ │   │
│  │  │  Routing     │  │  Search      │  │  APIs      │ │   │
│  │  └──────────────┘  └──────────────┘  └────────────┘ │   │
│  └──────────────────────────────────────────────────────┘   │
│                           ▲                                   │
│                           │                                   │
│  ┌──────────────────────────────────────────────────────┐   │
│  │           DATA PERSISTENCE LAYER                     │   │
│  │  ┌──────────────────────────────────────────────┐   │   │
│  │  │  SQLite Database (6 Tables)                  │   │   │
│  │  │  - Settings, Tolls, Reports                  │   │   │
│  │  │  - CAZ, Search History, Favorites            │   │   │
│  │  └──────────────────────────────────────────────┘   │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

---

## 🔧 CLASS STRUCTURE

### SatNavApp Class (Main Application)

**Initialization Methods**:
```python
__init__()              # Initialize all components
_init_database()        # Setup SQLite tables
_init_tts()            # Initialize text-to-speech
_init_voice()          # Setup voice detection
_init_gesture()        # Setup gesture recognition
_init_gps()            # Initialize GPS
load_settings()        # Load from database
save_settings()        # Save to database
setup_ui()             # Create Kivy UI
```

**Routing Methods**:
```python
check_valhalla_connection()    # Health check
_make_valhalla_request()       # HTTP with retry
calculate_route()              # Main routing
_fallback_route()              # Offline routing
get_valhalla_costing()         # Costing model
get_costing_options()          # Costing options
```

**Cost Calculation Methods**:
```python
calculate_fuel()               # Fuel consumption
calculate_energy()             # Energy consumption
calculate_cost()               # Total cost
calculate_toll_cost()          # Toll cost
calculate_caz_cost()           # CAZ cost
```

**Unit Conversion Methods**:
```python
to_miles()                     # km to miles
to_km()                        # miles to km
to_fahrenheit()                # C to F
to_celsius()                   # F to C
to_mpg()                       # L/100km to MPG
to_l_per_100km()               # MPG to L/100km
to_miles_per_kwh()             # kWh/100km to miles/kWh
to_kwh_per_100km()             # miles/kWh to kWh/100km
```

**Formatting Methods**:
```python
format_distance()              # Format with unit
format_temperature()           # Format with unit
format_fuel()                  # Format consumption
format_energy()                # Format consumption
format_currency()              # Format with symbol
get_currency_symbol()          # Get symbol
get_currency_name()            # Get name
get_route_summary()            # Route description
```

**Search Methods**:
```python
search_location()              # Nominatim search
add_search_to_history()        # Save search
get_search_history()           # Retrieve searches
add_to_favorites()             # Save favorite
get_favorites()                # Retrieve favorites
set_destination_from_search()  # Set destination
```

**CAZ Methods**:
```python
calculate_caz_cost()           # Calculate cost
set_caz_avoidance()            # Toggle avoidance
set_caz_exemption()            # Toggle exemption
```

**Routing Mode Methods**:
```python
set_routing_mode()             # Change mode
should_show_cost_inputs()      # UI logic
should_show_toll_toggle()      # UI logic
```

**Settings Methods**:
```python
set_distance_unit()            # Change unit
set_temperature_unit()         # Change unit
set_currency_unit()            # Change unit
set_vehicle_type()             # Change type
set_fuel_unit()                # Change unit
set_include_tolls()            # Toggle tolls
update_fuel_efficiency()       # Update value
update_fuel_price()            # Update value
update_energy_efficiency()     # Update value
update_electricity_price()     # Update value
```

**Voice & Gesture Methods**:
```python
listen_wake_word()             # Wake word loop
check_shake()                  # Gesture detection
start_report()                 # Start reporting
on_voice_report()              # Process report
speak()                        # Text-to-speech
```

**Alert Methods**:
```python
check_hazard_incident_alerts() # Check hazards
check_camera_proximity()       # Check cameras
check_toll_proximity()         # Check tolls
check_caz_proximity()          # Check CAZ
check_weather_alerts()         # Check weather
announce_eta()                 # Announce ETA
```

**GPS & Lifecycle Methods**:
```python
on_location()                  # GPS update
on_stop()                      # Cleanup
build()                        # Build UI
```

---

## 📊 DATA FLOW

### Route Calculation Flow

```
User Input (Start/End)
        ↓
check_valhalla_connection()
        ↓
    ┌───┴───┐
    │       │
  YES      NO
    │       │
    ↓       ↓
Valhalla  Fallback
Request   Calculation
    │       │
    └───┬───┘
        ↓
  Check Cache
        ↓
    ┌───┴───┐
    │       │
  HIT     MISS
    │       │
    ↓       ↓
Return   Cache &
Cached   Return
Route    Route
```

### Cost Calculation Flow

```
Route Distance
        ↓
    ┌───┴───┐
    │       │
Vehicle Type
    │       │
    ├─────────────────┐
    │                 │
Petrol/Diesel      Electric
    │                 │
    ↓                 ↓
Fuel Cost         Energy Cost
    │                 │
    └────────┬────────┘
             ↓
        Toll Cost
             ↓
        CAZ Cost
             ↓
      Total Cost
```

### Alert Detection Flow

```
Periodic Check (5-60s)
        ↓
Get Current Position
        ↓
Calculate Distance to Alert
        ↓
    ┌───┴───┐
    │       │
Within  Outside
Range   Range
    │       │
    ↓       ↓
Notify  Skip
+ Voice
```

---

## 🗄️ DATABASE SCHEMA

### Entity Relationship Diagram

```
┌─────────────────┐
│    Settings     │
├─────────────────┤
│ distance_unit   │
│ temperature_unit│
│ currency_unit   │
│ vehicle_type    │
│ fuel_unit       │
│ fuel_efficiency │
│ fuel_price_gbp  │
│ energy_eff      │
│ electricity_pr  │
│ include_tolls   │
│ routing_mode    │
│ avoid_caz       │
│ vehicle_caz_ex  │
└─────────────────┘

┌─────────────────┐
│     Tolls       │
├─────────────────┤
│ road_name       │
│ lat             │
│ lon             │
│ cost_gbp        │
└─────────────────┘

┌─────────────────┐
│    Reports      │
├─────────────────┤
│ lat             │
│ lon             │
│ type            │
│ description     │
│ timestamp       │
└─────────────────┘

┌──────────────────────┐
│ Clean_Air_Zones      │
├──────────────────────┤
│ id (PK)              │
│ zone_name            │
│ city                 │
│ country              │
│ lat                  │
│ lon                  │
│ zone_type            │
│ charge_amount        │
│ currency_code        │
│ active               │
│ operating_hours      │
│ boundary_coords      │
└──────────────────────┘

┌──────────────────────┐
│ Search_History       │
├──────────────────────┤
│ id (PK)              │
│ query                │
│ result_name          │
│ lat                  │
│ lon                  │
│ timestamp            │
└──────────────────────┘

┌──────────────────────┐
│ Favorite_Locations   │
├──────────────────────┤
│ id (PK)              │
│ name                 │
│ address              │
│ lat                  │
│ lon                  │
│ category             │
│ timestamp            │
└──────────────────────┘
```

---

## 🔄 THREADING MODEL

### Main Threads

**1. Main Thread (Kivy)**
- UI rendering
- Event handling
- Clock scheduling

**2. GPS Thread**
- Location updates
- Runs continuously

**3. Voice Detection Thread**
- Wake word listening
- Runs when enabled
- Daemon thread

**4. HTTP Request Threads**
- Valhalla requests
- Nominatim searches
- Blocking operations

### Thread Safety
- SQLite connection per thread
- No shared mutable state
- Event-based communication

---

## 📦 DEPENDENCY GRAPH

```
SatNavApp
├── Kivy (UI)
│   ├── MapView (mapping)
│   ├── BoxLayout (layout)
│   ├── ScrollView (scrolling)
│   ├── ToggleButton (controls)
│   └── TextInput (input)
├── Plyer (cross-platform)
│   ├── GPS (location)
│   ├── Notification (alerts)
│   └── Accelerometer (gesture)
├── Requests (HTTP)
│   ├── Valhalla API
│   └── Nominatim API
├── GeoPy (geolocation)
│   └── Geodesic (distance)
├── SQLite3 (database)
├── pyttsx3 (TTS desktop)
├── Android TTS (TTS mobile)
├── Porcupine (voice detection)
├── PyAudio (audio input)
└── Threading (concurrency)
```

---

## 🎯 CODE ORGANIZATION

### File Structure
```
satnav.py (1,382 lines)
├── Imports (lines 1-44)
├── Constants (lines 46-53)
├── SatNavApp Class (lines 56-1380)
│   ├── Initialization (lines 57-135)
│   ├── Database (lines 137-200)
│   ├── TTS/Voice/Gesture (lines 201-254)
│   ├── Settings (lines 256-281)
│   ├── Unit Conversions (lines 283-306)
│   ├── Cost Calculations (lines 308-431)
│   ├── CAZ Methods (lines 432-482)
│   ├── Routing Methods (lines 484-748)
│   ├── Search Methods (lines 789-913)
│   ├── UI Setup (lines 915-1003)
│   ├── Settings UI (lines 1005-1141)
│   ├── GPS/Voice/Gesture (lines 1143-1217)
│   ├── Alert Checks (lines 1219-1337)
│   ├── TTS (lines 1339-1350)
│   └── Lifecycle (lines 1352-1380)
└── Main Entry (lines 1379-1380)
```

---

## 🚀 EXECUTION FLOW

### Application Startup

```
1. Import modules
2. Load .env configuration
3. Create SatNavApp instance
   ├── Initialize database
   ├── Load settings
   ├── Initialize TTS
   ├── Initialize voice detection
   ├── Initialize gesture detection
   ├── Initialize GPS
   └── Setup UI
4. Schedule periodic checks
5. Start Kivy event loop
6. Listen for user input
7. Process events
8. Update UI
9. Repeat 6-8
```

### User Interaction Flow

```
User Action
    ↓
Kivy Event Handler
    ↓
Application Logic
    ↓
Database Update (if needed)
    ↓
External API Call (if needed)
    ↓
UI Update
    ↓
Notification/Voice (if needed)
```

---

**Status**: ✅ **WELL-ARCHITECTED & MAINTAINABLE**

**End of Architecture & Code Structure**


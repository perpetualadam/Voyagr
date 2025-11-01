# 📖 VOYAGR - USAGE EXAMPLES & API REFERENCE

---

## 🎮 USAGE EXAMPLES

### Example 1: Calculate Route with Cost

```python
from satnav import SatNavApp

app = SatNavApp()

# Set routing mode
app.set_routing_mode('auto')

# Calculate route (London to Manchester)
route = app.calculate_route(51.5074, -0.1278, 53.4808, -2.2426)

# Get costs
fuel_cost = app.calculate_cost(app.route_distance)
toll_cost = app.calculate_toll_cost()
caz_cost = app.calculate_caz_cost()
total_cost = fuel_cost + toll_cost + caz_cost

# Display results
print(f"Distance: {app.format_distance(app.route_distance * 1000)}")
print(f"Time: {app.route_time / 60:.0f} minutes")
print(f"Fuel cost: {app.format_currency(fuel_cost)}")
print(f"Toll cost: {app.format_currency(toll_cost)}")
print(f"CAZ cost: {app.format_currency(caz_cost)}")
print(f"Total: {app.format_currency(total_cost)}")
```

### Example 2: Search for Location

```python
# Search for pizza restaurants
results = app.search_location("Pizza near me")

if results['success']:
    for result in results['results'][:3]:
        print(f"{result['name']}")
        print(f"  Address: {result['address']}")
        print(f"  Distance: {result['distance']:.0f}m")
        print(f"  Coordinates: {result['lat']}, {result['lon']}")
        print()
```

### Example 3: Add to Favorites

```python
# Add search result to favorites
location = {
    'name': 'Mario\'s Pizza',
    'address': '123 Main St, London',
    'lat': 51.5074,
    'lon': -0.1278,
    'category': 'restaurant'
}

app.add_to_favorites(location)
# Output: "Added Mario's Pizza to favorites"
```

### Example 4: Change Settings

```python
# Change distance unit
app.set_distance_unit('mi')

# Change currency
app.set_currency_unit('USD')

# Change vehicle type
app.set_vehicle_type('electric')

# Update fuel efficiency
app.fuel_efficiency = 18.5  # kWh/100km
app.save_settings()

# Toggle toll inclusion
app.set_include_tolls(False)

# Toggle CAZ avoidance
app.set_caz_avoidance(True)
```

### Example 5: Different Routing Modes

```python
# Auto (car) routing
app.set_routing_mode('auto')
route_auto = app.calculate_route(51.5074, -0.1278, 53.4808, -2.2426)
print(f"Driving: {app.route_distance:.1f} km, {app.route_time/60:.0f} min")

# Pedestrian routing
app.set_routing_mode('pedestrian')
route_walk = app.calculate_route(51.5074, -0.1278, 53.4808, -2.2426)
print(f"Walking: {app.route_distance:.1f} km, {app.route_time/60:.0f} min")

# Bicycle routing
app.set_routing_mode('bicycle')
route_bike = app.calculate_route(51.5074, -0.1278, 53.4808, -2.2426)
print(f"Cycling: {app.route_distance:.1f} km, {app.route_time/60:.0f} min")
```

### Example 6: Unit Conversions

```python
# Distance conversions
km = 100
miles = app.to_miles(km)
print(f"{km} km = {miles:.2f} miles")

# Temperature conversions
celsius = 20
fahrenheit = app.to_fahrenheit(celsius)
print(f"{celsius}°C = {fahrenheit:.1f}°F")

# Fuel efficiency conversions
l_per_100km = 6.5
mpg = app.to_mpg(l_per_100km)
print(f"{l_per_100km} L/100km = {mpg:.1f} MPG")

# Energy efficiency conversions
kwh_per_100km = 18.5
miles_per_kwh = app.to_miles_per_kwh(kwh_per_100km)
print(f"{kwh_per_100km} kWh/100km = {miles_per_kwh:.2f} miles/kWh")
```

### Example 7: Voice Reporting

```python
# User says "Hey SatNav"
# App responds "Report now"
# User says "Pothole on the left"

# App automatically:
# 1. Detects "pothole" in speech
# 2. Logs report with current location
# 3. Saves to database
# 4. Announces "Report logged: pothole"

# Retrieve reports
app.cursor.execute("SELECT * FROM reports WHERE type='pothole'")
potholes = app.cursor.fetchall()
print(f"Found {len(potholes)} pothole reports")
```

---

## 🔌 API REFERENCE

### Routing Methods

#### `check_valhalla_connection()`
**Purpose**: Check if Valhalla server is available  
**Returns**: `bool` (True if available, False otherwise)  
**Caching**: 60 seconds  
**Example**:
```python
if app.check_valhalla_connection():
    print("Valhalla is available")
else:
    print("Using fallback routing")
```

#### `calculate_route(start_lat, start_lon, end_lat, end_lon)`
**Purpose**: Calculate route between two points  
**Parameters**:
- `start_lat` (float): Starting latitude
- `start_lon` (float): Starting longitude
- `end_lat` (float): Ending latitude
- `end_lon` (float): Ending longitude

**Returns**: `dict` (Valhalla response or fallback route)  
**Example**:
```python
route = app.calculate_route(51.5074, -0.1278, 53.4808, -2.2426)
```

#### `_fallback_route(start_lat, start_lon, end_lat, end_lon)`
**Purpose**: Calculate route offline using geodesic distance  
**Returns**: `dict` (simplified route object)  
**Note**: Called automatically if Valhalla unavailable

### Cost Calculation Methods

#### `calculate_cost(km)`
**Purpose**: Calculate fuel/energy cost for distance  
**Parameters**: `km` (float): Distance in kilometers  
**Returns**: `float` (cost in GBP)  
**Example**:
```python
cost = app.calculate_cost(100)  # £9.10 for 100km
```

#### `calculate_fuel(km, efficiency, unit)`
**Purpose**: Calculate fuel consumption  
**Parameters**:
- `km` (float): Distance
- `efficiency` (float): Fuel efficiency
- `unit` (str): 'l_per_100km' or 'mpg'

**Returns**: `float` (liters)

#### `calculate_energy(km, efficiency, unit)`
**Purpose**: Calculate energy consumption  
**Parameters**:
- `km` (float): Distance
- `efficiency` (float): Energy efficiency
- `unit` (str): 'kwh_per_100km' or 'miles_per_kwh'

**Returns**: `float` (kWh)

#### `calculate_toll_cost()`
**Purpose**: Calculate total toll cost for route  
**Returns**: `float` (cost in GBP)

#### `calculate_caz_cost()`
**Purpose**: Calculate total CAZ charges for route  
**Returns**: `float` (cost in GBP)

### Search Methods

#### `search_location(query)`
**Purpose**: Search for location using Nominatim  
**Parameters**: `query` (str): Search query  
**Returns**: `dict` with 'success' or 'error' key  
**Rate limit**: 1 request/second  
**Example**:
```python
results = app.search_location("Pizza near me")
```

#### `add_to_favorites(location)`
**Purpose**: Add location to favorites  
**Parameters**: `location` (dict): Location object  
**Returns**: `bool` (True if successful)  
**Example**:
```python
app.add_to_favorites({
    'name': 'Mario\'s Pizza',
    'lat': 51.5074,
    'lon': -0.1278
})
```

#### `get_favorites()`
**Purpose**: Retrieve all favorite locations  
**Returns**: `list` of tuples (name, address, lat, lon, category)

#### `get_search_history()`
**Purpose**: Retrieve search history  
**Returns**: `list` of tuples (query, result_name, lat, lon)

### Settings Methods

#### `set_routing_mode(mode)`
**Purpose**: Change routing mode  
**Parameters**: `mode` (str): 'auto', 'pedestrian', or 'bicycle'  
**Example**:
```python
app.set_routing_mode('pedestrian')
```

#### `set_distance_unit(unit)`
**Purpose**: Change distance unit  
**Parameters**: `unit` (str): 'km' or 'mi'

#### `set_currency_unit(unit)`
**Purpose**: Change currency  
**Parameters**: `unit` (str): 'GBP', 'USD', or 'EUR'

#### `set_vehicle_type(vehicle_type)`
**Purpose**: Change vehicle type  
**Parameters**: `vehicle_type` (str): 'petrol_diesel' or 'electric'

#### `set_fuel_unit(unit)`
**Purpose**: Change fuel/energy unit  
**Parameters**: `unit` (str): 'l_per_100km', 'mpg', 'kwh_per_100km', or 'miles_per_kwh'

#### `set_include_tolls(value)`
**Purpose**: Toggle toll inclusion  
**Parameters**: `value` (bool): True to include, False to exclude

#### `set_caz_avoidance(enabled)`
**Purpose**: Toggle CAZ avoidance  
**Parameters**: `enabled` (bool): True to avoid, False to allow

#### `set_caz_exemption(exempt)`
**Purpose**: Mark vehicle as CAZ exempt  
**Parameters**: `exempt` (bool): True if exempt, False otherwise

### Formatting Methods

#### `format_distance(meters)`
**Purpose**: Format distance with selected unit  
**Parameters**: `meters` (float): Distance in meters  
**Returns**: `str` (formatted distance)  
**Example**:
```python
print(app.format_distance(100000))  # "100.00 km" or "62.14 miles"
```

#### `format_currency(amount)`
**Purpose**: Format currency with symbol  
**Parameters**: `amount` (float): Amount in GBP  
**Returns**: `str` (formatted currency)  
**Example**:
```python
print(app.format_currency(9.10))  # "£9.10" or "$9.10" or "€9.10"
```

#### `format_temperature(celsius)`
**Purpose**: Format temperature with unit  
**Parameters**: `celsius` (float): Temperature in Celsius  
**Returns**: `str` (formatted temperature)

#### `format_fuel(litres)`
**Purpose**: Format fuel consumption  
**Parameters**: `litres` (float): Fuel in liters  
**Returns**: `str` (formatted fuel)

#### `format_energy(kwh)`
**Purpose**: Format energy consumption  
**Parameters**: `kwh` (float): Energy in kWh  
**Returns**: `str` (formatted energy)

### Unit Conversion Methods

#### `to_miles(km)` → `float`
#### `to_km(miles)` → `float`
#### `to_fahrenheit(celsius)` → `float`
#### `to_celsius(fahrenheit)` → `float`
#### `to_mpg(l_per_100km)` → `float`
#### `to_l_per_100km(mpg)` → `float`
#### `to_miles_per_kwh(kwh_per_100km)` → `float`
#### `to_kwh_per_100km(miles_per_kwh)` → `float`

### Voice & Gesture Methods

#### `speak(message)`
**Purpose**: Speak message using TTS  
**Parameters**: `message` (str): Text to speak  
**Example**:
```python
app.speak("Route calculated")
```

#### `listen_wake_word()`
**Purpose**: Listen for wake word ("Hey SatNav")  
**Note**: Runs in separate thread

#### `check_shake(dt)`
**Purpose**: Check for shake gesture  
**Note**: Called periodically by Kivy Clock

### Database Methods

#### `load_settings()`
**Purpose**: Load settings from database

#### `save_settings()`
**Purpose**: Save settings to database

#### `add_search_to_history(query, result)`
**Purpose**: Add search to history

---

## 🔑 CONFIGURATION

### Environment Variables (.env)
```
VALHALLA_URL=http://141.147.102.102:8002
VALHALLA_TIMEOUT=30
VALHALLA_RETRIES=3
VALHALLA_RETRY_DELAY=1
```

### Default Settings
```python
distance_unit = 'km'
temperature_unit = 'C'
currency_unit = 'GBP'
vehicle_type = 'petrol_diesel'
fuel_unit = 'l_per_100km'
fuel_efficiency = 6.5
fuel_price_gbp = 1.40
energy_efficiency = 18.5
electricity_price_gbp = 0.30
include_tolls = True
routing_mode = 'auto'
avoid_caz = False
vehicle_caz_exempt = False
```

---

**Status**: ✅ **COMPLETE API REFERENCE**

**End of Usage Examples & API Reference**


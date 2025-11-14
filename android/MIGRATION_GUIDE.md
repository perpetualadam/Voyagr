# Python to Kotlin Migration Guide

This guide explains how the Voyagr Python code has been ported to Kotlin Android.

## Cost Calculation

### Python (voyagr_web.py)

```python
def calculate_fuel_cost(distance_km, fuel_efficiency, fuel_price):
    """Calculate fuel cost in GBP."""
    return (distance_km / fuel_efficiency) * fuel_price

def calculate_toll_cost(route_coords, vehicle_type):
    """Calculate toll cost for UK toll roads."""
    total_toll = 0.0
    for toll_name, toll_cost in UK_TOLLS.items():
        # Check if route passes through toll road
        if route_passes_through(route_coords, toll_name):
            total_toll += toll_cost
    return total_toll

def calculate_caz_cost(route_coords, vehicle_type):
    """Calculate CAZ charge."""
    if vehicle_type in CAZ_EXEMPT_TYPES:
        return 0.0
    
    total_caz = 0.0
    for zone_name, zone_center in UK_CAZ_ZONES.items():
        if route_passes_through_zone(route_coords, zone_center):
            total_caz += CAZ_CHARGES[vehicle_type]
    return total_caz
```

### Kotlin (CostCalculator.kt)

```kotlin
object CostCalculator {
    fun calculateFuelCost(distanceKm: Double, vehicle: Vehicle): Double {
        return (distanceKm / vehicle.fuelEfficiency) * vehicle.fuelPrice
    }
    
    fun calculateTollCost(
        vehicle: Vehicle,
        routeCoordinates: List<Pair<Double, Double>> = emptyList()
    ): Double {
        var totalToll = 0.0
        for ((tollName, tollCost) in UK_TOLLS) {
            // TODO: Implement actual toll road detection
        }
        return totalToll
    }
    
    fun calculateCazCost(
        vehicle: Vehicle,
        routeCoordinates: List<Pair<Double, Double>> = emptyList()
    ): Double {
        if (vehicle.isCazExempt) return 0.0
        
        var totalCazCost = 0.0
        val cazZonesHit = mutableSetOf<String>()
        
        for ((zoneName, zoneCenter) in UK_CAZ_ZONES) {
            for (coord in routeCoordinates) {
                val distance = calculateHaversineDistance(
                    coord.first, coord.second,
                    zoneCenter.first, zoneCenter.second
                )
                
                if (distance <= CAZ_RADIUS_KM && !cazZonesHit.contains(zoneName)) {
                    cazZonesHit.add(zoneName)
                    totalCazCost += getCazCharge(vehicle.vehicleType)
                    break
                }
            }
        }
        return totalCazCost
    }
}
```

## Route Calculation

### Python (satnav.py)

```python
def calculate_route(self, start_lat, start_lon, end_lat, end_lon):
    """Calculate route using Valhalla."""
    payload = {
        "locations": [
            {"lat": start_lat, "lon": start_lon},
            {"lat": end_lat, "lon": end_lon}
        ],
        "costing": "auto",
        "format": "json"
    }
    
    response = requests.post(
        f"{VALHALLA_URL}/route",
        json=payload,
        timeout=30
    )
    
    if response.status_code == 200:
        return response.json()
    return None
```

### Kotlin (RoutingService.kt)

```kotlin
suspend fun calculateRoute(
    startLat: Double,
    startLon: Double,
    endLat: Double,
    endLon: Double,
    routingMode: String = "auto"
): Route? {
    // Try GraphHopper first
    try {
        val route = calculateGraphHopperRoute(startLat, startLon, endLat, endLon, routingMode)
        if (route != null) return route
    } catch (e: Exception) {
        Timber.w("GraphHopper failed: ${e.message}")
    }
    
    // Fallback to Valhalla
    try {
        val route = calculateValhallaRoute(startLat, startLon, endLat, endLon, routingMode)
        if (route != null) return route
    } catch (e: Exception) {
        Timber.w("Valhalla failed: ${e.message}")
    }
    
    // Final fallback to OSRM
    try {
        val route = calculateOsrmRoute(startLat, startLon, endLat, endLon, routingMode)
        if (route != null) return route
    } catch (e: Exception) {
        Timber.w("OSRM failed: ${e.message}")
    }
    
    return null
}
```

## Location Tracking

### Python (satnav.py)

```python
from plyer import gps

def start_gps(self):
    """Start GPS tracking."""
    gps.configure(on_location=self.on_location)
    gps.start(1000, 10)  # 1000ms interval, 10m min distance

def on_location(self, **kwargs):
    """Handle location update."""
    lat = kwargs['lat']
    lon = kwargs['lon']
    self.current_location = (lat, lon)
```

### Kotlin (LocationHelper.kt)

```kotlin
fun getLocationUpdates(
    priority: Int = Priority.PRIORITY_HIGH_ACCURACY,
    intervalMs: Long = 5000L
): Flow<Location> = callbackFlow {
    if (!hasLocationPermission()) {
        close()
        return@callbackFlow
    }
    
    val locationRequest = LocationRequest.Builder(priority, intervalMs).build()
    
    val locationCallback = object : LocationCallback() {
        override fun onLocationResult(result: LocationResult) {
            for (location in result.locations) {
                trySend(location)
            }
        }
    }
    
    fusedLocationClient.requestLocationUpdates(
        locationRequest,
        locationCallback,
        null
    )
    
    awaitClose {
        fusedLocationClient.removeLocationUpdates(locationCallback)
    }
}
```

## Text-to-Speech

### Python (satnav.py)

```python
from android.speech.tts import TextToSpeech

def speak(self, text):
    """Speak text using Android TTS."""
    if self.tts:
        self.tts.speak(text, TextToSpeech.QUEUE_FLUSH, None)
```

### Kotlin (VoiceHelper.kt)

```kotlin
fun speak(text: String, queueMode: Boolean = false) {
    if (!isInitialized) return
    
    try {
        val mode = if (queueMode) {
            TextToSpeech.QUEUE_ADD
        } else {
            TextToSpeech.QUEUE_FLUSH
        }
        
        textToSpeech?.speak(text, mode, null)
    } catch (e: Exception) {
        Timber.e("Error speaking: ${e.message}")
    }
}
```

## Database Operations

### Python (voyagr_web.py)

```python
import sqlite3

def insert_trip(self, trip_data):
    """Insert trip into database."""
    cursor.execute('''
        INSERT INTO trips (start_lat, start_lon, end_lat, end_lon, distance_km, duration_minutes)
        VALUES (?, ?, ?, ?, ?, ?)
    ''', (trip_data['start_lat'], trip_data['start_lon'], ...))
    conn.commit()

def get_all_trips(self):
    """Get all trips from database."""
    cursor.execute('SELECT * FROM trips ORDER BY timestamp DESC')
    return cursor.fetchall()
```

### Kotlin (TripDao.kt)

```kotlin
@Dao
interface TripDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertTrip(trip: Trip): Long
    
    @Query("SELECT * FROM trips ORDER BY timestamp DESC")
    fun getAllTrips(): Flow<List<Trip>>
}
```

## API Calls

### Python (voyagr_web.py)

```python
import requests

response = requests.get(
    f"{GRAPHHOPPER_URL}/route",
    params={
        "point": [f"{start_lat},{start_lon}", f"{end_lat},{end_lon}"],
        "profile": "car"
    },
    timeout=10
)

if response.status_code == 200:
    data = response.json()
```

### Kotlin (RoutingService.kt)

```kotlin
val response = graphHopperApi.calculateGraphHopperRoute(
    points = listOf("$startLat,$startLon", "$endLat,$endLon"),
    profile = "car"
)

if (response.isSuccessful && response.body() != null) {
    val data = response.body()!!
}
```

## Error Handling

### Python

```python
try:
    result = calculate_route(lat1, lon1, lat2, lon2)
except Exception as e:
    print(f"Error: {e}")
    return None
```

### Kotlin

```kotlin
try {
    val result = calculateRoute(lat1, lon1, lat2, lon2)
} catch (e: Exception) {
    Timber.e("Error: ${e.message}")
    return null
}
```

## Async Operations

### Python

```python
import threading

def calculate_in_background(self):
    """Calculate route in background thread."""
    thread = threading.Thread(target=self.calculate_route)
    thread.start()
```

### Kotlin

```kotlin
viewModelScope.launch {
    try {
        val route = routingService.calculateRoute(...)
        _currentRoute.value = route
    } catch (e: Exception) {
        Timber.e("Error: ${e.message}")
    }
}
```

## Key Differences

| Aspect | Python | Kotlin |
|--------|--------|--------|
| **Async** | threading, asyncio | Coroutines |
| **Database** | sqlite3 | Room |
| **HTTP** | requests | Retrofit |
| **DI** | Manual | Hilt |
| **Logging** | print, logging | Timber |
| **UI** | Kivy | Jetpack Compose |
| **Location** | Plyer | Google Play Services |
| **TTS** | Android JNI | Android TextToSpeech API |

## Migration Checklist

- [x] Database schema (Room entities)
- [x] API clients (Retrofit)
- [x] Cost calculations
- [x] Location tracking
- [x] Voice system
- [ ] UI screens (Compose)
- [ ] Settings screen
- [ ] Trip history screen
- [ ] Vehicle management
- [ ] Hazard avoidance
- [ ] Testing
- [ ] Release build

## Common Patterns

### Coroutines + Flow

```kotlin
// Python: Generator
def get_locations():
    while True:
        yield get_current_location()

# Kotlin: Flow
fun getLocationUpdates(): Flow<Location> = callbackFlow {
    // ...
}
```

### Repository Pattern

```kotlin
// Replaces direct database access
class TripRepository(private val tripDao: TripDao) {
    fun getAllTrips(): Flow<List<Trip>> = tripDao.getAllTrips()
}
```

### ViewModel + StateFlow

```kotlin
// Replaces manual state management
class NavigationViewModel : ViewModel() {
    private val _uiState = MutableStateFlow<UiState>(UiState.Idle)
    val uiState: StateFlow<UiState> = _uiState.asStateFlow()
}
```


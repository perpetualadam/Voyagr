# Voyagr Kotlin Android App - Developer Guide

## Quick Start

### 1. Build the Project
```bash
cd android
./gradlew assembleDebug
```

### 2. Run Tests
```bash
# Unit tests
./gradlew test

# Integration tests
./gradlew connectedAndroidTest

# All tests
./gradlew test connectedAndroidTest
```

### 3. Run on Device/Emulator
```bash
./gradlew installDebug
```

---

## Architecture Overview

### MVVM Pattern
- **Model**: Data classes and repositories
- **View**: Jetpack Compose UI components
- **ViewModel**: State management and business logic

### Dependency Injection (Hilt)
All major components are injected via Hilt:
```kotlin
@HiltViewModel
class NavigationViewModel @Inject constructor(
    private val routingService: RoutingService,
    private val tripRepository: TripRepository,
    private val vehicleRepository: VehicleRepository
) : ViewModel()
```

### Data Flow
```
UI (Compose) 
  ↓
ViewModel (State Management)
  ↓
Repository (Data Access)
  ↓
Database (Room) / API (Retrofit)
```

---

## Key Components

### 1. Cost Calculator
**File**: `utils/CostCalculator.kt`

Calculate route costs:
```kotlin
val cost = CostCalculator.calculateRouteCost(
    distanceKm = 100.0,
    vehicle = vehicle,
    includeTolls = true,
    includeCaz = true
)
```

### 2. Routing Service
**File**: `network/services/RoutingService.kt`

Calculate routes with fallback:
```kotlin
val route = routingService.calculateRoute(
    startLat = 51.5074,
    startLon = -0.1278,
    endLat = 51.5174,
    endLon = -0.1178,
    routingMode = "auto"
)
```

### 3. Navigation ViewModel
**File**: `ui/navigation/NavigationViewModel.kt`

Manage navigation state:
```kotlin
viewModel.calculateRoute(51.5074, -0.1278, 51.5174, -0.1178)
viewModel.selectVehicle(vehicleId)
viewModel.setRoutingMode("pedestrian")
viewModel.setIncludeTolls(false)
```

### 4. Navigation Screen
**File**: `ui/navigation/NavigationScreen.kt`

Main UI with all features:
```kotlin
NavigationScreen(viewModel = navigationViewModel)
```

---

## Database Operations

### Insert Trip
```kotlin
val trip = Trip(
    startLocation = "London",
    endLocation = "Manchester",
    distanceKm = 200.0,
    durationSeconds = 7200.0,
    fuelCost = 30.0,
    tollCost = 5.0,
    cazCost = 10.0,
    routingMode = "auto"
)
tripRepository.insertTrip(trip)
```

### Query Trips
```kotlin
// Get all trips
tripRepository.getAllTrips().collect { trips ->
    // Handle trips
}

// Get trips by date range
tripRepository.getTripsByDateRange(startDate, endDate).collect { trips ->
    // Handle trips
}

// Get total distance
val totalDistance = tripRepository.getTotalDistance()
```

### Insert Vehicle
```kotlin
val vehicle = Vehicle(
    name = "My Car",
    vehicleType = "petrol_diesel",
    fuelEfficiency = 6.5,
    fuelPrice = 1.40,
    energyEfficiency = 0.0,
    electricityPrice = 0.0,
    isCazExempt = false
)
vehicleRepository.insertVehicle(vehicle)
```

---

## API Integration

### Routing Engines
- **GraphHopper**: http://81.0.246.97:8989
- **Valhalla**: http://141.147.102.102:8002
- **OSRM**: http://router.project-osrm.org

### Fallback Chain
1. Try GraphHopper
2. If fails, try Valhalla
3. If fails, try OSRM
4. If all fail, return error

### Example API Call
```kotlin
val response = graphHopperApi.calculateGraphHopperRoute(
    points = listOf("51.5074,-0.1278", "51.5174,-0.1178"),
    profile = "car"
)
```

---

## Testing

### Unit Tests
Located in `src/test/java/`

Run specific test:
```bash
./gradlew test --tests CostCalculatorTest
```

### Integration Tests
Located in `src/androidTest/java/`

Run specific test:
```bash
./gradlew connectedAndroidTest --tests RetrofitClientTest
```

### UI Tests
Located in `src/androidTest/java/`

Test Compose components:
```bash
./gradlew connectedAndroidTest --tests NavigationScreenTest
```

---

## Common Tasks

### Add New Vehicle Type
1. Update `Vehicle.kt` vehicleType enum
2. Add cost calculation in `CostCalculator.kt`
3. Update UI in `NavigationScreen.kt`
4. Add tests in `CostCalculatorTest.kt`

### Add New Routing Engine
1. Add endpoint to `RoutingApi.kt`
2. Create client in `RetrofitClient.kt`
3. Add parsing method in `RoutingService.kt`
4. Update fallback chain in `calculateRoute()`
5. Add tests in `RoutingServiceTest.kt`

### Add New Database Entity
1. Create data class in `models/Trip.kt`
2. Create DAO interface in `database/`
3. Add to `VoyagrDatabase.kt`
4. Create repository in `repository/`
5. Add tests in `VoyagrDatabaseTest.kt`

### Add New UI Screen
1. Create Composable in `ui/`
2. Create ViewModel if needed
3. Add navigation in `MainActivity.kt`
4. Create UI tests in `androidTest/`

---

## Debugging

### Enable Logging
Timber logs are automatically enabled in debug builds:
```kotlin
Timber.d("Debug message")
Timber.e("Error message")
Timber.w("Warning message")
```

### View HTTP Requests
HTTP logging is enabled in debug builds via OkHttp interceptor:
```
HTTP: --> POST http://141.147.102.102:8002/route
HTTP: {"locations":[...]}
HTTP: <-- 200 OK
```

### Database Inspection
Use Android Studio's Database Inspector:
1. Run app on device/emulator
2. View → Tool Windows → Database Inspector
3. Browse `voyagr_database`

---

## Performance Tips

### Database Queries
- Use indexed columns (timestamp, routingMode, vehicleType)
- Limit query results with LIMIT clause
- Use Flow for reactive updates

### API Calls
- Implement caching for geocoding results
- Use connection pooling (automatic with Retrofit)
- Set appropriate timeouts (30s default)

### UI Rendering
- Use LazyColumn for large lists
- Avoid recomposition with remember
- Use StateFlow for state management

---

## Troubleshooting

### Build Fails
```bash
# Clean build
./gradlew clean build

# Update dependencies
./gradlew dependencies --refresh-dependencies
```

### Tests Fail
```bash
# Run with verbose output
./gradlew test --info

# Run specific test
./gradlew test --tests TestClassName
```

### API Connection Issues
1. Check routing engine URLs in `RetrofitClient.kt`
2. Verify network connectivity
3. Check firewall/proxy settings
4. Review HTTP logs in Logcat

### Database Issues
```bash
# Clear app data
adb shell pm clear com.voyagr.navigation

# Reinstall app
./gradlew installDebug
```

---

## Code Style

### Kotlin Conventions
- Use `val` by default, `var` only when needed
- Use extension functions for utility methods
- Use data classes for models
- Use sealed classes for state management

### Naming Conventions
- Classes: PascalCase (e.g., `NavigationViewModel`)
- Functions: camelCase (e.g., `calculateRoute()`)
- Constants: UPPER_SNAKE_CASE (e.g., `CONNECT_TIMEOUT`)
- Private members: prefix with underscore (e.g., `_uiState`)

### Comments
- Use KDoc for public APIs
- Explain "why", not "what"
- Keep comments up-to-date

---

## Resources

- [Kotlin Documentation](https://kotlinlang.org/docs/)
- [Android Developers](https://developer.android.com/)
- [Jetpack Compose](https://developer.android.com/jetpack/compose)
- [Room Database](https://developer.android.com/training/data-storage/room)
- [Retrofit](https://square.github.io/retrofit/)
- [Hilt](https://dagger.dev/hilt/)
- [Timber](https://github.com/JakeWharton/timber)

---

## Support

For issues or questions:
1. Check existing tests for examples
2. Review documentation in code comments
3. Check Android Studio's built-in help
4. Search Stack Overflow for similar issues


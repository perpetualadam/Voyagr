# Voyagr Navigation - Kotlin Android App

A production-ready Kotlin Android navigation application with toll cost estimation, electric vehicle support, and comprehensive routing capabilities.

## Project Overview

This is a complete Android Studio project template for the Voyagr navigation app, ported from the Python/Kivy implementation. It includes:

- **Modern Architecture**: MVVM pattern with Jetpack Compose UI
- **Routing Engines**: Valhalla, GraphHopper, OSRM with fallback chain
- **Cost Calculation**: Fuel, toll, and CAZ (Clean Air Zone) cost estimation
- **Voice Navigation**: Text-to-Speech announcements and voice commands
- **Offline Support**: Room database for trip history and vehicle profiles
- **Location Services**: Real-time GPS tracking with Google Play Services

## Project Structure

```
app/src/main/java/com/voyagr/navigation/
├── data/
│   ├── database/          # Room database, DAOs, entities
│   ├── models/            # Data models (Trip, Vehicle, Route, etc.)
│   └── repository/        # Repository pattern for data access
├── network/
│   ├── api/               # Retrofit API interfaces
│   ├── services/          # RoutingService implementation
│   └── RetrofitClient.kt  # HTTP client configuration
├── ui/
│   ├── navigation/        # Main navigation screen & ViewModel
│   ├── settings/          # Settings screen (TODO)
│   ├── history/           # Trip history screen (TODO)
│   ├── vehicles/          # Vehicle management screen (TODO)
│   └── theme/             # Material Design 3 theme
├── utils/
│   ├── CostCalculator.kt  # Toll/fuel/CAZ cost calculations
│   ├── LocationHelper.kt  # GPS and location utilities
│   └── VoiceHelper.kt     # Text-to-Speech utilities
├── di/
│   └── AppModule.kt       # Hilt dependency injection
└── MainActivity.kt        # Application entry point
```

## Setup Instructions

### Prerequisites

- Android Studio Flamingo or later
- Android SDK 26+ (API level 26)
- Kotlin 1.9.20+
- Gradle 8.2+

### Step 1: Clone and Open Project

```bash
cd android
# Open in Android Studio
```

### Step 2: Configure API Keys

Create `local.properties` in the project root:

```properties
# Google Maps API Key
MAPS_API_KEY=YOUR_GOOGLE_MAPS_API_KEY_HERE

# Routing Engine URLs
VALHALLA_URL=http://141.147.102.102:8002
GRAPHHOPPER_URL=http://81.0.246.97:8989

# External APIs
MAPQUEST_API_KEY=YOUR_MAPQUEST_API_KEY
OPENWEATHERMAP_API_KEY=YOUR_OPENWEATHERMAP_API_KEY
PICOVOICE_ACCESS_KEY=YOUR_PICOVOICE_ACCESS_KEY
```

### Step 3: Update AndroidManifest.xml

Replace `YOUR_GOOGLE_MAPS_API_KEY_HERE` with your actual Google Maps API key:

```xml
<meta-data
    android:name="com.google.android.geo.API_KEY"
    android:value="YOUR_GOOGLE_MAPS_API_KEY_HERE" />
```

### Step 4: Build and Run

```bash
# Build debug APK
./gradlew assembleDebug

# Run on connected device
./gradlew installDebug

# Or use Android Studio: Run > Run 'app'
```

## Key Components

### Database (Room)

Three main tables:
- **trips**: Trip history with distance, duration, costs
- **vehicles**: Vehicle profiles with efficiency and pricing
- **settings**: User preferences and app configuration

### Routing Service

Implements fallback chain:
1. **GraphHopper** (Primary) - Custom model for speed camera avoidance
2. **Valhalla** (Secondary) - OCI server (141.147.102.102:8002)
3. **OSRM** (Fallback) - Public API (router.project-osrm.org)

### Cost Calculator

Calculates:
- **Fuel Cost**: Based on distance, efficiency, and fuel price
- **Toll Cost**: UK toll roads (M6 Toll, Dartford Crossing, etc.)
- **CAZ Cost**: Clean Air Zone charges for non-exempt vehicles

### Voice System

- Text-to-Speech announcements for turns and hazards
- Speed limit announcements
- ETA updates
- Hazard warnings

## Porting from Python

### Cost Calculation Logic

**Python** (voyagr_web.py):
```python
fuel_cost = (distance_km / fuel_efficiency) * fuel_price
```

**Kotlin** (CostCalculator.kt):
```kotlin
val fuelCost = (distanceKm / vehicle.fuelEfficiency) * vehicle.fuelPrice
```

### Route Calculation

**Python** (satnav.py):
```python
response = requests.post(f"{VALHALLA_URL}/route", json=payload)
```

**Kotlin** (RoutingService.kt):
```kotlin
val response = valhallaApi.calculateValhallaRoute(body)
```

### Location Tracking

**Python** (satnav.py):
```python
gps.start(1000, 10)  # 1000ms interval, 10m min distance
```

**Kotlin** (LocationHelper.kt):
```kotlin
val locationUpdates = locationHelper.getLocationUpdates(
    priority = Priority.PRIORITY_HIGH_ACCURACY,
    intervalMs = 5000L
)
```

## Dependencies

### Core AndroidX
- androidx.core:core-ktx:1.12.0
- androidx.appcompat:appcompat:1.6.1
- androidx.lifecycle:lifecycle-runtime-ktx:2.6.2

### UI
- androidx.compose.ui:ui:1.6.0
- com.google.android.material:material:1.11.0
- com.google.android.gms:play-services-maps:18.2.0

### Networking
- com.squareup.retrofit2:retrofit:2.10.0
- com.squareup.okhttp3:okhttp:4.11.0

### Database
- androidx.room:room-runtime:2.6.1
- androidx.datastore:datastore-preferences:1.0.0

### Async
- org.jetbrains.kotlinx:kotlinx-coroutines-android:1.7.3

### Dependency Injection
- com.google.dagger:hilt-android:2.48

### Logging
- com.jakewharton.timber:timber:5.0.1

## TODO: Next Steps

1. **Implement Navigation UI**
   - [ ] Main navigation screen with Google Maps
   - [ ] Search bar for start/end locations
   - [ ] Route display and turn-by-turn panel
   - [ ] Cost breakdown display

2. **Implement Settings Screen**
   - [ ] Vehicle selection
   - [ ] Routing preferences (avoid tolls, CAZ, etc.)
   - [ ] Voice settings
   - [ ] Unit preferences (km/miles, £/€, etc.)

3. **Implement Trip History Screen**
   - [ ] List of past trips
   - [ ] Trip analytics and statistics
   - [ ] Trip replay functionality

4. **Implement Vehicle Management**
   - [ ] Add/edit/delete vehicles
   - [ ] Vehicle type selection
   - [ ] Efficiency and pricing configuration

5. **Advanced Features**
   - [ ] Hazard avoidance (speed cameras, accidents)
   - [ ] Charging station finder
   - [ ] Weather integration
   - [ ] Offline map support

6. **Testing**
   - [ ] Unit tests for CostCalculator
   - [ ] Integration tests for RoutingService
   - [ ] UI tests with Espresso

7. **Release**
   - [ ] ProGuard optimization
   - [ ] Release build signing
   - [ ] Google Play Store submission

## Permissions

The app requires the following permissions:

```xml
<!-- Location -->
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_BACKGROUND_LOCATION" />

<!-- Network -->
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />

<!-- Audio -->
<uses-permission android:name="android.permission.RECORD_AUDIO" />

<!-- Foreground Service -->
<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE_LOCATION" />
```

## Architecture

### MVVM Pattern

- **Model**: Data models and repositories
- **View**: Jetpack Compose UI components
- **ViewModel**: NavigationViewModel manages UI state

### Dependency Injection (Hilt)

All services are injected via Hilt:
- RoutingService
- TripRepository
- VehicleRepository
- LocationHelper
- VoiceHelper

### Coroutines

Async operations use Kotlin Coroutines:
- Route calculation
- Database queries
- Location updates
- API calls

## Logging

Uses Timber for logging:

```kotlin
Timber.d("Debug message")
Timber.e("Error message")
Timber.w("Warning message")
```

## ProGuard Rules

Release builds use ProGuard for code obfuscation and optimization. Rules are configured in `proguard-rules.pro`.

## License

This project is part of the Voyagr navigation application.

## Support

For issues or questions, refer to the main Voyagr repository.


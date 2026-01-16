# Android App Dependencies Analysis

**Date**: 2026-01-16  
**Purpose**: Understanding how the Android app components depend on each other

---

## 📱 Overview

The Voyagr Android app is a **Kotlin-based native Android application** that follows modern Android development best practices with MVVM architecture, Jetpack Compose UI, and Hilt dependency injection.

**Key Point**: The Android app is **NOT dependent on the Python web app** for its core functionality. It's a standalone native app that communicates with the same backend routing engines (Valhalla, GraphHopper, OSRM) that the web app uses.

---

## 🏗️ Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                      Android App (Kotlin)                    │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │   UI Layer   │  │  ViewModel   │  │  Repository  │      │
│  │  (Compose)   │◄─┤   (MVVM)     │◄─┤   Pattern    │      │
│  └──────────────┘  └──────────────┘  └──────┬───────┘      │
│                                              │              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────▼───────┐      │
│  │  Room DB     │  │   Utilities  │  │   Network    │      │
│  │  (Local)     │  │ (Cost, Voice)│  │  (Retrofit)  │      │
│  └──────────────┘  └──────────────┘  └──────┬───────┘      │
└─────────────────────────────────────────────┼──────────────┘
                                              │
                                              ▼
                        ┌─────────────────────────────────┐
                        │   External Routing Engines      │
                        │  - Valhalla (141.147.102.102)   │
                        │  - GraphHopper (81.0.246.97)    │
                        │  - OSRM (fallback)              │
                        └─────────────────────────────────┘
```

---

## 🔗 Dependency Layers

### Layer 1: UI Layer (Jetpack Compose)
**Location**: `android/app/src/main/java/com/voyagr/navigation/ui/`

**Dependencies**:
- ✅ **ViewModel Layer** - Observes UI state via LiveData/Flow
- ✅ **Material Design 3** - UI components and theming
- ✅ **Google Maps Compose** - Map display

**Key Files**:
- `NavigationViewModel.kt` - Main screen logic
- `Theme.kt`, `Color.kt`, `Type.kt` - Material Design theme

**External Dependencies**:
```kotlin
androidx.compose.ui:ui:1.6.0
androidx.compose.material3:material3:1.1.2
com.google.maps.android:maps-compose:4.3.0
```

---

### Layer 2: ViewModel Layer (MVVM)
**Location**: `android/app/src/main/java/com/voyagr/navigation/ui/navigation/`

**Dependencies**:
- ✅ **Repository Layer** - Data access
- ✅ **Utilities** - Cost calculation, location, voice
- ✅ **Hilt** - Dependency injection
- ✅ **Coroutines** - Async operations

**Key Files**:
- `NavigationViewModel.kt` - Manages UI state and business logic
- `NavigationUiState.kt` - UI state data class

**External Dependencies**:
```kotlin
androidx.lifecycle:lifecycle-viewmodel-ktx:2.6.2
org.jetbrains.kotlinx:kotlinx-coroutines-android:1.7.3
com.google.dagger:hilt-android:2.48
```

---

### Layer 3: Repository Layer (Data Access)
**Location**: `android/app/src/main/java/com/voyagr/navigation/data/repository/`

**Dependencies**:
- ✅ **Room Database** - Local data persistence
- ✅ **Network Layer** - Remote API calls
- ✅ **Data Models** - Trip, Vehicle, Route entities

**Key Files**:
- `TripRepository.kt` - Trip history management
- `VehicleRepository.kt` - Vehicle profile management

**External Dependencies**:
```kotlin
androidx.room:room-runtime:2.6.1
org.jetbrains.kotlinx:kotlinx-coroutines-core:1.7.3
```

---

### Layer 4: Network Layer (Retrofit)
**Location**: `android/app/src/main/java/com/voyagr/navigation/network/`

**Dependencies**:
- ✅ **Retrofit** - HTTP client
- ✅ **OkHttp** - Connection pooling
- ✅ **Gson** - JSON parsing
- ✅ **External Routing Engines** - Valhalla, GraphHopper, OSRM

**Key Files**:
- `RoutingApi.kt` - Retrofit API interface
- `RoutingService.kt` - Route calculation with fallback chain
- `RetrofitClient.kt` - HTTP client configuration

**External Dependencies**:
```kotlin
com.squareup.retrofit2:retrofit:2.10.0
com.squareup.okhttp3:okhttp:4.11.0
com.google.code.gson:gson:2.10.1
```

**API Endpoints**:
- Valhalla: `http://141.147.102.102:8002/route`
- GraphHopper: `http://81.0.246.97:8989/route`
- OSRM: `http://router.project-osrm.org/route/v1/driving/`

---

### Layer 5: Database Layer (Room)
**Location**: `android/app/src/main/java/com/voyagr/navigation/data/database/`

**Dependencies**:
- ✅ **Room** - SQLite abstraction
- ✅ **Data Models** - Entity classes

**Key Files**:
- `VoyagrDatabase.kt` - Main database class
- `TripDao.kt` - Trip data access object
- `VehicleDao.kt` - Vehicle data access object
- `SettingsDao.kt` - Settings data access object
- `Converters.kt` - Type converters for LocalDateTime

**External Dependencies**:
```kotlin
androidx.room:room-runtime:2.6.1
androidx.room:room-ktx:2.6.1
```

---

### Layer 6: Utilities (Business Logic)
**Location**: `android/app/src/main/java/com/voyagr/navigation/utils/`

**Dependencies**:
- ✅ **Android Location Services** - GPS tracking
- ✅ **Text-to-Speech** - Voice announcements
- ✅ **Data Models** - Route, Vehicle, Cost

**Key Files**:
- `CostCalculator.kt` - Fuel, toll, CAZ cost calculations
- `LocationHelper.kt` - GPS tracking and distance calculations
- `VoiceHelper.kt` - Text-to-Speech announcements

**External Dependencies**:
```kotlin
com.google.android.gms:play-services-location:21.0.1
androidx.speech:speech:1.0.0
```

---

## 📦 Dependency Injection (Hilt)

**Location**: `android/app/src/main/java/com/voyagr/navigation/di/`

**Purpose**: Provides singleton instances of services to the entire app

**Key File**: `AppModule.kt`

**Provides**:
- `VoyagrDatabase` - Room database instance
- `RoutingService` - Routing API service
- `TripRepository` - Trip data repository
- `VehicleRepository` - Vehicle data repository
- `CostCalculator` - Cost calculation utility
- `LocationHelper` - Location tracking utility
- `VoiceHelper` - Voice announcement utility

**External Dependencies**:
```kotlin
com.google.dagger:hilt-android:2.48
```

---

## 🌐 External Service Dependencies

### 1. Routing Engines (Critical)
- **Valhalla** (Primary): `http://141.147.102.102:8002`
- **GraphHopper** (Secondary): `http://81.0.246.97:8989`
- **OSRM** (Fallback): `http://router.project-osrm.org`

**Dependency Type**: Network API calls  
**Fallback Strategy**: Automatic fallback chain (Valhalla → GraphHopper → OSRM)

### 2. Google Maps API (Critical)
- **Purpose**: Map display and location services
- **Configuration**: Requires API key in `local.properties`

### 3. Optional External APIs
- **MapQuest**: Geocoding (optional)
- **OpenWeatherMap**: Weather data (optional)
- **Picovoice**: Voice commands (optional)

---

## 🔄 Data Flow Example: Route Calculation

```
User Input (UI)
    ↓
NavigationViewModel.calculateRoute()
    ↓
RoutingService.calculateRoute()
    ↓
Retrofit API Call → Valhalla Server
    ↓ (if fails)
Retrofit API Call → GraphHopper Server
    ↓ (if fails)
Retrofit API Call → OSRM Server
    ↓
Parse JSON Response (Gson)
    ↓
Create Route Model
    ↓
CostCalculator.calculateCosts()
    ↓
Update UI State (LiveData/Flow)
    ↓
Compose UI Recomposition
    ↓
Display Route on Map
```

---

## ⚠️ Critical Dependencies

### Must Have (App Won't Work Without):
1. ✅ **At least one routing engine** (Valhalla, GraphHopper, or OSRM)
2. ✅ **Google Maps API key** (for map display)
3. ✅ **Android Location Services** (for GPS tracking)

### Nice to Have (App Works Without):
- ❌ MapQuest API (geocoding fallback)
- ❌ OpenWeatherMap API (weather features)
- ❌ Picovoice API (voice commands)

---

## 🆚 Android App vs Web App

| Feature | Android App | Web App |
|---------|-------------|---------|
| **Language** | Kotlin | Python |
| **UI Framework** | Jetpack Compose | HTML/CSS/JavaScript |
| **Database** | Room (SQLite) | SQLite/DuckDB |
| **Routing** | Direct API calls | Python routing engines |
| **Maps** | Google Maps SDK | MapLibre GL JS |
| **Offline** | Room database | Service Worker cache |
| **Platform** | Android only | Cross-platform (browser) |

**Key Difference**: The Android app and web app are **completely independent**. They don't communicate with each other. They both call the same external routing engines directly.

---

## 📝 Summary

The Android app has a **clean, layered architecture** with clear separation of concerns:

1. **UI Layer** depends on **ViewModel Layer**
2. **ViewModel Layer** depends on **Repository Layer** and **Utilities**
3. **Repository Layer** depends on **Database** and **Network Layer**
4. **Network Layer** depends on **External Routing Engines**
5. **Hilt** provides dependency injection across all layers

**No Python Web App Dependency**: The Android app is standalone and doesn't require the Python web app to function.


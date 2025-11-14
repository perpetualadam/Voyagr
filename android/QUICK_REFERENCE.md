# Voyagr Android - Quick Reference Guide

## Project Commands

```bash
# Build
./gradlew assembleDebug          # Build debug APK
./gradlew assembleRelease        # Build release APK
./gradlew build                  # Full build

# Run
./gradlew installDebug           # Install on device
./gradlew connectedAndroidTest   # Run instrumented tests
./gradlew test                   # Run unit tests

# Clean
./gradlew clean                  # Clean build
./gradlew cleanBuildCache        # Clean build cache

# Gradle
./gradlew --version             # Check Gradle version
./gradlew tasks                  # List all tasks
```

## File Locations

```
android/
├── app/src/main/java/com/voyagr/navigation/
│   ├── data/
│   │   ├── database/            # Room DAOs & entities
│   │   ├── models/              # Data classes
│   │   └── repository/          # Repository pattern
│   ├── network/
│   │   ├── api/                 # Retrofit interfaces
│   │   ├── services/            # API services
│   │   └── RetrofitClient.kt    # HTTP config
│   ├── ui/
│   │   ├── navigation/          # Main screen
│   │   ├── settings/            # Settings screen (TODO)
│   │   ├── history/             # History screen (TODO)
│   │   ├── vehicles/            # Vehicles screen (TODO)
│   │   └── theme/               # Material Design 3
│   ├── utils/
│   │   ├── CostCalculator.kt    # Cost calculations
│   │   ├── LocationHelper.kt    # GPS utilities
│   │   └── VoiceHelper.kt       # TTS utilities
│   ├── di/
│   │   └── AppModule.kt         # Hilt DI
│   └── MainActivity.kt          # Entry point
├── app/build.gradle.kts         # App dependencies
├── build.gradle.kts             # Root config
├── settings.gradle.kts          # Project settings
└── local.properties             # API keys
```

## Key Classes

### Data Models
- `Trip` - Trip history entity
- `Vehicle` - Vehicle profile entity
- `Route` - Route calculation result
- `RouteCost` - Cost breakdown

### Database
- `VoyagrDatabase` - Room database
- `TripDao` - Trip operations
- `VehicleDao` - Vehicle operations
- `SettingsDao` - Settings operations

### Network
- `RoutingApi` - Retrofit interface
- `RoutingService` - Route calculation
- `RetrofitClient` - HTTP client factory

### Utilities
- `CostCalculator` - Fuel/toll/CAZ costs
- `LocationHelper` - GPS tracking
- `VoiceHelper` - Text-to-Speech

### UI
- `NavigationViewModel` - Main screen logic
- `NavigationUiState` - UI state management

## Common Tasks

### Add a New Screen

1. Create ViewModel:
```kotlin
@HiltViewModel
class MyScreenViewModel @Inject constructor(
    private val repository: MyRepository
) : ViewModel() {
    // ...
}
```

2. Create Composable:
```kotlin
@Composable
fun MyScreen(viewModel: MyScreenViewModel = hiltViewModel()) {
    // ...
}
```

3. Add to navigation

### Add Database Entity

1. Create data class:
```kotlin
@Entity(tableName = "my_table")
data class MyEntity(
    @PrimaryKey(autoGenerate = true)
    val id: Long = 0,
    val name: String
)
```

2. Create DAO:
```kotlin
@Dao
interface MyDao {
    @Insert
    suspend fun insert(entity: MyEntity): Long
    
    @Query("SELECT * FROM my_table")
    fun getAll(): Flow<List<MyEntity>>
}
```

3. Add to database:
```kotlin
@Database(entities = [MyEntity::class], version = 1)
abstract class VoyagrDatabase : RoomDatabase() {
    abstract fun myDao(): MyDao
}
```

### Add API Endpoint

1. Add to RoutingApi:
```kotlin
@GET("/endpoint")
suspend fun getEndpoint(
    @Query("param") param: String
): Response<JsonObject>
```

2. Use in service:
```kotlin
val response = api.getEndpoint("value")
if (response.isSuccessful) {
    val data = response.body()
}
```

### Inject Dependency

```kotlin
@HiltViewModel
class MyViewModel @Inject constructor(
    private val service: MyService,
    private val repository: MyRepository
) : ViewModel() {
    // ...
}
```

## Debugging

### Logcat Filtering

```bash
# Show all logs
adb logcat

# Filter by tag
adb logcat | grep "Voyagr"

# Filter by level
adb logcat *:E  # Errors only

# Clear logs
adb logcat -c
```

### Timber Logging

```kotlin
Timber.d("Debug: $message")
Timber.i("Info: $message")
Timber.w("Warning: $message")
Timber.e("Error: $message")
```

### Android Studio Debugger

1. Set breakpoint (click line number)
2. Run in debug mode (Shift+F9)
3. Step through code (F10/F11)
4. Inspect variables in Variables panel

## Testing

### Unit Tests

```kotlin
@Test
fun testCostCalculation() {
    val vehicle = Vehicle(
        name = "Test Car",
        vehicleType = "petrol_diesel",
        fuelEfficiency = 6.5,
        fuelPrice = 1.40
    )
    
    val cost = CostCalculator.calculateFuelCost(100.0, vehicle)
    assertEquals(21.54, cost, 0.01)
}
```

### Instrumented Tests

```kotlin
@RunWith(AndroidJUnit4::class)
class NavigationScreenTest {
    @get:Rule
    val composeTestRule = createComposeRule()
    
    @Test
    fun testNavigationScreen() {
        composeTestRule.setContent {
            NavigationScreen()
        }
        
        composeTestRule.onNodeWithText("Voyagr").assertIsDisplayed()
    }
}
```

## Performance Tips

1. **Use Flow instead of LiveData** for better performance
2. **Lazy load data** with pagination
3. **Cache API responses** in database
4. **Use ProGuard** for release builds
5. **Profile with Android Profiler**
6. **Minimize database queries** with proper indexing

## Common Issues

### "Unresolved reference"
- Run `./gradlew clean build`
- Invalidate Android Studio cache

### "Permission denied"
- Grant permissions in Settings app
- Or use ADB: `adb shell pm grant com.voyagr.navigation android.permission.ACCESS_FINE_LOCATION`

### "API key invalid"
- Check AndroidManifest.xml
- Verify key in Google Cloud Console
- Check SHA-1 fingerprint

### "Gradle sync failed"
- Update Gradle: `./gradlew wrapper --gradle-version 8.2`
- Clear cache: `./gradlew clean`
- Restart Android Studio

## Resources

- [Android Docs](https://developer.android.com/docs)
- [Kotlin Docs](https://kotlinlang.org/docs/)
- [Jetpack Compose](https://developer.android.com/jetpack/compose)
- [Room Database](https://developer.android.com/training/data-storage/room)
- [Hilt](https://developer.android.com/training/dependency-injection/hilt-android)
- [Retrofit](https://square.github.io/retrofit/)
- [Coroutines](https://kotlinlang.org/docs/coroutines-overview.html)

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| Ctrl+Shift+O | Optimize imports |
| Ctrl+Alt+L | Format code |
| Ctrl+/ | Toggle comment |
| Ctrl+B | Go to definition |
| Ctrl+H | Find and replace |
| Shift+F9 | Debug |
| Shift+F10 | Run |
| Ctrl+K | Commit |

## Git Workflow

```bash
# Create feature branch
git checkout -b feature/my-feature

# Make changes and commit
git add .
git commit -m "Add my feature"

# Push to GitHub
git push origin feature/my-feature

# Create Pull Request on GitHub
# After review and approval, merge to main
```

## Release Checklist

- [ ] Update version in build.gradle.kts
- [ ] Update CHANGELOG
- [ ] Run all tests
- [ ] Build release APK: `./gradlew assembleRelease`
- [ ] Sign APK
- [ ] Test on multiple devices
- [ ] Create GitHub release
- [ ] Submit to Google Play Store


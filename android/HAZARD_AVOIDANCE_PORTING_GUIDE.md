# Porting Hazard Avoidance to Kotlin Android App

## Overview

This guide explains how to port the traffic camera avoidance feature from the Python app to the Kotlin Android app.

---

## Current Status

### Python App (satnav.py)
✅ Complete hazard avoidance system  
✅ 8 hazard types with penalties  
✅ Community hazard reporting  
✅ SCDB camera database (144,528 cameras)  
✅ GraphHopper custom model  

### Kotlin App
❌ No hazard avoidance  
✅ Traffic visualization (different feature)  
✅ Automatic rerouting  

---

## Implementation Plan

### Phase 1: Database Setup (30 minutes)

**1. Create Hazard Entity**
```kotlin
@Entity("hazards")
data class Hazard(
    @PrimaryKey val id: String,
    val lat: Double,
    val lon: Double,
    val type: String,  // speed_camera, traffic_camera, police, roadworks, accident, railway, pothole, debris
    val penalty: Long,  // seconds
    val threshold: Int,  // meters
    val timestamp: Long
)
```

**2. Create Community Report Entity**
```kotlin
@Entity("community_reports")
data class CommunityReport(
    @PrimaryKey val id: String,
    val lat: Double,
    val lon: Double,
    val type: String,
    val description: String,
    val userId: String,
    val timestamp: Long,
    val upvotes: Int = 0
)
```

**3. Create DAO Interfaces**
```kotlin
@Dao
interface HazardDao {
    @Query("SELECT * FROM hazards WHERE lat BETWEEN :minLat AND :maxLat AND lon BETWEEN :minLon AND :maxLon")
    suspend fun getHazardsInArea(minLat: Double, maxLat: Double, minLon: Double, maxLon: Double): List<Hazard>
    
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertHazards(hazards: List<Hazard>)
    
    @Query("DELETE FROM hazards WHERE timestamp < :cutoffTime")
    suspend fun deleteOldHazards(cutoffTime: Long)
}

@Dao
interface CommunityReportDao {
    @Query("SELECT * FROM community_reports WHERE lat BETWEEN :minLat AND :maxLat AND lon BETWEEN :minLon AND :maxLon")
    suspend fun getReportsInArea(minLat: Double, maxLat: Double, minLon: Double, maxLon: Double): List<CommunityReport>
    
    @Insert
    suspend fun insertReport(report: CommunityReport)
}
```

**4. Add to AppDatabase**
```kotlin
@Database(
    entities = [
        ...,
        Hazard::class,
        CommunityReport::class
    ],
    version = 2
)
abstract class AppDatabase : RoomDatabase() {
    abstract fun hazardDao(): HazardDao
    abstract fun communityReportDao(): CommunityReportDao
}
```

---

### Phase 2: API Integration (20 minutes)

**1. Create API Interface**
```kotlin
interface HazardApi {
    @GET("/api/hazards/nearby")
    suspend fun getNearbyHazards(
        @Query("lat") lat: Double,
        @Query("lon") lon: Double,
        @Query("radius") radius: Int = 5000  // 5km
    ): Response<HazardResponse>
    
    @POST("/api/hazards/report")
    suspend fun reportHazard(
        @Body report: CommunityReport
    ): Response<ReportResponse>
}

data class HazardResponse(
    val success: Boolean,
    val hazards: List<Hazard>
)

data class ReportResponse(
    val success: Boolean,
    val message: String
)
```

**2. Create Hazard Repository**
```kotlin
class HazardRepository(
    private val hazardApi: HazardApi,
    private val hazardDao: HazardDao,
    private val communityReportDao: CommunityReportDao
) {
    suspend fun getHazardsForRoute(route: Route): List<Hazard> {
        // Get bounding box of route
        val (minLat, maxLat, minLon, maxLon) = calculateBoundingBox(route)
        
        // Try API first
        return try {
            val response = hazardApi.getNearbyHazards(
                (minLat + maxLat) / 2,
                (minLon + maxLon) / 2
            )
            if (response.isSuccessful) {
                response.body()?.hazards?.let { hazards ->
                    hazardDao.insertHazards(hazards)
                    hazards
                } ?: emptyList()
            } else {
                hazardDao.getHazardsInArea(minLat, maxLat, minLon, maxLon)
            }
        } catch (e: Exception) {
            Timber.w("Failed to fetch hazards from API: ${e.message}")
            hazardDao.getHazardsInArea(minLat, maxLat, minLon, maxLon)
        }
    }
    
    suspend fun reportHazard(hazard: CommunityReport) {
        try {
            val response = hazardApi.reportHazard(hazard)
            if (response.isSuccessful) {
                communityReportDao.insertReport(hazard)
                Timber.d("Hazard reported successfully")
            }
        } catch (e: Exception) {
            Timber.e("Failed to report hazard: ${e.message}")
        }
    }
}
```

---

### Phase 3: Hazard Scoring (20 minutes)

**1. Create HazardHelper**
```kotlin
class HazardHelper {
    companion object {
        private val HAZARD_PENALTIES = mapOf(
            "speed_camera" to 30L,
            "traffic_camera" to 45L,
            "police" to 180L,
            "roadworks" to 300L,
            "accident" to 600L,
            "railway" to 120L,
            "pothole" to 120L,
            "debris" to 300L
        )
        
        private val HAZARD_THRESHOLDS = mapOf(
            "speed_camera" to 100,
            "traffic_camera" to 100,
            "police" to 200,
            "roadworks" to 500,
            "accident" to 500,
            "railway" to 200,
            "pothole" to 50,
            "debris" to 100
        )
    }
    
    fun scoreRoute(route: Route, hazards: List<Hazard>): RouteScore {
        var totalPenalty = 0L
        var hazardCount = 0
        val nearbyHazards = mutableListOf<Hazard>()
        
        for (hazard in hazards) {
            val distance = distanceToRoute(hazard, route)
            val threshold = HAZARD_THRESHOLDS[hazard.type] ?: 100
            
            if (distance < threshold) {
                val penalty = calculatePenalty(distance, hazard.type)
                totalPenalty += penalty
                hazardCount++
                nearbyHazards.add(hazard)
            }
        }
        
        return RouteScore(
            totalPenalty = totalPenalty,
            hazardCount = hazardCount,
            nearbyHazards = nearbyHazards
        )
    }
    
    private fun calculatePenalty(distance: Double, hazardType: String): Long {
        val basePenalty = HAZARD_PENALTIES[hazardType] ?: 30L
        val threshold = HAZARD_THRESHOLDS[hazardType] ?: 100
        
        // Distance-based multiplier: closer = higher penalty
        val multiplier = 1 + (2 * (1 - distance / threshold))
        return (basePenalty * multiplier).toLong()
    }
    
    private fun distanceToRoute(hazard: Hazard, route: Route): Double {
        var minDistance = Double.MAX_VALUE
        val points = route.geometry.split(";").map { point ->
            val (lat, lon) = point.split(",")
            Pair(lat.toDouble(), lon.toDouble())
        }
        
        for (i in 0 until points.size - 1) {
            val distance = distanceToLineSegment(
                hazard.lat, hazard.lon,
                points[i].first, points[i].second,
                points[i+1].first, points[i+1].second
            )
            minDistance = minOf(minDistance, distance)
        }
        
        return minDistance
    }
    
    private fun distanceToLineSegment(
        lat: Double, lon: Double,
        lat1: Double, lon1: Double,
        lat2: Double, lon2: Double
    ): Double {
        // Point-to-line-segment distance calculation
        val A = lat - lat1
        val B = lon - lon1
        val C = lat2 - lat1
        val D = lon2 - lon1
        
        val dot = A * C + B * D
        val lenSq = C * C + D * D
        var param = -1.0
        
        if (lenSq != 0.0) param = dot / lenSq
        
        val xx = when {
            param < 0 -> lat1
            param > 1 -> lat2
            else -> lat1 + param * C
        }
        
        val yy = when {
            param < 0 -> lon1
            param > 1 -> lon2
            else -> lon1 + param * D
        }
        
        val dx = lat - xx
        val dy = lon - yy
        return Math.sqrt(dx * dx + dy * dy) * 111000 // Convert degrees to meters
    }
}

data class RouteScore(
    val totalPenalty: Long,
    val hazardCount: Int,
    val nearbyHazards: List<Hazard>
)
```

---

### Phase 4: UI Integration (30 minutes)

**1. Add Hazard Toggle to RoutePreferencesScreen**
```kotlin
// In RoutePreferencesScreen.kt
var avoidHazards by remember { mutableStateOf(false) }

Checkbox(
    checked = avoidHazards,
    onCheckedChange = { avoidHazards = it },
    label = "Avoid Hazards (Cameras, Police, etc.)"
)
```

**2. Display Hazard Markers on Map**
```kotlin
// In GoogleMapScreen.kt
for (hazard in hazards) {
    Marker(
        position = LatLng(hazard.lat, hazard.lon),
        title = hazard.type.replace("_", " "),
        snippet = "Penalty: ${hazard.penalty}s"
    )
}
```

**3. Show Hazard Info in Route Details**
```kotlin
Text("Hazards on route: ${routeScore.hazardCount}")
Text("Hazard penalty: ${routeScore.totalPenalty}s")
```

---

### Phase 5: Testing (20 minutes)

**1. Unit Tests**
```kotlin
@Test
fun testHazardScoring() {
    val route = Route(...)
    val hazards = listOf(
        Hazard("1", 51.5, -0.1, "speed_camera", 30, 100, System.currentTimeMillis())
    )
    
    val score = hazardHelper.scoreRoute(route, hazards)
    assertTrue(score.hazardCount > 0)
    assertTrue(score.totalPenalty > 0)
}
```

**2. Integration Tests**
```kotlin
@Test
fun testHazardFetching() {
    val hazards = runBlocking {
        hazardRepository.getHazardsForRoute(testRoute)
    }
    assertTrue(hazards.isNotEmpty())
}
```

---

## Timeline

| Phase | Task | Time |
|-------|------|------|
| 1 | Database Setup | 30 min |
| 2 | API Integration | 20 min |
| 3 | Hazard Scoring | 20 min |
| 4 | UI Integration | 30 min |
| 5 | Testing | 20 min |
| **Total** | | **2 hours** |

---

## Files to Create/Modify

### Create
- `HazardHelper.kt`
- `HazardRepository.kt`
- `HazardApi.kt`
- `Hazard.kt` (entity)
- `CommunityReport.kt` (entity)
- `HazardDao.kt`
- `CommunityReportDao.kt`

### Modify
- `AppDatabase.kt` - Add entities and DAOs
- `RoutePreferencesScreen.kt` - Add hazard toggle
- `GoogleMapScreen.kt` - Add hazard markers
- `RoutingService.kt` - Integrate hazard scoring
- `build.gradle.kts` - No changes needed

---

## Next Steps

1. Create database entities and DAOs
2. Implement HazardRepository
3. Create HazardHelper with scoring logic
4. Add API endpoints to voyagr_web.py
5. Integrate into UI
6. Test thoroughly
7. Deploy

---

**Estimated Effort:** 2 hours  
**Complexity:** Medium  
**Priority:** High (Feature parity with Python app)

---

**Version:** 1.0  
**Last Updated:** 2025-11-09  
**Status:** Ready for Implementation ✅


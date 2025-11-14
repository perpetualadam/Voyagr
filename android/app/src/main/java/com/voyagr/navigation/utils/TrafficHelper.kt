package com.voyagr.navigation.utils

import android.content.Context
import com.voyagr.navigation.data.models.Route
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import timber.log.Timber

/**
 * Helper class for real-time traffic data management.
 * Handles fetching, parsing, and applying traffic data to routes.
 */
class TrafficHelper(private val context: Context) {
    
    enum class TrafficLevel {
        LIGHT,      // Green - free flow
        MODERATE,   // Yellow - moderate congestion
        HEAVY,      // Red - heavy congestion
        BLOCKED     // Dark red - road blocked
    }
    
    data class TrafficIncident(
        val id: String,
        val type: String,  // accident, roadwork, closure, etc.
        val latitude: Double,
        val longitude: Double,
        val description: String,
        val severity: Int,  // 1-5
        val distance: Double  // Distance from current location in meters
    )
    
    data class TrafficSegment(
        val startLat: Double,
        val startLon: Double,
        val endLat: Double,
        val endLon: Double,
        val level: TrafficLevel,
        val speed: Double,  // Current speed in km/h
        val freeFlowSpeed: Double,  // Normal speed in km/h
        val delay: Double  // Delay in seconds
    )
    
    companion object {
        const val TRAFFIC_UPDATE_INTERVAL = 5 * 60 * 1000L  // 5 minutes
        const val HEAVY_TRAFFIC_THRESHOLD = 0.5  // 50% of free flow speed
        const val MODERATE_TRAFFIC_THRESHOLD = 0.75  // 75% of free flow speed
    }
    
    /**
     * Fetch traffic data for a route.
     * 
     * @param route Route to fetch traffic for
     * @return Flow of traffic segments
     */
    fun getTrafficForRoute(route: Route): Flow<List<TrafficSegment>> = flow {
        try {
            // Simulate traffic data fetching
            // In production, this would call a real traffic API
            val segments = mutableListOf<TrafficSegment>()
            
            // Parse route steps and create traffic segments
            for (step in route.steps) {
                val segment = TrafficSegment(
                    startLat = 0.0,  // Would be parsed from step
                    startLon = 0.0,
                    endLat = 0.0,
                    endLon = 0.0,
                    level = TrafficLevel.LIGHT,
                    speed = 60.0,
                    freeFlowSpeed = 80.0,
                    delay = 0.0
                )
                segments.add(segment)
            }
            
            emit(segments)
            Timber.d("Fetched traffic data for ${segments.size} segments")
        } catch (e: Exception) {
            Timber.e("Error fetching traffic data: ${e.message}")
            emit(emptyList())
        }
    }
    
    /**
     * Get traffic incidents near a location.
     * 
     * @param latitude Current latitude
     * @param longitude Current longitude
     * @param radiusMeters Search radius in meters
     * @return List of traffic incidents
     */
    suspend fun getTrafficIncidents(
        latitude: Double,
        longitude: Double,
        radiusMeters: Double = 5000.0
    ): List<TrafficIncident> {
        return try {
            // Simulate fetching traffic incidents
            // In production, this would call a real traffic API
            emptyList()
        } catch (e: Exception) {
            Timber.e("Error fetching traffic incidents: ${e.message}")
            emptyList()
        }
    }
    
    /**
     * Calculate traffic-adjusted ETA.
     * 
     * @param baseEtaSeconds Base ETA in seconds
     * @param trafficSegments Traffic segments for route
     * @return Adjusted ETA in seconds
     */
    fun calculateTrafficAdjustedEta(
        baseEtaSeconds: Double,
        trafficSegments: List<TrafficSegment>
    ): Double {
        return try {
            var totalDelay = 0.0
            for (segment in trafficSegments) {
                totalDelay += segment.delay
            }
            baseEtaSeconds + totalDelay
        } catch (e: Exception) {
            Timber.e("Error calculating traffic-adjusted ETA: ${e.message}")
            baseEtaSeconds
        }
    }
    
    /**
     * Determine if rerouting is recommended.
     * 
     * @param trafficSegments Traffic segments for current route
     * @return True if heavy traffic detected
     */
    fun shouldReroute(trafficSegments: List<TrafficSegment>): Boolean {
        return try {
            val heavyTrafficSegments = trafficSegments.count { it.level == TrafficLevel.HEAVY }
            val blockedSegments = trafficSegments.count { it.level == TrafficLevel.BLOCKED }
            
            val heavyTrafficPercentage = (heavyTrafficSegments + blockedSegments) * 100 / trafficSegments.size
            heavyTrafficPercentage > 30  // Reroute if > 30% of route has heavy traffic
        } catch (e: Exception) {
            Timber.e("Error determining reroute: ${e.message}")
            false
        }
    }
    
    /**
     * Get traffic level color for visualization.
     * 
     * @param level Traffic level
     * @return Color code (ARGB)
     */
    fun getTrafficLevelColor(level: TrafficLevel): Int {
        return when (level) {
            TrafficLevel.LIGHT -> 0xFF00AA00.toInt()      // Green
            TrafficLevel.MODERATE -> 0xFFFFAA00.toInt()   // Yellow
            TrafficLevel.HEAVY -> 0xFFFF5500.toInt()      // Orange
            TrafficLevel.BLOCKED -> 0xFFCC0000.toInt()    // Red
        }
    }
    
    /**
     * Get traffic level description.
     * 
     * @param level Traffic level
     * @return Description string
     */
    fun getTrafficLevelDescription(level: TrafficLevel): String {
        return when (level) {
            TrafficLevel.LIGHT -> "Light traffic"
            TrafficLevel.MODERATE -> "Moderate traffic"
            TrafficLevel.HEAVY -> "Heavy traffic"
            TrafficLevel.BLOCKED -> "Road blocked"
        }
    }
    
    /**
     * Generate voice announcement for traffic incident.
     * 
     * @param incident Traffic incident
     * @return Voice announcement text
     */
    fun generateTrafficAnnouncement(incident: TrafficIncident): String {
        return when (incident.type) {
            "accident" -> "Accident ahead in ${incident.distance.toInt()} meters"
            "roadwork" -> "Roadwork ahead in ${incident.distance.toInt()} meters"
            "closure" -> "Road closure ahead in ${incident.distance.toInt()} meters"
            "police" -> "Police presence ahead in ${incident.distance.toInt()} meters"
            else -> "${incident.description} in ${incident.distance.toInt()} meters"
        }
    }
}


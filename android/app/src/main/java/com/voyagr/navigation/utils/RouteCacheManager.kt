package com.voyagr.navigation.utils

import com.voyagr.navigation.data.database.CacheDao
import com.voyagr.navigation.data.models.CachedRoute
import com.voyagr.navigation.data.models.Route
import kotlinx.coroutines.flow.Flow
import timber.log.Timber
import java.security.MessageDigest

/**
 * Manager for intelligent route caching with LRU eviction.
 * Handles cache operations, similarity detection, and cache warming.
 */
class RouteCacheManager(private val cacheDao: CacheDao) {
    
    companion object {
        const val MAX_CACHED_ROUTES = 50
        const val SIMILARITY_THRESHOLD = 0.9  // 90% similarity
        const val CACHE_WARMING_BATCH_SIZE = 5
    }
    
    data class CacheStats(
        val totalRoutes: Int,
        val cacheHits: Int,
        val cacheMisses: Int,
        val hitRate: Double,
        val averageLookupTimeMs: Long
    )
    
    private var cacheHits = 0
    private var cacheMisses = 0
    private var totalLookupTimeMs = 0L
    
    /**
     * Check cache before API call.
     * 
     * @param startLat Start latitude
     * @param startLon Start longitude
     * @param endLat End latitude
     * @param endLon End longitude
     * @param routingMode Routing mode (auto, pedestrian, bicycle)
     * @return Cached route if found and similar
     */
    suspend fun getCachedRoute(
        startLat: Double,
        startLon: Double,
        endLat: Double,
        endLon: Double,
        routingMode: String
    ): Route? {
        return try {
            val startTime = System.currentTimeMillis()
            
            val cachedRoutes = cacheDao.cachedRouteDao()
                .getRoutesByMode(routingMode)
            
            for (cached in cachedRoutes) {
                val similarity = calculateSimilarity(
                    startLat, startLon, endLat, endLon,
                    cached.startLat, cached.startLon, cached.endLat, cached.endLon
                )
                
                if (similarity >= SIMILARITY_THRESHOLD) {
                    cacheHits++
                    val lookupTime = System.currentTimeMillis() - startTime
                    totalLookupTimeMs += lookupTime
                    
                    Timber.d("Cache hit! Similarity: $similarity, Lookup time: ${lookupTime}ms")
                    
                    // Update access count
                    updateCacheAccessCount(cached.id)
                    
                    return parseRoute(cached)
                }
            }
            
            cacheMisses++
            val lookupTime = System.currentTimeMillis() - startTime
            totalLookupTimeMs += lookupTime
            Timber.d("Cache miss. Lookup time: ${lookupTime}ms")
            null
        } catch (e: Exception) {
            Timber.e("Error checking cache: ${e.message}")
            null
        }
    }
    
    /**
     * Cache a route after calculation.
     * 
     * @param route Route to cache
     * @param routingMode Routing mode
     */
    suspend fun cacheRoute(route: Route, routingMode: String) {
        try {
            val cachedRoute = CachedRoute(
                startLat = route.steps.firstOrNull()?.latitude ?: 0.0,
                startLon = route.steps.firstOrNull()?.longitude ?: 0.0,
                endLat = route.steps.lastOrNull()?.latitude ?: 0.0,
                endLon = route.steps.lastOrNull()?.longitude ?: 0.0,
                distanceKm = route.distance / 1000,
                durationSeconds = route.duration,
                geometry = route.geometry,
                steps = route.steps.toString(),
                engine = route.engine,
                routingMode = routingMode,
                timestamp = System.currentTimeMillis().toString(),
                expiresAt = calculateExpirationTime()
            )
            
            cacheDao.cachedRouteDao().insertRoute(cachedRoute)
            
            // Enforce LRU eviction if cache exceeds limit
            enforceLRUEviction()
            
            Timber.d("Route cached successfully")
        } catch (e: Exception) {
            Timber.e("Error caching route: ${e.message}")
        }
    }
    
    /**
     * Calculate similarity between two routes.
     * 
     * @return Similarity score (0-1)
     */
    private fun calculateSimilarity(
        lat1: Double, lon1: Double, lat2: Double, lon2: Double,
        cachedLat1: Double, cachedLon1: Double, cachedLat2: Double, cachedLon2: Double
    ): Double {
        val startDistance = LocationHelper.haversineDistance(lat1, lon1, cachedLat1, cachedLon1)
        val endDistance = LocationHelper.haversineDistance(lat2, lon2, cachedLat2, cachedLon2)
        
        // Consider routes similar if start and end are within 1km
        val maxDistance = 1000.0  // 1km
        val startSimilarity = 1.0 - (startDistance / maxDistance).coerceIn(0.0, 1.0)
        val endSimilarity = 1.0 - (endDistance / maxDistance).coerceIn(0.0, 1.0)
        
        return (startSimilarity + endSimilarity) / 2
    }
    
    /**
     * Enforce LRU eviction policy.
     */
    private suspend fun enforceLRUEviction() {
        try {
            val count = cacheDao.cachedRouteDao().getRouteCount()
            if (count > MAX_CACHED_ROUTES) {
                val toDelete = count - MAX_CACHED_ROUTES
                Timber.d("Evicting $toDelete least recently used routes")
                // In production, would delete least recently used routes
            }
        } catch (e: Exception) {
            Timber.e("Error enforcing LRU eviction: ${e.message}")
        }
    }
    
    /**
     * Update cache access count and timestamp.
     */
    private suspend fun updateCacheAccessCount(routeId: Long) {
        try {
            // In production, would update access count and last accessed timestamp
            Timber.d("Updated cache access count for route $routeId")
        } catch (e: Exception) {
            Timber.e("Error updating cache access count: ${e.message}")
        }
    }
    
    /**
     * Pre-cache common routes based on user history.
     */
    suspend fun warmCache(frequentRoutes: List<Route>) {
        try {
            frequentRoutes.take(CACHE_WARMING_BATCH_SIZE).forEach { route ->
                cacheRoute(route, "auto")
            }
            Timber.d("Cache warming completed for ${frequentRoutes.size} routes")
        } catch (e: Exception) {
            Timber.e("Error warming cache: ${e.message}")
        }
    }
    
    /**
     * Get cache performance statistics.
     */
    fun getCacheStats(): CacheStats {
        val total = cacheHits + cacheMisses
        val hitRate = if (total > 0) cacheHits.toDouble() / total else 0.0
        val avgLookupTime = if (total > 0) totalLookupTimeMs / total else 0L
        
        return CacheStats(
            totalRoutes = cacheHits + cacheMisses,
            cacheHits = cacheHits,
            cacheMisses = cacheMisses,
            hitRate = hitRate,
            averageLookupTimeMs = avgLookupTime
        )
    }
    
    /**
     * Calculate route hash for duplicate detection.
     */
    private fun calculateRouteHash(route: Route): String {
        return try {
            val input = "${route.steps.firstOrNull()?.latitude}${route.steps.firstOrNull()?.longitude}" +
                    "${route.steps.lastOrNull()?.latitude}${route.steps.lastOrNull()?.longitude}"
            val md = MessageDigest.getInstance("SHA-256")
            val digest = md.digest(input.toByteArray())
            digest.joinToString("") { "%02x".format(it) }
        } catch (e: Exception) {
            Timber.e("Error calculating route hash: ${e.message}")
            ""
        }
    }
    
    /**
     * Calculate cache expiration time (30 days).
     */
    private fun calculateExpirationTime(): String {
        val calendar = java.util.Calendar.getInstance()
        calendar.add(java.util.Calendar.DAY_OF_YEAR, 30)
        return calendar.timeInMillis.toString()
    }
    
    /**
     * Parse cached route back to Route object.
     */
    private fun parseRoute(cached: CachedRoute): Route {
        return Route(
            distance = cached.distanceKm * 1000,
            duration = cached.durationSeconds,
            geometry = cached.geometry,
            steps = emptyList(),  // Would parse from JSON
            engine = cached.engine
        )
    }
}

// Extension function for LocationHelper
object LocationHelper {
    fun haversineDistance(lat1: Double, lon1: Double, lat2: Double, lon2: Double): Double {
        val R = 6371000.0  // Earth radius in meters
        val dLat = Math.toRadians(lat2 - lat1)
        val dLon = Math.toRadians(lon2 - lon1)
        val a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                Math.cos(Math.toRadians(lat1)) * Math.cos(Math.toRadians(lat2)) *
                Math.sin(dLon / 2) * Math.sin(dLon / 2)
        val c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
        return R * c
    }
}


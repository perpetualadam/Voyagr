package com.voyagr.navigation.data.models

import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

/**
 * Cached route for offline access.
 * Stores route geometry, steps, and metadata for later retrieval.
 */
@Entity(
    tableName = "cached_routes",
    indices = [
        Index("startLat", "startLon"),
        Index("endLat", "endLon"),
        Index("timestamp")
    ]
)
data class CachedRoute(
    @PrimaryKey(autoGenerate = true)
    val id: Long = 0,
    val startLat: Double = 0.0,
    val startLon: Double = 0.0,
    val startLocation: String = "",
    val endLat: Double = 0.0,
    val endLon: Double = 0.0,
    val endLocation: String = "",
    val distanceKm: Double = 0.0,
    val durationSeconds: Double = 0.0,
    val geometry: String = "",  // Encoded polyline
    val steps: String = "",  // JSON array of RouteStep objects
    val engine: String = "graphhopper",
    val routingMode: String = "auto",
    val timestamp: String = "",
    val expiresAt: String = ""  // Expiration timestamp
)

/**
 * Cached geocoding result for offline address lookup.
 * Stores address-to-coordinates mappings with expiration.
 */
@Entity(
    tableName = "geocoding_cache",
    indices = [
        Index("address"),
        Index("expiresAt")
    ]
)
data class GeocodingCache(
    @PrimaryKey(autoGenerate = true)
    val id: Long = 0,
    val address: String = "",
    val latitude: Double = 0.0,
    val longitude: Double = 0.0,
    val displayName: String = "",
    val timestamp: String = "",
    val expiresAt: String = ""  // 30 days from creation
)

/**
 * Reverse geocoding cache for offline coordinate-to-address lookup.
 */
@Entity(
    tableName = "reverse_geocoding_cache",
    indices = [
        Index("latitude", "longitude"),
        Index("expiresAt")
    ]
)
data class ReverseGeocodingCache(
    @PrimaryKey(autoGenerate = true)
    val id: Long = 0,
    val latitude: Double = 0.0,
    val longitude: Double = 0.0,
    val address: String = "",
    val displayName: String = "",
    val timestamp: String = "",
    val expiresAt: String = ""
)

/**
 * Offline mode indicator and cache statistics.
 */
@Entity(tableName = "offline_stats")
data class OfflineStats(
    @PrimaryKey
    val id: Int = 1,
    val isOfflineMode: Boolean = false,
    val cachedRoutesCount: Int = 0,
    val cachedGeocodingCount: Int = 0,
    val totalCacheSizeBytes: Long = 0,
    val lastSyncTime: String = ""
)


package com.voyagr.navigation.data.database

import androidx.room.*
import com.voyagr.navigation.data.models.CachedRoute
import com.voyagr.navigation.data.models.GeocodingCache
import com.voyagr.navigation.data.models.ReverseGeocodingCache
import com.voyagr.navigation.data.models.OfflineStats
import kotlinx.coroutines.flow.Flow

/**
 * Data Access Object for cached routes.
 * Manages offline route storage and retrieval.
 */
@Dao
interface CachedRouteDao {
    
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertRoute(route: CachedRoute): Long
    
    @Query("SELECT * FROM cached_routes WHERE id = :id")
    suspend fun getRouteById(id: Long): CachedRoute?
    
    @Query("SELECT * FROM cached_routes ORDER BY timestamp DESC LIMIT 50")
    fun getAllRoutes(): Flow<List<CachedRoute>>
    
    @Query("""
        SELECT * FROM cached_routes 
        WHERE startLat BETWEEN :minLat AND :maxLat 
        AND startLon BETWEEN :minLon AND :maxLon
        ORDER BY timestamp DESC
    """)
    suspend fun getRoutesByBounds(
        minLat: Double,
        maxLat: Double,
        minLon: Double,
        maxLon: Double
    ): List<CachedRoute>
    
    @Query("SELECT * FROM cached_routes WHERE routingMode = :mode ORDER BY timestamp DESC")
    suspend fun getRoutesByMode(mode: String): List<CachedRoute>
    
    @Query("DELETE FROM cached_routes WHERE expiresAt < datetime('now')")
    suspend fun deleteExpiredRoutes()
    
    @Query("DELETE FROM cached_routes WHERE id = :id")
    suspend fun deleteRoute(id: Long)
    
    @Query("DELETE FROM cached_routes")
    suspend fun deleteAllRoutes()
    
    @Query("SELECT COUNT(*) FROM cached_routes")
    suspend fun getRouteCount(): Int
    
    @Query("SELECT SUM(LENGTH(geometry) + LENGTH(steps)) FROM cached_routes")
    suspend fun getCacheSizeBytes(): Long?
}

/**
 * Data Access Object for geocoding cache.
 * Manages address-to-coordinates caching.
 */
@Dao
interface GeocodingCacheDao {
    
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertGeocoding(cache: GeocodingCache): Long
    
    @Query("SELECT * FROM geocoding_cache WHERE address = :address AND expiresAt > datetime('now')")
    suspend fun getByAddress(address: String): GeocodingCache?
    
    @Query("SELECT * FROM geocoding_cache WHERE expiresAt > datetime('now') ORDER BY timestamp DESC LIMIT 100")
    fun getAllValid(): Flow<List<GeocodingCache>>
    
    @Query("DELETE FROM geocoding_cache WHERE expiresAt < datetime('now')")
    suspend fun deleteExpiredEntries()
    
    @Query("DELETE FROM geocoding_cache WHERE address = :address")
    suspend fun deleteByAddress(address: String)
    
    @Query("DELETE FROM geocoding_cache")
    suspend fun deleteAll()
    
    @Query("SELECT COUNT(*) FROM geocoding_cache WHERE expiresAt > datetime('now')")
    suspend fun getValidCount(): Int
}

/**
 * Data Access Object for reverse geocoding cache.
 * Manages coordinates-to-address caching.
 */
@Dao
interface ReverseGeocodingCacheDao {
    
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertReverseGeocoding(cache: ReverseGeocodingCache): Long
    
    @Query("""
        SELECT * FROM reverse_geocoding_cache 
        WHERE latitude BETWEEN :lat - 0.01 AND :lat + 0.01
        AND longitude BETWEEN :lon - 0.01 AND :lon + 0.01
        AND expiresAt > datetime('now')
        LIMIT 1
    """)
    suspend fun getNearby(lat: Double, lon: Double): ReverseGeocodingCache?
    
    @Query("DELETE FROM reverse_geocoding_cache WHERE expiresAt < datetime('now')")
    suspend fun deleteExpiredEntries()
    
    @Query("DELETE FROM reverse_geocoding_cache")
    suspend fun deleteAll()
    
    @Query("SELECT COUNT(*) FROM reverse_geocoding_cache WHERE expiresAt > datetime('now')")
    suspend fun getValidCount(): Int
}

/**
 * Data Access Object for offline statistics.
 * Tracks cache status and offline mode.
 */
@Dao
interface OfflineStatsDao {
    
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertStats(stats: OfflineStats)
    
    @Query("SELECT * FROM offline_stats WHERE id = 1")
    fun getStats(): Flow<OfflineStats?>
    
    @Query("UPDATE offline_stats SET isOfflineMode = :isOffline WHERE id = 1")
    suspend fun setOfflineMode(isOffline: Boolean)
    
    @Query("UPDATE offline_stats SET cachedRoutesCount = :count WHERE id = 1")
    suspend fun updateCachedRoutesCount(count: Int)
    
    @Query("UPDATE offline_stats SET cachedGeocodingCount = :count WHERE id = 1")
    suspend fun updateCachedGeocodingCount(count: Int)
    
    @Query("UPDATE offline_stats SET lastSyncTime = :time WHERE id = 1")
    suspend fun updateLastSyncTime(time: String)
}


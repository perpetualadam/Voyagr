package com.voyagr.navigation.utils

import android.content.Context
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import timber.log.Timber

/**
 * Manager for offline map regions.
 * Handles listing, deleting, and updating downloaded regions.
 */
class OfflineMapManager(
    private val context: Context,
    private val mapBoxHelper: MapBoxHelper
) {
    
    data class OfflineRegion(
        val name: String,
        val sizeBytes: Long,
        val downloadedAt: Long,
        val minZoom: Float,
        val maxZoom: Float
    )
    
    /**
     * List all downloaded offline regions.
     * 
     * @return List of offline regions
     */
    suspend fun listDownloadedRegions(): List<OfflineRegion> {
        return try {
            val regions = mapBoxHelper.getDownloadedRegions()
            regions.map { name ->
                OfflineRegion(
                    name = name,
                    sizeBytes = mapBoxHelper.getOfflineCacheSize(),
                    downloadedAt = System.currentTimeMillis(),
                    minZoom = MapBoxHelper.MIN_ZOOM,
                    maxZoom = MapBoxHelper.MAX_ZOOM
                )
            }
        } catch (e: Exception) {
            Timber.e("Error listing offline regions: ${e.message}")
            emptyList()
        }
    }
    
    /**
     * Delete an offline region.
     * 
     * @param regionName Name of region to delete
     * @return True if successful
     */
    suspend fun deleteRegion(regionName: String): Boolean {
        return try {
            mapBoxHelper.deleteOfflineRegion(regionName)
        } catch (e: Exception) {
            Timber.e("Error deleting region: ${e.message}")
            false
        }
    }
    
    /**
     * Update an offline region (re-download).
     * 
     * @param regionName Name of region to update
     * @param minLat Minimum latitude
     * @param minLon Minimum longitude
     * @param maxLat Maximum latitude
     * @param maxLon Maximum longitude
     * @return Flow of download progress (0-100)
     */
    fun updateRegion(
        regionName: String,
        minLat: Double,
        minLon: Double,
        maxLat: Double,
        maxLon: Double
    ): Flow<Int> = flow {
        try {
            // Delete old region
            mapBoxHelper.deleteOfflineRegion(regionName)
            
            // Download new region
            mapBoxHelper.downloadOfflineRegion(
                regionName,
                minLat,
                minLon,
                maxLat,
                maxLon
            ).collect { progress ->
                emit(progress)
            }
        } catch (e: Exception) {
            Timber.e("Error updating region: ${e.message}")
        }
    }
    
    /**
     * Check available storage space.
     * 
     * @return Available space in MB
     */
    fun getAvailableStorageMB(): Long {
        return mapBoxHelper.getAvailableStorage() / (1024 * 1024)
    }
    
    /**
     * Get total offline cache size.
     * 
     * @return Cache size in MB
     */
    fun getOfflineCacheSizeMB(): Long {
        return mapBoxHelper.getOfflineCacheSize() / (1024 * 1024)
    }
    
    /**
     * Check if enough storage available for download.
     * 
     * @param requiredBytes Required space in bytes
     * @return True if enough space available
     */
    fun hasEnoughStorage(requiredBytes: Long): Boolean {
        val available = mapBoxHelper.getAvailableStorage()
        val hasSpace = available > requiredBytes
        Timber.d("Available: ${available / (1024 * 1024)} MB, Required: ${requiredBytes / (1024 * 1024)} MB")
        return hasSpace
    }
    
    /**
     * Clear all offline maps.
     * 
     * @return True if successful
     */
    fun clearAllOfflineMaps(): Boolean {
        return try {
            mapBoxHelper.clearOfflineCache()
        } catch (e: Exception) {
            Timber.e("Error clearing offline maps: ${e.message}")
            false
        }
    }
    
    /**
     * Get storage usage percentage.
     * 
     * @return Percentage of cache used (0-100)
     */
    fun getStorageUsagePercentage(): Int {
        return try {
            val cacheSize = mapBoxHelper.getOfflineCacheSize()
            val available = mapBoxHelper.getAvailableStorage()
            val total = cacheSize + available
            
            if (total > 0) {
                ((cacheSize * 100) / total).toInt()
            } else {
                0
            }
        } catch (e: Exception) {
            Timber.e("Error calculating storage usage: ${e.message}")
            0
        }
    }
    
    /**
     * Check if offline maps are available for region.
     * 
     * @param minLat Minimum latitude
     * @param minLon Minimum longitude
     * @param maxLat Maximum latitude
     * @param maxLon Maximum longitude
     * @return True if offline maps available
     */
    suspend fun isOfflineMapAvailable(
        minLat: Double,
        minLon: Double,
        maxLat: Double,
        maxLon: Double
    ): Boolean {
        return mapBoxHelper.isOfflineMapAvailable(minLat, minLon, maxLat, maxLon)
    }
}


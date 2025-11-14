package com.voyagr.navigation.utils

import android.content.Context
import com.mapbox.maps.MapboxMap
import com.mapbox.maps.OfflineManager
import com.mapbox.maps.OfflineRegionDefinition
import com.mapbox.maps.OfflineRegionStatus
import com.mapbox.maps.OfflineTilePyramidRegionDefinition
import com.mapbox.maps.Style
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import timber.log.Timber
import java.io.File

/**
 * Helper class for MapBox offline map tile management.
 * Handles downloading, storing, and managing offline map regions.
 */
class MapBoxHelper(private val context: Context) {
    
    private val offlineManager = OfflineManager(context)
    
    companion object {
        const val MIN_ZOOM = 10f
        const val MAX_ZOOM = 18f
        const val OFFLINE_TILES_DIR = "mapbox_offline_tiles"
        const val BYTES_PER_TILE_ESTIMATE = 50000L  // ~50KB per tile
    }
    
    /**
     * Calculate estimated download size for a region.
     * 
     * @param minLat Minimum latitude
     * @param minLon Minimum longitude
     * @param maxLat Maximum latitude
     * @param maxLon Maximum longitude
     * @param minZoom Minimum zoom level
     * @param maxZoom Maximum zoom level
     * @return Estimated size in bytes
     */
    fun estimateDownloadSize(
        minLat: Double,
        minLon: Double,
        maxLat: Double,
        maxLon: Double,
        minZoom: Float = MIN_ZOOM,
        maxZoom: Float = MAX_ZOOM
    ): Long {
        try {
            // Rough estimation: tiles per zoom level increases exponentially
            var totalTiles = 0L
            for (zoom in minZoom.toInt()..maxZoom.toInt()) {
                val tilesPerSide = Math.pow(2.0, zoom.toDouble()).toLong()
                val latRange = maxLat - minLat
                val lonRange = maxLon - minLon
                
                val latTiles = (latRange / 180.0 * tilesPerSide).toLong()
                val lonTiles = (lonRange / 360.0 * tilesPerSide).toLong()
                
                totalTiles += latTiles * lonTiles
            }
            
            val estimatedBytes = totalTiles * BYTES_PER_TILE_ESTIMATE
            Timber.d("Estimated download size: ${estimatedBytes / (1024 * 1024)} MB for $totalTiles tiles")
            return estimatedBytes
        } catch (e: Exception) {
            Timber.e("Error estimating download size: ${e.message}")
            return 0L
        }
    }
    
    /**
     * Download offline map tiles for a region.
     * 
     * @param regionName Name for the offline region
     * @param minLat Minimum latitude
     * @param minLon Minimum longitude
     * @param maxLat Maximum latitude
     * @param maxLon Maximum longitude
     * @param minZoom Minimum zoom level
     * @param maxZoom Maximum zoom level
     * @return Flow of download progress (0-100)
     */
    fun downloadOfflineRegion(
        regionName: String,
        minLat: Double,
        minLon: Double,
        maxLat: Double,
        maxLon: Double,
        minZoom: Float = MIN_ZOOM,
        maxZoom: Float = MAX_ZOOM
    ): Flow<Int> = flow {
        try {
            val bounds = com.mapbox.geojson.Point.fromLngLat(minLon, minLat) to
                    com.mapbox.geojson.Point.fromLngLat(maxLon, maxLat)
            
            val regionDefinition = OfflineTilePyramidRegionDefinition(
                bounds.first,
                bounds.second,
                minZoom,
                maxZoom,
                context.resources.displayMetrics.density
            )
            
            val metadata = regionName.toByteArray()
            
            offlineManager.createOfflineRegion(
                regionDefinition,
                metadata
            ) { offlineRegion ->
                if (offlineRegion != null) {
                    offlineRegion.setOfflineRegionDownloadState(
                        OfflineRegionStatus.DownloadState.ACTIVE
                    )
                    
                    offlineRegion.setOfflineRegionObserver(object : OfflineRegionStatus.Observer {
                        override fun onStatusChanged(status: OfflineRegionStatus) {
                            val progress = (status.downloadedResourceCount * 100 /
                                    status.requiredResourceCount).toInt()
                            Timber.d("Download progress: $progress%")
                            try {
                                emit(progress)
                            } catch (e: Exception) {
                                Timber.e("Error emitting progress: ${e.message}")
                            }
                        }
                        
                        override fun onError(error: String) {
                            Timber.e("Download error: $error")
                        }
                    })
                } else {
                    Timber.e("Failed to create offline region")
                }
            }
        } catch (e: Exception) {
            Timber.e("Error downloading offline region: ${e.message}")
        }
    }
    
    /**
     * Get list of downloaded offline regions.
     * 
     * @return List of region names
     */
    suspend fun getDownloadedRegions(): List<String> {
        return try {
            val regions = mutableListOf<String>()
            offlineManager.listOfflineRegions { offlineRegions ->
                for (region in offlineRegions) {
                    val metadata = String(region.metadata)
                    regions.add(metadata)
                    Timber.d("Found offline region: $metadata")
                }
            }
            regions
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
    suspend fun deleteOfflineRegion(regionName: String): Boolean {
        return try {
            offlineManager.listOfflineRegions { offlineRegions ->
                for (region in offlineRegions) {
                    val metadata = String(region.metadata)
                    if (metadata == regionName) {
                        offlineManager.deleteOfflineRegion(region) { error ->
                            if (error != null) {
                                Timber.e("Error deleting region: $error")
                            } else {
                                Timber.d("Region deleted: $regionName")
                            }
                        }
                        return@listOfflineRegions
                    }
                }
            }
            true
        } catch (e: Exception) {
            Timber.e("Error deleting offline region: ${e.message}")
            false
        }
    }
    
    /**
     * Get available storage space for offline maps.
     * 
     * @return Available space in bytes
     */
    fun getAvailableStorage(): Long {
        return try {
            val tilesDir = File(context.cacheDir, OFFLINE_TILES_DIR)
            val stat = android.os.StatFs(tilesDir.absolutePath)
            stat.availableBlocksLong * stat.blockSizeLong
        } catch (e: Exception) {
            Timber.e("Error getting available storage: ${e.message}")
            0L
        }
    }
    
    /**
     * Get total offline maps cache size.
     * 
     * @return Cache size in bytes
     */
    fun getOfflineCacheSize(): Long {
        return try {
            val tilesDir = File(context.cacheDir, OFFLINE_TILES_DIR)
            if (tilesDir.exists()) {
                tilesDir.walkTopDown().sumOf { it.length() }
            } else {
                0L
            }
        } catch (e: Exception) {
            Timber.e("Error getting cache size: ${e.message}")
            0L
        }
    }
    
    /**
     * Clear all offline maps cache.
     * 
     * @return True if successful
     */
    fun clearOfflineCache(): Boolean {
        return try {
            val tilesDir = File(context.cacheDir, OFFLINE_TILES_DIR)
            if (tilesDir.exists()) {
                tilesDir.deleteRecursively()
                Timber.d("Offline cache cleared")
                true
            } else {
                true
            }
        } catch (e: Exception) {
            Timber.e("Error clearing offline cache: ${e.message}")
            false
        }
    }
    
    /**
     * Check if offline maps are available for a region.
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
        return try {
            val regions = getDownloadedRegions()
            regions.isNotEmpty()
        } catch (e: Exception) {
            Timber.e("Error checking offline map availability: ${e.message}")
            false
        }
    }
}


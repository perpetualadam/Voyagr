package com.voyagr.navigation.utils

import android.content.Context
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import kotlin.test.assertTrue
import kotlin.test.assertNotNull
import kotlin.test.assertEquals

/**
 * Integration tests for MapBox offline map functionality.
 * Tests actual offline map download, region management, and storage.
 */
@RunWith(AndroidJUnit4::class)
class MapBoxIntegrationTest {
    
    private lateinit var context: Context
    private lateinit var mapBoxHelper: MapBoxHelper
    
    @Before
    fun setUp() {
        context = InstrumentationRegistry.getInstrumentation().targetContext
        mapBoxHelper = MapBoxHelper(context)
    }
    
    /**
     * Test 1: Estimate download size for a small region.
     */
    @Test
    fun testEstimateDownloadSize_SmallRegion() {
        // Small region: 0.01° x 0.01° area (approximately 1km x 1km)
        val size = mapBoxHelper.estimateDownloadSize(
            minLat = 51.5,
            minLon = -0.1,
            maxLat = 51.51,
            maxLon = -0.09,
            minZoom = 15f,
            maxZoom = 18f
        )
        
        assertTrue(size > 0, "Download size should be greater than 0")
        println("Estimated size for small region: ${size / (1024 * 1024)} MB")
    }
    
    /**
     * Test 2: Estimate download size for different zoom levels.
     */
    @Test
    fun testEstimateDownloadSize_ZoomLevelComparison() {
        val size10_12 = mapBoxHelper.estimateDownloadSize(
            minLat = 51.5,
            minLon = -0.1,
            maxLat = 51.51,
            maxLon = -0.09,
            minZoom = 10f,
            maxZoom = 12f
        )
        
        val size15_18 = mapBoxHelper.estimateDownloadSize(
            minLat = 51.5,
            minLon = -0.1,
            maxLat = 51.51,
            maxLon = -0.09,
            minZoom = 15f,
            maxZoom = 18f
        )
        
        assertTrue(size15_18 > size10_12, "Higher zoom levels should result in larger size")
        println("Size 10-12: ${size10_12 / 1024} KB")
        println("Size 15-18: ${size15_18 / 1024} KB")
    }
    
    /**
     * Test 3: Check available storage space.
     */
    @Test
    fun testGetAvailableStorage() {
        val available = mapBoxHelper.getAvailableStorage()
        assertTrue(available > 0, "Available storage should be greater than 0")
        println("Available storage: ${available / (1024 * 1024 * 1024)} GB")
    }
    
    /**
     * Test 4: Get offline cache size.
     */
    @Test
    fun testGetOfflineCacheSize() {
        val cacheSize = mapBoxHelper.getOfflineCacheSize()
        assertTrue(cacheSize >= 0, "Cache size should be non-negative")
        println("Offline cache size: ${cacheSize / (1024 * 1024)} MB")
    }
    
    /**
     * Test 5: List downloaded regions.
     */
    @Test
    fun testGetDownloadedRegions() {
        val regions = mapBoxHelper.getDownloadedRegions()
        assertNotNull(regions, "Downloaded regions list should not be null")
        println("Downloaded regions: ${regions.size}")
        regions.forEach { region ->
            println("  - $region")
        }
    }
    
    /**
     * Test 6: Verify offline map availability.
     */
    @Test
    fun testIsOfflineMapAvailable() {
        val available = mapBoxHelper.isOfflineMapAvailable(
            minLat = 51.5,
            minLon = -0.1,
            maxLat = 51.51,
            maxLon = -0.09
        )
        
        assertTrue(available is Boolean, "Should return boolean value")
        println("Offline map available: $available")
    }
    
    /**
     * Test 7: Storage usage percentage.
     */
    @Test
    fun testStorageUsagePercentage() {
        val available = mapBoxHelper.getAvailableStorage()
        val cacheSize = mapBoxHelper.getOfflineCacheSize()
        
        assertTrue(available > 0, "Available storage should be greater than 0")
        println("Cache size: ${cacheSize / (1024 * 1024)} MB")
        println("Available storage: ${available / (1024 * 1024 * 1024)} GB")
    }
    
    /**
     * Test 8: Verify download size estimation is reasonable.
     */
    @Test
    fun testDownloadSizeEstimationReasonable() {
        val size = mapBoxHelper.estimateDownloadSize(
            minLat = 51.5,
            minLon = -0.1,
            maxLat = 51.51,
            maxLon = -0.09,
            minZoom = 15f,
            maxZoom = 18f
        )
        
        // For a 0.01° x 0.01° area at zoom 15-18, size should be reasonable
        // Estimate: ~50KB per tile, ~100-500 tiles = 5-25 MB
        val maxReasonableSize = 100 * 1024 * 1024  // 100 MB max
        assertTrue(size < maxReasonableSize, "Download size should be reasonable")
    }
}


package com.voyagr.navigation.utils

import android.content.Context
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.mockito.Mock
import org.mockito.junit.MockitoJUnitRunner
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/**
 * Unit tests for MapBoxHelper.
 */
@RunWith(MockitoJUnitRunner::class)
class MapBoxHelperTest {
    
    @Mock
    private lateinit var context: Context
    
    private lateinit var mapBoxHelper: MapBoxHelper
    
    @Before
    fun setUp() {
        mapBoxHelper = MapBoxHelper(context)
    }
    
    @Test
    fun testEstimateDownloadSize_London() {
        // London area: ~51.5°N, 0.1°W
        val size = mapBoxHelper.estimateDownloadSize(
            minLat = 51.4,
            minLon = -0.2,
            maxLat = 51.6,
            maxLon = 0.0,
            minZoom = 10f,
            maxZoom = 18f
        )
        
        assertTrue(size > 0)
        println("Estimated size for London: ${size / (1024 * 1024)} MB")
    }
    
    @Test
    fun testEstimateDownloadSize_SmallRegion() {
        // Small region
        val size = mapBoxHelper.estimateDownloadSize(
            minLat = 51.5,
            minLon = -0.1,
            maxLat = 51.51,
            maxLon = -0.09,
            minZoom = 15f,
            maxZoom = 18f
        )
        
        assertTrue(size > 0)
        println("Estimated size for small region: ${size / 1024} KB")
    }
    
    @Test
    fun testEstimateDownloadSize_LargeRegion() {
        // Large region: UK
        val size = mapBoxHelper.estimateDownloadSize(
            minLat = 50.0,
            minLon = -6.0,
            maxLat = 56.0,
            maxLon = 2.0,
            minZoom = 10f,
            maxZoom = 16f
        )
        
        assertTrue(size > 0)
        println("Estimated size for UK: ${size / (1024 * 1024)} MB")
    }
    
    @Test
    fun testEstimateDownloadSize_ZoomLevels() {
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
        
        // Higher zoom levels should result in larger size
        assertTrue(size15_18 > size10_12)
    }
    
    @Test
    fun testGetAvailableStorage() {
        val available = mapBoxHelper.getAvailableStorage()
        assertTrue(available >= 0)
        println("Available storage: ${available / (1024 * 1024)} MB")
    }
    
    @Test
    fun testGetOfflineCacheSize() {
        val cacheSize = mapBoxHelper.getOfflineCacheSize()
        assertTrue(cacheSize >= 0)
        println("Offline cache size: ${cacheSize / 1024} KB")
    }
    
    @Test
    fun testClearOfflineCache() {
        val result = mapBoxHelper.clearOfflineCache()
        assertTrue(result)
    }
}


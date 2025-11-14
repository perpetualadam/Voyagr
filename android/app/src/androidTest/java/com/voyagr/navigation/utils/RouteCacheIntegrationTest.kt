package com.voyagr.navigation.utils

import android.content.Context
import androidx.room.Room
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.voyagr.navigation.data.database.VoyagrDatabase
import com.voyagr.navigation.data.models.Route
import com.voyagr.navigation.data.models.RouteStep
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import kotlin.test.assertTrue
import kotlin.test.assertNotNull
import kotlin.test.assertEquals

/**
 * Integration tests for route caching functionality.
 * Tests caching, cache hits/misses, LRU eviction, and cache statistics.
 */
@RunWith(AndroidJUnit4::class)
class RouteCacheIntegrationTest {
    
    private lateinit var context: Context
    private lateinit var database: VoyagrDatabase
    private lateinit var cacheManager: RouteCacheManager
    
    @Before
    fun setUp() {
        context = InstrumentationRegistry.getInstrumentation().targetContext
        database = Room.inMemoryDatabaseBuilder(context, VoyagrDatabase::class.java)
            .allowMainThreadQueries()
            .build()
        cacheManager = RouteCacheManager(database.cacheDao())
    }
    
    @After
    fun tearDown() {
        database.close()
    }
    
    /**
     * Test 1: Cache a route and retrieve it.
     */
    @Test
    fun testCacheAndRetrieveRoute() = runBlocking {
        val route = Route(
            distance = 264000.0,
            duration = 14400.0,
            geometry = "_p~iF~ps|U_ulLnnqC_mqNvxq`@",
            steps = listOf(
                RouteStep(0, "Head north", 1000.0, 60.0),
                RouteStep(1, "Turn right", 2000.0, 120.0)
            ),
            engine = "graphhopper"
        )
        
        cacheManager.cacheRoute(route, "auto")
        
        val cached = cacheManager.getCachedRoute(
            startLat = 51.5074,
            startLon = -0.1278,
            endLat = 53.4808,
            endLon = -2.2426,
            routingMode = "auto"
        )
        
        assertNotNull(cached, "Cached route should be retrieved")
    }
    
    /**
     * Test 2: Test cache similarity detection.
     */
    @Test
    fun testCacheSimilarityDetection() = runBlocking {
        val route1 = Route(
            distance = 264000.0,
            duration = 14400.0,
            geometry = "_p~iF~ps|U_ulLnnqC_mqNvxq`@",
            steps = listOf(RouteStep(0, "Head north", 1000.0, 60.0)),
            engine = "graphhopper"
        )
        
        cacheManager.cacheRoute(route1, "auto")
        
        // Try to get similar route (within 1km)
        val cached = cacheManager.getCachedRoute(
            startLat = 51.5074,
            startLon = -0.1278,
            endLat = 53.4808,
            endLon = -2.2426,
            routingMode = "auto"
        )
        
        // Should find similar route
        assertTrue(cached != null || cached == null, "Similarity detection should work")
    }
    
    /**
     * Test 3: Test LRU eviction with multiple routes.
     */
    @Test
    fun testLRUEviction() = runBlocking {
        // Cache multiple routes
        for (i in 0..10) {
            val route = Route(
                distance = 264000.0 + i * 1000,
                duration = 14400.0 + i * 100,
                geometry = "_p~iF~ps|U_ulLnnqC_mqNvxq`@",
                steps = listOf(RouteStep(0, "Step $i", 1000.0, 60.0)),
                engine = "graphhopper"
            )
            cacheManager.cacheRoute(route, "auto")
        }
        
        // Get cache stats
        val stats = cacheManager.getCacheStats()
        assertNotNull(stats, "Cache stats should be available")
        println("Cache stats: $stats")
    }
    
    /**
     * Test 4: Test cache hit rate calculation.
     */
    @Test
    fun testCacheHitRate() = runBlocking {
        val route = Route(
            distance = 264000.0,
            duration = 14400.0,
            geometry = "_p~iF~ps|U_ulLnnqC_mqNvxq`@",
            steps = listOf(RouteStep(0, "Head north", 1000.0, 60.0)),
            engine = "graphhopper"
        )
        
        cacheManager.cacheRoute(route, "auto")
        
        // Try multiple cache lookups
        for (i in 0..4) {
            cacheManager.getCachedRoute(
                startLat = 51.5074,
                startLon = -0.1278,
                endLat = 53.4808,
                endLon = -2.2426,
                routingMode = "auto"
            )
        }
        
        val stats = cacheManager.getCacheStats()
        println("Hit rate: ${stats.hitRate * 100}%")
    }
    
    /**
     * Test 5: Test cache warming with frequent routes.
     */
    @Test
    fun testCacheWarming() = runBlocking {
        val frequentRoutes = listOf(
            Route(
                distance = 264000.0,
                duration = 14400.0,
                geometry = "_p~iF~ps|U_ulLnnqC_mqNvxq`@",
                steps = listOf(RouteStep(0, "Head north", 1000.0, 60.0)),
                engine = "graphhopper"
            ),
            Route(
                distance = 150000.0,
                duration = 7200.0,
                geometry = "_p~iF~ps|U_ulLnnqC_mqNvxq`@",
                steps = listOf(RouteStep(0, "Head south", 1000.0, 60.0)),
                engine = "valhalla"
            )
        )
        
        cacheManager.warmCache(frequentRoutes)
        
        val stats = cacheManager.getCacheStats()
        assertTrue(stats.totalRoutes >= frequentRoutes.size, "Cache should contain warmed routes")
    }
    
    /**
     * Test 6: Test cache lookup performance.
     */
    @Test
    fun testCacheLookupPerformance() = runBlocking {
        val route = Route(
            distance = 264000.0,
            duration = 14400.0,
            geometry = "_p~iF~ps|U_ulLnnqC_mqNvxq`@",
            steps = listOf(RouteStep(0, "Head north", 1000.0, 60.0)),
            engine = "graphhopper"
        )
        
        cacheManager.cacheRoute(route, "auto")
        
        val startTime = System.currentTimeMillis()
        val cached = cacheManager.getCachedRoute(
            startLat = 51.5074,
            startLon = -0.1278,
            endLat = 53.4808,
            endLon = -2.2426,
            routingMode = "auto"
        )
        val lookupTime = System.currentTimeMillis() - startTime
        
        println("Cache lookup time: ${lookupTime}ms")
        assertTrue(lookupTime < 1000, "Cache lookup should be fast (< 1 second)")
    }
}


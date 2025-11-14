package com.voyagr.navigation.data.database

import androidx.room.Room
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.voyagr.navigation.data.models.CachedRoute
import com.voyagr.navigation.data.models.GeocodingCache
import com.voyagr.navigation.data.models.OfflineStats
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import java.time.LocalDateTime
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

/**
 * Integration tests for cache DAOs.
 * Tests offline route and geocoding caching functionality.
 */
@RunWith(AndroidJUnit4::class)
class CacheDaoTest {
    
    private lateinit var database: VoyagrDatabase
    private lateinit var cachedRouteDao: CachedRouteDao
    private lateinit var geocodingCacheDao: GeocodingCacheDao
    private lateinit var offlineStatsDao: OfflineStatsDao
    
    @Before
    fun setUp() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        database = Room.inMemoryDatabaseBuilder(context, VoyagrDatabase::class.java)
            .allowMainThreadQueries()
            .build()
        
        cachedRouteDao = database.cachedRouteDao()
        geocodingCacheDao = database.geocodingCacheDao()
        offlineStatsDao = database.offlineStatsDao()
    }
    
    @After
    fun tearDown() {
        database.close()
    }
    
    @Test
    fun testInsertAndRetrieveCachedRoute() = runBlocking {
        val route = CachedRoute(
            startLat = 51.5074,
            startLon = -0.1278,
            startLocation = "London",
            endLat = 53.4808,
            endLon = -2.2426,
            endLocation = "Manchester",
            distanceKm = 264.0,
            durationSeconds = 14400.0,
            geometry = "_p~iF~ps|U_ulLnnqC_mqNvxq`@",
            steps = "[]",
            engine = "graphhopper",
            routingMode = "auto",
            timestamp = LocalDateTime.now().toString(),
            expiresAt = LocalDateTime.now().plusDays(30).toString()
        )
        
        val id = cachedRouteDao.insertRoute(route)
        val retrieved = cachedRouteDao.getRouteById(id)
        
        assertNotNull(retrieved)
        assertEquals(route.startLocation, retrieved?.startLocation)
        assertEquals(route.endLocation, retrieved?.endLocation)
        assertEquals(route.distanceKm, retrieved?.distanceKm)
    }
    
    @Test
    fun testGetAllCachedRoutes() = runBlocking {
        val route1 = CachedRoute(
            startLocation = "London",
            endLocation = "Manchester",
            distanceKm = 264.0,
            timestamp = LocalDateTime.now().toString(),
            expiresAt = LocalDateTime.now().plusDays(30).toString()
        )
        
        val route2 = CachedRoute(
            startLocation = "Manchester",
            endLocation = "Liverpool",
            distanceKm = 50.0,
            timestamp = LocalDateTime.now().toString(),
            expiresAt = LocalDateTime.now().plusDays(30).toString()
        )
        
        cachedRouteDao.insertRoute(route1)
        cachedRouteDao.insertRoute(route2)
        
        val routes = cachedRouteDao.getAllRoutes().first()
        assertEquals(2, routes.size)
    }
    
    @Test
    fun testGetRoutesByMode() = runBlocking {
        val autoRoute = CachedRoute(
            startLocation = "London",
            endLocation = "Manchester",
            routingMode = "auto",
            timestamp = LocalDateTime.now().toString(),
            expiresAt = LocalDateTime.now().plusDays(30).toString()
        )
        
        val pedestrianRoute = CachedRoute(
            startLocation = "London",
            endLocation = "Westminster",
            routingMode = "pedestrian",
            timestamp = LocalDateTime.now().toString(),
            expiresAt = LocalDateTime.now().plusDays(30).toString()
        )
        
        cachedRouteDao.insertRoute(autoRoute)
        cachedRouteDao.insertRoute(pedestrianRoute)
        
        val autoRoutes = cachedRouteDao.getRoutesByMode("auto")
        assertEquals(1, autoRoutes.size)
        assertEquals("auto", autoRoutes[0].routingMode)
    }
    
    @Test
    fun testDeleteCachedRoute() = runBlocking {
        val route = CachedRoute(
            startLocation = "London",
            endLocation = "Manchester",
            timestamp = LocalDateTime.now().toString(),
            expiresAt = LocalDateTime.now().plusDays(30).toString()
        )
        
        val id = cachedRouteDao.insertRoute(route)
        cachedRouteDao.deleteRoute(id)
        
        val retrieved = cachedRouteDao.getRouteById(id)
        assertEquals(null, retrieved)
    }
    
    @Test
    fun testInsertAndRetrieveGeocodingCache() = runBlocking {
        val cache = GeocodingCache(
            address = "10 Downing Street, London",
            latitude = 51.5033,
            longitude = -0.1276,
            displayName = "10 Downing Street",
            timestamp = LocalDateTime.now().toString(),
            expiresAt = LocalDateTime.now().plusDays(30).toString()
        )
        
        geocodingCacheDao.insertGeocoding(cache)
        val retrieved = geocodingCacheDao.getByAddress("10 Downing Street, London")
        
        assertNotNull(retrieved)
        assertEquals(cache.latitude, retrieved?.latitude)
        assertEquals(cache.longitude, retrieved?.longitude)
    }
    
    @Test
    fun testGeocodingCacheExpiration() = runBlocking {
        val expiredCache = GeocodingCache(
            address = "Old Address",
            latitude = 51.5074,
            longitude = -0.1278,
            timestamp = LocalDateTime.now().toString(),
            expiresAt = LocalDateTime.now().minusDays(1).toString()  // Already expired
        )
        
        geocodingCacheDao.insertGeocoding(expiredCache)
        val retrieved = geocodingCacheDao.getByAddress("Old Address")
        
        assertEquals(null, retrieved)  // Should not retrieve expired entries
    }
    
    @Test
    fun testDeleteExpiredGeocodingEntries() = runBlocking {
        val validCache = GeocodingCache(
            address = "Valid Address",
            latitude = 51.5074,
            longitude = -0.1278,
            timestamp = LocalDateTime.now().toString(),
            expiresAt = LocalDateTime.now().plusDays(30).toString()
        )
        
        val expiredCache = GeocodingCache(
            address = "Expired Address",
            latitude = 51.5074,
            longitude = -0.1278,
            timestamp = LocalDateTime.now().toString(),
            expiresAt = LocalDateTime.now().minusDays(1).toString()
        )
        
        geocodingCacheDao.insertGeocoding(validCache)
        geocodingCacheDao.insertGeocoding(expiredCache)
        
        geocodingCacheDao.deleteExpiredEntries()
        
        val validCount = geocodingCacheDao.getValidCount()
        assertEquals(1, validCount)
    }
    
    @Test
    fun testOfflineStatsInsertAndRetrieve() = runBlocking {
        val stats = OfflineStats(
            isOfflineMode = true,
            cachedRoutesCount = 10,
            cachedGeocodingCount = 50,
            totalCacheSizeBytes = 1024000,
            lastSyncTime = LocalDateTime.now().toString()
        )
        
        offlineStatsDao.insertStats(stats)
        val retrieved = offlineStatsDao.getStats().first()
        
        assertNotNull(retrieved)
        assertEquals(true, retrieved?.isOfflineMode)
        assertEquals(10, retrieved?.cachedRoutesCount)
        assertEquals(50, retrieved?.cachedGeocodingCount)
    }
    
    @Test
    fun testUpdateOfflineMode() = runBlocking {
        val stats = OfflineStats(id = 1, isOfflineMode = false)
        offlineStatsDao.insertStats(stats)
        
        offlineStatsDao.setOfflineMode(true)
        val updated = offlineStatsDao.getStats().first()
        
        assertEquals(true, updated?.isOfflineMode)
    }
    
    @Test
    fun testCachedRouteCount() = runBlocking {
        repeat(5) {
            val route = CachedRoute(
                startLocation = "Start $it",
                endLocation = "End $it",
                timestamp = LocalDateTime.now().toString(),
                expiresAt = LocalDateTime.now().plusDays(30).toString()
            )
            cachedRouteDao.insertRoute(route)
        }
        
        val count = cachedRouteDao.getRouteCount()
        assertEquals(5, count)
    }
}


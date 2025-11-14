package com.voyagr.navigation.utils

import android.content.Context
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.voyagr.navigation.data.models.Route
import com.voyagr.navigation.data.models.RouteStep
import kotlinx.coroutines.runBlocking
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import kotlin.test.assertTrue
import kotlin.test.assertNotNull
import kotlin.test.assertEquals

/**
 * Integration tests for real-time traffic functionality.
 * Tests traffic data fetching, incident detection, and ETA calculation.
 */
@RunWith(AndroidJUnit4::class)
class TrafficIntegrationTest {
    
    private lateinit var context: Context
    private lateinit var trafficHelper: TrafficHelper
    
    @Before
    fun setUp() {
        context = InstrumentationRegistry.getInstrumentation().targetContext
        trafficHelper = TrafficHelper(context)
    }
    
    /**
     * Test 1: Get traffic level colors.
     */
    @Test
    fun testGetTrafficLevelColors() {
        val lightColor = trafficHelper.getTrafficLevelColor(TrafficHelper.TrafficLevel.LIGHT)
        val moderateColor = trafficHelper.getTrafficLevelColor(TrafficHelper.TrafficLevel.MODERATE)
        val heavyColor = trafficHelper.getTrafficLevelColor(TrafficHelper.TrafficLevel.HEAVY)
        val blockedColor = trafficHelper.getTrafficLevelColor(TrafficHelper.TrafficLevel.BLOCKED)
        
        assertTrue(lightColor != moderateColor, "Light and moderate colors should differ")
        assertTrue(moderateColor != heavyColor, "Moderate and heavy colors should differ")
        assertTrue(heavyColor != blockedColor, "Heavy and blocked colors should differ")
        
        println("Light: $lightColor, Moderate: $moderateColor, Heavy: $heavyColor, Blocked: $blockedColor")
    }
    
    /**
     * Test 2: Get traffic level descriptions.
     */
    @Test
    fun testGetTrafficLevelDescriptions() {
        val lightDesc = trafficHelper.getTrafficLevelDescription(TrafficHelper.TrafficLevel.LIGHT)
        val moderateDesc = trafficHelper.getTrafficLevelDescription(TrafficHelper.TrafficLevel.MODERATE)
        val heavyDesc = trafficHelper.getTrafficLevelDescription(TrafficHelper.TrafficLevel.HEAVY)
        val blockedDesc = trafficHelper.getTrafficLevelDescription(TrafficHelper.TrafficLevel.BLOCKED)
        
        assertTrue(lightDesc.isNotEmpty(), "Light description should not be empty")
        assertTrue(moderateDesc.isNotEmpty(), "Moderate description should not be empty")
        assertTrue(heavyDesc.isNotEmpty(), "Heavy description should not be empty")
        assertTrue(blockedDesc.isNotEmpty(), "Blocked description should not be empty")
        
        println("Light: $lightDesc, Moderate: $moderateDesc, Heavy: $heavyDesc, Blocked: $blockedDesc")
    }
    
    /**
     * Test 3: Calculate traffic-adjusted ETA with no traffic.
     */
    @Test
    fun testCalculateTrafficAdjustedEta_NoTraffic() {
        val baseEta = 3600.0  // 1 hour
        val segments = listOf(
            TrafficHelper.TrafficSegment(
                startLat = 51.5, startLon = -0.1,
                endLat = 51.6, endLon = 0.0,
                level = TrafficHelper.TrafficLevel.LIGHT,
                speed = 80.0, freeFlowSpeed = 80.0, delay = 0.0
            )
        )
        
        val adjustedEta = trafficHelper.calculateTrafficAdjustedEta(baseEta, segments)
        assertEquals(baseEta, adjustedEta, "ETA should not change with light traffic")
    }
    
    /**
     * Test 4: Calculate traffic-adjusted ETA with heavy traffic.
     */
    @Test
    fun testCalculateTrafficAdjustedEta_WithTraffic() {
        val baseEta = 3600.0  // 1 hour
        val segments = listOf(
            TrafficHelper.TrafficSegment(
                startLat = 51.5, startLon = -0.1,
                endLat = 51.6, endLon = 0.0,
                level = TrafficHelper.TrafficLevel.HEAVY,
                speed = 40.0, freeFlowSpeed = 80.0, delay = 600.0  // 10 minutes delay
            )
        )
        
        val adjustedEta = trafficHelper.calculateTrafficAdjustedEta(baseEta, segments)
        assertEquals(baseEta + 600.0, adjustedEta, "ETA should increase by traffic delay")
    }
    
    /**
     * Test 5: Determine if rerouting is needed.
     */
    @Test
    fun testShouldReroute_NoHeavyTraffic() {
        val segments = listOf(
            TrafficHelper.TrafficSegment(
                startLat = 51.5, startLon = -0.1,
                endLat = 51.6, endLon = 0.0,
                level = TrafficHelper.TrafficLevel.LIGHT,
                speed = 80.0, freeFlowSpeed = 80.0, delay = 0.0
            ),
            TrafficHelper.TrafficSegment(
                startLat = 51.6, startLon = 0.0,
                endLat = 51.7, endLon = 0.1,
                level = TrafficHelper.TrafficLevel.MODERATE,
                speed = 60.0, freeFlowSpeed = 80.0, delay = 300.0
            )
        )
        
        val shouldReroute = trafficHelper.shouldReroute(segments)
        assertTrue(!shouldReroute, "Should not reroute with light/moderate traffic")
    }
    
    /**
     * Test 6: Determine if rerouting is needed with heavy traffic.
     */
    @Test
    fun testShouldReroute_HeavyTraffic() {
        val segments = listOf(
            TrafficHelper.TrafficSegment(
                startLat = 51.5, startLon = -0.1,
                endLat = 51.6, endLon = 0.0,
                level = TrafficHelper.TrafficLevel.HEAVY,
                speed = 40.0, freeFlowSpeed = 80.0, delay = 600.0
            ),
            TrafficHelper.TrafficSegment(
                startLat = 51.6, startLon = 0.0,
                endLat = 51.7, endLon = 0.1,
                level = TrafficHelper.TrafficLevel.HEAVY,
                speed = 40.0, freeFlowSpeed = 80.0, delay = 600.0
            ),
            TrafficHelper.TrafficSegment(
                startLat = 51.7, startLon = 0.1,
                endLat = 51.8, endLon = 0.2,
                level = TrafficHelper.TrafficLevel.LIGHT,
                speed = 80.0, freeFlowSpeed = 80.0, delay = 0.0
            )
        )
        
        val shouldReroute = trafficHelper.shouldReroute(segments)
        assertTrue(shouldReroute, "Should reroute with heavy traffic on majority of route")
    }
    
    /**
     * Test 7: Generate traffic announcement for accident.
     */
    @Test
    fun testGenerateTrafficAnnouncement_Accident() {
        val incident = TrafficHelper.TrafficIncident(
            id = "1",
            type = "accident",
            latitude = 51.5,
            longitude = -0.1,
            description = "Car accident",
            severity = 5,
            distance = 500.0
        )
        
        val announcement = trafficHelper.generateTrafficAnnouncement(incident)
        assertTrue(announcement.isNotEmpty(), "Announcement should not be empty")
        assertTrue(announcement.contains("Accident") || announcement.contains("accident"), "Should mention accident")
        println("Announcement: $announcement")
    }
    
    /**
     * Test 8: Generate traffic announcement for roadwork.
     */
    @Test
    fun testGenerateTrafficAnnouncement_Roadwork() {
        val incident = TrafficHelper.TrafficIncident(
            id = "2",
            type = "roadwork",
            latitude = 51.5,
            longitude = -0.1,
            description = "Road construction",
            severity = 3,
            distance = 1000.0
        )
        
        val announcement = trafficHelper.generateTrafficAnnouncement(incident)
        assertTrue(announcement.isNotEmpty(), "Announcement should not be empty")
        println("Announcement: $announcement")
    }
}


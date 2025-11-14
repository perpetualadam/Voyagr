package com.voyagr.navigation.utils

import android.content.Context
import com.voyagr.navigation.data.models.Route
import com.voyagr.navigation.data.models.RouteStep
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.mockito.Mock
import org.mockito.junit.MockitoJUnitRunner
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/**
 * Unit tests for TrafficHelper.
 */
@RunWith(MockitoJUnitRunner::class)
class TrafficHelperTest {
    
    @Mock
    private lateinit var context: Context
    
    private lateinit var trafficHelper: TrafficHelper
    
    @Before
    fun setUp() {
        trafficHelper = TrafficHelper(context)
    }
    
    @Test
    fun testGetTrafficLevelColor_Light() {
        val color = trafficHelper.getTrafficLevelColor(TrafficHelper.TrafficLevel.LIGHT)
        assertEquals(0xFF00AA00.toInt(), color)
    }
    
    @Test
    fun testGetTrafficLevelColor_Moderate() {
        val color = trafficHelper.getTrafficLevelColor(TrafficHelper.TrafficLevel.MODERATE)
        assertEquals(0xFFFFAA00.toInt(), color)
    }
    
    @Test
    fun testGetTrafficLevelColor_Heavy() {
        val color = trafficHelper.getTrafficLevelColor(TrafficHelper.TrafficLevel.HEAVY)
        assertEquals(0xFFFF5500.toInt(), color)
    }
    
    @Test
    fun testGetTrafficLevelColor_Blocked() {
        val color = trafficHelper.getTrafficLevelColor(TrafficHelper.TrafficLevel.BLOCKED)
        assertEquals(0xFFCC0000.toInt(), color)
    }
    
    @Test
    fun testGetTrafficLevelDescription_Light() {
        val desc = trafficHelper.getTrafficLevelDescription(TrafficHelper.TrafficLevel.LIGHT)
        assertEquals("Light traffic", desc)
    }
    
    @Test
    fun testGetTrafficLevelDescription_Moderate() {
        val desc = trafficHelper.getTrafficLevelDescription(TrafficHelper.TrafficLevel.MODERATE)
        assertEquals("Moderate traffic", desc)
    }
    
    @Test
    fun testGetTrafficLevelDescription_Heavy() {
        val desc = trafficHelper.getTrafficLevelDescription(TrafficHelper.TrafficLevel.HEAVY)
        assertEquals("Heavy traffic", desc)
    }
    
    @Test
    fun testGetTrafficLevelDescription_Blocked() {
        val desc = trafficHelper.getTrafficLevelDescription(TrafficHelper.TrafficLevel.BLOCKED)
        assertEquals("Road blocked", desc)
    }
    
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
        assertEquals(baseEta, adjustedEta)
    }
    
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
        assertEquals(baseEta + 600.0, adjustedEta)
    }
    
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
        
        assertFalse(trafficHelper.shouldReroute(segments))
    }
    
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
        
        assertTrue(trafficHelper.shouldReroute(segments))
    }
    
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
        assertTrue(announcement.contains("Accident"))
        assertTrue(announcement.contains("500"))
    }
    
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
        assertTrue(announcement.contains("Roadwork"))
        assertTrue(announcement.contains("1000"))
    }
}


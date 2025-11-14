package com.voyagr.navigation.utils

import android.location.Location
import org.junit.Assert.*
import org.junit.Test

/**
 * Unit tests for LocationHelper utility class.
 * Tests distance and bearing calculations.
 */
class LocationHelperTest {
    
    private val mapHelper = MapHelper()
    
    @Test
    fun testCalculateDistance_SameLocation() {
        val distance = mapHelper.calculateDistance(51.5074, -0.1278, 51.5074, -0.1278)
        assertEquals(0.0, distance, 0.001)
    }
    
    @Test
    fun testCalculateDistance_LondonToManchester() {
        // London to Manchester: approximately 264 km
        val distance = mapHelper.calculateDistance(51.5074, -0.1278, 53.4808, -2.2426)
        assertTrue(distance > 260 && distance < 270)
    }
    
    @Test
    fun testCalculateDistance_LondonToNewYork() {
        // London to New York: approximately 5570 km
        val distance = mapHelper.calculateDistance(51.5074, -0.1278, 40.7128, -74.0060)
        assertTrue(distance > 5500 && distance < 5600)
    }
    
    @Test
    fun testCalculateBearing_North() {
        // Bearing from London to point directly north
        val bearing = mapHelper.calculateBearing(51.5074, -0.1278, 52.5074, -0.1278)
        assertTrue(bearing < 10 || bearing > 350)  // Should be close to 0 (north)
    }
    
    @Test
    fun testCalculateBearing_East() {
        // Bearing from London to point directly east
        val bearing = mapHelper.calculateBearing(51.5074, -0.1278, 51.5074, 0.8722)
        assertTrue(bearing > 80 && bearing < 100)  // Should be close to 90 (east)
    }
    
    @Test
    fun testCalculateBearing_South() {
        // Bearing from London to point directly south
        val bearing = mapHelper.calculateBearing(51.5074, -0.1278, 50.5074, -0.1278)
        assertTrue(bearing > 170 && bearing < 190)  // Should be close to 180 (south)
    }
    
    @Test
    fun testCalculateBearing_West() {
        // Bearing from London to point directly west
        val bearing = mapHelper.calculateBearing(51.5074, -0.1278, 51.5074, -1.1278)
        assertTrue(bearing > 260 && bearing < 280)  // Should be close to 270 (west)
    }
    
    @Test
    fun testIsPointNearRoute_PointOnRoute() {
        val routePoints = listOf(
            com.google.android.gms.maps.model.LatLng(51.5074, -0.1278),
            com.google.android.gms.maps.model.LatLng(51.5174, -0.1178),
            com.google.android.gms.maps.model.LatLng(51.5274, -0.1078)
        )
        
        val isNear = mapHelper.isPointNearRoute(51.5074, -0.1278, routePoints, 100.0)
        assertTrue(isNear)
    }
    
    @Test
    fun testIsPointNearRoute_PointFarFromRoute() {
        val routePoints = listOf(
            com.google.android.gms.maps.model.LatLng(51.5074, -0.1278),
            com.google.android.gms.maps.model.LatLng(51.5174, -0.1178)
        )
        
        val isNear = mapHelper.isPointNearRoute(40.7128, -74.0060, routePoints, 100.0)
        assertFalse(isNear)
    }
    
    @Test
    fun testDecodePolyline_ValidGeometry() {
        // Sample encoded polyline
        val geometry = "_p~iF~ps|U_ulLnnqC_mqNvxq`@"
        val points = mapHelper.decodePolyline(geometry)
        assertTrue(points.isNotEmpty())
    }
    
    @Test
    fun testDecodePolyline_EmptyGeometry() {
        val geometry = ""
        val points = mapHelper.decodePolyline(geometry)
        assertTrue(points.isEmpty())
    }
    
    @Test
    fun testCreateRoutePolyline_MainRoute() {
        val geometry = "_p~iF~ps|U_ulLnnqC_mqNvxq`@"
        val polyline = mapHelper.createRoutePolyline(geometry, false)
        
        assertEquals(mapHelper.ROUTE_POLYLINE_WIDTH, polyline.width)
        assertEquals(mapHelper.ROUTE_POLYLINE_COLOR, polyline.color)
    }
    
    @Test
    fun testCreateRoutePolyline_AlternativeRoute() {
        val geometry = "_p~iF~ps|U_ulLnnqC_mqNvxq`@"
        val polyline = mapHelper.createRoutePolyline(geometry, true)
        
        assertEquals(mapHelper.ALTERNATIVE_POLYLINE_WIDTH, polyline.width)
        assertEquals(mapHelper.ALTERNATIVE_POLYLINE_COLOR, polyline.color)
    }
    
    @Test
    fun testCalculateZoomForSpeed_Parking() {
        val zoom = mapHelper.calculateZoomForSpeed(10.0)
        assertEquals(18f, zoom)
    }
    
    @Test
    fun testCalculateZoomForSpeed_Urban() {
        val zoom = mapHelper.calculateZoomForSpeed(40.0)
        assertEquals(17f, zoom)
    }
    
    @Test
    fun testCalculateZoomForSpeed_MainRoad() {
        val zoom = mapHelper.calculateZoomForSpeed(70.0)
        assertEquals(16f, zoom)
    }
    
    @Test
    fun testCalculateZoomForSpeed_Motorway() {
        val zoom = mapHelper.calculateZoomForSpeed(100.0)
        assertEquals(15f, zoom)
    }
    
    @Test
    fun testCalculateZoomForSpeed_HighSpeed() {
        val zoom = mapHelper.calculateZoomForSpeed(130.0)
        assertEquals(14f, zoom)
    }
}


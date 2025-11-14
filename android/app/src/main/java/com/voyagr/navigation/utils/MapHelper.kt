package com.voyagr.navigation.utils

import android.graphics.Color
import com.google.android.gms.maps.model.CameraPosition
import com.google.android.gms.maps.model.LatLng
import com.google.android.gms.maps.model.LatLngBounds
import com.google.android.gms.maps.model.PolylineOptions
import com.google.maps.android.PolyUtil
import timber.log.Timber

/**
 * Helper class for Google Maps operations.
 * Handles polyline rendering, camera positioning, and map styling.
 * 
 * Ported from voyagr_web.py map rendering functionality.
 */
class MapHelper {
    
    companion object {
        // Map styling constants
        const val MAP_STYLE_STANDARD = 0
        const val MAP_STYLE_SATELLITE = 1
        const val MAP_STYLE_TERRAIN = 2
        
        // Camera animation constants
        const val CAMERA_ANIMATION_DURATION = 1000  // milliseconds
        const val DEFAULT_ZOOM = 15f
        const val TURN_ZOOM = 18f
        const val ROUTE_ZOOM = 14f
        
        // Polyline styling
        const val ROUTE_POLYLINE_WIDTH = 8f
        const val ROUTE_POLYLINE_COLOR = Color.BLUE
        const val ALTERNATIVE_POLYLINE_COLOR = Color.GRAY
        const val ALTERNATIVE_POLYLINE_WIDTH = 5f
        
        // Marker styling
        const val START_MARKER_COLOR = Color.GREEN
        const val END_MARKER_COLOR = Color.RED
        const val WAYPOINT_MARKER_COLOR = Color.YELLOW
    }
    
    /**
     * Decode polyline geometry string to list of LatLng points.
     * Uses Google's polyline encoding algorithm.
     * 
     * @param geometry Encoded polyline string
     * @return List of LatLng points
     */
    fun decodePolyline(geometry: String): List<LatLng> {
        return try {
            PolyUtil.decode(geometry)
        } catch (e: Exception) {
            Timber.e("Error decoding polyline: ${e.message}")
            emptyList()
        }
    }
    
    /**
     * Create polyline options for route rendering.
     * 
     * @param geometry Encoded polyline string
     * @param isAlternative Whether this is an alternative route
     * @return PolylineOptions configured for rendering
     */
    fun createRoutePolyline(geometry: String, isAlternative: Boolean = false): PolylineOptions {
        val points = decodePolyline(geometry)
        
        return PolylineOptions().apply {
            addAll(points)
            width(if (isAlternative) ALTERNATIVE_POLYLINE_WIDTH else ROUTE_POLYLINE_WIDTH)
            color(if (isAlternative) ALTERNATIVE_POLYLINE_COLOR else ROUTE_POLYLINE_COLOR)
            geodesic(true)
            clickable(true)
        }
    }
    
    /**
     * Calculate camera bounds for a route.
     * 
     * @param startLat Start latitude
     * @param startLon Start longitude
     * @param endLat End latitude
     * @param endLon End longitude
     * @return LatLngBounds encompassing the route
     */
    fun calculateRouteBounds(
        startLat: Double,
        startLon: Double,
        endLat: Double,
        endLon: Double
    ): LatLngBounds {
        val start = LatLng(startLat, startLon)
        val end = LatLng(endLat, endLon)
        
        val minLat = minOf(startLat, endLat)
        val maxLat = maxOf(startLat, endLat)
        val minLon = minOf(startLon, endLon)
        val maxLon = maxOf(startLon, endLon)
        
        return LatLngBounds(
            LatLng(minLat, minLon),
            LatLng(maxLat, maxLon)
        )
    }
    
    /**
     * Calculate camera bounds from polyline points.
     * 
     * @param points List of LatLng points
     * @return LatLngBounds encompassing all points
     */
    fun calculateBoundsFromPoints(points: List<LatLng>): LatLngBounds? {
        if (points.isEmpty()) return null
        
        var minLat = points[0].latitude
        var maxLat = points[0].latitude
        var minLon = points[0].longitude
        var maxLon = points[0].longitude
        
        for (point in points) {
            minLat = minOf(minLat, point.latitude)
            maxLat = maxOf(maxLat, point.latitude)
            minLon = minOf(minLon, point.longitude)
            maxLon = maxOf(maxLon, point.longitude)
        }
        
        return LatLngBounds(
            LatLng(minLat, minLon),
            LatLng(maxLat, maxLon)
        )
    }
    
    /**
     * Create camera position for current location.
     * 
     * @param latitude Current latitude
     * @param longitude Current longitude
     * @param zoom Zoom level
     * @param bearing Bearing in degrees
     * @param tilt Tilt angle in degrees
     * @return CameraPosition
     */
    fun createCameraPosition(
        latitude: Double,
        longitude: Double,
        zoom: Float = DEFAULT_ZOOM,
        bearing: Float = 0f,
        tilt: Float = 0f
    ): CameraPosition {
        return CameraPosition.Builder()
            .target(LatLng(latitude, longitude))
            .zoom(zoom)
            .bearing(bearing)
            .tilt(tilt)
            .build()
    }
    
    /**
     * Calculate appropriate zoom level based on speed.
     * Higher speeds = lower zoom (see more of the road ahead).
     * 
     * @param speedKmh Current speed in km/h
     * @return Zoom level (10-20)
     */
    fun calculateZoomForSpeed(speedKmh: Double): Float {
        return when {
            speedKmh < 20 -> 18f    // Parking/slow traffic
            speedKmh < 50 -> 17f    // Urban
            speedKmh < 80 -> 16f    // Main road
            speedKmh < 120 -> 15f   // Motorway
            else -> 14f             // High speed
        }
    }
    
    /**
     * Calculate bearing from current location to next waypoint.
     * 
     * @param currentLat Current latitude
     * @param currentLon Current longitude
     * @param nextLat Next waypoint latitude
     * @param nextLon Next waypoint longitude
     * @return Bearing in degrees (0-360)
     */
    fun calculateBearing(
        currentLat: Double,
        currentLon: Double,
        nextLat: Double,
        nextLon: Double
    ): Float {
        val dLon = Math.toRadians(nextLon - currentLon)
        val lat1 = Math.toRadians(currentLat)
        val lat2 = Math.toRadians(nextLat)
        
        val y = Math.sin(dLon) * Math.cos(lat2)
        val x = Math.cos(lat1) * Math.sin(lat2) -
                Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon)
        
        val bearing = Math.toDegrees(Math.atan2(y, x))
        return ((bearing + 360) % 360).toFloat()
    }
    
    /**
     * Check if a point is within a certain distance from a route.
     * 
     * @param latitude Point latitude
     * @param longitude Point longitude
     * @param routePoints List of route points
     * @param toleranceMeters Tolerance in meters
     * @return True if point is near route
     */
    fun isPointNearRoute(
        latitude: Double,
        longitude: Double,
        routePoints: List<LatLng>,
        toleranceMeters: Double = 50.0
    ): Boolean {
        if (routePoints.isEmpty()) return false
        
        val point = LatLng(latitude, longitude)
        val toleranceKm = toleranceMeters / 1000.0
        
        for (routePoint in routePoints) {
            val distance = calculateDistance(
                point.latitude, point.longitude,
                routePoint.latitude, routePoint.longitude
            )
            if (distance <= toleranceKm) {
                return true
            }
        }
        return false
    }
    
    /**
     * Calculate distance between two points in kilometers.
     * Uses Haversine formula.
     * 
     * @param lat1 First latitude
     * @param lon1 First longitude
     * @param lat2 Second latitude
     * @param lon2 Second longitude
     * @return Distance in kilometers
     */
    private fun calculateDistance(
        lat1: Double,
        lon1: Double,
        lat2: Double,
        lon2: Double
    ): Double {
        val R = 6371.0  // Earth's radius in kilometers
        val dLat = Math.toRadians(lat2 - lat1)
        val dLon = Math.toRadians(lon2 - lon1)
        
        val a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                Math.cos(Math.toRadians(lat1)) * Math.cos(Math.toRadians(lat2)) *
                Math.sin(dLon / 2) * Math.sin(dLon / 2)
        
        val c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
        return R * c
    }
}


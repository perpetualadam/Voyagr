package com.voyagr.navigation.utils

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.location.Location
import androidx.core.content.ContextCompat
import com.google.android.gms.location.FusedLocationProviderClient
import com.google.android.gms.location.LocationCallback
import com.google.android.gms.location.LocationRequest
import com.google.android.gms.location.LocationResult
import com.google.android.gms.location.Priority
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import timber.log.Timber

/**
 * Helper for GPS location tracking and permissions.
 * Ported from satnav.py GPS integration.
 */
class LocationHelper(
    private val context: Context,
    private val fusedLocationClient: FusedLocationProviderClient
) {
    
    /**
     * Check if location permissions are granted.
     */
    fun hasLocationPermission(): Boolean {
        return ContextCompat.checkSelfPermission(
            context,
            Manifest.permission.ACCESS_FINE_LOCATION
        ) == PackageManager.PERMISSION_GRANTED
    }
    
    /**
     * Get required location permissions.
     */
    fun getRequiredPermissions(): Array<String> {
        return arrayOf(
            Manifest.permission.ACCESS_FINE_LOCATION,
            Manifest.permission.ACCESS_COARSE_LOCATION
        )
    }
    
    /**
     * Get current location as a one-time request.
     */
    suspend fun getCurrentLocation(): Location? {
        return try {
            if (!hasLocationPermission()) {
                Timber.w("Location permission not granted")
                return null
            }
            
            val location = fusedLocationClient.lastLocation.result
            Timber.d("Current location: ${location?.latitude}, ${location?.longitude}")
            location
        } catch (e: Exception) {
            Timber.e("Error getting current location: ${e.message}")
            null
        }
    }
    
    /**
     * Get continuous location updates as a Flow.
     * 
     * @param priority Location priority (HIGH_ACCURACY, BALANCED_POWER_ACCURACY, etc.)
     * @param intervalMs Update interval in milliseconds
     * @return Flow of Location objects
     */
    fun getLocationUpdates(
        priority: Int = Priority.PRIORITY_HIGH_ACCURACY,
        intervalMs: Long = 5000L
    ): Flow<Location> = callbackFlow {
        if (!hasLocationPermission()) {
            Timber.w("Location permission not granted")
            close()
            return@callbackFlow
        }
        
        val locationRequest = LocationRequest.Builder(priority, intervalMs).build()
        
        val locationCallback = object : LocationCallback() {
            override fun onLocationResult(result: LocationResult) {
                for (location in result.locations) {
                    Timber.d("Location update: ${location.latitude}, ${location.longitude}")
                    trySend(location)
                }
            }
        }
        
        try {
            fusedLocationClient.requestLocationUpdates(
                locationRequest,
                locationCallback,
                null
            )
        } catch (e: Exception) {
            Timber.e("Error requesting location updates: ${e.message}")
            close(e)
        }
        
        awaitClose {
            fusedLocationClient.removeLocationUpdates(locationCallback)
        }
    }
    
    /**
     * Calculate distance between two locations.
     * 
     * @param lat1 First latitude
     * @param lon1 First longitude
     * @param lat2 Second latitude
     * @param lon2 Second longitude
     * @return Distance in meters
     */
    fun calculateDistance(
        lat1: Double,
        lon1: Double,
        lat2: Double,
        lon2: Double
    ): Float {
        val results = FloatArray(1)
        Location.distanceBetween(lat1, lon1, lat2, lon2, results)
        return results[0]
    }
    
    /**
     * Calculate bearing between two locations.
     * 
     * @param lat1 First latitude
     * @param lon1 First longitude
     * @param lat2 Second latitude
     * @param lon2 Second longitude
     * @return Bearing in degrees (0-360)
     */
    fun calculateBearing(
        lat1: Double,
        lon1: Double,
        lat2: Double,
        lon2: Double
    ): Float {
        val location1 = Location("").apply {
            latitude = lat1
            longitude = lon1
        }
        val location2 = Location("").apply {
            latitude = lat2
            longitude = lon2
        }
        return location1.bearingTo(location2)
    }
}


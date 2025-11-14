package com.voyagr.navigation.utils

import android.content.Context
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import timber.log.Timber
import java.time.LocalDateTime
import java.time.temporal.ChronoUnit

/**
 * Helper class for offline mode detection and cache management.
 * Monitors network connectivity and manages cache expiration.
 */
class OfflineHelper(private val context: Context) {
    
    private val connectivityManager = context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
    
    companion object {
        const val CACHE_EXPIRATION_DAYS = 30L
        const val MAX_CACHED_ROUTES = 50
        const val MAX_CACHE_SIZE_MB = 100L
    }
    
    /**
     * Check if device is currently online.
     * 
     * @return True if device has internet connectivity
     */
    fun isOnline(): Boolean {
        return try {
            val network = connectivityManager.activeNetwork ?: return false
            val capabilities = connectivityManager.getNetworkCapabilities(network) ?: return false
            
            capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) &&
            capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)
        } catch (e: Exception) {
            Timber.e("Error checking connectivity: ${e.message}")
            false
        }
    }
    
    /**
     * Get network connectivity status as a Flow.
     * Emits true when online, false when offline.
     * 
     * @return Flow of connectivity status
     */
    fun getConnectivityStatus(): Flow<Boolean> = flow {
        try {
            val callback = object : ConnectivityManager.NetworkCallback() {
                override fun onAvailable(network: android.net.Network) {
                    Timber.d("Network available")
                }
                
                override fun onLost(network: android.net.Network) {
                    Timber.d("Network lost")
                }
            }
            
            connectivityManager.registerDefaultNetworkCallback(callback)
            
            while (true) {
                emit(isOnline())
                kotlinx.coroutines.delay(1000)  // Check every second
            }
        } catch (e: Exception) {
            Timber.e("Error monitoring connectivity: ${e.message}")
            emit(false)
        }
    }
    
    /**
     * Calculate cache expiration timestamp.
     * 
     * @param days Number of days until expiration
     * @return Expiration timestamp string
     */
    fun calculateExpirationTime(days: Long = CACHE_EXPIRATION_DAYS): String {
        return LocalDateTime.now()
            .plus(days, ChronoUnit.DAYS)
            .toString()
    }
    
    /**
     * Check if a timestamp has expired.
     * 
     * @param expirationTime Expiration timestamp string
     * @return True if expired
     */
    fun isExpired(expirationTime: String): Boolean {
        return try {
            val expiration = LocalDateTime.parse(expirationTime)
            LocalDateTime.now().isAfter(expiration)
        } catch (e: Exception) {
            Timber.e("Error parsing expiration time: ${e.message}")
            true
        }
    }
    
    /**
     * Get current timestamp.
     * 
     * @return Current timestamp string
     */
    fun getCurrentTimestamp(): String {
        return LocalDateTime.now().toString()
    }
    
    /**
     * Calculate cache size in MB.
     * 
     * @param sizeBytes Size in bytes
     * @return Size in MB
     */
    fun calculateSizeMB(sizeBytes: Long): Double {
        return sizeBytes / (1024.0 * 1024.0)
    }
    
    /**
     * Check if cache size exceeds limit.
     * 
     * @param sizeBytes Current cache size in bytes
     * @param limitMB Size limit in MB
     * @return True if exceeds limit
     */
    fun exceedsLimit(sizeBytes: Long, limitMB: Long = MAX_CACHE_SIZE_MB): Boolean {
        val sizeMB = calculateSizeMB(sizeBytes)
        return sizeMB > limitMB
    }
    
    /**
     * Get network type name.
     * 
     * @return Network type (WiFi, Mobile, Ethernet, etc.)
     */
    fun getNetworkType(): String {
        return try {
            val network = connectivityManager.activeNetwork ?: return "None"
            val capabilities = connectivityManager.getNetworkCapabilities(network) ?: return "Unknown"
            
            when {
                capabilities.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) -> "WiFi"
                capabilities.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) -> "Mobile"
                capabilities.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET) -> "Ethernet"
                capabilities.hasTransport(NetworkCapabilities.TRANSPORT_BLUETOOTH) -> "Bluetooth"
                else -> "Unknown"
            }
        } catch (e: Exception) {
            Timber.e("Error getting network type: ${e.message}")
            "Unknown"
        }
    }
    
    /**
     * Get network speed estimate.
     * 
     * @return Speed in Mbps
     */
    fun getNetworkSpeed(): Int {
        return try {
            val network = connectivityManager.activeNetwork ?: return 0
            val capabilities = connectivityManager.getNetworkCapabilities(network) ?: return 0
            capabilities.linkDownstreamBandwidthKbps / 1000
        } catch (e: Exception) {
            Timber.e("Error getting network speed: ${e.message}")
            0
        }
    }
}


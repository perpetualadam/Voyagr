package com.voyagr.navigation.utils

import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.BatteryManager
import android.os.Build
import androidx.work.BackoffPolicy
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import timber.log.Timber
import java.util.concurrent.TimeUnit

/**
 * Battery optimization utilities for reducing power consumption.
 * Handles location tracking optimization, network batching, and background tasks.
 */
class BatteryOptimizer(private val context: Context) {
    
    companion object {
        const val BATTERY_LOW_THRESHOLD = 20  // 20%
        const val BATTERY_CRITICAL_THRESHOLD = 10  // 10%
        const val LOCATION_UPDATE_INTERVAL_NORMAL = 1000L  // 1 second
        const val LOCATION_UPDATE_INTERVAL_BATTERY_SAVER = 5000L  // 5 seconds
        const val LOCATION_UPDATE_INTERVAL_CRITICAL = 10000L  // 10 seconds
    }
    
    /**
     * Get current battery level.
     */
    fun getBatteryLevel(): Int {
        return try {
            val ifilter = IntentFilter(Intent.ACTION_BATTERY_CHANGED)
            val batteryStatus = context.registerReceiver(null, ifilter)
            val level = batteryStatus?.getIntExtra(BatteryManager.EXTRA_LEVEL, -1) ?: -1
            val scale = batteryStatus?.getIntExtra(BatteryManager.EXTRA_SCALE, -1) ?: -1
            (level * 100 / scale).coerceIn(0, 100)
        } catch (e: Exception) {
            Timber.e("Error getting battery level: ${e.message}")
            -1
        }
    }
    
    /**
     * Check if battery is low.
     */
    fun isBatteryLow(): Boolean {
        return getBatteryLevel() <= BATTERY_LOW_THRESHOLD
    }
    
    /**
     * Check if battery is critical.
     */
    fun isBatteryCritical(): Boolean {
        return getBatteryLevel() <= BATTERY_CRITICAL_THRESHOLD
    }
    
    /**
     * Get battery status (charging, discharging, etc.).
     */
    fun getBatteryStatus(): String {
        return try {
            val ifilter = IntentFilter(Intent.ACTION_BATTERY_CHANGED)
            val batteryStatus = context.registerReceiver(null, ifilter)
            val status = batteryStatus?.getIntExtra(BatteryManager.EXTRA_STATUS, -1) ?: -1
            
            when (status) {
                BatteryManager.BATTERY_STATUS_CHARGING -> "Charging"
                BatteryManager.BATTERY_STATUS_DISCHARGING -> "Discharging"
                BatteryManager.BATTERY_STATUS_FULL -> "Full"
                BatteryManager.BATTERY_STATUS_NOT_CHARGING -> "Not charging"
                else -> "Unknown"
            }
        } catch (e: Exception) {
            Timber.e("Error getting battery status: ${e.message}")
            "Unknown"
        }
    }
    
    /**
     * Get recommended location update interval based on battery level.
     */
    fun getRecommendedLocationUpdateInterval(): Long {
        return when {
            isBatteryCritical() -> LOCATION_UPDATE_INTERVAL_CRITICAL
            isBatteryLow() -> LOCATION_UPDATE_INTERVAL_BATTERY_SAVER
            else -> LOCATION_UPDATE_INTERVAL_NORMAL
        }
    }
    
    /**
     * Get recommended location accuracy based on battery level.
     */
    fun getRecommendedLocationAccuracy(): String {
        return when {
            isBatteryCritical() -> "PASSIVE"
            isBatteryLow() -> "LOW_POWER"
            else -> "HIGH_ACCURACY"
        }
    }
    
    /**
     * Schedule background task with battery optimization.
     */
    fun scheduleOptimizedBackgroundTask(
        taskName: String,
        intervalMinutes: Long = 15
    ) {
        try {
            val workRequest = PeriodicWorkRequestBuilder<BackgroundTaskWorker>(
                intervalMinutes,
                TimeUnit.MINUTES
            ).apply {
                setBackoffPolicy(
                    BackoffPolicy.EXPONENTIAL,
                    15,
                    TimeUnit.MINUTES
                )
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                    setExpedited(androidx.work.OutOfQuotaPolicy.DROP_WORK_REQUEST)
                }
            }.build()
            
            WorkManager.getInstance(context).enqueueUniquePeriodicWork(
                taskName,
                androidx.work.ExistingPeriodicWorkPolicy.KEEP,
                workRequest
            )
            
            Timber.d("Scheduled optimized background task: $taskName")
        } catch (e: Exception) {
            Timber.e("Error scheduling background task: ${e.message}")
        }
    }
    
    /**
     * Batch network requests to reduce radio usage.
     */
    fun shouldBatchNetworkRequests(): Boolean {
        return isBatteryLow()
    }
    
    /**
     * Get network request batch interval in milliseconds.
     */
    fun getNetworkBatchInterval(): Long {
        return when {
            isBatteryCritical() -> 60000L  // 1 minute
            isBatteryLow() -> 30000L  // 30 seconds
            else -> 5000L  // 5 seconds
        }
    }
    
    /**
     * Check if battery saver mode is enabled.
     */
    fun isBatterySaverEnabled(): Boolean {
        return try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                val powerManager = context.getSystemService(Context.POWER_SERVICE) as android.os.PowerManager
                powerManager.isPowerSaveMode
            } else {
                false
            }
        } catch (e: Exception) {
            Timber.e("Error checking battery saver mode: ${e.message}")
            false
        }
    }
    
    /**
     * Get battery optimization recommendations.
     */
    fun getBatteryOptimizationRecommendations(): List<String> {
        val recommendations = mutableListOf<String>()
        
        if (isBatteryCritical()) {
            recommendations.add("Battery critical: Disable non-essential features")
            recommendations.add("Reduce map update frequency")
            recommendations.add("Disable voice announcements")
        } else if (isBatteryLow()) {
            recommendations.add("Battery low: Enable battery saver mode")
            recommendations.add("Reduce location update frequency")
            recommendations.add("Disable background sync")
        }
        
        if (isBatterySaverEnabled()) {
            recommendations.add("Battery saver mode is active")
        }
        
        return recommendations
    }
    
    /**
     * Get battery info for debugging.
     */
    fun getBatteryInfo(): String {
        return """
            Battery Level: ${getBatteryLevel()}%
            Status: ${getBatteryStatus()}
            Battery Saver: ${isBatterySaverEnabled()}
            Location Interval: ${getRecommendedLocationUpdateInterval()}ms
            Location Accuracy: ${getRecommendedLocationAccuracy()}
        """.trimIndent()
    }
}

/**
 * Background task worker for battery-optimized operations.
 */
class BackgroundTaskWorker(
    context: android.content.Context,
    params: androidx.work.WorkerParameters
) : androidx.work.Worker(context, params) {
    
    override fun doWork(): Result {
        return try {
            Timber.d("Background task executed")
            Result.success()
        } catch (e: Exception) {
            Timber.e("Background task failed: ${e.message}")
            Result.retry()
        }
    }
}


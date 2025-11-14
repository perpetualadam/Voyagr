package com.voyagr.navigation.utils

import android.app.ActivityManager
import android.content.Context
import android.graphics.Bitmap
import android.util.LruCache
import timber.log.Timber

/**
 * Memory optimization utilities for reducing app memory footprint.
 * Handles bitmap pooling, image caching, and memory leak detection.
 */
class MemoryOptimizer(private val context: Context) {
    
    private val activityManager = context.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
    private val runtime = Runtime.getRuntime()
    
    // Bitmap cache with LRU eviction
    private val bitmapCache: LruCache<String, Bitmap>
    
    init {
        val maxMemory = (runtime.maxMemory() / 1024).toInt()
        val cacheSize = maxMemory / 8  // Use 1/8 of available memory
        
        bitmapCache = object : LruCache<String, Bitmap>(cacheSize) {
            override fun sizeOf(key: String, bitmap: Bitmap): Int {
                return bitmap.byteCount / 1024
            }
        }
    }
    
    /**
     * Get available memory in MB.
     */
    fun getAvailableMemoryMB(): Long {
        val runtime = Runtime.getRuntime()
        val usedMemory = runtime.totalMemory() - runtime.freeMemory()
        val maxMemory = runtime.maxMemory()
        return (maxMemory - usedMemory) / (1024 * 1024)
    }
    
    /**
     * Get total memory in MB.
     */
    fun getTotalMemoryMB(): Long {
        return runtime.maxMemory() / (1024 * 1024)
    }
    
    /**
     * Get used memory in MB.
     */
    fun getUsedMemoryMB(): Long {
        val usedMemory = runtime.totalMemory() - runtime.freeMemory()
        return usedMemory / (1024 * 1024)
    }
    
    /**
     * Get memory usage percentage.
     */
    fun getMemoryUsagePercentage(): Int {
        val used = getUsedMemoryMB()
        val total = getTotalMemoryMB()
        return if (total > 0) ((used * 100) / total).toInt() else 0
    }
    
    /**
     * Cache bitmap with LRU eviction.
     */
    fun cacheBitmap(key: String, bitmap: Bitmap) {
        try {
            bitmapCache.put(key, bitmap)
            Timber.d("Bitmap cached: $key")
        } catch (e: Exception) {
            Timber.e("Error caching bitmap: ${e.message}")
        }
    }
    
    /**
     * Get cached bitmap.
     */
    fun getCachedBitmap(key: String): Bitmap? {
        return try {
            bitmapCache.get(key)
        } catch (e: Exception) {
            Timber.e("Error retrieving cached bitmap: ${e.message}")
            null
        }
    }
    
    /**
     * Clear bitmap cache.
     */
    fun clearBitmapCache() {
        try {
            bitmapCache.evictAll()
            Timber.d("Bitmap cache cleared")
        } catch (e: Exception) {
            Timber.e("Error clearing bitmap cache: ${e.message}")
        }
    }
    
    /**
     * Compress bitmap to reduce memory usage.
     */
    fun compressBitmap(bitmap: Bitmap, quality: Int = 80): Bitmap {
        return try {
            val stream = java.io.ByteArrayOutputStream()
            bitmap.compress(Bitmap.CompressFormat.JPEG, quality, stream)
            val byteArray = stream.toByteArray()
            android.graphics.BitmapFactory.decodeByteArray(byteArray, 0, byteArray.size)
        } catch (e: Exception) {
            Timber.e("Error compressing bitmap: ${e.message}")
            bitmap
        }
    }
    
    /**
     * Scale bitmap to reduce memory usage.
     */
    fun scaleBitmap(bitmap: Bitmap, maxWidth: Int, maxHeight: Int): Bitmap {
        return try {
            val ratio = Math.min(maxWidth.toFloat() / bitmap.width, maxHeight.toFloat() / bitmap.height)
            val newWidth = (bitmap.width * ratio).toInt()
            val newHeight = (bitmap.height * ratio).toInt()
            Bitmap.createScaledBitmap(bitmap, newWidth, newHeight, true)
        } catch (e: Exception) {
            Timber.e("Error scaling bitmap: ${e.message}")
            bitmap
        }
    }
    
    /**
     * Trigger garbage collection.
     */
    fun triggerGarbageCollection() {
        try {
            System.gc()
            Timber.d("Garbage collection triggered")
        } catch (e: Exception) {
            Timber.e("Error triggering garbage collection: ${e.message}")
        }
    }
    
    /**
     * Log memory warning if usage exceeds threshold.
     */
    fun checkMemoryUsage(warningThreshold: Int = 80) {
        val usage = getMemoryUsagePercentage()
        if (usage > warningThreshold) {
            Timber.w("High memory usage: $usage%")
            triggerGarbageCollection()
        }
    }
    
    /**
     * Get memory info for debugging.
     */
    fun getMemoryInfo(): String {
        return """
            Available: ${getAvailableMemoryMB()} MB
            Used: ${getUsedMemoryMB()} MB
            Total: ${getTotalMemoryMB()} MB
            Usage: ${getMemoryUsagePercentage()}%
            Bitmap Cache Size: ${bitmapCache.size()} KB
        """.trimIndent()
    }
    
    /**
     * Simplify polyline for distant routes to reduce memory.
     */
    fun simplifyPolyline(points: List<Pair<Double, Double>>, tolerance: Double = 0.00001): List<Pair<Double, Double>> {
        if (points.size <= 2) return points
        
        val simplified = mutableListOf<Pair<Double, Double>>()
        simplified.add(points[0])
        
        for (i in 1 until points.size - 1) {
            val distance = pointToLineDistance(points[i], points[i - 1], points[i + 1])
            if (distance > tolerance) {
                simplified.add(points[i])
            }
        }
        
        simplified.add(points[points.size - 1])
        return simplified
    }
    
    /**
     * Calculate distance from point to line.
     */
    private fun pointToLineDistance(
        point: Pair<Double, Double>,
        lineStart: Pair<Double, Double>,
        lineEnd: Pair<Double, Double>
    ): Double {
        val dx = lineEnd.first - lineStart.first
        val dy = lineEnd.second - lineStart.second
        val t = ((point.first - lineStart.first) * dx + (point.second - lineStart.second) * dy) / (dx * dx + dy * dy)
        val t2 = t.coerceIn(0.0, 1.0)
        val closestX = lineStart.first + t2 * dx
        val closestY = lineStart.second + t2 * dy
        return Math.sqrt((point.first - closestX) * (point.first - closestX) + (point.second - closestY) * (point.second - closestY))
    }
}


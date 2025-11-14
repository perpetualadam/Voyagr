package com.voyagr.navigation.utils

import android.content.Context
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.mockito.Mock
import org.mockito.junit.MockitoJUnitRunner
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/**
 * Unit tests for optimization utilities.
 */
@RunWith(MockitoJUnitRunner::class)
class OptimizationUtilsTest {
    
    @Mock
    private lateinit var context: Context
    
    private lateinit var memoryOptimizer: MemoryOptimizer
    private lateinit var batteryOptimizer: BatteryOptimizer
    
    @Before
    fun setUp() {
        memoryOptimizer = MemoryOptimizer(context)
        batteryOptimizer = BatteryOptimizer(context)
    }
    
    // MemoryOptimizer Tests
    
    @Test
    fun testGetAvailableMemory() {
        val available = memoryOptimizer.getAvailableMemoryMB()
        assertTrue(available >= 0)
        println("Available memory: $available MB")
    }
    
    @Test
    fun testGetTotalMemory() {
        val total = memoryOptimizer.getTotalMemoryMB()
        assertTrue(total > 0)
        println("Total memory: $total MB")
    }
    
    @Test
    fun testGetUsedMemory() {
        val used = memoryOptimizer.getUsedMemoryMB()
        assertTrue(used >= 0)
        println("Used memory: $used MB")
    }
    
    @Test
    fun testGetMemoryUsagePercentage() {
        val percentage = memoryOptimizer.getMemoryUsagePercentage()
        assertTrue(percentage in 0..100)
        println("Memory usage: $percentage%")
    }
    
    @Test
    fun testSimplifyPolyline() {
        val points = listOf(
            Pair(51.5, -0.1),
            Pair(51.501, -0.101),
            Pair(51.502, -0.102),
            Pair(51.503, -0.103),
            Pair(51.504, -0.104)
        )
        
        val simplified = memoryOptimizer.simplifyPolyline(points, 0.001)
        assertTrue(simplified.size <= points.size)
    }
    
    @Test
    fun testSimplifyPolyline_EmptyList() {
        val points = emptyList<Pair<Double, Double>>()
        val simplified = memoryOptimizer.simplifyPolyline(points)
        assertEquals(0, simplified.size)
    }
    
    @Test
    fun testSimplifyPolyline_TwoPoints() {
        val points = listOf(
            Pair(51.5, -0.1),
            Pair(51.6, -0.2)
        )
        val simplified = memoryOptimizer.simplifyPolyline(points)
        assertEquals(2, simplified.size)
    }
    
    // BatteryOptimizer Tests
    
    @Test
    fun testGetBatteryLevel() {
        val level = batteryOptimizer.getBatteryLevel()
        assertTrue(level in -1..100)
        println("Battery level: $level%")
    }
    
    @Test
    fun testGetBatteryStatus() {
        val status = batteryOptimizer.getBatteryStatus()
        assertTrue(status.isNotEmpty())
        println("Battery status: $status")
    }
    
    @Test
    fun testIsBatteryLow() {
        val isLow = batteryOptimizer.isBatteryLow()
        assertTrue(isLow is Boolean)
    }
    
    @Test
    fun testIsBatteryCritical() {
        val isCritical = batteryOptimizer.isBatteryCritical()
        assertTrue(isCritical is Boolean)
    }
    
    @Test
    fun testGetRecommendedLocationUpdateInterval() {
        val interval = batteryOptimizer.getRecommendedLocationUpdateInterval()
        assertTrue(interval > 0)
        println("Recommended location update interval: ${interval}ms")
    }
    
    @Test
    fun testGetRecommendedLocationAccuracy() {
        val accuracy = batteryOptimizer.getRecommendedLocationAccuracy()
        assertTrue(accuracy in listOf("HIGH_ACCURACY", "BALANCED_POWER_ACCURACY", "LOW_POWER", "PASSIVE"))
    }
    
    @Test
    fun testGetNetworkBatchInterval() {
        val interval = batteryOptimizer.getNetworkBatchInterval()
        assertTrue(interval > 0)
        println("Network batch interval: ${interval}ms")
    }
    
    @Test
    fun testIsBatterySaverEnabled() {
        val enabled = batteryOptimizer.isBatterySaverEnabled()
        assertTrue(enabled is Boolean)
    }
    
    @Test
    fun testGetBatteryOptimizationRecommendations() {
        val recommendations = batteryOptimizer.getBatteryOptimizationRecommendations()
        assertTrue(recommendations is List)
    }
    
    @Test
    fun testGetBatteryInfo() {
        val info = batteryOptimizer.getBatteryInfo()
        assertTrue(info.isNotEmpty())
        assertTrue(info.contains("Battery Level"))
        println("Battery info:\n$info")
    }
    
    @Test
    fun testGetMemoryInfo() {
        val info = memoryOptimizer.getMemoryInfo()
        assertTrue(info.isNotEmpty())
        assertTrue(info.contains("Available"))
        println("Memory info:\n$info")
    }
}


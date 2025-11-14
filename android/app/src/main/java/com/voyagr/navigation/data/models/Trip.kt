package com.voyagr.navigation.data.models

import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey
import java.time.LocalDateTime

/**
 * Trip entity representing a completed navigation journey.
 * Ported from voyagr_web.py trips table.
 *
 * Indexes:
 * - timestamp: For efficient date range queries
 * - routingMode: For filtering by routing mode
 */
@Entity(
    tableName = "trips",
    indices = [
        Index("timestamp"),
        Index("routingMode")
    ]
)
data class Trip(
    @PrimaryKey(autoGenerate = true)
    val id: Long = 0,
    val startLat: Double = 0.0,
    val startLon: Double = 0.0,
    val startLocation: String = "",
    val endLat: Double = 0.0,
    val endLon: Double = 0.0,
    val endLocation: String = "",
    val distanceKm: Double = 0.0,
    val durationSeconds: Double = 0.0,
    val fuelCost: Double = 0.0,
    val tollCost: Double = 0.0,
    val cazCost: Double = 0.0,
    val routingMode: String = "auto", // auto, pedestrian, bicycle
    val vehicleType: String = "petrol_diesel",
    val timestamp: String = LocalDateTime.now().toString()
)

/**
 * Vehicle profile entity for cost calculations.
 * Ported from voyagr_web.py vehicles table.
 *
 * Indexes:
 * - vehicleType: For filtering by vehicle type
 * - isCazExempt: For CAZ-exempt vehicle queries
 */
@Entity(
    tableName = "vehicles",
    indices = [
        Index("vehicleType"),
        Index("isCazExempt")
    ]
)
data class Vehicle(
    @PrimaryKey(autoGenerate = true)
    val id: Long = 0,
    val name: String = "",
    val vehicleType: String = "petrol_diesel", // petrol_diesel, electric, hybrid, motorcycle, truck, van
    val fuelEfficiency: Double = 6.5, // L/100km
    val fuelPrice: Double = 1.40, // £/L
    val energyEfficiency: Double = 18.5, // kWh/100km
    val electricityPrice: Double = 0.30, // £/kWh
    val isCazExempt: Boolean = false,
    val createdAt: LocalDateTime = LocalDateTime.now()
)

/**
 * Settings entity for user preferences.
 * Ported from voyagr_web.py app_settings table.
 */
@Entity(tableName = "settings")
data class AppSettings(
    @PrimaryKey
    val key: String,
    val value: String
)

/**
 * Route data class for API responses.
 * Represents a calculated route from routing engines.
 */
data class Route(
    val distance: Double, // meters
    val duration: Double, // seconds
    val geometry: String, // polyline encoded
    val steps: List<RouteStep> = emptyList(),
    val engine: String = "graphhopper" // graphhopper, valhalla, osrm
)

/**
 * Route step for turn-by-turn navigation.
 */
data class RouteStep(
    val index: Int = 0,
    val instruction: String = "",
    val distance: Double = 0.0, // km
    val duration: Double = 0.0, // seconds
    val name: String = "",
    val maneuver: String = "straight", // left, right, sharp_left, sharp_right, slight_left, slight_right, straight, u_turn
    val lat: Double = 0.0,
    val lon: Double = 0.0
)

/**
 * Cost breakdown for a route.
 */
data class RouteCost(
    val fuelCost: Double = 0.0,
    val tollCost: Double = 0.0,
    val cazCost: Double = 0.0,
    val totalCost: Double = 0.0
)


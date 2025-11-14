package com.voyagr.navigation.utils

import com.voyagr.navigation.data.models.RouteCost
import com.voyagr.navigation.data.models.Vehicle
import kotlin.math.abs

/**
 * Cost calculator for routes.
 * Ported from voyagr_web.py cost calculation logic.
 * 
 * Calculates:
 * - Fuel cost (petrol/diesel vehicles)
 * - Energy cost (electric vehicles)
 * - Toll costs (UK toll roads)
 * - CAZ (Clean Air Zone) costs
 */
object CostCalculator {
    
    // UK Toll Roads Database
    private val UK_TOLLS = mapOf(
        "M6 Toll" to 2.50,
        "Dartford Crossing" to 2.50,
        "Severn Crossing" to 6.70,
        "Humber Bridge" to 1.50,
        "Forth Road Bridge" to 3.00
    )
    
    // UK Clean Air Zones (CAZ)
    private val UK_CAZ_ZONES = mapOf(
        "Birmingham" to Pair(52.5086, -1.8845),
        "Leeds" to Pair(53.8008, -1.5491),
        "Southampton" to Pair(50.9097, -1.4044),
        "Bristol" to Pair(51.4545, -2.5879),
        "Oxford" to Pair(51.7520, -1.2577),
        "Derby" to Pair(52.9219, -1.4760),
        "Coventry" to Pair(52.4081, -1.5105),
        "Nottingham" to Pair(52.9548, -1.1581)
    )
    
    private const val CAZ_RADIUS_KM = 5.0
    private const val CAZ_CHARGE_PETROL = 10.0 // £
    private const val CAZ_CHARGE_DIESEL = 12.50 // £
    private const val CAZ_CHARGE_MOTORCYCLE = 0.0 // £ (exempt)
    private const val CAZ_CHARGE_ELECTRIC = 0.0 // £ (exempt)
    
    /**
     * Calculate total route cost.
     * 
     * @param distanceKm Route distance in kilometers
     * @param vehicle Vehicle profile
     * @param includeTolls Whether to include toll costs
     * @param includeCaz Whether to include CAZ costs
     * @param routeCoordinates Optional route coordinates for CAZ detection
     * @return RouteCost with breakdown
     */
    fun calculateRouteCost(
        distanceKm: Double,
        vehicle: Vehicle,
        includeTolls: Boolean = true,
        includeCaz: Boolean = true,
        routeCoordinates: List<Pair<Double, Double>> = emptyList()
    ): RouteCost {
        val fuelCost = calculateFuelCost(distanceKm, vehicle)
        val tollCost = if (includeTolls) calculateTollCost(vehicle, routeCoordinates) else 0.0
        val cazCost = if (includeCaz) calculateCazCost(vehicle, routeCoordinates) else 0.0
        
        return RouteCost(
            fuelCost = fuelCost,
            tollCost = tollCost,
            cazCost = cazCost,
            totalCost = fuelCost + tollCost + cazCost
        )
    }
    
    /**
     * Calculate fuel/energy cost for a route.
     * 
     * @param distanceKm Distance in kilometers
     * @param vehicle Vehicle profile
     * @return Cost in GBP
     */
    fun calculateFuelCost(distanceKm: Double, vehicle: Vehicle): Double {
        return when (vehicle.vehicleType) {
            "electric" -> {
                // Energy cost: distance / efficiency * price
                (distanceKm / vehicle.energyEfficiency) * vehicle.electricityPrice
            }
            "hybrid" -> {
                // Assume 50% electric, 50% fuel
                val electricCost = (distanceKm * 0.5 / vehicle.energyEfficiency) * vehicle.electricityPrice
                val fuelCost = (distanceKm * 0.5 / vehicle.fuelEfficiency) * vehicle.fuelPrice
                electricCost + fuelCost
            }
            else -> {
                // Fuel cost: distance / efficiency * price
                (distanceKm / vehicle.fuelEfficiency) * vehicle.fuelPrice
            }
        }
    }
    
    /**
     * Calculate toll cost for a route.
     * Checks if route passes through known UK toll roads.
     *
     * @param vehicle Vehicle profile
     * @param routeCoordinates Route coordinates to check for toll roads
     * @return Toll cost in GBP
     */
    fun calculateTollCost(
        vehicle: Vehicle,
        routeCoordinates: List<Pair<Double, Double>> = emptyList()
    ): Double {
        if (routeCoordinates.isEmpty()) return 0.0

        // Toll road locations (center coordinates and radius in km)
        val tollRoads = mapOf(
            "M6 Toll" to Triple(52.5086, -1.8845, 15.0),  // Birmingham area
            "Dartford Crossing" to Triple(51.4544, 0.1833, 10.0),  // London area
            "Severn Crossing" to Triple(51.8944, -2.6389, 15.0),  // Wales/England border
            "Humber Bridge" to Triple(53.7167, -0.4667, 10.0),  // Yorkshire
            "Forth Road Bridge" to Triple(55.9833, -3.3833, 10.0)  // Scotland
        )

        var totalToll = 0.0
        val tollsApplied = mutableSetOf<String>()

        // Check if route passes through any toll roads
        for ((tollName, tollData) in tollRoads) {
            val (tollLat, tollLon, tollRadius) = tollData

            for (coord in routeCoordinates) {
                val distance = calculateHaversineDistance(
                    coord.first, coord.second,
                    tollLat, tollLon
                )

                // If route passes within toll radius and we haven't already charged for this toll
                if (distance <= tollRadius && !tollsApplied.contains(tollName)) {
                    totalToll += UK_TOLLS[tollName] ?: 0.0
                    tollsApplied.add(tollName)
                    break
                }
            }
        }

        return totalToll
    }
    
    /**
     * Calculate CAZ (Clean Air Zone) charge.
     * 
     * @param vehicle Vehicle profile
     * @param routeCoordinates Route coordinates to check for CAZ zones
     * @return CAZ charge in GBP
     */
    fun calculateCazCost(
        vehicle: Vehicle,
        routeCoordinates: List<Pair<Double, Double>> = emptyList()
    ): Double {
        if (vehicle.isCazExempt) return 0.0
        
        // Check if route passes through CAZ zones
        var totalCazCost = 0.0
        val cazZonesHit = mutableSetOf<String>()
        
        for ((zoneName, zoneCenter) in UK_CAZ_ZONES) {
            for (coord in routeCoordinates) {
                val distance = calculateHaversineDistance(
                    coord.first, coord.second,
                    zoneCenter.first, zoneCenter.second
                )
                
                if (distance <= CAZ_RADIUS_KM && !cazZonesHit.contains(zoneName)) {
                    cazZonesHit.add(zoneName)
                    
                    val cazCharge = when (vehicle.vehicleType) {
                        "petrol_diesel" -> CAZ_CHARGE_PETROL
                        "diesel" -> CAZ_CHARGE_DIESEL
                        "motorcycle" -> CAZ_CHARGE_MOTORCYCLE
                        "electric" -> CAZ_CHARGE_ELECTRIC
                        else -> CAZ_CHARGE_PETROL
                    }
                    
                    totalCazCost += cazCharge
                    break
                }
            }
        }
        
        return totalCazCost
    }
    
    /**
     * Calculate Haversine distance between two coordinates.
     *
     * @param lat1 First latitude
     * @param lon1 First longitude
     * @param lat2 Second latitude
     * @param lon2 Second longitude
     * @return Distance in kilometers
     */
    private fun calculateHaversineDistance(
        lat1: Double,
        lon1: Double,
        lat2: Double,
        lon2: Double
    ): Double {
        val earthRadiusKm = 6371.0

        val dLat = Math.toRadians(lat2 - lat1)
        val dLon = Math.toRadians(lon2 - lon1)

        val a = kotlin.math.sin(dLat / 2) * kotlin.math.sin(dLat / 2) +
                kotlin.math.cos(Math.toRadians(lat1)) * kotlin.math.cos(Math.toRadians(lat2)) *
                kotlin.math.sin(dLon / 2) * kotlin.math.sin(dLon / 2)

        val c = 2 * kotlin.math.atan2(kotlin.math.sqrt(a), kotlin.math.sqrt(1 - a))

        return earthRadiusKm * c
    }

    /**
     * Get CAZ charge for a specific vehicle type.
     *
     * @param vehicleType Type of vehicle
     * @return CAZ charge in GBP
     */
    fun getCazCharge(vehicleType: String): Double {
        return when (vehicleType) {
            "petrol_diesel" -> CAZ_CHARGE_PETROL
            "diesel" -> CAZ_CHARGE_DIESEL
            "motorcycle" -> CAZ_CHARGE_MOTORCYCLE
            "electric" -> CAZ_CHARGE_ELECTRIC
            else -> CAZ_CHARGE_PETROL
        }
    }

    /**
     * Check if a vehicle is CAZ exempt.
     *
     * @param vehicleType Type of vehicle
     * @return True if vehicle is CAZ exempt
     */
    fun isCazExempt(vehicleType: String): Boolean {
        return vehicleType in listOf("motorcycle", "electric")
    }

    /**
     * Format cost as GBP string.
     *
     * @param cost Cost in GBP
     * @return Formatted string (e.g., "£12.50")
     */
    fun formatCost(cost: Double): String {
        return "£%.2f".format(cost)
    }
}


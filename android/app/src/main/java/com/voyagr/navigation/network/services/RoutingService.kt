package com.voyagr.navigation.network.services

import com.google.gson.JsonObject
import com.voyagr.navigation.data.models.Route
import com.voyagr.navigation.data.models.RouteStep
import com.voyagr.navigation.network.RetrofitClient
import timber.log.Timber

/**
 * Service for calculating routes using multiple routing engines.
 * Implements fallback chain: GraphHopper -> Valhalla -> OSRM
 * 
 * Ported from voyagr_web.py route calculation logic.
 */
class RoutingService {
    
    private val valhallaApi = RetrofitClient.createValhallaClient()
    private val graphHopperApi = RetrofitClient.createGraphHopperClient()
    private val osrmApi = RetrofitClient.createOsrmClient()
    
    /**
     * Calculate route with fallback chain.
     * Tries GraphHopper first, then Valhalla, then OSRM.
     * 
     * @param startLat Starting latitude
     * @param startLon Starting longitude
     * @param endLat Ending latitude
     * @param endLon Ending longitude
     * @param routingMode Routing mode (auto, pedestrian, bicycle)
     * @return Route object or null if all engines fail
     */
    suspend fun calculateRoute(
        startLat: Double,
        startLon: Double,
        endLat: Double,
        endLon: Double,
        routingMode: String = "auto"
    ): Route? {
        Timber.d("Calculating route from ($startLat,$startLon) to ($endLat,$endLon)")
        
        // Try GraphHopper first
        try {
            val route = calculateGraphHopperRoute(startLat, startLon, endLat, endLon, routingMode)
            if (route != null) {
                Timber.d("Route calculated successfully via GraphHopper")
                return route
            }
        } catch (e: Exception) {
            Timber.w("GraphHopper failed: ${e.message}")
        }
        
        // Fallback to Valhalla
        try {
            val route = calculateValhallaRoute(startLat, startLon, endLat, endLon, routingMode)
            if (route != null) {
                Timber.d("Route calculated successfully via Valhalla")
                return route
            }
        } catch (e: Exception) {
            Timber.w("Valhalla failed: ${e.message}")
        }
        
        // Final fallback to OSRM
        try {
            val route = calculateOsrmRoute(startLat, startLon, endLat, endLon, routingMode)
            if (route != null) {
                Timber.d("Route calculated successfully via OSRM")
                return route
            }
        } catch (e: Exception) {
            Timber.w("OSRM failed: ${e.message}")
        }
        
        Timber.e("All routing engines failed")
        return null
    }
    
    /**
     * Calculate route using GraphHopper.
     */
    private suspend fun calculateGraphHopperRoute(
        startLat: Double,
        startLon: Double,
        endLat: Double,
        endLon: Double,
        routingMode: String
    ): Route? {
        return try {
            val profile = when (routingMode) {
                "pedestrian" -> "foot"
                "bicycle" -> "bike"
                else -> "car"
            }
            
            val points = listOf("$startLat,$startLon", "$endLat,$endLon")
            val response = graphHopperApi.calculateGraphHopperRoute(
                points = points,
                profile = profile
            )
            
            if (response.isSuccessful && response.body() != null) {
                parseGraphHopperResponse(response.body()!!)
            } else {
                Timber.w("GraphHopper error: ${response.code()}")
                null
            }
        } catch (e: Exception) {
            Timber.e("GraphHopper exception: ${e.message}")
            null
        }
    }
    
    /**
     * Calculate route using Valhalla.
     */
    private suspend fun calculateValhallaRoute(
        startLat: Double,
        startLon: Double,
        endLat: Double,
        endLon: Double,
        routingMode: String
    ): Route? {
        return try {
            val costing = when (routingMode) {
                "pedestrian" -> "pedestrian"
                "bicycle" -> "bicycle"
                else -> "auto"
            }
            
            val body = JsonObject().apply {
                add("locations", JsonObject().apply {
                    add("0", JsonObject().apply {
                        addProperty("lat", startLat)
                        addProperty("lon", startLon)
                    })
                    add("1", JsonObject().apply {
                        addProperty("lat", endLat)
                        addProperty("lon", endLon)
                    })
                })
                addProperty("costing", costing)
                addProperty("format", "json")
            }
            
            val response = valhallaApi.calculateValhallaRoute(body)
            
            if (response.isSuccessful && response.body() != null) {
                parseValhallaResponse(response.body()!!)
            } else {
                Timber.w("Valhalla error: ${response.code()}")
                null
            }
        } catch (e: Exception) {
            Timber.e("Valhalla exception: ${e.message}")
            null
        }
    }
    
    /**
     * Calculate route using OSRM.
     */
    private suspend fun calculateOsrmRoute(
        startLat: Double,
        startLon: Double,
        endLat: Double,
        endLon: Double,
        routingMode: String
    ): Route? {
        return try {
            val profile = when (routingMode) {
                "pedestrian" -> "walking"
                "bicycle" -> "cycling"
                else -> "driving"
            }
            
            val coordinates = "$startLon,$startLat;$endLon,$endLat"
            val response = osrmApi.calculateOsrmRoute(profile, coordinates)
            
            if (response.isSuccessful && response.body() != null) {
                parseOsrmResponse(response.body()!!)
            } else {
                Timber.w("OSRM error: ${response.code()}")
                null
            }
        } catch (e: Exception) {
            Timber.e("OSRM exception: ${e.message}")
            null
        }
    }
    
    /**
     * Parse GraphHopper response into Route object.
     */
    private fun parseGraphHopperResponse(response: JsonObject): Route? {
        return try {
            if (!response.has("paths")) {
                Timber.w("GraphHopper response missing 'paths' field")
                return null
            }

            val paths = response.getAsJsonArray("paths")
            if (paths.size() == 0) {
                Timber.w("GraphHopper response has empty paths array")
                return null
            }

            val path = paths[0].asJsonObject

            // Distance is in meters, convert to km
            val distanceMeters = path.get("distance").asDouble
            val distanceKm = distanceMeters / 1000.0

            // Time is in milliseconds, convert to seconds
            val timeMs = path.get("time").asDouble
            val timeSeconds = timeMs / 1000.0

            val geometry = path.get("points").asString

            // Parse turn-by-turn instructions
            val steps = mutableListOf<RouteStep>()
            if (path.has("instructions")) {
                val instructions = path.getAsJsonArray("instructions")
                for ((index, instruction) in instructions.withIndex()) {
                    val instrObj = instruction.asJsonObject
                    val text = instrObj.get("text").asString
                    val distance = instrObj.get("distance").asDouble / 1000.0  // Convert to km
                    val time = instrObj.get("time").asDouble / 1000.0  // Convert to seconds

                    steps.add(
                        RouteStep(
                            index = index,
                            instruction = text,
                            distance = distance,
                            duration = time
                        )
                    )
                }
            }

            Route(
                distance = distanceKm,
                duration = timeSeconds,
                geometry = geometry,
                steps = steps,
                engine = "graphhopper"
            )
        } catch (e: Exception) {
            Timber.e("Error parsing GraphHopper response: ${e.message}")
            null
        }
    }
    
    /**
     * Parse Valhalla response into Route object.
     */
    private fun parseValhallaResponse(response: JsonObject): Route? {
        return try {
            if (!response.has("trip")) {
                Timber.w("Valhalla response missing 'trip' field")
                return null
            }

            val trips = response.getAsJsonArray("trip")
            if (trips.size() == 0) {
                Timber.w("Valhalla response has empty trip array")
                return null
            }

            val trip = trips[0].asJsonObject

            // Get summary data
            val summary = trip.getAsJsonObject("summary")
            val totalDistance = summary.get("length").asDouble  // Already in km
            val totalTime = summary.get("time").asDouble  // In seconds

            // Get geometry
            val geometry = trip.get("shape").asString

            // Parse turn-by-turn instructions
            val steps = mutableListOf<RouteStep>()
            if (trip.has("legs")) {
                val legs = trip.getAsJsonArray("legs")
                var stepIndex = 0

                for (leg in legs) {
                    val legObj = leg.asJsonObject
                    if (legObj.has("maneuvers")) {
                        val maneuvers = legObj.getAsJsonArray("maneuvers")
                        for (maneuver in maneuvers) {
                            val manObj = maneuver.asJsonObject
                            val instruction = manObj.get("instruction").asString
                            val distance = manObj.get("length").asDouble
                            val time = manObj.get("time").asDouble

                            steps.add(
                                RouteStep(
                                    index = stepIndex++,
                                    instruction = instruction,
                                    distance = distance,
                                    duration = time
                                )
                            )
                        }
                    }
                }
            }

            Route(
                distance = totalDistance,
                duration = totalTime,
                geometry = geometry,
                steps = steps,
                engine = "valhalla"
            )
        } catch (e: Exception) {
            Timber.e("Error parsing Valhalla response: ${e.message}")
            null
        }
    }
    
    /**
     * Parse OSRM response into Route object.
     */
    private fun parseOsrmResponse(response: JsonObject): Route? {
        return try {
            if (!response.has("routes")) {
                Timber.w("OSRM response missing 'routes' field")
                return null
            }

            val routes = response.getAsJsonArray("routes")
            if (routes.size() == 0) {
                Timber.w("OSRM response has empty routes array")
                return null
            }

            val route = routes[0].asJsonObject

            // Distance is in meters, convert to km
            val distanceMeters = route.get("distance").asDouble
            val distanceKm = distanceMeters / 1000.0

            // Duration is in seconds
            val durationSeconds = route.get("duration").asDouble

            val geometry = route.get("geometry").asString

            // Parse turn-by-turn instructions if available
            val steps = mutableListOf<RouteStep>()
            if (route.has("legs")) {
                val legs = route.getAsJsonArray("legs")
                var stepIndex = 0

                for (leg in legs) {
                    val legObj = leg.asJsonObject
                    if (legObj.has("steps")) {
                        val legSteps = legObj.getAsJsonArray("steps")
                        for (step in legSteps) {
                            val stepObj = step.asJsonObject
                            val instruction = stepObj.get("name").asString
                            val distance = stepObj.get("distance").asDouble / 1000.0  // Convert to km
                            val duration = stepObj.get("duration").asDouble  // Already in seconds

                            steps.add(
                                RouteStep(
                                    index = stepIndex++,
                                    instruction = instruction,
                                    distance = distance,
                                    duration = duration
                                )
                            )
                        }
                    }
                }
            }

            Route(
                distance = distanceKm,
                duration = durationSeconds,
                geometry = geometry,
                steps = steps,
                engine = "osrm"
            )
        } catch (e: Exception) {
            Timber.e("Error parsing OSRM response: ${e.message}")
            null
        }
    }
}


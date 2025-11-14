package com.voyagr.navigation.network.api

import com.google.gson.JsonObject
import retrofit2.Response
import retrofit2.http.*

/**
 * Retrofit API interface for routing engines.
 * Supports: Valhalla, GraphHopper, OSRM
 * 
 * Ported from voyagr_web.py routing engine integration.
 */
interface RoutingApi {
    
    // ============================================================================
    // VALHALLA ROUTING ENGINE (Primary)
    // ============================================================================
    
    /**
     * Calculate route using Valhalla routing engine.
     * Endpoint: POST /route
     * 
     * @param body Request body with locations, costing, and options
     * @return Route response with geometry and steps
     */
    @POST("/route")
    suspend fun calculateValhallaRoute(
        @Body body: JsonObject
    ): Response<JsonObject>
    
    /**
     * Get Valhalla server info/status.
     */
    @GET("/status")
    suspend fun getValhallaStatus(): Response<JsonObject>

    /**
     * Get Valhalla server version and capabilities.
     */
    @GET("/version")
    suspend fun getValhallaVersion(): Response<JsonObject>
    
    // ============================================================================
    // GRAPHHOPPER ROUTING ENGINE (Secondary)
    // ============================================================================
    
    /**
     * Calculate route using GraphHopper routing engine.
     * Endpoint: GET /route
     * 
     * @param points Route points as "lat,lon" pairs
     * @param profile Vehicle profile (car, bike, foot)
     * @param locale Language locale
     * @param chDisable Disable Contraction Hierarchies for alternative routes
     * @return Route response with geometry and steps
     */
    @GET("/route")
    suspend fun calculateGraphHopperRoute(
        @Query("point") points: List<String>,
        @Query("profile") profile: String = "car",
        @Query("locale") locale: String = "en",
        @Query("ch.disable") chDisable: String = "true"
    ): Response<JsonObject>
    
    /**
     * Get GraphHopper server info.
     */
    @GET("/info")
    suspend fun getGraphHopperInfo(): Response<JsonObject>

    /**
     * Geocode address to coordinates using GraphHopper.
     * Endpoint: GET /geocode
     *
     * @param query Address or place name to geocode
     * @param locale Language locale
     * @param limit Maximum number of results
     * @return Geocoding results with coordinates
     */
    @GET("/geocode")
    suspend fun geocodeAddress(
        @Query("q") query: String,
        @Query("locale") locale: String = "en",
        @Query("limit") limit: Int = 5
    ): Response<JsonObject>

    /**
     * Reverse geocode coordinates to address using GraphHopper.
     * Endpoint: GET /reverse
     *
     * @param lat Latitude
     * @param lon Longitude
     * @return Address information
     */
    @GET("/reverse")
    suspend fun reverseGeocode(
        @Query("lat") lat: Double,
        @Query("lon") lon: Double
    ): Response<JsonObject>
    
    // ============================================================================
    // OSRM ROUTING ENGINE (Fallback)
    // ============================================================================
    
    /**
     * Calculate route using OSRM routing engine.
     * Endpoint: GET /route/v1/{profile}/{coordinates}
     *
     * @param profile Routing profile (driving, walking, cycling)
     * @param coordinates Semicolon-separated coordinates "lon,lat;lon,lat"
     * @return Route response with geometry and steps
     */
    @GET("/route/v1/{profile}/{coordinates}")
    suspend fun calculateOsrmRoute(
        @Path("profile") profile: String,
        @Path("coordinates") coordinates: String,
        @Query("steps") steps: String = "true",
        @Query("geometries") geometries: String = "polyline",
        @Query("overview") overview: String = "full",
        @Query("alternatives") alternatives: String = "true"
    ): Response<JsonObject>

    /**
     * Calculate distance matrix using OSRM.
     * Endpoint: GET /table/v1/{profile}/{coordinates}
     *
     * @param profile Routing profile
     * @param coordinates Semicolon-separated coordinates
     * @return Distance and duration matrix
     */
    @GET("/table/v1/{profile}/{coordinates}")
    suspend fun calculateOsrmMatrix(
        @Path("profile") profile: String,
        @Path("coordinates") coordinates: String
    ): Response<JsonObject>

    /**
     * Match GPS trace to road network using OSRM.
     * Endpoint: GET /match/v1/{profile}/{coordinates}
     *
     * @param profile Routing profile
     * @param coordinates Semicolon-separated coordinates
     * @return Matched coordinates and route
     */
    @GET("/match/v1/{profile}/{coordinates}")
    suspend fun matchGpsTrace(
        @Path("profile") profile: String,
        @Path("coordinates") coordinates: String,
        @Query("geometries") geometries: String = "polyline"
    ): Response<JsonObject>
}


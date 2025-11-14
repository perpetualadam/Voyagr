package com.voyagr.navigation.network

import com.voyagr.navigation.network.api.RoutingApi
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import timber.log.Timber
import java.util.concurrent.TimeUnit

/**
 * Retrofit client factory for API calls.
 * Configures HTTP client with logging, timeouts, and interceptors.
 *
 * Ported from voyagr_web.py routing engine integration.
 */
object RetrofitClient {

    private const val VALHALLA_BASE_URL = "http://141.147.102.102:8002"
    private const val GRAPHHOPPER_BASE_URL = "http://81.0.246.97:8989"
    private const val OSRM_BASE_URL = "http://router.project-osrm.org"

    private const val CONNECT_TIMEOUT = 30L
    private const val READ_TIMEOUT = 30L
    private const val WRITE_TIMEOUT = 30L

    /**
     * Create OkHttpClient with logging, timeouts, and retry logic.
     */
    private fun createOkHttpClient(): OkHttpClient {
        val loggingInterceptor = HttpLoggingInterceptor { message ->
            Timber.d("HTTP: $message")
        }.apply {
            level = HttpLoggingInterceptor.Level.BODY
        }

        return OkHttpClient.Builder()
            .addInterceptor(loggingInterceptor)
            .connectTimeout(CONNECT_TIMEOUT, TimeUnit.SECONDS)
            .readTimeout(READ_TIMEOUT, TimeUnit.SECONDS)
            .writeTimeout(WRITE_TIMEOUT, TimeUnit.SECONDS)
            .retryOnConnectionFailure(true)
            .build()
    }
    
    /**
     * Create Retrofit instance for Valhalla routing engine.
     */
    fun createValhallaClient(): RoutingApi {
        return Retrofit.Builder()
            .baseUrl(VALHALLA_BASE_URL)
            .client(createOkHttpClient())
            .addConverterFactory(GsonConverterFactory.create())
            .build()
            .create(RoutingApi::class.java)
    }
    
    /**
     * Create Retrofit instance for GraphHopper routing engine.
     */
    fun createGraphHopperClient(): RoutingApi {
        return Retrofit.Builder()
            .baseUrl(GRAPHHOPPER_BASE_URL)
            .client(createOkHttpClient())
            .addConverterFactory(GsonConverterFactory.create())
            .build()
            .create(RoutingApi::class.java)
    }
    
    /**
     * Create Retrofit instance for OSRM routing engine.
     */
    fun createOsrmClient(): RoutingApi {
        return Retrofit.Builder()
            .baseUrl(OSRM_BASE_URL)
            .client(createOkHttpClient())
            .addConverterFactory(GsonConverterFactory.create())
            .build()
            .create(RoutingApi::class.java)
    }
}


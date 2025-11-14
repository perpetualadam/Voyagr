package com.voyagr.navigation.data.database

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.room.TypeConverters
import com.voyagr.navigation.data.models.AppSettings
import com.voyagr.navigation.data.models.Trip
import com.voyagr.navigation.data.models.Vehicle
import com.voyagr.navigation.data.models.CachedRoute
import com.voyagr.navigation.data.models.GeocodingCache
import com.voyagr.navigation.data.models.ReverseGeocodingCache
import com.voyagr.navigation.data.models.OfflineStats

/**
 * Room database for Voyagr navigation app.
 * Handles all local data persistence.
 *
 * Ported from voyagr_web.py SQLite database schema.
 *
 * Database Schema:
 * - trips: Trip history with cost breakdown
 * - vehicles: Vehicle profiles with efficiency ratings
 * - settings: App settings and user preferences
 *
 * Indexes:
 * - trips(timestamp): For efficient date range queries
 * - trips(routingMode): For filtering by routing mode
 * - vehicles(vehicleType): For filtering by vehicle type
 * - vehicles(isCazExempt): For CAZ-exempt vehicle queries
 */
@Database(
    entities = [
        Trip::class, Vehicle::class, AppSettings::class,
        CachedRoute::class, GeocodingCache::class, ReverseGeocodingCache::class, OfflineStats::class
    ],
    version = 1,
    exportSchema = true
)
@TypeConverters(Converters::class)
abstract class VoyagrDatabase : RoomDatabase() {

    abstract fun tripDao(): TripDao
    abstract fun vehicleDao(): VehicleDao
    abstract fun settingsDao(): SettingsDao
    abstract fun cachedRouteDao(): CachedRouteDao
    abstract fun geocodingCacheDao(): GeocodingCacheDao
    abstract fun reverseGeocodingCacheDao(): ReverseGeocodingCacheDao
    abstract fun offlineStatsDao(): OfflineStatsDao
    
    companion object {
        @Volatile
        private var INSTANCE: VoyagrDatabase? = null
        
        fun getDatabase(context: Context): VoyagrDatabase {
            return INSTANCE ?: synchronized(this) {
                val instance = Room.databaseBuilder(
                    context.applicationContext,
                    VoyagrDatabase::class.java,
                    "voyagr_database"
                )
                    .fallbackToDestructiveMigration()
                    .build()
                INSTANCE = instance
                instance
            }
        }
    }
}


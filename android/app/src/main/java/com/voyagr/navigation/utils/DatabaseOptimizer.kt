package com.voyagr.navigation.utils

import android.database.sqlite.SQLiteDatabase
import timber.log.Timber

/**
 * Database optimization utilities for Room database.
 * Handles query optimization, indexing, and maintenance.
 */
class DatabaseOptimizer {
    
    companion object {
        const val SLOW_QUERY_THRESHOLD_MS = 100L
    }
    
    /**
     * Enable Write-Ahead Logging (WAL) mode for better concurrency.
     * 
     * @param database SQLite database
     */
    fun enableWALMode(database: SQLiteDatabase) {
        try {
            database.enableWriteAheadLogging()
            Timber.d("WAL mode enabled")
        } catch (e: Exception) {
            Timber.e("Error enabling WAL mode: ${e.message}")
        }
    }
    
    /**
     * Optimize database by running ANALYZE.
     * 
     * @param database SQLite database
     */
    fun analyzeDatabase(database: SQLiteDatabase) {
        try {
            database.execSQL("ANALYZE")
            Timber.d("Database analyzed")
        } catch (e: Exception) {
            Timber.e("Error analyzing database: ${e.message}")
        }
    }
    
    /**
     * Vacuum database to reclaim space.
     * 
     * @param database SQLite database
     */
    fun vacuumDatabase(database: SQLiteDatabase) {
        try {
            database.execSQL("VACUUM")
            Timber.d("Database vacuumed")
        } catch (e: Exception) {
            Timber.e("Error vacuuming database: ${e.message}")
        }
    }
    
    /**
     * Create composite indexes for common queries.
     * 
     * @param database SQLite database
     */
    fun createCompositeIndexes(database: SQLiteDatabase) {
        try {
            // Index for trip queries by timestamp and routing mode
            database.execSQL(
                "CREATE INDEX IF NOT EXISTS idx_trips_timestamp_mode " +
                "ON trips(timestamp DESC, routingMode)"
            )
            
            // Index for cached routes by bounds
            database.execSQL(
                "CREATE INDEX IF NOT EXISTS idx_cached_routes_bounds " +
                "ON cached_routes(startLat, startLon, endLat, endLon)"
            )
            
            // Index for geocoding cache by address
            database.execSQL(
                "CREATE INDEX IF NOT EXISTS idx_geocoding_address " +
                "ON geocoding_cache(address, expiresAt)"
            )
            
            // Index for offline stats by timestamp
            database.execSQL(
                "CREATE INDEX IF NOT EXISTS idx_offline_stats_timestamp " +
                "ON offline_stats(timestamp DESC)"
            )
            
            Timber.d("Composite indexes created")
        } catch (e: Exception) {
            Timber.e("Error creating composite indexes: ${e.message}")
        }
    }
    
    /**
     * Create covering indexes for frequently accessed columns.
     * 
     * @param database SQLite database
     */
    fun createCoveringIndexes(database: SQLiteDatabase) {
        try {
            // Covering index for trip queries
            database.execSQL(
                "CREATE INDEX IF NOT EXISTS idx_trips_covering " +
                "ON trips(timestamp, routingMode, distance, duration)"
            )
            
            // Covering index for cached routes
            database.execSQL(
                "CREATE INDEX IF NOT EXISTS idx_cached_routes_covering " +
                "ON cached_routes(startLat, startLon, endLat, endLon, distanceKm, durationSeconds)"
            )
            
            Timber.d("Covering indexes created")
        } catch (e: Exception) {
            Timber.e("Error creating covering indexes: ${e.message}")
        }
    }
    
    /**
     * Get database statistics.
     * 
     * @param database SQLite database
     * @return Database size in bytes
     */
    fun getDatabaseSize(database: SQLiteDatabase): Long {
        return try {
            val cursor = database.rawQuery("SELECT page_count * page_size as size FROM pragma_page_count(), pragma_page_size()", null)
            cursor.use {
                if (it.moveToFirst()) {
                    it.getLong(0)
                } else {
                    0L
                }
            }
        } catch (e: Exception) {
            Timber.e("Error getting database size: ${e.message}")
            0L
        }
    }
    
    /**
     * Get table statistics.
     * 
     * @param database SQLite database
     * @param tableName Table name
     * @return Row count
     */
    fun getTableRowCount(database: SQLiteDatabase, tableName: String): Long {
        return try {
            val cursor = database.rawQuery("SELECT COUNT(*) FROM $tableName", null)
            cursor.use {
                if (it.moveToFirst()) {
                    it.getLong(0)
                } else {
                    0L
                }
            }
        } catch (e: Exception) {
            Timber.e("Error getting row count for $tableName: ${e.message}")
            0L
        }
    }
    
    /**
     * Log slow queries (queries taking > 100ms).
     * 
     * @param queryName Query name
     * @param executionTimeMs Execution time in milliseconds
     */
    fun logSlowQuery(queryName: String, executionTimeMs: Long) {
        if (executionTimeMs > SLOW_QUERY_THRESHOLD_MS) {
            Timber.w("Slow query detected: $queryName took ${executionTimeMs}ms")
        }
    }
    
    /**
     * Optimize database on app startup.
     * 
     * @param database SQLite database
     */
    fun optimizeOnStartup(database: SQLiteDatabase) {
        try {
            Timber.d("Starting database optimization...")
            enableWALMode(database)
            createCompositeIndexes(database)
            createCoveringIndexes(database)
            analyzeDatabase(database)
            
            val dbSize = getDatabaseSize(database)
            Timber.d("Database optimization complete. Size: ${dbSize / 1024} KB")
        } catch (e: Exception) {
            Timber.e("Error during database optimization: ${e.message}")
        }
    }
    
    /**
     * Perform database maintenance.
     * 
     * @param database SQLite database
     */
    fun performMaintenance(database: SQLiteDatabase) {
        try {
            Timber.d("Starting database maintenance...")
            analyzeDatabase(database)
            vacuumDatabase(database)
            Timber.d("Database maintenance complete")
        } catch (e: Exception) {
            Timber.e("Error during database maintenance: ${e.message}")
        }
    }
}


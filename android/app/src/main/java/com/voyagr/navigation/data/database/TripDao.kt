package com.voyagr.navigation.data.database

import androidx.room.*
import com.voyagr.navigation.data.models.Trip
import kotlinx.coroutines.flow.Flow

/**
 * Data Access Object for Trip entity.
 * Handles all database operations for trip history.
 */
@Dao
interface TripDao {
    
    /**
     * Insert a new trip into the database.
     */
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertTrip(trip: Trip): Long
    
    /**
     * Get all trips ordered by timestamp (newest first).
     */
    @Query("SELECT * FROM trips ORDER BY timestamp DESC")
    fun getAllTrips(): Flow<List<Trip>>
    
    /**
     * Get a specific trip by ID.
     */
    @Query("SELECT * FROM trips WHERE id = :tripId")
    suspend fun getTripById(tripId: Long): Trip?
    
    /**
     * Get trips within a date range.
     */
    @Query("""
        SELECT * FROM trips 
        WHERE timestamp >= :startDate AND timestamp <= :endDate
        ORDER BY timestamp DESC
    """)
    fun getTripsByDateRange(startDate: String, endDate: String): Flow<List<Trip>>
    
    /**
     * Get trips by routing mode (auto, pedestrian, bicycle).
     */
    @Query("SELECT * FROM trips WHERE routingMode = :mode ORDER BY timestamp DESC")
    fun getTripsByMode(mode: String): Flow<List<Trip>>
    
    /**
     * Get total distance traveled.
     */
    @Query("SELECT COALESCE(SUM(distanceKm), 0) FROM trips")
    suspend fun getTotalDistance(): Double
    
    /**
     * Get total cost (fuel + toll + CAZ).
     */
    @Query("SELECT COALESCE(SUM(fuelCost + tollCost + cazCost), 0) FROM trips")
    suspend fun getTotalCost(): Double
    
    /**
     * Delete a trip by ID.
     */
    @Query("DELETE FROM trips WHERE id = :tripId")
    suspend fun deleteTrip(tripId: Long)
    
    /**
     * Delete all trips.
     */
    @Query("DELETE FROM trips")
    suspend fun deleteAllTrips()
    
    /**
     * Get trip count.
     */
    @Query("SELECT COUNT(*) FROM trips")
    suspend fun getTripCount(): Int
}


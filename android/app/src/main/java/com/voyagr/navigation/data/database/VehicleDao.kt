package com.voyagr.navigation.data.database

import androidx.room.*
import com.voyagr.navigation.data.models.Vehicle
import kotlinx.coroutines.flow.Flow

/**
 * Data Access Object for Vehicle entity.
 * Handles all database operations for vehicle profiles.
 */
@Dao
interface VehicleDao {
    
    /**
     * Insert a new vehicle profile.
     */
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertVehicle(vehicle: Vehicle): Long
    
    /**
     * Update an existing vehicle profile.
     */
    @Update
    suspend fun updateVehicle(vehicle: Vehicle)
    
    /**
     * Get all vehicles.
     */
    @Query("SELECT * FROM vehicles ORDER BY createdAt DESC")
    fun getAllVehicles(): Flow<List<Vehicle>>
    
    /**
     * Get a specific vehicle by ID.
     */
    @Query("SELECT * FROM vehicles WHERE id = :vehicleId")
    suspend fun getVehicleById(vehicleId: Long): Vehicle?
    
    /**
     * Get vehicles by type.
     */
    @Query("SELECT * FROM vehicles WHERE vehicleType = :type")
    fun getVehiclesByType(type: String): Flow<List<Vehicle>>
    
    /**
     * Get CAZ-exempt vehicles.
     */
    @Query("SELECT * FROM vehicles WHERE isCazExempt = 1")
    fun getCazExemptVehicles(): Flow<List<Vehicle>>
    
    /**
     * Delete a vehicle by ID.
     */
    @Query("DELETE FROM vehicles WHERE id = :vehicleId")
    suspend fun deleteVehicle(vehicleId: Long)
    
    /**
     * Get vehicle count.
     */
    @Query("SELECT COUNT(*) FROM vehicles")
    suspend fun getVehicleCount(): Int
}


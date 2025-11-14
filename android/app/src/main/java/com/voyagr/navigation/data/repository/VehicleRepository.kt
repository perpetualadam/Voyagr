package com.voyagr.navigation.data.repository

import com.voyagr.navigation.data.database.VehicleDao
import com.voyagr.navigation.data.models.Vehicle
import kotlinx.coroutines.flow.Flow
import javax.inject.Inject

/**
 * Repository for Vehicle data access.
 * Implements repository pattern for clean data layer.
 */
class VehicleRepository @Inject constructor(
    private val vehicleDao: VehicleDao
) {
    
    /**
     * Insert a new vehicle.
     */
    suspend fun insertVehicle(vehicle: Vehicle): Long {
        return vehicleDao.insertVehicle(vehicle)
    }
    
    /**
     * Update an existing vehicle.
     */
    suspend fun updateVehicle(vehicle: Vehicle) {
        vehicleDao.updateVehicle(vehicle)
    }
    
    /**
     * Get all vehicles.
     */
    fun getAllVehicles(): Flow<List<Vehicle>> {
        return vehicleDao.getAllVehicles()
    }
    
    /**
     * Get a specific vehicle by ID.
     */
    suspend fun getVehicleById(vehicleId: Long): Vehicle? {
        return vehicleDao.getVehicleById(vehicleId)
    }
    
    /**
     * Get vehicles by type.
     */
    fun getVehiclesByType(type: String): Flow<List<Vehicle>> {
        return vehicleDao.getVehiclesByType(type)
    }
    
    /**
     * Get CAZ-exempt vehicles.
     */
    fun getCazExemptVehicles(): Flow<List<Vehicle>> {
        return vehicleDao.getCazExemptVehicles()
    }
    
    /**
     * Delete a vehicle.
     */
    suspend fun deleteVehicle(vehicleId: Long) {
        vehicleDao.deleteVehicle(vehicleId)
    }
    
    /**
     * Get vehicle count.
     */
    suspend fun getVehicleCount(): Int {
        return vehicleDao.getVehicleCount()
    }
}


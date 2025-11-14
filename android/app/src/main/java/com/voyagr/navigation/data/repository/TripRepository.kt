package com.voyagr.navigation.data.repository

import com.voyagr.navigation.data.database.TripDao
import com.voyagr.navigation.data.models.Trip
import kotlinx.coroutines.flow.Flow
import javax.inject.Inject

/**
 * Repository for Trip data access.
 * Implements repository pattern for clean data layer.
 */
class TripRepository @Inject constructor(
    private val tripDao: TripDao
) {
    
    /**
     * Insert a new trip.
     */
    suspend fun insertTrip(trip: Trip): Long {
        return tripDao.insertTrip(trip)
    }
    
    /**
     * Get all trips.
     */
    fun getAllTrips(): Flow<List<Trip>> {
        return tripDao.getAllTrips()
    }
    
    /**
     * Get a specific trip by ID.
     */
    suspend fun getTripById(tripId: Long): Trip? {
        return tripDao.getTripById(tripId)
    }
    
    /**
     * Get trips by date range.
     */
    fun getTripsByDateRange(startDate: String, endDate: String): Flow<List<Trip>> {
        return tripDao.getTripsByDateRange(startDate, endDate)
    }
    
    /**
     * Get trips by routing mode.
     */
    fun getTripsByMode(mode: String): Flow<List<Trip>> {
        return tripDao.getTripsByMode(mode)
    }
    
    /**
     * Get total distance traveled.
     */
    suspend fun getTotalDistance(): Double {
        return tripDao.getTotalDistance()
    }
    
    /**
     * Get total cost.
     */
    suspend fun getTotalCost(): Double {
        return tripDao.getTotalCost()
    }
    
    /**
     * Delete a trip.
     */
    suspend fun deleteTrip(tripId: Long) {
        tripDao.deleteTrip(tripId)
    }
    
    /**
     * Delete all trips.
     */
    suspend fun deleteAllTrips() {
        tripDao.deleteAllTrips()
    }
    
    /**
     * Get trip count.
     */
    suspend fun getTripCount(): Int {
        return tripDao.getTripCount()
    }
}


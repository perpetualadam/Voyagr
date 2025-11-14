package com.voyagr.navigation.data.database

import android.content.Context
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.voyagr.navigation.data.models.AppSettings
import com.voyagr.navigation.data.models.Trip
import com.voyagr.navigation.data.models.Vehicle
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import java.time.LocalDateTime

/**
 * Integration tests for Room database operations.
 * Tests CRUD operations for all entities.
 */
@RunWith(AndroidJUnit4::class)
class VoyagrDatabaseTest {
    
    private lateinit var database: VoyagrDatabase
    private lateinit var tripDao: TripDao
    private lateinit var vehicleDao: VehicleDao
    private lateinit var settingsDao: SettingsDao
    
    @Before
    fun setUp() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        database = Room.inMemoryDatabaseBuilder(context, VoyagrDatabase::class.java)
            .allowMainThreadQueries()
            .build()
        
        tripDao = database.tripDao()
        vehicleDao = database.vehicleDao()
        settingsDao = database.settingsDao()
    }
    
    @After
    fun tearDown() {
        database.close()
    }
    
    @Test
    fun testInsertAndRetrieveVehicle() = runBlocking {
        val vehicle = Vehicle(
            id = 1,
            name = "Test Car",
            vehicleType = "petrol_diesel",
            fuelEfficiency = 6.5,
            fuelPrice = 1.40,
            energyEfficiency = 0.0,
            electricityPrice = 0.0,
            isCazExempt = false
        )
        
        vehicleDao.insertVehicle(vehicle)
        val retrieved = vehicleDao.getVehicleById(1)
        
        assertNotNull(retrieved)
        assertEquals("Test Car", retrieved?.name)
        assertEquals("petrol_diesel", retrieved?.vehicleType)
    }
    
    @Test
    fun testGetAllVehicles() = runBlocking {
        val vehicle1 = Vehicle(
            id = 1,
            name = "Car 1",
            vehicleType = "petrol_diesel",
            fuelEfficiency = 6.5,
            fuelPrice = 1.40,
            energyEfficiency = 0.0,
            electricityPrice = 0.0,
            isCazExempt = false
        )
        
        val vehicle2 = Vehicle(
            id = 2,
            name = "Car 2",
            vehicleType = "electric",
            fuelEfficiency = 0.0,
            fuelPrice = 0.0,
            energyEfficiency = 18.5,
            electricityPrice = 0.30,
            isCazExempt = true
        )
        
        vehicleDao.insertVehicle(vehicle1)
        vehicleDao.insertVehicle(vehicle2)
        
        val vehicles = vehicleDao.getAllVehicles().first()
        assertEquals(2, vehicles.size)
    }
    
    @Test
    fun testInsertAndRetrieveTrip() = runBlocking {
        val trip = Trip(
            id = 1,
            startLocation = "London",
            endLocation = "Manchester",
            distanceKm = 200.0,
            durationSeconds = 7200.0,
            fuelCost = 30.0,
            tollCost = 5.0,
            cazCost = 10.0,
            routingMode = "auto",
            timestamp = LocalDateTime.now().toString()
        )
        
        tripDao.insertTrip(trip)
        val retrieved = tripDao.getTripById(1)
        
        assertNotNull(retrieved)
        assertEquals("London", retrieved?.startLocation)
        assertEquals("Manchester", retrieved?.endLocation)
        assertEquals(200.0, retrieved?.distanceKm, 0.0)
    }
    
    @Test
    fun testGetTotalDistance() = runBlocking {
        val trip1 = Trip(
            id = 1,
            startLocation = "A",
            endLocation = "B",
            distanceKm = 100.0,
            durationSeconds = 3600.0,
            fuelCost = 15.0,
            tollCost = 0.0,
            cazCost = 0.0,
            routingMode = "auto",
            timestamp = LocalDateTime.now().toString()
        )
        
        val trip2 = Trip(
            id = 2,
            startLocation = "C",
            endLocation = "D",
            distanceKm = 150.0,
            durationSeconds = 5400.0,
            fuelCost = 22.5,
            tollCost = 0.0,
            cazCost = 0.0,
            routingMode = "auto",
            timestamp = LocalDateTime.now().toString()
        )
        
        tripDao.insertTrip(trip1)
        tripDao.insertTrip(trip2)
        
        val totalDistance = tripDao.getTotalDistance()
        assertEquals(250.0, totalDistance, 0.0)
    }
    
    @Test
    fun testGetTotalCost() = runBlocking {
        val trip1 = Trip(
            id = 1,
            startLocation = "A",
            endLocation = "B",
            distanceKm = 100.0,
            durationSeconds = 3600.0,
            fuelCost = 15.0,
            tollCost = 2.5,
            cazCost = 5.0,
            routingMode = "auto",
            timestamp = LocalDateTime.now().toString()
        )
        
        val trip2 = Trip(
            id = 2,
            startLocation = "C",
            endLocation = "D",
            distanceKm = 150.0,
            durationSeconds = 5400.0,
            fuelCost = 22.5,
            tollCost = 5.0,
            cazCost = 10.0,
            routingMode = "auto",
            timestamp = LocalDateTime.now().toString()
        )
        
        tripDao.insertTrip(trip1)
        tripDao.insertTrip(trip2)
        
        val totalCost = tripDao.getTotalCost()
        assertEquals(60.0, totalCost, 0.0)  // (15+2.5+5) + (22.5+5+10)
    }
    
    @Test
    fun testInsertAndRetrieveSetting() = runBlocking {
        val setting = AppSettings(
            key = "units",
            value = "metric"
        )
        
        settingsDao.insertSetting(setting)
        val retrieved = settingsDao.getSetting("units")
        
        assertNotNull(retrieved)
        assertEquals("metric", retrieved?.value)
    }
    
    @Test
    fun testDeleteTrip() = runBlocking {
        val trip = Trip(
            id = 1,
            startLocation = "A",
            endLocation = "B",
            distanceKm = 100.0,
            durationSeconds = 3600.0,
            fuelCost = 15.0,
            tollCost = 0.0,
            cazCost = 0.0,
            routingMode = "auto",
            timestamp = LocalDateTime.now().toString()
        )
        
        tripDao.insertTrip(trip)
        tripDao.deleteTrip(1)
        
        val retrieved = tripDao.getTripById(1)
        assertNull(retrieved)
    }
    
    @Test
    fun testGetTripCount() = runBlocking {
        val trip1 = Trip(
            id = 1,
            startLocation = "A",
            endLocation = "B",
            distanceKm = 100.0,
            durationSeconds = 3600.0,
            fuelCost = 15.0,
            tollCost = 0.0,
            cazCost = 0.0,
            routingMode = "auto",
            timestamp = LocalDateTime.now().toString()
        )
        
        val trip2 = Trip(
            id = 2,
            startLocation = "C",
            endLocation = "D",
            distanceKm = 150.0,
            durationSeconds = 5400.0,
            fuelCost = 22.5,
            tollCost = 0.0,
            cazCost = 0.0,
            routingMode = "auto",
            timestamp = LocalDateTime.now().toString()
        )
        
        tripDao.insertTrip(trip1)
        tripDao.insertTrip(trip2)
        
        val count = tripDao.getTripCount()
        assertEquals(2, count)
    }
}


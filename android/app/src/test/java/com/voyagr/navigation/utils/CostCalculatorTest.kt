package com.voyagr.navigation.utils

import com.voyagr.navigation.data.models.Vehicle
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test

/**
 * Unit tests for CostCalculator.
 * Tests fuel cost, toll cost, and CAZ cost calculations.
 */
class CostCalculatorTest {
    
    private lateinit var petrolVehicle: Vehicle
    private lateinit var electricVehicle: Vehicle
    private lateinit var hybridVehicle: Vehicle
    
    @Before
    fun setUp() {
        // Create test vehicles
        petrolVehicle = Vehicle(
            id = 1,
            name = "Test Petrol Car",
            vehicleType = "petrol_diesel",
            fuelEfficiency = 6.5,  // L/100km
            fuelPrice = 1.40,  // £/L
            energyEfficiency = 0.0,
            electricityPrice = 0.0,
            isCazExempt = false
        )
        
        electricVehicle = Vehicle(
            id = 2,
            name = "Test Electric Car",
            vehicleType = "electric",
            fuelEfficiency = 0.0,
            fuelPrice = 0.0,
            energyEfficiency = 18.5,  // kWh/100km
            electricityPrice = 0.30,  // £/kWh
            isCazExempt = true
        )
        
        hybridVehicle = Vehicle(
            id = 3,
            name = "Test Hybrid Car",
            vehicleType = "hybrid",
            fuelEfficiency = 6.5,
            fuelPrice = 1.40,
            energyEfficiency = 18.5,
            electricityPrice = 0.30,
            isCazExempt = false
        )
    }
    
    @Test
    fun testFuelCostCalculation_Petrol() {
        // 100 km route with petrol car
        val cost = CostCalculator.calculateFuelCost(100.0, petrolVehicle)
        
        // Expected: (100 / 6.5) * 1.40 = 21.54
        assertEquals(21.54, cost, 0.01)
    }
    
    @Test
    fun testFuelCostCalculation_Electric() {
        // 100 km route with electric car
        val cost = CostCalculator.calculateFuelCost(100.0, electricVehicle)
        
        // Expected: (100 / 18.5) * 0.30 = 1.62
        assertEquals(1.62, cost, 0.01)
    }
    
    @Test
    fun testFuelCostCalculation_Hybrid() {
        // 100 km route with hybrid car (50% electric, 50% fuel)
        val cost = CostCalculator.calculateFuelCost(100.0, hybridVehicle)
        
        // Expected: (50 / 6.5) * 1.40 + (50 / 18.5) * 0.30 = 10.77 + 0.81 = 11.58
        assertEquals(11.58, cost, 0.01)
    }
    
    @Test
    fun testCazCostCalculation_Exempt() {
        // Electric vehicle should have 0 CAZ cost
        val cost = CostCalculator.calculateCazCost(electricVehicle)
        assertEquals(0.0, cost, 0.0)
    }
    
    @Test
    fun testCazCostCalculation_NonExempt() {
        // Petrol vehicle with no route coordinates should have 0 CAZ cost
        val cost = CostCalculator.calculateCazCost(petrolVehicle)
        assertEquals(0.0, cost, 0.0)
    }
    
    @Test
    fun testCazCostCalculation_WithCoordinates() {
        // Route through Birmingham CAZ zone
        val birminghamCoords = listOf(
            Pair(52.5086, -1.8845),  // Birmingham center
            Pair(52.5100, -1.8850)   // Nearby point
        )
        
        val cost = CostCalculator.calculateCazCost(petrolVehicle, birminghamCoords)
        
        // Should charge CAZ for Birmingham
        assertTrue(cost > 0.0)
    }
    
    @Test
    fun testTollCostCalculation_NoCoordinates() {
        // No coordinates should result in 0 toll cost
        val cost = CostCalculator.calculateTollCost(petrolVehicle)
        assertEquals(0.0, cost, 0.0)
    }
    
    @Test
    fun testTollCostCalculation_WithCoordinates() {
        // Route through M6 Toll area (Birmingham)
        val m6TollCoords = listOf(
            Pair(52.5086, -1.8845),  // M6 Toll center
            Pair(52.5100, -1.8850)   // Nearby point
        )
        
        val cost = CostCalculator.calculateTollCost(petrolVehicle, m6TollCoords)
        
        // Should charge M6 Toll (£2.50)
        assertEquals(2.50, cost, 0.01)
    }
    
    @Test
    fun testRouteCostCalculation() {
        // 100 km route with petrol car
        val cost = CostCalculator.calculateRouteCost(
            distanceKm = 100.0,
            vehicle = petrolVehicle,
            includeTolls = false,
            includeCaz = false
        )
        
        // Should only include fuel cost
        assertEquals(21.54, cost.fuelCost, 0.01)
        assertEquals(0.0, cost.tollCost, 0.0)
        assertEquals(0.0, cost.cazCost, 0.0)
        assertEquals(21.54, cost.totalCost, 0.01)
    }
    
    @Test
    fun testCazChargeForVehicleType() {
        assertEquals(10.0, CostCalculator.getCazCharge("petrol_diesel"), 0.0)
        assertEquals(12.50, CostCalculator.getCazCharge("diesel"), 0.0)
        assertEquals(0.0, CostCalculator.getCazCharge("motorcycle"), 0.0)
        assertEquals(0.0, CostCalculator.getCazCharge("electric"), 0.0)
    }
    
    @Test
    fun testCazExemption() {
        assertTrue(CostCalculator.isCazExempt("motorcycle"))
        assertTrue(CostCalculator.isCazExempt("electric"))
        assertFalse(CostCalculator.isCazExempt("petrol_diesel"))
        assertFalse(CostCalculator.isCazExempt("diesel"))
    }
    
    @Test
    fun testCostFormatting() {
        assertEquals("£12.50", CostCalculator.formatCost(12.50))
        assertEquals("£0.00", CostCalculator.formatCost(0.0))
        assertEquals("£100.99", CostCalculator.formatCost(100.99))
    }
    
    @Test
    fun testZeroDistance() {
        val cost = CostCalculator.calculateFuelCost(0.0, petrolVehicle)
        assertEquals(0.0, cost, 0.0)
    }
    
    @Test
    fun testLargeDistance() {
        // 1000 km route
        val cost = CostCalculator.calculateFuelCost(1000.0, petrolVehicle)
        
        // Expected: (1000 / 6.5) * 1.40 = 215.38
        assertEquals(215.38, cost, 0.01)
    }
}


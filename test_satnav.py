"""
Unit tests for Voyagr SatNav application.
Tests toll costs, EV calculations, GBP pricing, and error handling.
"""

import unittest
import sqlite3
import os
import time
from satnav import SatNavApp
from hazard_parser import HazardParser


class TestSatNavApp(unittest.TestCase):
    """Test SatNavApp functionality."""
    
    def setUp(self):
        """Set up test fixtures."""
        self.app = SatNavApp()
        self.test_db = 'test_satnav.db'
    
    def tearDown(self):
        """Clean up after tests."""
        if os.path.exists(self.test_db):
            os.remove(self.test_db)
    
    # Unit Conversion Tests
    def test_to_miles(self):
        """Test km to miles conversion."""
        self.assertAlmostEqual(self.app.to_miles(1), 0.621371, places=5)
        self.assertAlmostEqual(self.app.to_miles(100), 62.1371, places=4)
    
    def test_to_km(self):
        """Test miles to km conversion."""
        self.assertAlmostEqual(self.app.to_km(1), 1.60934, places=5)
        self.assertAlmostEqual(self.app.to_km(62.1371), 100, places=4)
    
    def test_to_fahrenheit(self):
        """Test Celsius to Fahrenheit conversion."""
        self.assertAlmostEqual(self.app.to_fahrenheit(0), 32, places=1)
        self.assertAlmostEqual(self.app.to_fahrenheit(100), 212, places=1)
    
    def test_to_celsius(self):
        """Test Fahrenheit to Celsius conversion."""
        self.assertAlmostEqual(self.app.to_celsius(32), 0, places=1)
        self.assertAlmostEqual(self.app.to_celsius(212), 100, places=1)
    
    def test_to_mpg(self):
        """Test L/100km to mpg conversion."""
        self.assertAlmostEqual(self.app.to_mpg(6.5), 36.18, places=2)
        self.assertAlmostEqual(self.app.to_mpg(10), 23.52, places=2)
    
    def test_to_l_per_100km(self):
        """Test mpg to L/100km conversion."""
        self.assertAlmostEqual(self.app.to_l_per_100km(36.18), 6.5, places=2)
        self.assertAlmostEqual(self.app.to_l_per_100km(43.5), 5.41, places=2)
    
    def test_to_miles_per_kwh(self):
        """Test kWh/100km to miles/kWh conversion."""
        self.assertAlmostEqual(self.app.to_miles_per_kwh(18.5), 3.36, places=2)
        self.assertAlmostEqual(self.app.to_miles_per_kwh(20), 3.11, places=2)
    
    def test_to_kwh_per_100km(self):
        """Test miles/kWh to kWh/100km conversion."""
        self.assertAlmostEqual(self.app.to_kwh_per_100km(3.36), 18.5, places=2)
        self.assertAlmostEqual(self.app.to_kwh_per_100km(3.11), 20, places=2)
    
    # Fuel Calculation Tests
    def test_calculate_fuel_l_per_100km(self):
        """Test fuel calculation in L/100km."""
        self.app.fuel_unit = 'l_per_100km'
        fuel = self.app.calculate_fuel(100, 6.5, 'l_per_100km')
        self.assertAlmostEqual(fuel, 6.5, places=2)
    
    def test_calculate_fuel_mpg(self):
        """Test fuel calculation in mpg."""
        self.app.fuel_unit = 'mpg'
        fuel = self.app.calculate_fuel(100, 43.5, 'mpg')
        self.assertGreater(fuel, 0)
    
    # Energy Calculation Tests
    def test_calculate_energy_kwh_per_100km(self):
        """Test energy calculation in kWh/100km."""
        self.app.fuel_unit = 'kwh_per_100km'
        energy = self.app.calculate_energy(100, 18.5, 'kwh_per_100km')
        self.assertAlmostEqual(energy, 18.5, places=2)
    
    def test_calculate_energy_miles_per_kwh(self):
        """Test energy calculation in miles/kWh."""
        self.app.fuel_unit = 'miles_per_kwh'
        energy = self.app.calculate_energy(100, 3.36, 'miles_per_kwh')
        self.assertGreater(energy, 0)
    
    # Cost Calculation Tests
    def test_calculate_cost_petrol(self):
        """Test fuel cost calculation for petrol."""
        self.app.vehicle_type = 'petrol_diesel'
        self.app.fuel_efficiency = 6.5
        self.app.fuel_price_gbp = 1.40
        self.app.fuel_unit = 'l_per_100km'
        cost = self.app.calculate_cost(100)
        self.assertAlmostEqual(cost, 9.1, places=1)  # 6.5L * £1.40
    
    def test_calculate_cost_electric(self):
        """Test energy cost calculation for EV."""
        self.app.vehicle_type = 'electric'
        self.app.energy_efficiency = 18.5
        self.app.electricity_price_gbp = 0.30
        self.app.fuel_unit = 'kwh_per_100km'
        cost = self.app.calculate_cost(100)
        self.assertAlmostEqual(cost, 5.55, places=2)  # 18.5kWh * £0.30
    
    # Toll Cost Tests
    def test_calculate_toll_cost_no_route(self):
        """Test toll cost with no route."""
        self.app.current_route = None
        toll_cost = self.app.calculate_toll_cost()
        self.assertEqual(toll_cost, 0)
    
    def test_calculate_toll_cost_tolls_disabled(self):
        """Test toll cost when tolls disabled."""
        self.app.include_tolls = False
        self.app.current_route = {'segments': []}
        toll_cost = self.app.calculate_toll_cost()
        self.assertEqual(toll_cost, 0)
    
    # Formatting Tests
    def test_format_distance_km(self):
        """Test distance formatting in km."""
        self.app.distance_unit = 'km'
        formatted = self.app.format_distance(1000)
        self.assertIn('1.00 km', formatted)
    
    def test_format_distance_miles(self):
        """Test distance formatting in miles."""
        self.app.distance_unit = 'mi'
        formatted = self.app.format_distance(1609)
        self.assertIn('miles', formatted)
    
    def test_format_temperature_celsius(self):
        """Test temperature formatting in Celsius."""
        self.app.temperature_unit = 'C'
        formatted = self.app.format_temperature(20)
        self.assertIn('20.0°C', formatted)
    
    def test_format_temperature_fahrenheit(self):
        """Test temperature formatting in Fahrenheit."""
        self.app.temperature_unit = 'F'
        formatted = self.app.format_temperature(20)
        self.assertIn('°F', formatted)
    
    def test_format_fuel(self):
        """Test fuel formatting."""
        formatted = self.app.format_fuel(5.5)
        self.assertIn('5.50 litres', formatted)
    
    def test_format_energy(self):
        """Test energy formatting."""
        formatted = self.app.format_energy(18.5)
        self.assertIn('18.50 kWh', formatted)
    
    # Settings Tests
    def test_save_and_load_settings(self):
        """Test saving and loading settings."""
        self.app.distance_unit = 'mi'
        self.app.temperature_unit = 'F'
        self.app.vehicle_type = 'electric'
        self.app.fuel_efficiency = 25
        self.app.save_settings()
        
        # Create new app instance and load settings
        app2 = SatNavApp()
        self.assertEqual(app2.distance_unit, 'mi')
        self.assertEqual(app2.temperature_unit, 'F')
        self.assertEqual(app2.vehicle_type, 'electric')
    
    # Vehicle Type Tests
    def test_set_vehicle_type_petrol(self):
        """Test setting vehicle type to petrol."""
        self.app.set_vehicle_type('petrol_diesel')
        self.assertEqual(self.app.vehicle_type, 'petrol_diesel')
        self.assertEqual(self.app.fuel_unit, 'l_per_100km')
    
    def test_set_vehicle_type_electric(self):
        """Test setting vehicle type to electric."""
        self.app.set_vehicle_type('electric')
        self.assertEqual(self.app.vehicle_type, 'electric')
        self.assertEqual(self.app.fuel_unit, 'kwh_per_100km')
    
    # Fuel Unit Tests
    def test_set_fuel_unit_l_per_100km(self):
        """Test setting fuel unit to L/100km."""
        self.app.vehicle_type = 'petrol_diesel'
        self.app.set_fuel_unit('l_per_100km')
        self.assertEqual(self.app.fuel_unit, 'l_per_100km')
    
    def test_set_fuel_unit_mpg(self):
        """Test setting fuel unit to mpg."""
        self.app.vehicle_type = 'petrol_diesel'
        self.app.set_fuel_unit('mpg')
        self.assertEqual(self.app.fuel_unit, 'mpg')
    
    def test_set_fuel_unit_kwh_per_100km(self):
        """Test setting fuel unit to kWh/100km."""
        self.app.vehicle_type = 'electric'
        self.app.set_fuel_unit('kwh_per_100km')
        self.assertEqual(self.app.fuel_unit, 'kwh_per_100km')
    
    def test_set_fuel_unit_miles_per_kwh(self):
        """Test setting fuel unit to miles/kWh."""
        self.app.vehicle_type = 'electric'
        self.app.set_fuel_unit('miles_per_kwh')
        self.assertEqual(self.app.fuel_unit, 'miles_per_kwh')


class TestHazardParser(unittest.TestCase):
    """Test HazardParser functionality."""
    
    def setUp(self):
        """Set up test fixtures."""
        self.test_db = 'test_hazard.db'
        self.parser = HazardParser(self.test_db)
    
    def tearDown(self):
        """Clean up after tests."""
        self.parser.close()
        if os.path.exists(self.test_db):
            os.remove(self.test_db)
    
    def test_database_initialization(self):
        """Test database tables are created."""
        cursor = self.parser.cursor
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
        tables = [row[0] for row in cursor.fetchall()]
        self.assertIn('hazards', tables)
        self.assertIn('incidents', tables)
        self.assertIn('cameras', tables)
        self.assertIn('tolls', tables)
        self.assertIn('weather', tables)
    
    def test_get_cameras_empty(self):
        """Test getting cameras when none exist."""
        cameras = self.parser.get_cameras()
        self.assertEqual(cameras, [])
    
    def test_get_tolls_empty(self):
        """Test getting tolls when none exist."""
        tolls = self.parser.get_tolls()
        self.assertEqual(tolls, [])
    
    def test_get_hazards_empty(self):
        """Test getting hazards when none exist."""
        hazards = self.parser.get_hazards()
        self.assertEqual(hazards, [])


class TestIntegration(unittest.TestCase):
    """Integration tests."""
    
    def test_full_journey_cost_calculation(self):
        """Test full journey cost calculation."""
        app = SatNavApp()
        
        # Petrol journey
        app.vehicle_type = 'petrol_diesel'
        app.fuel_efficiency = 6.5
        app.fuel_price_gbp = 1.40
        app.fuel_unit = 'l_per_100km'
        app.include_tolls = True
        
        cost = app.calculate_cost(100)
        self.assertGreater(cost, 0)
        self.assertAlmostEqual(cost, 9.1, places=1)
    
    def test_ev_journey_cost_calculation(self):
        """Test EV journey cost calculation."""
        app = SatNavApp()
        
        # EV journey
        app.vehicle_type = 'electric'
        app.energy_efficiency = 18.5
        app.electricity_price_gbp = 0.30
        app.fuel_unit = 'kwh_per_100km'
        app.include_tolls = True
        
        cost = app.calculate_cost(100)
        self.assertGreater(cost, 0)
        self.assertAlmostEqual(cost, 5.55, places=2)


if __name__ == '__main__':
    unittest.main()


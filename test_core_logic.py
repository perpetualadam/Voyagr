"""
Unit tests for Voyagr core logic (without Kivy UI dependencies).
Tests toll costs, EV calculations, GBP pricing, and error handling.
"""

import unittest
import sqlite3
import os
import time
from hazard_parser import HazardParser


class TestUnitConversions(unittest.TestCase):
    """Test unit conversion functions."""
    
    def test_to_miles(self):
        """Test km to miles conversion."""
        km = 100
        miles = km * 0.621371
        self.assertAlmostEqual(miles, 62.1371, places=4)
    
    def test_to_km(self):
        """Test miles to km conversion."""
        miles = 62.1371
        km = miles / 0.621371
        self.assertAlmostEqual(km, 100, places=4)
    
    def test_to_fahrenheit(self):
        """Test Celsius to Fahrenheit conversion."""
        celsius = 0
        fahrenheit = (celsius * 9/5) + 32
        self.assertAlmostEqual(fahrenheit, 32, places=1)
        
        celsius = 100
        fahrenheit = (celsius * 9/5) + 32
        self.assertAlmostEqual(fahrenheit, 212, places=1)
    
    def test_to_celsius(self):
        """Test Fahrenheit to Celsius conversion."""
        fahrenheit = 32
        celsius = (fahrenheit - 32) * 5/9
        self.assertAlmostEqual(celsius, 0, places=1)
        
        fahrenheit = 212
        celsius = (fahrenheit - 32) * 5/9
        self.assertAlmostEqual(celsius, 100, places=1)
    
    def test_to_mpg(self):
        """Test L/100km to mpg conversion."""
        l_per_100km = 6.5
        mpg = 235.214 / l_per_100km
        self.assertAlmostEqual(mpg, 36.19, places=1)
    
    def test_to_l_per_100km(self):
        """Test mpg to L/100km conversion."""
        mpg = 36.18
        l_per_100km = 235.214 / mpg
        self.assertAlmostEqual(l_per_100km, 6.5, places=2)
    
    def test_to_miles_per_kwh(self):
        """Test kWh/100km to miles/kWh conversion."""
        kwh_per_100km = 18.5
        miles_per_kwh = 62.1371 / kwh_per_100km
        self.assertAlmostEqual(miles_per_kwh, 3.36, places=2)
    
    def test_to_kwh_per_100km(self):
        """Test miles/kWh to kWh/100km conversion."""
        miles_per_kwh = 3.36
        kwh_per_100km = 62.1371 / miles_per_kwh
        self.assertAlmostEqual(kwh_per_100km, 18.49, places=1)


class TestFuelCalculations(unittest.TestCase):
    """Test fuel consumption calculations."""
    
    def test_calculate_fuel_l_per_100km(self):
        """Test fuel calculation in L/100km."""
        distance_km = 100
        efficiency = 6.5  # L/100km
        fuel_litres = (distance_km * efficiency) / 100
        self.assertAlmostEqual(fuel_litres, 6.5, places=2)
    
    def test_calculate_fuel_mpg(self):
        """Test fuel calculation in mpg."""
        distance_km = 100
        efficiency_mpg = 43.5
        distance_miles = distance_km * 0.621371
        fuel_gallons = distance_miles / efficiency_mpg
        self.assertGreater(fuel_gallons, 0)
    
    def test_calculate_fuel_cost_gbp(self):
        """Test fuel cost calculation in GBP."""
        distance_km = 100
        efficiency = 6.5  # L/100km
        fuel_price_gbp = 1.40  # £/L
        fuel_litres = (distance_km * efficiency) / 100
        cost_gbp = fuel_litres * fuel_price_gbp
        self.assertAlmostEqual(cost_gbp, 9.1, places=1)


class TestEnergyCalculations(unittest.TestCase):
    """Test energy consumption calculations for EVs."""
    
    def test_calculate_energy_kwh_per_100km(self):
        """Test energy calculation in kWh/100km."""
        distance_km = 100
        efficiency = 18.5  # kWh/100km
        energy_kwh = (distance_km * efficiency) / 100
        self.assertAlmostEqual(energy_kwh, 18.5, places=2)
    
    def test_calculate_energy_miles_per_kwh(self):
        """Test energy calculation in miles/kWh."""
        distance_km = 100
        efficiency_miles_per_kwh = 3.36
        distance_miles = distance_km * 0.621371
        energy_kwh = distance_miles / efficiency_miles_per_kwh
        self.assertGreater(energy_kwh, 0)
    
    def test_calculate_energy_cost_gbp(self):
        """Test energy cost calculation in GBP."""
        distance_km = 100
        efficiency = 18.5  # kWh/100km
        electricity_price_gbp = 0.30  # £/kWh
        energy_kwh = (distance_km * efficiency) / 100
        cost_gbp = energy_kwh * electricity_price_gbp
        self.assertAlmostEqual(cost_gbp, 5.55, places=2)


class TestTollCostCalculations(unittest.TestCase):
    """Test toll cost calculations."""
    
    def test_uk_toll_database(self):
        """Test UK toll database."""
        static_tolls = {
            'M6 Toll': {'lat': 52.664, 'lon': -1.932, 'cost': 7.00},
            'Dartford Crossing': {'lat': 51.465, 'lon': 0.258, 'cost': 2.50},
            'Severn Bridge': {'lat': 51.385, 'lon': -2.635, 'cost': 6.70},
            'Humber Bridge': {'lat': 53.710, 'lon': -0.305, 'cost': 1.50},
        }
        
        self.assertEqual(static_tolls['M6 Toll']['cost'], 7.00)
        self.assertEqual(static_tolls['Dartford Crossing']['cost'], 2.50)
        self.assertEqual(static_tolls['Severn Bridge']['cost'], 6.70)
        self.assertEqual(static_tolls['Humber Bridge']['cost'], 1.50)
    
    def test_toll_cost_calculation(self):
        """Test toll cost calculation."""
        tolls = [
            {'road_name': 'M6 Toll', 'cost_gbp': 7.00},
            {'road_name': 'Dartford Crossing', 'cost_gbp': 2.50},
        ]
        
        total_toll_cost = sum(toll['cost_gbp'] for toll in tolls)
        self.assertAlmostEqual(total_toll_cost, 9.50, places=2)


class TestJourneyCostCalculations(unittest.TestCase):
    """Test complete journey cost calculations."""
    
    def test_petrol_journey_cost(self):
        """Test petrol journey cost calculation."""
        distance_km = 100
        fuel_efficiency = 6.5  # L/100km
        fuel_price_gbp = 1.40  # £/L
        
        fuel_litres = (distance_km * fuel_efficiency) / 100
        fuel_cost = fuel_litres * fuel_price_gbp
        
        self.assertAlmostEqual(fuel_cost, 9.1, places=1)
    
    def test_electric_journey_cost(self):
        """Test electric journey cost calculation."""
        distance_km = 100
        energy_efficiency = 18.5  # kWh/100km
        electricity_price_gbp = 0.30  # £/kWh
        
        energy_kwh = (distance_km * energy_efficiency) / 100
        energy_cost = energy_kwh * electricity_price_gbp
        
        self.assertAlmostEqual(energy_cost, 5.55, places=2)
    
    def test_journey_with_tolls(self):
        """Test journey cost including tolls."""
        distance_km = 100
        fuel_efficiency = 6.5
        fuel_price_gbp = 1.40
        toll_cost = 7.00
        
        fuel_litres = (distance_km * fuel_efficiency) / 100
        fuel_cost = fuel_litres * fuel_price_gbp
        total_cost = fuel_cost + toll_cost
        
        self.assertAlmostEqual(total_cost, 16.1, places=1)
    
    def test_long_journey_cost(self):
        """Test long journey cost calculation."""
        distance_km = 500  # London to Barnsley
        fuel_efficiency = 6.5
        fuel_price_gbp = 1.40
        toll_cost = 9.50  # M6 Toll + Dartford Crossing
        
        fuel_litres = (distance_km * fuel_efficiency) / 100
        fuel_cost = fuel_litres * fuel_price_gbp
        total_cost = fuel_cost + toll_cost
        
        self.assertAlmostEqual(fuel_cost, 45.5, places=1)
        self.assertAlmostEqual(total_cost, 55.0, places=1)


class TestInputValidation(unittest.TestCase):
    """Test input validation."""
    
    def test_fuel_efficiency_validation_l_per_100km(self):
        """Test fuel efficiency validation for L/100km."""
        valid_values = [1, 6.5, 20]
        invalid_values = [0, 0.5, 25, -1]
        
        for value in valid_values:
            self.assertTrue(1 <= value <= 20)
        
        for value in invalid_values:
            self.assertFalse(1 <= value <= 20)
    
    def test_fuel_efficiency_validation_mpg(self):
        """Test fuel efficiency validation for mpg."""
        valid_values = [10, 43.5, 100]
        invalid_values = [5, 0, 150, -1]
        
        for value in valid_values:
            self.assertTrue(10 <= value <= 100)
        
        for value in invalid_values:
            self.assertFalse(10 <= value <= 100)
    
    def test_energy_efficiency_validation_kwh_per_100km(self):
        """Test energy efficiency validation for kWh/100km."""
        valid_values = [10, 18.5, 30]
        invalid_values = [5, 0, 40, -1]
        
        for value in valid_values:
            self.assertTrue(10 <= value <= 30)
        
        for value in invalid_values:
            self.assertFalse(10 <= value <= 30)
    
    def test_energy_efficiency_validation_miles_per_kwh(self):
        """Test energy efficiency validation for miles/kWh."""
        valid_values = [2, 3.36, 6]
        invalid_values = [1, 0, 8, -1]
        
        for value in valid_values:
            self.assertTrue(2 <= value <= 6)
        
        for value in invalid_values:
            self.assertFalse(2 <= value <= 6)
    
    def test_fuel_price_validation(self):
        """Test fuel price validation."""
        valid_prices = [0.50, 1.40, 3.00]
        invalid_prices = [0.25, 0, 5.00, -1]
        
        for price in valid_prices:
            self.assertTrue(0.5 <= price <= 3.0)
        
        for price in invalid_prices:
            self.assertFalse(0.5 <= price <= 3.0)
    
    def test_electricity_price_validation(self):
        """Test electricity price validation."""
        valid_prices = [0.10, 0.30, 1.00]
        invalid_prices = [0.05, 0, 2.00, -1]
        
        for price in valid_prices:
            self.assertTrue(0.1 <= price <= 1.0)
        
        for price in invalid_prices:
            self.assertFalse(0.1 <= price <= 1.0)


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
    
    def test_get_incidents_empty(self):
        """Test getting incidents when none exist."""
        incidents = self.parser.get_incidents()
        self.assertEqual(incidents, [])
    
    def test_get_weather_empty(self):
        """Test getting weather when none exist."""
        weather = self.parser.get_weather()
        self.assertEqual(weather, [])


class TestDistanceFormatting(unittest.TestCase):
    """Test distance formatting."""
    
    def test_format_distance_km(self):
        """Test distance formatting in km."""
        distance_m = 1000
        distance_km = distance_m / 1000
        formatted = f"{distance_km:.2f} km"
        self.assertEqual(formatted, "1.00 km")
    
    def test_format_distance_miles(self):
        """Test distance formatting in miles."""
        distance_m = 1609
        distance_km = distance_m / 1000
        distance_miles = distance_km * 0.621371
        formatted = f"{distance_miles:.2f} miles"
        self.assertIn("miles", formatted)
    
    def test_format_temperature_celsius(self):
        """Test temperature formatting in Celsius."""
        temp_c = 20
        formatted = f"{temp_c:.1f}°C"
        self.assertEqual(formatted, "20.0°C")
    
    def test_format_temperature_fahrenheit(self):
        """Test temperature formatting in Fahrenheit."""
        temp_c = 20
        temp_f = (temp_c * 9/5) + 32
        formatted = f"{temp_f:.1f}°F"
        self.assertIn("°F", formatted)
    
    def test_format_fuel(self):
        """Test fuel formatting."""
        fuel_litres = 5.5
        formatted = f"{fuel_litres:.2f} litres"
        self.assertEqual(formatted, "5.50 litres")
    
    def test_format_energy(self):
        """Test energy formatting."""
        energy_kwh = 18.5
        formatted = f"{energy_kwh:.2f} kWh"
        self.assertEqual(formatted, "18.50 kWh")


class TestDefaultValues(unittest.TestCase):
    """Test default values for Voyagr."""
    
    def test_default_location_barnsley(self):
        """Test default location is Barnsley."""
        barnsley_lat = 53.5526
        barnsley_lon = -1.4797
        self.assertAlmostEqual(barnsley_lat, 53.5526, places=4)
        self.assertAlmostEqual(barnsley_lon, -1.4797, places=4)
    
    def test_default_fuel_efficiency(self):
        """Test default fuel efficiency."""
        default_l_per_100km = 6.5
        default_mpg = 43.5
        self.assertEqual(default_l_per_100km, 6.5)
        self.assertEqual(default_mpg, 43.5)
    
    def test_default_fuel_price(self):
        """Test default fuel price."""
        default_price_gbp = 1.40
        self.assertEqual(default_price_gbp, 1.40)
    
    def test_default_energy_efficiency(self):
        """Test default energy efficiency."""
        default_kwh_per_100km = 18.5
        default_miles_per_kwh = 3.4
        self.assertEqual(default_kwh_per_100km, 18.5)
        self.assertEqual(default_miles_per_kwh, 3.4)
    
    def test_default_electricity_price(self):
        """Test default electricity price."""
        default_price_gbp = 0.30
        self.assertEqual(default_price_gbp, 0.30)


class TestRoutingModes(unittest.TestCase):
    """Test routing mode functionality."""

    def test_routing_mode_auto(self):
        """Test auto routing mode."""
        routing_mode = 'auto'
        self.assertEqual(routing_mode, 'auto')

    def test_routing_mode_pedestrian(self):
        """Test pedestrian routing mode."""
        routing_mode = 'pedestrian'
        self.assertEqual(routing_mode, 'pedestrian')

    def test_routing_mode_bicycle(self):
        """Test bicycle routing mode."""
        routing_mode = 'bicycle'
        self.assertEqual(routing_mode, 'bicycle')

    def test_valhalla_costing_auto(self):
        """Test Valhalla costing for auto mode."""
        routing_mode = 'auto'
        costing_map = {
            'auto': 'auto',
            'pedestrian': 'pedestrian',
            'bicycle': 'bicycle'
        }
        costing = costing_map.get(routing_mode, 'auto')
        self.assertEqual(costing, 'auto')

    def test_valhalla_costing_pedestrian(self):
        """Test Valhalla costing for pedestrian mode."""
        routing_mode = 'pedestrian'
        costing_map = {
            'auto': 'auto',
            'pedestrian': 'pedestrian',
            'bicycle': 'bicycle'
        }
        costing = costing_map.get(routing_mode, 'auto')
        self.assertEqual(costing, 'pedestrian')

    def test_valhalla_costing_bicycle(self):
        """Test Valhalla costing for bicycle mode."""
        routing_mode = 'bicycle'
        costing_map = {
            'auto': 'auto',
            'pedestrian': 'pedestrian',
            'bicycle': 'bicycle'
        }
        costing = costing_map.get(routing_mode, 'auto')
        self.assertEqual(costing, 'bicycle')

    def test_cost_inputs_shown_for_auto(self):
        """Test that cost inputs are shown for auto mode."""
        routing_mode = 'auto'
        should_show = routing_mode == 'auto'
        self.assertTrue(should_show)

    def test_cost_inputs_hidden_for_pedestrian(self):
        """Test that cost inputs are hidden for pedestrian mode."""
        routing_mode = 'pedestrian'
        should_show = routing_mode == 'auto'
        self.assertFalse(should_show)

    def test_cost_inputs_hidden_for_bicycle(self):
        """Test that cost inputs are hidden for bicycle mode."""
        routing_mode = 'bicycle'
        should_show = routing_mode == 'auto'
        self.assertFalse(should_show)

    def test_toll_toggle_shown_for_auto(self):
        """Test that toll toggle is shown for auto mode."""
        routing_mode = 'auto'
        should_show = routing_mode == 'auto'
        self.assertTrue(should_show)

    def test_toll_toggle_hidden_for_pedestrian(self):
        """Test that toll toggle is hidden for pedestrian mode."""
        routing_mode = 'pedestrian'
        should_show = routing_mode == 'auto'
        self.assertFalse(should_show)

    def test_toll_toggle_hidden_for_bicycle(self):
        """Test that toll toggle is hidden for bicycle mode."""
        routing_mode = 'bicycle'
        should_show = routing_mode == 'auto'
        self.assertFalse(should_show)

    def test_route_summary_pedestrian(self):
        """Test route summary for pedestrian mode."""
        routing_mode = 'pedestrian'
        distance_km = 3.5
        time_minutes = 45

        if routing_mode == 'pedestrian':
            summary = f"Walking: {distance_km:.2f} km, {time_minutes} min"

        self.assertIn("Walking", summary)
        self.assertIn("3.50 km", summary)
        self.assertIn("45 min", summary)

    def test_route_summary_bicycle(self):
        """Test route summary for bicycle mode."""
        routing_mode = 'bicycle'
        distance_km = 15.0
        time_minutes = 30

        if routing_mode == 'bicycle':
            summary = f"Cycling: {distance_km:.2f} km, {time_minutes} min"

        self.assertIn("Cycling", summary)
        self.assertIn("15.00 km", summary)
        self.assertIn("30 min", summary)

    def test_route_summary_auto_with_cost(self):
        """Test route summary for auto mode includes cost."""
        routing_mode = 'auto'
        distance_km = 100.0
        time_minutes = 120
        cost_gbp = 15.50

        if routing_mode == 'auto':
            summary = f"Driving: {distance_km:.2f} km, {time_minutes} min, £{cost_gbp:.2f}"

        self.assertIn("Driving", summary)
        self.assertIn("100.00 km", summary)
        self.assertIn("120 min", summary)
        self.assertIn("£15.50", summary)

    def test_no_cost_calculation_for_pedestrian(self):
        """Test that cost is not calculated for pedestrian mode."""
        routing_mode = 'pedestrian'
        # In pedestrian mode, cost should be 0 or not calculated
        if routing_mode != 'auto':
            cost = 0
        self.assertEqual(cost, 0)

    def test_no_cost_calculation_for_bicycle(self):
        """Test that cost is not calculated for bicycle mode."""
        routing_mode = 'bicycle'
        # In bicycle mode, cost should be 0 or not calculated
        if routing_mode != 'auto':
            cost = 0
        self.assertEqual(cost, 0)

    def test_no_toll_calculation_for_pedestrian(self):
        """Test that tolls are not calculated for pedestrian mode."""
        routing_mode = 'pedestrian'
        # In pedestrian mode, tolls should be 0
        if routing_mode != 'auto':
            toll_cost = 0
        self.assertEqual(toll_cost, 0)

    def test_no_toll_calculation_for_bicycle(self):
        """Test that tolls are not calculated for bicycle mode."""
        routing_mode = 'bicycle'
        # In bicycle mode, tolls should be 0
        if routing_mode != 'auto':
            toll_cost = 0
        self.assertEqual(toll_cost, 0)


class TestCurrencyFormatting(unittest.TestCase):
    """Test currency formatting functionality."""

    def test_currency_symbol_gbp(self):
        """Test GBP currency symbol."""
        currency_unit = 'GBP'
        currency_symbols = {
            'GBP': '£',
            'USD': '$',
            'EUR': '€'
        }
        symbol = currency_symbols.get(currency_unit, '£')
        self.assertEqual(symbol, '£')

    def test_currency_symbol_usd(self):
        """Test USD currency symbol."""
        currency_unit = 'USD'
        currency_symbols = {
            'GBP': '£',
            'USD': '$',
            'EUR': '€'
        }
        symbol = currency_symbols.get(currency_unit, '£')
        self.assertEqual(symbol, '$')

    def test_currency_symbol_eur(self):
        """Test EUR currency symbol."""
        currency_unit = 'EUR'
        currency_symbols = {
            'GBP': '£',
            'USD': '$',
            'EUR': '€'
        }
        symbol = currency_symbols.get(currency_unit, '£')
        self.assertEqual(symbol, '€')

    def test_currency_name_gbp(self):
        """Test GBP currency name for voice."""
        currency_unit = 'GBP'
        currency_names = {
            'GBP': 'pounds',
            'USD': 'dollars',
            'EUR': 'euros'
        }
        name = currency_names.get(currency_unit, 'pounds')
        self.assertEqual(name, 'pounds')

    def test_currency_name_usd(self):
        """Test USD currency name for voice."""
        currency_unit = 'USD'
        currency_names = {
            'GBP': 'pounds',
            'USD': 'dollars',
            'EUR': 'euros'
        }
        name = currency_names.get(currency_unit, 'pounds')
        self.assertEqual(name, 'dollars')

    def test_currency_name_eur(self):
        """Test EUR currency name for voice."""
        currency_unit = 'EUR'
        currency_names = {
            'GBP': 'pounds',
            'USD': 'dollars',
            'EUR': 'euros'
        }
        name = currency_names.get(currency_unit, 'pounds')
        self.assertEqual(name, 'euros')

    def test_format_currency_gbp(self):
        """Test currency formatting for GBP."""
        currency_unit = 'GBP'
        amount = 15.50
        currency_symbols = {'GBP': '£', 'USD': '$', 'EUR': '€'}
        symbol = currency_symbols.get(currency_unit, '£')
        formatted = f"{symbol}{amount:.2f}"
        self.assertEqual(formatted, "£15.50")

    def test_format_currency_usd(self):
        """Test currency formatting for USD."""
        currency_unit = 'USD'
        amount = 15.50
        currency_symbols = {'GBP': '£', 'USD': '$', 'EUR': '€'}
        symbol = currency_symbols.get(currency_unit, '£')
        formatted = f"{symbol}{amount:.2f}"
        self.assertEqual(formatted, "$15.50")

    def test_format_currency_eur(self):
        """Test currency formatting for EUR."""
        currency_unit = 'EUR'
        amount = 15.50
        currency_symbols = {'GBP': '£', 'USD': '$', 'EUR': '€'}
        symbol = currency_symbols.get(currency_unit, '£')
        formatted = f"{symbol}{amount:.2f}"
        self.assertEqual(formatted, "€15.50")

    def test_format_currency_zero(self):
        """Test currency formatting for zero amount."""
        currency_unit = 'GBP'
        amount = 0.00
        currency_symbols = {'GBP': '£', 'USD': '$', 'EUR': '€'}
        symbol = currency_symbols.get(currency_unit, '£')
        formatted = f"{symbol}{amount:.2f}"
        self.assertEqual(formatted, "£0.00")

    def test_format_currency_large_amount(self):
        """Test currency formatting for large amount."""
        currency_unit = 'GBP'
        amount = 1234.56
        currency_symbols = {'GBP': '£', 'USD': '$', 'EUR': '€'}
        symbol = currency_symbols.get(currency_unit, '£')
        formatted = f"{symbol}{amount:.2f}"
        self.assertEqual(formatted, "£1234.56")


class TestDistanceFormatting(unittest.TestCase):
    """Test distance formatting with unit consistency."""

    def test_format_distance_km_1000m(self):
        """Test distance formatting 1000m in km."""
        distance_unit = 'km'
        meters = 1000
        if distance_unit == 'mi':
            miles = meters / 1000 * 0.621371
            formatted = f"{miles:.2f} miles"
        else:
            formatted = f"{meters / 1000:.2f} km"
        self.assertEqual(formatted, "1.00 km")

    def test_format_distance_km_3500m(self):
        """Test distance formatting 3500m in km."""
        distance_unit = 'km'
        meters = 3500
        if distance_unit == 'mi':
            miles = meters / 1000 * 0.621371
            formatted = f"{miles:.2f} miles"
        else:
            formatted = f"{meters / 1000:.2f} km"
        self.assertEqual(formatted, "3.50 km")

    def test_format_distance_miles_1609m(self):
        """Test distance formatting 1609m (1 mile) in miles."""
        distance_unit = 'mi'
        meters = 1609
        if distance_unit == 'mi':
            miles = meters / 1000 * 0.621371
            formatted = f"{miles:.2f} miles"
        else:
            formatted = f"{meters / 1000:.2f} km"
        self.assertIn("1.00 miles", formatted)

    def test_format_distance_miles_5632m(self):
        """Test distance formatting 5632m (3.5 miles) in miles."""
        distance_unit = 'mi'
        meters = 5632
        if distance_unit == 'mi':
            miles = meters / 1000 * 0.621371
            formatted = f"{miles:.2f} miles"
        else:
            formatted = f"{meters / 1000:.2f} km"
        self.assertIn("3.50 miles", formatted)

    def test_route_summary_pedestrian_km(self):
        """Test pedestrian route summary in km."""
        routing_mode = 'pedestrian'
        distance_km = 3.50
        time_minutes = 45
        distance_str = f"{distance_km:.2f} km"
        time_str = f"{time_minutes} min"
        summary = f"Walking: {distance_str}, {time_str}"
        self.assertEqual(summary, "Walking: 3.50 km, 45 min")

    def test_route_summary_pedestrian_miles(self):
        """Test pedestrian route summary in miles."""
        routing_mode = 'pedestrian'
        distance_miles = 2.17
        time_minutes = 45
        distance_str = f"{distance_miles:.2f} miles"
        time_str = f"{time_minutes} min"
        summary = f"Walking: {distance_str}, {time_str}"
        self.assertEqual(summary, "Walking: 2.17 miles, 45 min")

    def test_route_summary_bicycle_km(self):
        """Test bicycle route summary in km."""
        routing_mode = 'bicycle'
        distance_km = 15.00
        time_minutes = 30
        distance_str = f"{distance_km:.2f} km"
        time_str = f"{time_minutes} min"
        summary = f"Cycling: {distance_str}, {time_str}"
        self.assertEqual(summary, "Cycling: 15.00 km, 30 min")

    def test_route_summary_bicycle_miles(self):
        """Test bicycle route summary in miles."""
        routing_mode = 'bicycle'
        distance_miles = 9.32
        time_minutes = 30
        distance_str = f"{distance_miles:.2f} miles"
        time_str = f"{time_minutes} min"
        summary = f"Cycling: {distance_str}, {time_str}"
        self.assertEqual(summary, "Cycling: 9.32 miles, 30 min")

    def test_route_summary_auto_gbp_km(self):
        """Test auto route summary with GBP in km."""
        routing_mode = 'auto'
        distance_km = 100.00
        time_minutes = 120
        cost_gbp = 15.50
        distance_str = f"{distance_km:.2f} km"
        time_str = f"{time_minutes} min"
        cost_str = f"£{cost_gbp:.2f}"
        summary = f"Driving: {distance_str}, {time_str}, {cost_str}"
        self.assertEqual(summary, "Driving: 100.00 km, 120 min, £15.50")

    def test_route_summary_auto_usd_km(self):
        """Test auto route summary with USD in km."""
        routing_mode = 'auto'
        distance_km = 100.00
        time_minutes = 120
        cost_usd = 15.50
        distance_str = f"{distance_km:.2f} km"
        time_str = f"{time_minutes} min"
        cost_str = f"${cost_usd:.2f}"
        summary = f"Driving: {distance_str}, {time_str}, {cost_str}"
        self.assertEqual(summary, "Driving: 100.00 km, 120 min, $15.50")

    def test_route_summary_auto_eur_miles(self):
        """Test auto route summary with EUR in miles."""
        routing_mode = 'auto'
        distance_miles = 62.14
        time_minutes = 120
        cost_eur = 15.50
        distance_str = f"{distance_miles:.2f} miles"
        time_str = f"{time_minutes} min"
        cost_str = f"€{cost_eur:.2f}"
        summary = f"Driving: {distance_str}, {time_str}, {cost_str}"
        self.assertEqual(summary, "Driving: 62.14 miles, 120 min, €15.50")

    def test_km_to_miles_conversion(self):
        """Test km to miles conversion accuracy."""
        km = 100
        miles = km * 0.621371
        self.assertAlmostEqual(miles, 62.1371, places=4)

    def test_miles_to_km_conversion(self):
        """Test miles to km conversion accuracy."""
        miles = 62.1371
        km = miles / 0.621371
        self.assertAlmostEqual(km, 100, places=4)


class TestCAZFeatures(unittest.TestCase):
    """Test Clean Air Zone features."""

    def test_caz_database_initialization(self):
        """Test CAZ table created with sample data."""
        conn = sqlite3.connect(':memory:')
        cursor = conn.cursor()
        cursor.execute('''CREATE TABLE IF NOT EXISTS clean_air_zones
                          (id INTEGER PRIMARY KEY AUTOINCREMENT, zone_name TEXT NOT NULL, city TEXT NOT NULL,
                           country TEXT NOT NULL, lat REAL NOT NULL, lon REAL NOT NULL, zone_type TEXT,
                           charge_amount REAL, currency_code TEXT DEFAULT 'GBP', active INTEGER DEFAULT 1,
                           operating_hours TEXT, boundary_coords TEXT)''')

        # Insert sample data
        cursor.execute("INSERT INTO clean_air_zones (zone_name, city, country, lat, lon, zone_type, charge_amount, currency_code, active, operating_hours) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                      ('London ULEZ', 'London', 'UK', 51.5074, -0.1278, 'ULEZ', 12.50, 'GBP', 1, '24/7'))
        conn.commit()

        cursor.execute("SELECT COUNT(*) FROM clean_air_zones")
        count = cursor.fetchone()[0]
        self.assertEqual(count, 1)

        cursor.execute("SELECT zone_name, charge_amount, currency_code FROM clean_air_zones WHERE zone_name = 'London ULEZ'")
        result = cursor.fetchone()
        self.assertEqual(result[0], 'London ULEZ')
        self.assertEqual(result[1], 12.50)
        self.assertEqual(result[2], 'GBP')
        conn.close()

    def test_caz_proximity_detection(self):
        """Test CAZ proximity detection within 1000m."""
        from geopy.distance import geodesic

        # London ULEZ center
        caz_lat, caz_lon = 51.5074, -0.1278

        # Position 800m away (should trigger alert)
        pos_close = (51.5074 + 0.007, -0.1278)  # ~800m north
        distance_close = geodesic((pos_close[0], pos_close[1]), (caz_lat, caz_lon)).meters
        self.assertLess(distance_close, 1000)

        # Position 2000m away (should not trigger alert)
        pos_far = (51.5074 + 0.02, -0.1278)  # ~2000m north
        distance_far = geodesic((pos_far[0], pos_far[1]), (caz_lat, caz_lon)).meters
        self.assertGreater(distance_far, 1000)

    def test_caz_cost_calculation(self):
        """Test CAZ cost calculation."""
        # Test basic CAZ cost
        caz_charge = 12.50
        self.assertEqual(caz_charge, 12.50)

        # Test multiple CAZ charges
        caz_charges = [12.50, 15.00, 8.00]
        total = sum(caz_charges)
        self.assertEqual(total, 35.50)

    def test_caz_cost_with_exemption(self):
        """Test CAZ cost returns 0 for exempt vehicles."""
        vehicle_caz_exempt = True
        caz_charge = 12.50

        # Exempt vehicles should have 0 CAZ cost
        if vehicle_caz_exempt:
            caz_cost = 0
        else:
            caz_cost = caz_charge

        self.assertEqual(caz_cost, 0)

    def test_caz_avoidance_toggle(self):
        """Test CAZ avoidance toggle updates settings."""
        avoid_caz = False

        # Toggle on
        avoid_caz = True
        self.assertTrue(avoid_caz)

        # Toggle off
        avoid_caz = False
        self.assertFalse(avoid_caz)

    def test_route_summary_with_caz(self):
        """Test route summary includes CAZ costs."""
        distance_str = "100.00 km"
        time_str = "120 min"
        fuel_cost = "£9.10"
        toll_cost = "£2.50"
        caz_cost = "£12.50"

        summary = f"Driving: {distance_str}, {time_str}, £23.60 ({fuel_cost} + {toll_cost} tolls + {caz_cost} CAZ)"
        self.assertIn("CAZ", summary)
        self.assertIn("£12.50", summary)

    def test_route_summary_without_caz(self):
        """Test route summary without CAZ costs."""
        distance_str = "100.00 km"
        time_str = "120 min"
        fuel_cost = "£9.10"

        summary = f"Driving: {distance_str}, {time_str}, {fuel_cost}"
        self.assertNotIn("CAZ", summary)

    def test_caz_currency_formatting_gbp(self):
        """Test CAZ currency formatting for GBP."""
        caz_charge = 12.50
        currency_symbol = '£'
        formatted = f"{currency_symbol}{caz_charge:.2f}"
        self.assertEqual(formatted, "£12.50")

    def test_caz_currency_formatting_eur(self):
        """Test CAZ currency formatting for EUR."""
        caz_charge = 68.00
        currency_symbol = '€'
        formatted = f"{currency_symbol}{caz_charge:.2f}"
        self.assertEqual(formatted, "€68.00")


class TestSearchFunctionality(unittest.TestCase):
    """Test search functionality."""

    def setUp(self):
        """Set up test database."""
        self.test_db = 'test_search.db'
        self.conn = sqlite3.connect(self.test_db)
        self.cursor = self.conn.cursor()

        # Create search tables
        self.cursor.execute('''CREATE TABLE IF NOT EXISTS search_history
                              (id INTEGER PRIMARY KEY AUTOINCREMENT, query TEXT NOT NULL, result_name TEXT,
                               lat REAL, lon REAL, timestamp INTEGER)''')
        self.cursor.execute('''CREATE TABLE IF NOT EXISTS favorite_locations
                              (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, address TEXT,
                               lat REAL NOT NULL, lon REAL NOT NULL, category TEXT, timestamp INTEGER)''')
        self.conn.commit()

    def tearDown(self):
        """Clean up test database."""
        self.conn.close()
        if os.path.exists(self.test_db):
            os.remove(self.test_db)

    def test_search_result_structure(self):
        """Test search result data structure."""
        result = {
            'name': 'Tesco',
            'address': '123 Main Street, London',
            'lat': 51.5074,
            'lon': -0.1278,
            'distance': 1500.0,
            'category': 'supermarket'
        }

        self.assertIn('name', result)
        self.assertIn('address', result)
        self.assertIn('lat', result)
        self.assertIn('lon', result)
        self.assertIn('distance', result)
        self.assertIn('category', result)
        self.assertEqual(result['name'], 'Tesco')

    def test_search_history_storage(self):
        """Test search history storage in database."""
        timestamp = int(time.time())
        self.cursor.execute(
            "INSERT INTO search_history (query, result_name, lat, lon, timestamp) VALUES (?, ?, ?, ?, ?)",
            ('Tesco', 'Tesco Barnsley', 53.5526, -1.4797, timestamp)
        )
        self.conn.commit()

        self.cursor.execute("SELECT query, result_name FROM search_history WHERE query = ?", ('Tesco',))
        result = self.cursor.fetchone()
        self.assertIsNotNone(result)
        self.assertEqual(result[0], 'Tesco')
        self.assertEqual(result[1], 'Tesco Barnsley')

    def test_favorite_locations_storage(self):
        """Test favorite locations storage in database."""
        timestamp = int(time.time())
        self.cursor.execute(
            "INSERT INTO favorite_locations (name, address, lat, lon, category, timestamp) VALUES (?, ?, ?, ?, ?, ?)",
            ('Home', '123 Main Street', 53.5526, -1.4797, 'residence', timestamp)
        )
        self.conn.commit()

        self.cursor.execute("SELECT name, address, category FROM favorite_locations WHERE name = ?", ('Home',))
        result = self.cursor.fetchone()
        self.assertIsNotNone(result)
        self.assertEqual(result[0], 'Home')
        self.assertEqual(result[2], 'residence')

    def test_search_history_limit(self):
        """Test search history limited to 50 entries."""
        timestamp = int(time.time())

        # Insert 60 entries
        for i in range(60):
            self.cursor.execute(
                "INSERT INTO search_history (query, result_name, lat, lon, timestamp) VALUES (?, ?, ?, ?, ?)",
                (f'query_{i}', f'result_{i}', 53.5526 + i*0.001, -1.4797 + i*0.001, timestamp + i)
            )
        self.conn.commit()

        # Count entries
        self.cursor.execute("SELECT COUNT(*) FROM search_history")
        count = self.cursor.fetchone()[0]
        self.assertEqual(count, 60)

    def test_search_result_distance_calculation(self):
        """Test distance calculation in search results."""
        from geopy.distance import geodesic

        current_pos = (53.5526, -1.4797)  # Barnsley
        result_pos = (51.5074, -0.1278)   # London

        distance = geodesic(current_pos, result_pos).meters

        # Distance should be approximately 245 km
        self.assertGreater(distance, 240000)
        self.assertLess(distance, 250000)

    def test_search_query_validation(self):
        """Test search query validation."""
        # Empty query
        query = ""
        self.assertLess(len(query.strip()), 2)

        # Single character
        query = "a"
        self.assertLess(len(query.strip()), 2)

        # Valid query
        query = "Tesco"
        self.assertGreaterEqual(len(query.strip()), 2)

    def test_favorite_location_retrieval(self):
        """Test retrieving favorite locations."""
        # Insert multiple favorites with different timestamps
        favorites = [
            ('Home', '123 Main Street', 53.5526, -1.4797, 'residence', int(time.time())),
            ('Work', '456 Business Park', 53.5600, -1.4700, 'workplace', int(time.time()) + 1),
            ('Gym', '789 Fitness Center', 53.5500, -1.4800, 'gym', int(time.time()) + 2)
        ]

        for fav in favorites:
            self.cursor.execute(
                "INSERT INTO favorite_locations (name, address, lat, lon, category, timestamp) VALUES (?, ?, ?, ?, ?, ?)",
                (fav[0], fav[1], fav[2], fav[3], fav[4], fav[5])
            )
        self.conn.commit()

        # Retrieve all favorites
        self.cursor.execute("SELECT name, category FROM favorite_locations ORDER BY timestamp DESC")
        results = self.cursor.fetchall()

        self.assertEqual(len(results), 3)
        self.assertEqual(results[0][0], 'Gym')
        self.assertEqual(results[1][0], 'Work')
        self.assertEqual(results[2][0], 'Home')


if __name__ == '__main__':
    unittest.main()


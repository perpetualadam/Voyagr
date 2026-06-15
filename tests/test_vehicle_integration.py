"""
Comprehensive tests for Vehicle Integration features in Voyagr.
Tests vehicle profiles, charging stations, and maintenance tracking.
"""

import unittest
import sqlite3
import time
import json
import os
from vehicle_profile_manager import VehicleProfileManager
from charging_station_manager import ChargingStationManager
from maintenance_tracker import MaintenanceTracker


class TestVehicleProfileManager(unittest.TestCase):
    """Test vehicle profile management functionality."""
    
    def setUp(self):
        """Set up test database."""
        self.db_path = 'test_vehicles.db'
        self.conn = sqlite3.connect(self.db_path)
        self.cursor = self.conn.cursor()
        self._init_test_db()
        self.manager = VehicleProfileManager(self.db_path)
    
    def _init_test_db(self):
        """Initialize test database."""
        self.cursor.execute('''CREATE TABLE IF NOT EXISTS vehicles
                              (id INTEGER PRIMARY KEY, name TEXT, vehicle_type TEXT,
                               vehicle_subtype TEXT, fuel_efficiency REAL, fuel_unit TEXT,
                               fuel_price_gbp REAL, energy_efficiency REAL,
                               electricity_price_gbp REAL, emission_class TEXT,
                               registration_number TEXT, purchase_date INTEGER,
                               current_mileage_km REAL, is_active INTEGER, caz_exempt INTEGER,
                               timestamp INTEGER)''')
        
        self.cursor.execute('''CREATE TABLE IF NOT EXISTS trip_history
                              (id INTEGER PRIMARY KEY, distance_km REAL,
                               duration_seconds INTEGER, total_cost REAL,
                               fuel_cost REAL, toll_cost REAL, caz_cost REAL,
                               timestamp_start INTEGER)''')
        
        self.conn.commit()
    
    def test_create_vehicle(self):
        """Test vehicle creation."""
        vehicle_id = self.manager.create_vehicle(
            'Tesla Model 3', 'electric', energy_efficiency=20,
            fuel_unit='kwh_per_100km', electricity_price_gbp=0.25
        )
        self.assertIsNotNone(vehicle_id)
        print(f"[OK] Vehicle created with ID: {vehicle_id}")
    
    def test_get_vehicle(self):
        """Test getting vehicle details."""
        vehicle_id = self.manager.create_vehicle('BMW 3 Series', 'petrol_diesel')
        vehicle = self.manager.get_vehicle(vehicle_id)
        self.assertIsNotNone(vehicle)
        self.assertEqual(vehicle['name'], 'BMW 3 Series')
        print("[OK] Vehicle retrieval works")
    
    def test_list_vehicles(self):
        """Test listing vehicles."""
        self.manager.create_vehicle('Car 1', 'petrol_diesel')
        self.manager.create_vehicle('Car 2', 'electric')
        vehicles = self.manager.list_vehicles()
        self.assertGreaterEqual(len(vehicles), 2)
        print(f"[OK] Listed {len(vehicles)} vehicles")
    
    def test_switch_vehicle(self):
        """Test vehicle switching."""
        vehicle_id = self.manager.create_vehicle('Audi A4', 'petrol_diesel')
        success = self.manager.switch_vehicle(vehicle_id)
        self.assertTrue(success)
        print("[OK] Vehicle switching works")
    
    def test_update_vehicle(self):
        """Test vehicle update."""
        vehicle_id = self.manager.create_vehicle('Honda Civic', 'petrol_diesel')
        success = self.manager.update_vehicle(vehicle_id, fuel_efficiency=7.5)
        self.assertTrue(success)
        print("[OK] Vehicle update works")
    
    def test_delete_vehicle(self):
        """Test vehicle deletion."""
        vehicle_id = self.manager.create_vehicle('Toyota Corolla', 'petrol_diesel')
        success = self.manager.delete_vehicle(vehicle_id)
        self.assertTrue(success)
        print("[OK] Vehicle deletion works")
    
    def test_get_active_vehicle(self):
        """Test getting active vehicle."""
        vehicle_id = self.manager.create_vehicle('Nissan Leaf', 'electric')
        self.manager.switch_vehicle(vehicle_id)
        active = self.manager.get_active_vehicle()
        self.assertIsNotNone(active)
        print("[OK] Active vehicle retrieval works")
    
    def test_get_vehicle_statistics(self):
        """Test vehicle statistics."""
        vehicle_id = self.manager.create_vehicle('Volkswagen Golf', 'petrol_diesel')
        stats = self.manager.get_vehicle_statistics(vehicle_id)
        self.assertIn('trips', stats)
        print(f"[OK] Vehicle statistics: {stats['trips']} trips")
    
    def tearDown(self):
        """Clean up test database."""
        self.manager.close()
        self.conn.close()
        if os.path.exists(self.db_path):
            os.remove(self.db_path)


class TestChargingStationManager(unittest.TestCase):
    """Test charging station management functionality."""
    
    def setUp(self):
        """Set up test database."""
        self.db_path = 'test_charging.db'
        self.conn = sqlite3.connect(self.db_path)
        self.cursor = self.conn.cursor()
        self._init_test_db()
        self.manager = ChargingStationManager(self.db_path)
    
    def _init_test_db(self):
        """Initialize test database."""
        self.cursor.execute('''CREATE TABLE IF NOT EXISTS charging_stations
                              (id INTEGER PRIMARY KEY, name TEXT, lat REAL, lon REAL,
                               network TEXT, connector_types TEXT, power_kw REAL,
                               availability INTEGER, cost_per_kwh REAL, timestamp INTEGER)''')
        
        self.cursor.execute('''CREATE TABLE IF NOT EXISTS charging_history
                              (id INTEGER PRIMARY KEY, vehicle_id INTEGER, station_id INTEGER,
                               start_time INTEGER, end_time INTEGER, kwh_charged REAL,
                               cost REAL, timestamp INTEGER)''')
        
        self.conn.commit()
    
    def test_add_charging_station(self):
        """Test adding charging station."""
        success = self.manager.add_charging_station(
            'Tesla Supercharger', 51.5, -0.1, 'Tesla', '["Type 2"]', 150, 100, 0.30
        )
        self.assertTrue(success)
        print("[OK] Charging station added")
    
    def test_get_nearby_stations(self):
        """Test getting nearby stations."""
        self.manager.add_charging_station('Station 1', 51.5, -0.1, 'Network A', '["Type 2"]', 7, 100, 0.30)
        self.manager.add_charging_station('Station 2', 51.51, -0.11, 'Network B', '["CCS"]', 50, 80, 0.35)
        stations = self.manager.get_nearby_stations(51.5, -0.1, 5)
        self.assertGreater(len(stations), 0)
        print(f"[OK] Found {len(stations)} nearby stations")
    
    def test_record_charging(self):
        """Test recording charging session."""
        success = self.manager.record_charging(1, 1, 50, 15.00)
        self.assertTrue(success)
        print("[OK] Charging session recorded")
    
    def test_calculate_charging_time(self):
        """Test charging time calculation."""
        result = self.manager.calculate_charging_time(75, 20, 80, 50)
        self.assertIn('charging_hours', result)
        self.assertGreater(result['charging_hours'], 0)
        print(f"[OK] Charging time: {result['charging_minutes']:.1f} minutes")
    
    def test_calculate_charging_cost(self):
        """Test charging cost calculation."""
        cost = self.manager.calculate_charging_cost(50, 0.30)
        self.assertEqual(cost, 15.0)
        print(f"[OK] Charging cost: £{cost:.2f}")
    
    def test_get_charging_history(self):
        """Test getting charging history."""
        self.manager.record_charging(1, 1, 50, 15.00)
        history = self.manager.get_charging_history(1)
        self.assertGreater(len(history), 0)
        print(f"[OK] Charging history: {len(history)} sessions")
    
    def test_get_charging_statistics(self):
        """Test charging statistics."""
        self.manager.record_charging(1, 1, 50, 15.00)
        stats = self.manager.get_charging_statistics(1)
        self.assertIn('sessions', stats)
        print(f"[OK] Charging stats: {stats['sessions']} sessions, {stats['total_kwh']} kWh")
    
    def tearDown(self):
        """Clean up test database."""
        self.manager.close()
        self.conn.close()
        if os.path.exists(self.db_path):
            os.remove(self.db_path)


class TestMaintenanceTracker(unittest.TestCase):
    """Test maintenance tracking functionality."""
    
    def setUp(self):
        """Set up test database."""
        self.db_path = 'test_maintenance.db'
        self.conn = sqlite3.connect(self.db_path)
        self.cursor = self.conn.cursor()
        self._init_test_db()
        self.tracker = MaintenanceTracker(self.db_path)
    
    def _init_test_db(self):
        """Initialize test database."""
        self.cursor.execute('''CREATE TABLE IF NOT EXISTS maintenance_records
                              (id INTEGER PRIMARY KEY, vehicle_id INTEGER, service_type TEXT,
                               date INTEGER, mileage_km REAL, cost REAL, notes TEXT,
                               timestamp INTEGER)''')
        
        self.cursor.execute('''CREATE TABLE IF NOT EXISTS maintenance_reminders
                              (id INTEGER PRIMARY KEY, vehicle_id INTEGER, service_type TEXT,
                               due_date INTEGER, due_mileage_km REAL, status TEXT,
                               timestamp INTEGER)''')
        
        self.conn.commit()
    
    def test_add_maintenance_record(self):
        """Test adding maintenance record."""
        success = self.tracker.add_maintenance_record(
            1, 'oil_change', int(time.time()), 50000, 45.00, 'Regular oil change'
        )
        self.assertTrue(success)
        print("[OK] Maintenance record added")
    
    def test_create_maintenance_reminder(self):
        """Test creating maintenance reminder."""
        due_date = int(time.time()) + (30 * 86400)
        success = self.tracker.create_maintenance_reminder(1, 'tire_rotation', due_date, 55000)
        self.assertTrue(success)
        print("[OK] Maintenance reminder created")
    
    def test_generate_reminders(self):
        """Test generating reminders."""
        reminders = self.tracker.generate_reminders(1, 50000)
        self.assertIsInstance(reminders, list)
        print(f"[OK] Generated {len(reminders)} reminders")
    
    def test_get_pending_reminders(self):
        """Test getting pending reminders."""
        due_date = int(time.time()) + (30 * 86400)
        self.tracker.create_maintenance_reminder(1, 'oil_change', due_date, 55000)
        reminders = self.tracker.get_pending_reminders(1)
        self.assertGreater(len(reminders), 0)
        print(f"[OK] Found {len(reminders)} pending reminders")
    
    def test_complete_reminder(self):
        """Test completing reminder."""
        due_date = int(time.time()) + (30 * 86400)
        self.tracker.create_maintenance_reminder(1, 'oil_change', due_date, 55000)
        reminders = self.tracker.get_pending_reminders(1)
        if reminders:
            success = self.tracker.complete_reminder(reminders[0]['id'])
            self.assertTrue(success)
            print("[OK] Reminder completed")
    
    def test_get_maintenance_history(self):
        """Test getting maintenance history."""
        self.tracker.add_maintenance_record(1, 'oil_change', int(time.time()), 50000, 45.00)
        history = self.tracker.get_maintenance_history(1)
        self.assertGreater(len(history), 0)
        print(f"[OK] Maintenance history: {len(history)} records")
    
    def test_get_maintenance_costs(self):
        """Test getting maintenance costs."""
        self.tracker.add_maintenance_record(1, 'oil_change', int(time.time()), 50000, 45.00)
        self.tracker.add_maintenance_record(1, 'tire_rotation', int(time.time()), 50000, 60.00)
        costs = self.tracker.get_maintenance_costs(1)
        self.assertIn('total', costs)
        print(f"[OK] Maintenance costs: £{costs['total']:.2f}")
    
    def tearDown(self):
        """Clean up test database."""
        self.tracker.close()
        self.conn.close()
        if os.path.exists(self.db_path):
            os.remove(self.db_path)


if __name__ == '__main__':
    unittest.main(verbosity=2)


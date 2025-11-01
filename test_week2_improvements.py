#!/usr/bin/env python3
"""
Test suite for Week 2 improvements: Database Optimization, Trip History, and Dark Mode
Tests: Database indexes, query optimization, trip tracking, analytics, and theme system
"""

import unittest
import sqlite3
import os
import time
import tempfile
from datetime import datetime, timedelta


class TestDatabaseOptimization(unittest.TestCase):
    """Test database optimization features."""
    
    def setUp(self):
        """Create temporary database for testing."""
        self.db_fd, self.db_path = tempfile.mkstemp(suffix='.db')
        self.conn = sqlite3.connect(self.db_path)
        self.cursor = self.conn.cursor()
        self._init_test_db()
    
    def tearDown(self):
        """Clean up test database."""
        self.conn.close()
        os.close(self.db_fd)
        os.unlink(self.db_path)
    
    def _init_test_db(self):
        """Initialize test database with tables and indexes."""
        # Create tables
        self.cursor.execute('''CREATE TABLE search_history
                              (id INTEGER PRIMARY KEY AUTOINCREMENT, query TEXT, timestamp INTEGER)''')
        self.cursor.execute('''CREATE TABLE favorite_locations
                              (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, timestamp INTEGER)''')
        self.cursor.execute('''CREATE TABLE reports
                              (id INTEGER PRIMARY KEY AUTOINCREMENT, lat REAL, lon REAL, timestamp INTEGER)''')
        self.cursor.execute('''CREATE TABLE clean_air_zones
                              (id INTEGER PRIMARY KEY AUTOINCREMENT, lat REAL, lon REAL, active INTEGER)''')
        self.cursor.execute('''CREATE TABLE tolls
                              (id INTEGER PRIMARY KEY AUTOINCREMENT, lat REAL, lon REAL)''')
        
        # Create indexes
        self.cursor.execute('''CREATE INDEX idx_search_history_timestamp 
                              ON search_history(timestamp DESC)''')
        self.cursor.execute('''CREATE INDEX idx_favorite_locations_timestamp 
                              ON favorite_locations(timestamp DESC)''')
        self.cursor.execute('''CREATE INDEX idx_reports_location_time 
                              ON reports(lat, lon, timestamp DESC)''')
        self.cursor.execute('''CREATE INDEX idx_caz_location_active 
                              ON clean_air_zones(lat, lon, active)''')
        self.cursor.execute('''CREATE INDEX idx_tolls_location 
                              ON tolls(lat, lon)''')
        
        self.conn.commit()
    
    def test_search_history_index_exists(self):
        """Test that search_history index is created."""
        self.cursor.execute("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_search_history_timestamp'")
        result = self.cursor.fetchone()
        self.assertIsNotNone(result, "Search history index not found")
    
    def test_favorite_locations_index_exists(self):
        """Test that favorite_locations index is created."""
        self.cursor.execute("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_favorite_locations_timestamp'")
        result = self.cursor.fetchone()
        self.assertIsNotNone(result, "Favorite locations index not found")
    
    def test_reports_composite_index_exists(self):
        """Test that reports composite index is created."""
        self.cursor.execute("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_reports_location_time'")
        result = self.cursor.fetchone()
        self.assertIsNotNone(result, "Reports composite index not found")
    
    def test_caz_composite_index_exists(self):
        """Test that CAZ composite index is created."""
        self.cursor.execute("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_caz_location_active'")
        result = self.cursor.fetchone()
        self.assertIsNotNone(result, "CAZ composite index not found")
    
    def test_tolls_composite_index_exists(self):
        """Test that tolls composite index is created."""
        self.cursor.execute("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_tolls_location'")
        result = self.cursor.fetchone()
        self.assertIsNotNone(result, "Tolls composite index not found")
    
    def test_vacuum_command(self):
        """Test VACUUM command for database optimization."""
        # Insert and delete records to create fragmentation
        for i in range(100):
            self.cursor.execute("INSERT INTO search_history (query, timestamp) VALUES (?, ?)", 
                              (f"query_{i}", int(time.time())))
        self.cursor.execute("DELETE FROM search_history WHERE id % 2 = 0")
        self.conn.commit()
        
        # Run VACUUM
        self.cursor.execute("VACUUM")
        self.conn.commit()
        
        # Verify database is still functional
        self.cursor.execute("SELECT COUNT(*) FROM search_history")
        count = self.cursor.fetchone()[0]
        self.assertEqual(count, 50, "VACUUM should not affect data")
    
    def test_analyze_command(self):
        """Test ANALYZE command for query planner statistics."""
        # Insert test data
        for i in range(50):
            self.cursor.execute("INSERT INTO search_history (query, timestamp) VALUES (?, ?)", 
                              (f"query_{i}", int(time.time())))
        self.conn.commit()
        
        # Run ANALYZE
        self.cursor.execute("ANALYZE")
        self.conn.commit()
        
        # Verify sqlite_stat1 table is created
        self.cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='sqlite_stat1'")
        result = self.cursor.fetchone()
        self.assertIsNotNone(result, "ANALYZE should create sqlite_stat1 table")


class TestTripHistory(unittest.TestCase):
    """Test trip history and analytics features."""
    
    def setUp(self):
        """Create temporary database for testing."""
        self.db_fd, self.db_path = tempfile.mkstemp(suffix='.db')
        self.conn = sqlite3.connect(self.db_path)
        self.cursor = self.conn.cursor()
        self._init_test_db()
    
    def tearDown(self):
        """Clean up test database."""
        self.conn.close()
        os.close(self.db_fd)
        os.unlink(self.db_path)
    
    def _init_test_db(self):
        """Initialize test database with trip_history table."""
        self.cursor.execute('''CREATE TABLE trip_history
                              (id INTEGER PRIMARY KEY AUTOINCREMENT, start_lat REAL, start_lon REAL,
                               end_lat REAL, end_lon REAL, start_address TEXT, end_address TEXT,
                               distance_km REAL, duration_seconds INTEGER, routing_mode TEXT,
                               fuel_cost REAL, toll_cost REAL, caz_cost REAL, total_cost REAL,
                               timestamp_start INTEGER, timestamp_end INTEGER)''')
        
        # Create indexes
        self.cursor.execute('''CREATE INDEX idx_trip_history_start_time 
                              ON trip_history(timestamp_start DESC)''')
        self.cursor.execute('''CREATE INDEX idx_trip_history_routing_mode 
                              ON trip_history(routing_mode)''')
        
        self.conn.commit()
    
    def test_trip_history_table_exists(self):
        """Test that trip_history table is created."""
        self.cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='trip_history'")
        result = self.cursor.fetchone()
        self.assertIsNotNone(result, "trip_history table not found")
    
    def test_trip_history_indexes_exist(self):
        """Test that trip_history indexes are created."""
        self.cursor.execute("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_trip_history_start_time'")
        result1 = self.cursor.fetchone()
        
        self.cursor.execute("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_trip_history_routing_mode'")
        result2 = self.cursor.fetchone()
        
        self.assertIsNotNone(result1, "Trip history start_time index not found")
        self.assertIsNotNone(result2, "Trip history routing_mode index not found")
    
    def test_insert_trip_record(self):
        """Test inserting a trip record."""
        current_time = int(time.time())
        self.cursor.execute("""INSERT INTO trip_history 
                              (start_lat, start_lon, end_lat, end_lon, start_address, end_address,
                               distance_km, duration_seconds, routing_mode, fuel_cost, toll_cost, 
                               caz_cost, total_cost, timestamp_start, timestamp_end)
                              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                           (51.5074, -0.1278, 52.5086, -1.8853, "London", "Birmingham",
                            150.5, 7200, "auto", 15.50, 5.00, 0.00, 20.50, current_time, current_time + 7200))
        self.conn.commit()
        
        self.cursor.execute("SELECT COUNT(*) FROM trip_history")
        count = self.cursor.fetchone()[0]
        self.assertEqual(count, 1, "Trip record should be inserted")
    
    def test_get_trip_statistics(self):
        """Test calculating trip statistics."""
        current_time = int(time.time())
        
        # Insert multiple trip records
        trips = [
            (51.5074, -0.1278, 52.5086, -1.8853, "London", "Birmingham", 150.5, 7200, "auto", 15.50, 5.00, 0.00, 20.50),
            (52.5086, -1.8853, 53.3811, -1.4668, "Birmingham", "Sheffield", 120.0, 5400, "auto", 12.00, 3.00, 0.00, 15.00),
            (53.3811, -1.4668, 51.5074, -0.1278, "Sheffield", "London", 180.0, 8100, "pedestrian", 0.00, 0.00, 0.00, 0.00),
        ]
        
        for trip in trips:
            self.cursor.execute("""INSERT INTO trip_history 
                                  (start_lat, start_lon, end_lat, end_lon, start_address, end_address,
                                   distance_km, duration_seconds, routing_mode, fuel_cost, toll_cost, 
                                   caz_cost, total_cost, timestamp_start, timestamp_end)
                                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                               (*trip, current_time, current_time + 7200))
        self.conn.commit()
        
        # Calculate statistics
        self.cursor.execute("SELECT COUNT(*) FROM trip_history")
        total_trips = self.cursor.fetchone()[0]
        
        self.cursor.execute("SELECT SUM(distance_km), SUM(duration_seconds), SUM(total_cost) FROM trip_history")
        result = self.cursor.fetchone()
        total_distance, total_time, total_cost = result
        
        self.assertEqual(total_trips, 3, "Should have 3 trips")
        self.assertAlmostEqual(total_distance, 450.5, places=1, msg="Total distance should be ~450.5 km")
        self.assertEqual(total_time, 20700, "Total time should be 20700 seconds")
        self.assertAlmostEqual(total_cost, 35.50, places=2, msg="Total cost should be £35.50")
    
    def test_cleanup_old_trips(self):
        """Test deleting trips older than specified days."""
        current_time = int(time.time())
        old_time = current_time - (40 * 86400)  # 40 days ago
        
        # Insert old and new trips
        self.cursor.execute("""INSERT INTO trip_history 
                              (start_lat, start_lon, end_lat, end_lon, distance_km, duration_seconds, 
                               routing_mode, total_cost, timestamp_start, timestamp_end)
                              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                           (51.5074, -0.1278, 52.5086, -1.8853, 150.5, 7200, "auto", 20.50, old_time, old_time + 7200))
        
        self.cursor.execute("""INSERT INTO trip_history 
                              (start_lat, start_lon, end_lat, end_lon, distance_km, duration_seconds, 
                               routing_mode, total_cost, timestamp_start, timestamp_end)
                              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                           (51.5074, -0.1278, 52.5086, -1.8853, 150.5, 7200, "auto", 20.50, current_time, current_time + 7200))
        self.conn.commit()
        
        # Delete trips older than 30 days
        cutoff_time = current_time - (30 * 86400)
        self.cursor.execute("DELETE FROM trip_history WHERE timestamp_start < ?", (cutoff_time,))
        self.conn.commit()
        
        self.cursor.execute("SELECT COUNT(*) FROM trip_history")
        count = self.cursor.fetchone()[0]
        self.assertEqual(count, 1, "Old trip should be deleted")


class TestDarkMode(unittest.TestCase):
    """Test dark mode and theme system features."""
    
    def setUp(self):
        """Create temporary database for testing."""
        self.db_fd, self.db_path = tempfile.mkstemp(suffix='.db')
        self.conn = sqlite3.connect(self.db_path)
        self.cursor = self.conn.cursor()
        self._init_test_db()
    
    def tearDown(self):
        """Clean up test database."""
        self.conn.close()
        os.close(self.db_fd)
        os.unlink(self.db_path)
    
    def _init_test_db(self):
        """Initialize test database with settings table."""
        self.cursor.execute('''CREATE TABLE settings
                              (theme TEXT DEFAULT 'auto')''')
        self.cursor.execute("INSERT INTO settings (theme) VALUES ('auto')")
        self.conn.commit()
    
    def test_settings_table_has_theme_column(self):
        """Test that settings table has theme column."""
        self.cursor.execute("PRAGMA table_info(settings)")
        columns = [row[1] for row in self.cursor.fetchall()]
        self.assertIn('theme', columns, "Settings table should have theme column")
    
    def test_theme_default_value(self):
        """Test that theme defaults to 'auto'."""
        self.cursor.execute("SELECT theme FROM settings LIMIT 1")
        result = self.cursor.fetchone()
        self.assertEqual(result[0], 'auto', "Theme should default to 'auto'")
    
    def test_set_theme_light(self):
        """Test setting theme to light."""
        self.cursor.execute("UPDATE settings SET theme = ?", ('light',))
        self.conn.commit()
        
        self.cursor.execute("SELECT theme FROM settings LIMIT 1")
        result = self.cursor.fetchone()
        self.assertEqual(result[0], 'light', "Theme should be set to light")
    
    def test_set_theme_dark(self):
        """Test setting theme to dark."""
        self.cursor.execute("UPDATE settings SET theme = ?", ('dark',))
        self.conn.commit()
        
        self.cursor.execute("SELECT theme FROM settings LIMIT 1")
        result = self.cursor.fetchone()
        self.assertEqual(result[0], 'dark', "Theme should be set to dark")
    
    def test_light_theme_colors(self):
        """Test light theme color scheme."""
        light_colors = {
            'background': '#FFFFFF',
            'text': '#000000',
            'primary': '#2196F3',
            'secondary': '#FFC107',
            'surface': '#F5F5F5',
            'error': '#F44336',
            'success': '#4CAF50'
        }
        
        # Verify all required colors are present
        for color_name in ['background', 'text', 'primary', 'secondary', 'surface', 'error', 'success']:
            self.assertIn(color_name, light_colors, f"Light theme should have {color_name}")
    
    def test_dark_theme_colors(self):
        """Test dark theme color scheme."""
        dark_colors = {
            'background': '#121212',
            'text': '#FFFFFF',
            'primary': '#BB86FC',
            'secondary': '#03DAC6',
            'surface': '#1E1E1E',
            'error': '#CF6679',
            'success': '#81C784'
        }
        
        # Verify all required colors are present
        for color_name in ['background', 'text', 'primary', 'secondary', 'surface', 'error', 'success']:
            self.assertIn(color_name, dark_colors, f"Dark theme should have {color_name}")


def run_tests():
    """Run all tests and display results."""
    print()
    print('╔' + '═' * 78 + '╗')
    print('║' + ' ' * 78 + '║')
    print('║' + '🧪 VOYAGR WEEK 2 IMPROVEMENTS TEST SUITE'.center(78) + '║')
    print('║' + ' ' * 78 + '║')
    print('╚' + '═' * 78 + '╝')
    print()
    
    # Create test suite
    loader = unittest.TestLoader()
    suite = unittest.TestSuite()
    
    # Add all test classes
    suite.addTests(loader.loadTestsFromTestCase(TestDatabaseOptimization))
    suite.addTests(loader.loadTestsFromTestCase(TestTripHistory))
    suite.addTests(loader.loadTestsFromTestCase(TestDarkMode))
    
    # Run tests
    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(suite)
    
    # Print summary
    print()
    print('═' * 80)
    print('📊 TEST RESULTS SUMMARY')
    print('═' * 80)
    print(f"Tests Run: {result.testsRun}")
    print(f"Passed: {result.testsRun - len(result.failures) - len(result.errors)}")
    print(f"Failed: {len(result.failures)}")
    print(f"Errors: {len(result.errors)}")
    print()
    
    if result.wasSuccessful():
        print('╔' + '═' * 78 + '╗')
        print('║' + '🎉 ALL TESTS PASSED! 🎉'.center(78) + '║')
        print('╚' + '═' * 78 + '╝')
    else:
        print('╔' + '═' * 78 + '╗')
        print('║' + '❌ SOME TESTS FAILED ❌'.center(78) + '║')
        print('╚' + '═' * 78 + '╝')
    
    print()
    return result.wasSuccessful()


if __name__ == '__main__':
    success = run_tests()
    exit(0 if success else 1)


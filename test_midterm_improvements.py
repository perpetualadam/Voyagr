"""
Comprehensive test suite for mid-term improvements:
1. Real-Time Traffic Integration
2. Alternative Routes
3. Offline Maps
4. Community Reporting
"""

import unittest
import sqlite3
import time
import json
import os
from satnav import SatNavApp

class TestRealTimeTraffic(unittest.TestCase):
    """Test real-time traffic integration."""
    
    def setUp(self):
        """Set up test database."""
        self.app = SatNavApp()
    
    def test_fetch_traffic_data(self):
        """Test fetching traffic data."""
        result = self.app.fetch_traffic_data(51.5074, -0.1278, 5)
        self.assertIsNotNone(result)
        self.assertIn('location', result)
        self.assertIn('conditions', result)
        self.assertIn('incidents', result)
    
    def test_traffic_caching(self):
        """Test traffic data caching."""
        # First fetch
        result1 = self.app.fetch_traffic_data(51.5074, -0.1278, 5)
        # Second fetch (should use cache)
        result2 = self.app.fetch_traffic_data(51.5074, -0.1278, 5)
        self.assertEqual(result1, result2)
    
    def test_get_traffic_flow_speed(self):
        """Test getting traffic flow speed."""
        result = self.app.get_traffic_flow_speed(51.5074, -0.1278)
        self.assertIn('speed_kmh', result)
        self.assertIn('flow', result)
        self.assertIn('congestion_level', result)
    
    def test_calculate_traffic_delay(self):
        """Test calculating traffic delay."""
        # Create mock route
        mock_route = {
            'trip': {
                'legs': [{
                    'summary': {
                        'time': 3600,  # 1 hour
                        'length': 100000  # 100 km
                    }
                }]
            }
        }
        result = self.app.calculate_traffic_delay(mock_route)
        self.assertIn('delay_seconds', result)
        self.assertIn('estimated_time_seconds', result)
    
    def test_invalid_coordinates_traffic(self):
        """Test traffic with invalid coordinates."""
        result = self.app.fetch_traffic_data(91, -0.1278, 5)
        self.assertIn('error', result)


class TestAlternativeRoutes(unittest.TestCase):
    """Test alternative routes feature."""
    
    def setUp(self):
        """Set up test database."""
        self.app = SatNavApp()
    
    def test_calculate_alternative_routes(self):
        """Test calculating alternative routes."""
        routes = self.app.calculate_alternative_routes(
            51.5074, -0.1278, 52.5086, -1.8853, num_routes=3
        )
        self.assertIsInstance(routes, list)
    
    def test_compare_routes(self):
        """Test comparing routes."""
        routes = self.app.calculate_alternative_routes(
            51.5074, -0.1278, 52.5086, -1.8853, num_routes=2
        )
        if routes:
            comparison = self.app.compare_routes(routes)
            self.assertIn('routes', comparison)
            self.assertIn('best_time', comparison)
    
    def test_select_route(self):
        """Test selecting a route."""
        routes = self.app.calculate_alternative_routes(
            51.5074, -0.1278, 52.5086, -1.8853, num_routes=2
        )
        if routes:
            result = self.app.select_route(0)
            self.assertTrue(result)
    
    def test_invalid_route_selection(self):
        """Test selecting invalid route."""
        result = self.app.select_route(999)
        self.assertFalse(result)
    
    def test_invalid_coordinates_routes(self):
        """Test routes with invalid coordinates."""
        routes = self.app.calculate_alternative_routes(
            91, -0.1278, 52.5086, -1.8853
        )
        self.assertEqual(routes, [])


class TestOfflineMaps(unittest.TestCase):
    """Test offline maps feature."""
    
    def setUp(self):
        """Set up test database."""
        self.app = SatNavApp()
    
    def test_download_map_tiles(self):
        """Test downloading map tiles."""
        result = self.app.download_map_tiles(51.5074, -0.1278, 5)
        self.assertIn('status', result)
        self.assertIn('region_id', result)
    
    def test_get_available_offline_regions(self):
        """Test getting available offline regions."""
        # Download a region first
        self.app.download_map_tiles(51.5074, -0.1278, 5)
        regions = self.app.get_available_offline_regions()
        self.assertIsInstance(regions, list)
    
    def test_get_offline_storage_usage(self):
        """Test getting offline storage usage."""
        usage = self.app.get_offline_storage_usage()
        self.assertIn('total_mb', usage)
        self.assertIn('available_mb', usage)
        self.assertIn('usage_percent', usage)
    
    def test_delete_offline_region(self):
        """Test deleting offline region."""
        # Download a region first
        result = self.app.download_map_tiles(51.5074, -0.1278, 5)
        if 'region_id' in result:
            region_id = result['region_id']
            delete_result = self.app.delete_offline_region(region_id)
            self.assertTrue(delete_result)
    
    def test_update_offline_region(self):
        """Test updating offline region."""
        # Download a region first
        result = self.app.download_map_tiles(51.5074, -0.1278, 5)
        if 'region_id' in result:
            region_id = result['region_id']
            update_result = self.app.update_offline_region(region_id)
            self.assertTrue(update_result)
    
    def test_invalid_coordinates_offline(self):
        """Test offline maps with invalid coordinates."""
        result = self.app.download_map_tiles(91, -0.1278, 5)
        self.assertIn('error', result)


class TestCommunityReporting(unittest.TestCase):
    """Test community reporting feature."""
    
    def setUp(self):
        """Set up test database."""
        self.app = SatNavApp()
        self.app.user_id = "test_user"
    
    def test_submit_report(self):
        """Test submitting a report."""
        result = self.app.submit_report(
            51.5074, -0.1278, 'hazard', 'Pothole on main road'
        )
        self.assertIn('status', result)
        self.assertIn('report_id', result)
    
    def test_get_nearby_reports(self):
        """Test getting nearby reports."""
        # Submit a report first
        self.app.submit_report(51.5074, -0.1278, 'hazard', 'Test hazard')
        reports = self.app.get_nearby_reports(51.5074, -0.1278, 5)
        self.assertIsInstance(reports, list)
    
    def test_upvote_report(self):
        """Test upvoting a report."""
        result = self.app.submit_report(
            51.5074, -0.1278, 'incident', 'Test incident'
        )
        if 'report_id' in result:
            report_id = result['report_id']
            upvote_result = self.app.upvote_report(report_id)
            self.assertTrue(upvote_result)
    
    def test_flag_report(self):
        """Test flagging a report."""
        result = self.app.submit_report(
            51.5074, -0.1278, 'traffic', 'Test traffic'
        )
        if 'report_id' in result:
            report_id = result['report_id']
            flag_result = self.app.flag_report(report_id, 'spam')
            self.assertTrue(flag_result)
    
    def test_cleanup_expired_reports(self):
        """Test cleaning up expired reports."""
        count = self.app.cleanup_expired_reports()
        self.assertIsInstance(count, int)
    
    def test_get_community_statistics(self):
        """Test getting community statistics."""
        # Submit some reports
        self.app.submit_report(51.5074, -0.1278, 'hazard', 'Test 1')
        self.app.submit_report(51.5074, -0.1278, 'incident', 'Test 2')
        
        stats = self.app.get_community_statistics(days=30)
        self.assertIn('total_reports', stats)
        self.assertIn('report_types', stats)
    
    def test_invalid_report_type(self):
        """Test submitting report with invalid type."""
        result = self.app.submit_report(
            51.5074, -0.1278, 'invalid_type', 'Test'
        )
        self.assertIn('error', result)
    
    def test_invalid_coordinates_report(self):
        """Test report with invalid coordinates."""
        result = self.app.submit_report(
            91, -0.1278, 'hazard', 'Test'
        )
        self.assertIn('error', result)
    
    def test_rate_limiting(self):
        """Test report rate limiting."""
        # Set low rate limit for testing
        self.app.report_rate_limit = 2
        
        # Submit reports
        self.app.submit_report(51.5074, -0.1278, 'hazard', 'Test 1')
        self.app.submit_report(51.5074, -0.1278, 'hazard', 'Test 2')
        
        # Third report should fail
        result = self.app.submit_report(51.5074, -0.1278, 'hazard', 'Test 3')
        self.assertIn('error', result)


class TestDatabaseIntegration(unittest.TestCase):
    """Test database integration for all features."""
    
    def setUp(self):
        """Set up test database."""
        self.app = SatNavApp()
    
    def test_traffic_cache_table_exists(self):
        """Test traffic cache table exists."""
        self.app.cursor.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='traffic_cache'"
        )
        self.assertIsNotNone(self.app.cursor.fetchone())
    
    def test_alternative_routes_cache_table_exists(self):
        """Test alternative routes cache table exists."""
        self.app.cursor.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='alternative_routes_cache'"
        )
        self.assertIsNotNone(self.app.cursor.fetchone())
    
    def test_offline_maps_table_exists(self):
        """Test offline maps table exists."""
        self.app.cursor.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='offline_maps'"
        )
        self.assertIsNotNone(self.app.cursor.fetchone())
    
    def test_community_reports_table_exists(self):
        """Test community reports table exists."""
        self.app.cursor.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='community_reports'"
        )
        self.assertIsNotNone(self.app.cursor.fetchone())
    
    def test_database_indexes_created(self):
        """Test all database indexes are created."""
        indexes = [
            'idx_traffic_cache_location',
            'idx_traffic_incidents_location',
            'idx_alt_routes_cache_coords',
            'idx_offline_maps_tile',
            'idx_community_reports_location'
        ]
        
        for index_name in indexes:
            self.app.cursor.execute(
                "SELECT name FROM sqlite_master WHERE type='index' AND name=?",
                (index_name,)
            )
            self.assertIsNotNone(self.app.cursor.fetchone())


if __name__ == '__main__':
    unittest.main()


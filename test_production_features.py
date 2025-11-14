#!/usr/bin/env python3
"""
Test Suite for Production Features
Tests monitoring, alerting, backups, and security features
"""

import unittest
import sys
import os
from datetime import datetime

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

class TestProductionMonitoring(unittest.TestCase):
    """Test production monitoring module."""
    
    def setUp(self):
        """Set up test fixtures."""
        from production_monitoring import ProductionMonitor
        self.monitor = ProductionMonitor()
    
    def test_monitor_initialization(self):
        """Test monitor initializes correctly."""
        self.assertIsNotNone(self.monitor)
        self.assertEqual(self.monitor.request_count, 0)
        self.assertEqual(self.monitor.error_count, 0)
    
    def test_log_request(self):
        """Test logging requests."""
        self.monitor.log_request('/api/route', 'POST', 200, 100.5)
        self.assertEqual(self.monitor.request_count, 1)
        self.assertEqual(self.monitor.error_count, 0)
    
    def test_log_error_request(self):
        """Test logging error requests."""
        self.monitor.log_request('/api/route', 'POST', 500, 50.0)
        self.assertEqual(self.monitor.request_count, 1)
        self.assertEqual(self.monitor.error_count, 1)
    
    def test_cache_metrics(self):
        """Test cache metrics tracking."""
        self.monitor.log_cache_hit()
        self.monitor.log_cache_hit()
        self.monitor.log_cache_miss()
        
        self.assertEqual(self.monitor.cache_hits, 2)
        self.assertEqual(self.monitor.cache_misses, 1)
    
    def test_engine_tracking(self):
        """Test routing engine tracking."""
        self.monitor.log_engine_request('graphhopper', True, 150.0)
        self.monitor.log_engine_request('valhalla', False, 200.0)
        
        stats = self.monitor.engine_stats
        self.assertEqual(stats['graphhopper']['success'], 1)
        self.assertEqual(stats['valhalla']['failure'], 1)
    
    def test_get_metrics(self):
        """Test getting metrics."""
        self.monitor.log_request('/api/route', 'POST', 200, 100.0)
        self.monitor.log_cache_hit()
        
        metrics = self.monitor.get_metrics()
        
        self.assertIn('timestamp', metrics)
        self.assertIn('total_requests', metrics)
        self.assertIn('cache_hit_rate', metrics)
        self.assertEqual(metrics['total_requests'], 1)
    
    def test_health_status(self):
        """Test health status calculation."""
        self.monitor.log_request('/api/route', 'POST', 200, 100.0)
        
        health = self.monitor.get_health_status()
        
        self.assertIn('status', health)
        self.assertIn('issues', health)
        self.assertIn('metrics', health)

class TestAlertsNotifications(unittest.TestCase):
    """Test alerts and notifications module."""
    
    def setUp(self):
        """Set up test fixtures."""
        from alerts_notifications import AlertManager
        self.alert_manager = AlertManager()
    
    def test_alert_manager_initialization(self):
        """Test alert manager initializes correctly."""
        self.assertIsNotNone(self.alert_manager)
        self.assertIsNotNone(self.alert_manager.thresholds)
    
    def test_alert_thresholds(self):
        """Test alert thresholds are set."""
        self.assertGreater(self.alert_manager.thresholds['response_time_ms'], 0)
        self.assertGreater(self.alert_manager.thresholds['error_rate_percent'], 0)
    
    def test_send_alert(self):
        """Test sending alert."""
        # Should not raise exception
        self.alert_manager.send_alert(
            'test_alert',
            'Test Alert',
            'This is a test alert',
            'info'
        )
    
    def test_check_thresholds(self):
        """Test threshold checking."""
        metrics = {
            'avg_response_time': 1000,
            'error_rate': 2,
            'cache_hit_rate': 80,
            'engine_stats': {
                'graphhopper': {'success_rate': 95},
                'valhalla': {'success_rate': 90},
                'osrm': {'success_rate': 85}
            }
        }
        
        # Should not raise exception
        self.alert_manager.check_thresholds(metrics)

class TestBackupAutomation(unittest.TestCase):
    """Test backup automation module."""
    
    def setUp(self):
        """Set up test fixtures."""
        from backup_automation import BackupManager
        self.backup_manager = BackupManager()
    
    def test_backup_manager_initialization(self):
        """Test backup manager initializes correctly."""
        self.assertIsNotNone(self.backup_manager)
        self.assertIsNotNone(self.backup_manager.backup_dir)
    
    def test_backup_retention_policy(self):
        """Test retention policy is configured."""
        self.assertEqual(self.backup_manager.daily_retention, 7)
        self.assertEqual(self.backup_manager.weekly_retention, 4)
        self.assertEqual(self.backup_manager.monthly_retention, 12)
    
    def test_checksum_calculation(self):
        """Test checksum calculation."""
        import tempfile
        
        # Create temporary file
        with tempfile.NamedTemporaryFile(delete=False) as f:
            f.write(b'test data')
            temp_path = f.name
        
        try:
            checksum = self.backup_manager._calculate_checksum(temp_path)
            self.assertIsNotNone(checksum)
            self.assertEqual(len(checksum), 64)  # SHA256 hex length
        finally:
            os.unlink(temp_path)

class TestSecurityConfig(unittest.TestCase):
    """Test security configuration module."""
    
    def setUp(self):
        """Set up test fixtures."""
        from security_config import SecurityConfig, RateLimiter
        self.security_config = SecurityConfig()
        self.rate_limiter = RateLimiter(max_requests=10, window_seconds=60)
    
    def test_security_config_initialization(self):
        """Test security config initializes correctly."""
        self.assertIsNotNone(self.security_config)
    
    def test_rate_limiter_initialization(self):
        """Test rate limiter initializes correctly."""
        self.assertIsNotNone(self.rate_limiter)
        self.assertEqual(self.rate_limiter.max_requests, 10)
    
    def test_rate_limiter_allows_requests(self):
        """Test rate limiter allows requests within limit."""
        for i in range(10):
            self.assertTrue(self.rate_limiter.is_allowed('test_user'))
    
    def test_rate_limiter_blocks_excess_requests(self):
        """Test rate limiter blocks excess requests."""
        for i in range(10):
            self.rate_limiter.is_allowed('test_user')
        
        # 11th request should be blocked
        self.assertFalse(self.rate_limiter.is_allowed('test_user'))

class TestProductionIntegration(unittest.TestCase):
    """Integration tests for production features."""
    
    def test_all_modules_importable(self):
        """Test all production modules can be imported."""
        try:
            from production_monitoring import get_production_monitor
            from alerts_notifications import get_alert_manager
            from backup_automation import get_backup_manager
            from security_config import SecurityConfig, get_rate_limiter
            
            self.assertIsNotNone(get_production_monitor)
            self.assertIsNotNone(get_alert_manager)
            self.assertIsNotNone(get_backup_manager)
            self.assertIsNotNone(SecurityConfig)
            self.assertIsNotNone(get_rate_limiter)
        except ImportError as e:
            self.fail(f"Failed to import production modules: {str(e)}")
    
    def test_global_instances(self):
        """Test global instances can be created."""
        from production_monitoring import get_production_monitor
        from alerts_notifications import get_alert_manager
        from backup_automation import get_backup_manager
        from security_config import get_rate_limiter
        
        monitor = get_production_monitor()
        alert_mgr = get_alert_manager()
        backup_mgr = get_backup_manager()
        limiter = get_rate_limiter()
        
        self.assertIsNotNone(monitor)
        self.assertIsNotNone(alert_mgr)
        self.assertIsNotNone(backup_mgr)
        self.assertIsNotNone(limiter)

def run_tests():
    """Run all tests."""
    loader = unittest.TestLoader()
    suite = unittest.TestSuite()
    
    # Add test classes
    suite.addTests(loader.loadTestsFromTestCase(TestProductionMonitoring))
    suite.addTests(loader.loadTestsFromTestCase(TestAlertsNotifications))
    suite.addTests(loader.loadTestsFromTestCase(TestBackupAutomation))
    suite.addTests(loader.loadTestsFromTestCase(TestSecurityConfig))
    suite.addTests(loader.loadTestsFromTestCase(TestProductionIntegration))
    
    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(suite)
    
    return result.wasSuccessful()

if __name__ == '__main__':
    success = run_tests()
    sys.exit(0 if success else 1)


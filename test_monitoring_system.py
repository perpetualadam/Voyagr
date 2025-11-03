#!/usr/bin/env python3
"""
Test suite for Voyagr Routing Engine Monitoring System
Tests health checks, alerts, and cost tracking
"""

import pytest
import sqlite3
import time
import json
from datetime import datetime, timedelta
from routing_monitor import RoutingMonitor, ENGINES

# Test database
TEST_DB = 'test_monitoring.db'


class TestRoutingMonitor:
    """Test cases for RoutingMonitor class."""
    
    @pytest.fixture
    def monitor(self):
        """Create a test monitor instance."""
        monitor = RoutingMonitor(TEST_DB)
        yield monitor
        # Cleanup
        import os
        if os.path.exists(TEST_DB):
            os.remove(TEST_DB)
    
    def test_init_monitoring_db(self, monitor):
        """Test database initialization."""
        conn = sqlite3.connect(TEST_DB)
        cursor = conn.cursor()
        
        # Check tables exist
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
        tables = {row[0] for row in cursor.fetchall()}
        
        assert 'engine_health_checks' in tables
        assert 'engine_status' in tables
        assert 'routing_alerts' in tables
        assert 'oci_cost_tracking' in tables
        
        conn.close()
    
    def test_check_engine_health_up(self, monitor):
        """Test health check for a working engine."""
        # OSRM is public and should be up
        status, response_time, error = monitor.check_engine_health('osrm')
        
        assert status in ['up', 'down']
        assert response_time >= 0
        assert isinstance(error, str)
    
    def test_check_engine_health_invalid(self, monitor):
        """Test health check for invalid engine."""
        status, response_time, error = monitor.check_engine_health('invalid')
        
        assert status == 'unknown'
        assert error == 'Engine not found'
    
    def test_record_health_check(self, monitor):
        """Test recording health check results."""
        monitor.record_health_check('graphhopper', 'up', 45.2, '')
        
        conn = sqlite3.connect(TEST_DB)
        cursor = conn.cursor()
        
        cursor.execute('SELECT COUNT(*) FROM engine_health_checks')
        count = cursor.fetchone()[0]
        
        assert count == 1
        
        cursor.execute('SELECT status, response_time_ms FROM engine_health_checks LIMIT 1')
        row = cursor.fetchone()
        assert row[0] == 'up'
        assert row[1] == 45.2
        
        conn.close()
    
    def test_consecutive_failures_tracking(self, monitor):
        """Test tracking of consecutive failures."""
        # Record 3 failures
        for i in range(3):
            monitor.record_health_check('valhalla', 'down', 5000.0, 'Timeout')
        
        conn = sqlite3.connect(TEST_DB)
        cursor = conn.cursor()
        
        cursor.execute('SELECT consecutive_failures FROM engine_status WHERE engine_name = ?', ('valhalla',))
        failures = cursor.fetchone()[0]
        
        assert failures == 3
        
        conn.close()
    
    def test_alert_creation_on_threshold(self, monitor):
        """Test alert creation when threshold is reached."""
        # Record 3 failures to trigger alert
        for i in range(3):
            monitor.record_health_check('valhalla', 'down', 5000.0, 'Timeout')
        
        conn = sqlite3.connect(TEST_DB)
        cursor = conn.cursor()
        
        cursor.execute('SELECT COUNT(*) FROM routing_alerts WHERE engine_name = ?', ('valhalla',))
        alert_count = cursor.fetchone()[0]
        
        assert alert_count >= 1
        
        conn.close()
    
    def test_failure_reset_on_success(self, monitor):
        """Test that consecutive failures reset on success."""
        # Record 2 failures
        monitor.record_health_check('graphhopper', 'down', 5000.0, 'Error')
        monitor.record_health_check('graphhopper', 'down', 5000.0, 'Error')
        
        # Record success
        monitor.record_health_check('graphhopper', 'up', 45.0, '')
        
        conn = sqlite3.connect(TEST_DB)
        cursor = conn.cursor()
        
        cursor.execute('SELECT consecutive_failures FROM engine_status WHERE engine_name = ?', ('graphhopper',))
        failures = cursor.fetchone()[0]
        
        assert failures == 0
        
        conn.close()
    
    def test_get_engine_status(self, monitor):
        """Test retrieving engine status."""
        monitor.record_health_check('osrm', 'up', 38.5, '')
        
        status = monitor.get_engine_status('osrm')
        
        assert status is not None
        assert status['engine'] == 'osrm'
        assert status['status'] == 'up'
        assert status['consecutive_failures'] == 0
    
    def test_get_all_engine_status(self, monitor):
        """Test retrieving all engine statuses."""
        monitor.record_health_check('graphhopper', 'up', 45.0, '')
        monitor.record_health_check('valhalla', 'up', 52.0, '')
        monitor.record_health_check('osrm', 'up', 38.0, '')
        
        statuses = monitor.get_all_engine_status()
        
        assert len(statuses) == 3
        assert all(s is not None for s in statuses)
    
    def test_calculate_uptime(self, monitor):
        """Test uptime calculation."""
        # Record 10 checks: 8 up, 2 down
        for i in range(8):
            monitor.record_health_check('graphhopper', 'up', 45.0, '')
        for i in range(2):
            monitor.record_health_check('graphhopper', 'down', 5000.0, 'Error')
        
        uptime = monitor.calculate_uptime('graphhopper', hours=24)
        
        assert 75 <= uptime <= 85  # Should be around 80%
    
    def test_track_oci_cost(self, monitor):
        """Test OCI cost tracking."""
        monitor.track_oci_cost(bandwidth_gb=2.5, api_requests=1250)
        
        conn = sqlite3.connect(TEST_DB)
        cursor = conn.cursor()
        
        cursor.execute('SELECT bandwidth_gb, api_requests FROM oci_cost_tracking LIMIT 1')
        row = cursor.fetchone()
        
        assert row[0] == 2.5
        assert row[1] == 1250
        
        conn.close()
    
    def test_get_daily_costs(self, monitor):
        """Test retrieving daily costs."""
        monitor.track_oci_cost(bandwidth_gb=2.5, api_requests=1250)
        monitor.track_oci_cost(bandwidth_gb=1.5, api_requests=750)
        
        costs = monitor.get_daily_costs(days=30)
        
        assert len(costs) > 0
        assert 'date' in costs[0]
        assert 'bandwidth_gb' in costs[0]
        assert 'api_requests' in costs[0]
        assert 'estimated_cost' in costs[0]
    
    def test_get_recent_alerts(self, monitor):
        """Test retrieving recent alerts."""
        # Create alerts
        for i in range(3):
            monitor.record_health_check('valhalla', 'down', 5000.0, 'Timeout')
        
        alerts = monitor.get_recent_alerts(limit=10)
        
        assert len(alerts) > 0
        assert 'engine' in alerts[0]
        assert 'message' in alerts[0]
        assert 'severity' in alerts[0]
    
    def test_resolve_alert(self, monitor):
        """Test alert resolution."""
        # Create alert
        for i in range(3):
            monitor.record_health_check('valhalla', 'down', 5000.0, 'Timeout')
        
        alerts = monitor.get_recent_alerts(limit=1)
        alert_id = alerts[0]['id']
        
        monitor.resolve_alert(alert_id)
        
        conn = sqlite3.connect(TEST_DB)
        cursor = conn.cursor()
        
        cursor.execute('SELECT is_resolved FROM routing_alerts WHERE id = ?', (alert_id,))
        resolved = cursor.fetchone()[0]
        
        assert resolved == 1
        
        conn.close()


class TestMonitoringIntegration:
    """Integration tests for monitoring system."""
    
    @pytest.fixture
    def monitor(self):
        """Create a test monitor instance."""
        monitor = RoutingMonitor(TEST_DB)
        yield monitor
        import os
        if os.path.exists(TEST_DB):
            os.remove(TEST_DB)
    
    def test_full_monitoring_cycle(self, monitor):
        """Test a complete monitoring cycle."""
        # Simulate 3 health checks
        for cycle in range(3):
            for engine in ['graphhopper', 'valhalla', 'osrm']:
                status, response_time, error = monitor.check_engine_health(engine)
                monitor.record_health_check(engine, status, response_time, error)
            time.sleep(0.1)
        
        # Verify data was recorded
        statuses = monitor.get_all_engine_status()
        assert len(statuses) == 3
        
        conn = sqlite3.connect(TEST_DB)
        cursor = conn.cursor()
        
        cursor.execute('SELECT COUNT(*) FROM engine_health_checks')
        check_count = cursor.fetchone()[0]
        
        assert check_count >= 3
        
        conn.close()
    
    def test_cost_tracking_workflow(self, monitor):
        """Test cost tracking workflow."""
        # Track costs for multiple days
        for day in range(5):
            monitor.track_oci_cost(bandwidth_gb=2.0 + day * 0.5, api_requests=1000 + day * 100)
        
        costs = monitor.get_daily_costs(days=30)
        
        assert len(costs) > 0
        total_cost = sum(c['estimated_cost'] for c in costs)
        assert total_cost > 0


if __name__ == '__main__':
    pytest.main([__file__, '-v', '--tb=short'])


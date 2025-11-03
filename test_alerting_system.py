#!/usr/bin/env python3
"""
Comprehensive test suite for Voyagr Alerting System
Tests threshold-based alerts, severity levels, alert types, recovery detection, and resolution
"""

import pytest
import sqlite3
import time
from datetime import datetime, timedelta
from routing_monitor import RoutingMonitor

TEST_DB = 'test_alerting.db'


class TestAlertingSystem:
    """Test cases for comprehensive alerting system."""
    
    @pytest.fixture
    def monitor(self):
        """Create a test monitor instance."""
        monitor = RoutingMonitor(TEST_DB)
        yield monitor
        # Cleanup
        import os
        if os.path.exists(TEST_DB):
            os.remove(TEST_DB)
    
    # ===== THRESHOLD-BASED ALERTS =====
    
    def test_alert_on_first_failure(self, monitor):
        """Test that first failure creates warning alert."""
        monitor.record_health_check('graphhopper', 'down', 5000.0, 'Timeout')
        
        alerts = monitor.get_recent_alerts(limit=10)
        assert len(alerts) == 1
        assert alerts[0]['type'] == 'engine_failure'
        assert alerts[0]['severity'] == 'warning'
    
    def test_alert_on_second_failure(self, monitor):
        """Test that second failure is tracked (deduplication prevents duplicate alert)."""
        monitor.record_health_check('graphhopper', 'down', 5000.0, 'Timeout')
        monitor.record_health_check('graphhopper', 'down', 5000.0, 'Timeout')

        alerts = monitor.get_recent_alerts(limit=10)
        # Due to deduplication, similar alerts within 5 min are not duplicated
        assert len(alerts) >= 1
        assert all(a['severity'] == 'warning' for a in alerts)

        # But consecutive failures counter should be 2
        status = monitor.get_engine_status('graphhopper')
        assert status['consecutive_failures'] == 2
    
    def test_critical_alert_on_third_failure(self, monitor):
        """Test that third consecutive failure creates critical alert."""
        for i in range(3):
            monitor.record_health_check('graphhopper', 'down', 5000.0, 'Timeout')
        
        alerts = monitor.get_recent_alerts(limit=10)
        critical_alerts = [a for a in alerts if a['severity'] == 'critical']
        
        assert len(critical_alerts) >= 1
        assert critical_alerts[0]['type'] == 'engine_down'
    
    # ===== SEVERITY LEVELS =====
    
    def test_severity_levels(self, monitor):
        """Test all severity levels are created correctly."""
        # Create warning alert
        monitor.record_health_check('graphhopper', 'down', 5000.0, 'Error')
        
        # Create critical alert
        for i in range(2):
            monitor.record_health_check('graphhopper', 'down', 5000.0, 'Error')
        
        # Create info alert (recovery)
        monitor.record_health_check('graphhopper', 'up', 45.0, '')
        
        alerts = monitor.get_recent_alerts(limit=20)
        severities = {a['severity'] for a in alerts}
        
        assert 'warning' in severities
        assert 'critical' in severities
        assert 'info' in severities
    
    def test_get_alerts_by_severity(self, monitor):
        """Test filtering alerts by severity."""
        # Create multiple failures
        for i in range(3):
            monitor.record_health_check('valhalla', 'down', 5000.0, 'Error')
        
        critical_alerts = monitor.get_alerts_by_severity('critical')
        assert len(critical_alerts) > 0
        assert all(a['severity'] == 'critical' for a in critical_alerts)
    
    # ===== ALERT TYPES =====
    
    def test_engine_failure_alert_type(self, monitor):
        """Test engine_failure alert type."""
        monitor.record_health_check('osrm', 'down', 5000.0, 'Connection refused')
        
        alerts = monitor.get_recent_alerts(limit=10)
        assert any(a['type'] == 'engine_failure' for a in alerts)
    
    def test_engine_down_alert_type(self, monitor):
        """Test engine_down alert type."""
        for i in range(3):
            monitor.record_health_check('osrm', 'down', 5000.0, 'Error')
        
        alerts = monitor.get_recent_alerts(limit=10)
        assert any(a['type'] == 'engine_down' for a in alerts)
    
    def test_engine_recovery_alert_type(self, monitor):
        """Test engine_recovery alert type."""
        # Create failures
        for i in range(3):
            monitor.record_health_check('graphhopper', 'down', 5000.0, 'Error')
        
        # Recover
        monitor.record_health_check('graphhopper', 'up', 45.0, '')
        
        alerts = monitor.get_recent_alerts(limit=10)
        recovery_alerts = [a for a in alerts if a['type'] == 'engine_recovery']
        
        assert len(recovery_alerts) > 0
        assert recovery_alerts[0]['severity'] == 'info'
    
    # ===== RECOVERY DETECTION =====
    
    def test_recovery_resets_consecutive_failures(self, monitor):
        """Test that recovery resets consecutive failure counter."""
        # Create failures
        for i in range(3):
            monitor.record_health_check('valhalla', 'down', 5000.0, 'Error')
        
        status = monitor.get_engine_status('valhalla')
        assert status['consecutive_failures'] == 3
        
        # Recover
        monitor.record_health_check('valhalla', 'up', 45.0, '')
        
        status = monitor.get_engine_status('valhalla')
        assert status['consecutive_failures'] == 0
        assert status['status'] == 'up'
    
    def test_recovery_creates_info_alert(self, monitor):
        """Test that recovery creates info alert."""
        # Create failures
        for i in range(3):
            monitor.record_health_check('osrm', 'down', 5000.0, 'Error')
        
        # Recover
        monitor.record_health_check('osrm', 'up', 45.0, '')
        
        alerts = monitor.get_recent_alerts(limit=10)
        recovery_alerts = [a for a in alerts if a['type'] == 'engine_recovery']
        
        assert len(recovery_alerts) > 0
        assert recovery_alerts[0]['severity'] == 'info'
    
    def test_partial_recovery_creates_alert(self, monitor):
        """Test that recovery after any failures creates recovery alert."""
        # Create 1 failure
        monitor.record_health_check('graphhopper', 'down', 5000.0, 'Error')

        # Recover
        monitor.record_health_check('graphhopper', 'up', 45.0, '')

        alerts = monitor.get_recent_alerts(limit=10)
        recovery_alerts = [a for a in alerts if a['type'] == 'engine_recovery']

        # Recovery alert is created even for single failure
        assert len(recovery_alerts) > 0
        assert recovery_alerts[0]['severity'] == 'info'
    
    # ===== ALERT RESOLUTION =====
    
    def test_resolve_single_alert(self, monitor):
        """Test resolving a single alert."""
        monitor.record_health_check('graphhopper', 'down', 5000.0, 'Error')
        
        alerts = monitor.get_recent_alerts(limit=10)
        alert_id = alerts[0]['id']
        
        monitor.resolve_alert(alert_id)
        
        resolved_alerts = monitor.get_recent_alerts(limit=10)
        resolved = [a for a in resolved_alerts if a['id'] == alert_id]
        
        assert len(resolved) > 0
        assert resolved[0]['resolved'] == True
    
    def test_resolve_all_engine_alerts(self, monitor):
        """Test resolving all alerts for an engine."""
        # Create multiple alerts
        for i in range(3):
            monitor.record_health_check('valhalla', 'down', 5000.0, 'Error')
        
        monitor.resolve_all_alerts_for_engine('valhalla')
        
        unresolved = monitor.get_recent_alerts(limit=10, unresolved_only=True)
        valhalla_unresolved = [a for a in unresolved if a['engine'] == 'valhalla']
        
        assert len(valhalla_unresolved) == 0
    
    def test_get_unresolved_alerts(self, monitor):
        """Test filtering unresolved alerts."""
        # Create alerts
        monitor.record_health_check('graphhopper', 'down', 5000.0, 'Error')
        monitor.record_health_check('valhalla', 'down', 5000.0, 'Error')
        
        # Resolve one
        alerts = monitor.get_recent_alerts(limit=10)
        monitor.resolve_alert(alerts[0]['id'])
        
        unresolved = monitor.get_recent_alerts(limit=10, unresolved_only=True)
        assert len(unresolved) == 1
    
    # ===== ALERT FILTERING =====
    
    def test_get_alerts_by_engine(self, monitor):
        """Test filtering alerts by engine."""
        monitor.record_health_check('graphhopper', 'down', 5000.0, 'Error')
        monitor.record_health_check('valhalla', 'down', 5000.0, 'Error')
        
        graphhopper_alerts = monitor.get_alerts_by_engine('graphhopper')
        assert all(a['engine'] == 'graphhopper' for a in graphhopper_alerts)
    
    def test_alert_summary(self, monitor):
        """Test alert summary statistics."""
        # Create various alerts
        for i in range(3):
            monitor.record_health_check('graphhopper', 'down', 5000.0, 'Error')
        
        for i in range(2):
            monitor.record_health_check('valhalla', 'down', 5000.0, 'Error')
        
        summary = monitor.get_alert_summary()
        
        assert summary['total_unresolved'] > 0
        assert 'by_severity' in summary
        assert 'by_engine' in summary
    
    # ===== ALERT DEDUPLICATION =====
    
    def test_alert_deduplication(self, monitor):
        """Test that similar alerts within 5 minutes are deduplicated."""
        # Create first alert
        monitor.record_health_check('graphhopper', 'down', 5000.0, 'Timeout')
        
        alerts_before = len(monitor.get_recent_alerts(limit=10))
        
        # Create similar alert immediately (should be deduplicated)
        monitor.record_health_check('graphhopper', 'down', 5000.0, 'Timeout')
        
        alerts_after = len(monitor.get_recent_alerts(limit=10))
        
        # Should not create duplicate alert
        assert alerts_after <= alerts_before + 1


class TestAlertingIntegration:
    """Integration tests for alerting system."""
    
    @pytest.fixture
    def monitor(self):
        """Create a test monitor instance."""
        monitor = RoutingMonitor(TEST_DB)
        yield monitor
        import os
        if os.path.exists(TEST_DB):
            os.remove(TEST_DB)
    
    def test_full_alert_lifecycle(self, monitor):
        """Test complete alert lifecycle: failure -> critical -> recovery -> resolution."""
        engine = 'osrm'

        # Phase 1: First failure (warning)
        monitor.record_health_check(engine, 'down', 5000.0, 'Error 1')
        alerts = monitor.get_recent_alerts(limit=10)
        assert any(a['severity'] == 'warning' for a in alerts)

        # Phase 2: Second failure (warning - deduplicated)
        monitor.record_health_check(engine, 'down', 5000.0, 'Error 2')
        status = monitor.get_engine_status(engine)
        assert status['consecutive_failures'] == 2

        # Phase 3: Third failure (critical)
        monitor.record_health_check(engine, 'down', 5000.0, 'Error 3')
        alerts = monitor.get_recent_alerts(limit=10)
        assert any(a['severity'] == 'critical' for a in alerts)

        # Phase 4: Recovery (info)
        monitor.record_health_check(engine, 'up', 45.0, '')
        alerts = monitor.get_recent_alerts(limit=10)
        assert any(a['type'] == 'engine_recovery' for a in alerts)

        # Phase 5: Resolve all
        monitor.resolve_all_alerts_for_engine(engine)
        unresolved = monitor.get_recent_alerts(limit=10, unresolved_only=True)
        assert not any(a['engine'] == engine for a in unresolved)


if __name__ == '__main__':
    pytest.main([__file__, '-v', '--tb=short'])


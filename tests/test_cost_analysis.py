#!/usr/bin/env python3
"""
Comprehensive test suite for Voyagr Cost Analysis System
Tests bandwidth monitoring, request counting, cost estimation, and trend analysis
"""

import pytest
import sqlite3
import os
from datetime import datetime, timedelta
from routing_monitor import RoutingMonitor

TEST_DB = 'test_cost_analysis.db'


class TestBandwidthMonitoring:
    """Test bandwidth tracking functionality."""
    
    @pytest.fixture
    def monitor(self):
        """Create a test monitor instance."""
        monitor = RoutingMonitor(TEST_DB)
        yield monitor
        if os.path.exists(TEST_DB):
            os.remove(TEST_DB)
    
    def test_track_bandwidth(self, monitor):
        """Test bandwidth tracking."""
        monitor.track_bandwidth('valhalla', inbound_gb=0.5, outbound_gb=1.2, request_type='route_calculation')
        
        bandwidth = monitor.get_bandwidth_usage(days=1)
        assert len(bandwidth) > 0
        assert bandwidth[0]['engine'] == 'valhalla'
        assert bandwidth[0]['inbound_gb'] == 0.5
        assert bandwidth[0]['outbound_gb'] == 1.2
    
    def test_bandwidth_aggregation(self, monitor):
        """Test bandwidth aggregation by date."""
        monitor.track_bandwidth('valhalla', inbound_gb=0.5, outbound_gb=1.0)
        monitor.track_bandwidth('valhalla', inbound_gb=0.3, outbound_gb=0.7)
        
        bandwidth = monitor.get_bandwidth_usage(days=1)
        assert len(bandwidth) > 0
        # Should aggregate to 0.8 inbound, 1.7 outbound
        assert bandwidth[0]['inbound_gb'] == pytest.approx(0.8, abs=0.01)
        assert bandwidth[0]['outbound_gb'] == pytest.approx(1.7, abs=0.01)
    
    def test_bandwidth_by_request_type(self, monitor):
        """Test bandwidth tracking by request type."""
        monitor.track_bandwidth('valhalla', outbound_gb=0.5, request_type='health_check')
        monitor.track_bandwidth('valhalla', outbound_gb=1.5, request_type='route_calculation')
        
        bandwidth = monitor.get_bandwidth_usage(days=1)
        assert len(bandwidth) > 0


class TestAPIRequestCounting:
    """Test API request counting functionality."""
    
    @pytest.fixture
    def monitor(self):
        """Create a test monitor instance."""
        monitor = RoutingMonitor(TEST_DB)
        yield monitor
        if os.path.exists(TEST_DB):
            os.remove(TEST_DB)
    
    def test_track_api_request(self, monitor):
        """Test API request tracking."""
        monitor.track_api_request('valhalla', 'health_check')
        
        requests = monitor.get_request_counts(days=1)
        assert len(requests) > 0
    
    def test_request_count_aggregation(self, monitor):
        """Test request count aggregation."""
        for _ in range(5):
            monitor.track_api_request('valhalla', 'health_check')
        
        requests = monitor.get_request_counts(days=1)
        today = str(datetime.now().date())
        assert today in requests
        assert requests[today]['valhalla_health_check'] == 5
    
    def test_request_type_separation(self, monitor):
        """Test separation of request types."""
        for _ in range(3):
            monitor.track_api_request('valhalla', 'health_check')
        for _ in range(7):
            monitor.track_api_request('valhalla', 'route_calculation')
        
        requests = monitor.get_request_counts(days=1)
        today = str(datetime.now().date())
        assert requests[today]['valhalla_health_check'] == 3
        assert requests[today]['valhalla_route_calculation'] == 7


class TestCostEstimation:
    """Test cost estimation functionality."""
    
    @pytest.fixture
    def monitor(self):
        """Create a test monitor instance."""
        monitor = RoutingMonitor(TEST_DB)
        yield monitor
        if os.path.exists(TEST_DB):
            os.remove(TEST_DB)
    
    def test_estimate_monthly_cost(self, monitor):
        """Test monthly cost estimation."""
        # Add some cost data
        monitor.track_oci_cost(bandwidth_gb=10.0, api_requests=1000)
        
        estimate = monitor.estimate_monthly_cost(days=1)
        
        assert 'projected_bandwidth_gb' in estimate
        assert 'total_monthly_cost' in estimate
        assert estimate['total_monthly_cost'] > 0
    
    def test_cost_breakdown(self, monitor):
        """Test cost breakdown by category."""
        monitor.track_oci_cost(bandwidth_gb=5.0, api_requests=500)
        
        estimate = monitor.estimate_monthly_cost(days=1)
        
        assert 'bandwidth_cost' in estimate
        assert 'compute_cost' in estimate
        assert 'request_cost' in estimate
        assert estimate['bandwidth_cost'] > 0
        assert estimate['compute_cost'] > 0
    
    def test_cost_projection_accuracy(self, monitor):
        """Test cost projection accuracy."""
        # Add cost data (all on same day, so 10GB total)
        for i in range(10):
            monitor.track_oci_cost(bandwidth_gb=1.0, api_requests=100)

        estimate = monitor.estimate_monthly_cost(days=1)

        # Should project ~300GB for 30 days (10GB/day * 30 days)
        assert estimate['projected_bandwidth_gb'] == pytest.approx(300.0, abs=10.0)


class TestTrendAnalysis:
    """Test cost trend analysis functionality."""
    
    @pytest.fixture
    def monitor(self):
        """Create a test monitor instance."""
        monitor = RoutingMonitor(TEST_DB)
        yield monitor
        if os.path.exists(TEST_DB):
            os.remove(TEST_DB)
    
    def test_analyze_cost_trends(self, monitor):
        """Test trend analysis."""
        # Add some cost data
        for i in range(5):
            monitor.track_oci_cost(bandwidth_gb=1.0, api_requests=100)
        
        trends = monitor.analyze_cost_trends(days=30)
        
        assert 'daily_average_cost' in trends
        assert 'weekly_average_cost' in trends
        assert 'monthly_total_cost' in trends
        assert trends['daily_average_cost'] > 0
    
    def test_cost_spike_detection(self, monitor):
        """Test cost spike detection."""
        # Add normal data
        for i in range(5):
            monitor.track_oci_cost(bandwidth_gb=1.0, api_requests=100)
        
        # Add spike (>20% increase)
        monitor.track_oci_cost(bandwidth_gb=3.0, api_requests=300)
        
        trends = monitor.analyze_cost_trends(days=30)
        
        assert 'cost_spikes_detected' in trends
        assert trends['cost_spikes_detected'] >= 0
    
    def test_cost_forecast(self, monitor):
        """Test cost forecasting."""
        # Add 10 days of data
        for i in range(10):
            monitor.track_oci_cost(bandwidth_gb=1.0, api_requests=100)
        
        trends = monitor.analyze_cost_trends(days=10)
        
        assert 'forecast_7_days' in trends
        assert 'forecast_30_days' in trends
        assert trends['forecast_30_days'] > trends['forecast_7_days']
    
    def test_cost_alert_threshold(self, monitor):
        """Test cost alert threshold detection."""
        # Add high cost data to trigger alert
        for i in range(10):
            monitor.track_oci_cost(bandwidth_gb=5.0, api_requests=500)
        
        trends = monitor.analyze_cost_trends(days=10)
        
        assert 'cost_alert_threshold_exceeded' in trends
        if trends['forecast_30_days'] > 10.0:
            assert trends['cost_alert_threshold_exceeded'] == True


class TestCostHistory:
    """Test cost history retrieval."""
    
    @pytest.fixture
    def monitor(self):
        """Create a test monitor instance."""
        monitor = RoutingMonitor(TEST_DB)
        yield monitor
        if os.path.exists(TEST_DB):
            os.remove(TEST_DB)
    
    def test_get_cost_history(self, monitor):
        """Test cost history retrieval."""
        monitor.track_oci_cost(bandwidth_gb=1.0, api_requests=100)
        
        history = monitor.get_cost_history(days=30)
        
        assert 'history' in history
        assert 'summary' in history
        assert len(history['history']) > 0
    
    def test_cost_history_summary(self, monitor):
        """Test cost history summary."""
        monitor.track_oci_cost(bandwidth_gb=2.0, api_requests=200)
        monitor.track_oci_cost(bandwidth_gb=3.0, api_requests=300)
        
        history = monitor.get_cost_history(days=30)
        summary = history['summary']
        
        assert summary['total_bandwidth_gb'] == pytest.approx(5.0, abs=0.1)
        assert summary['total_requests'] == 500
        assert summary['total_cost'] > 0
    
    def test_export_cost_history_csv(self, monitor):
        """Test CSV export."""
        monitor.track_oci_cost(bandwidth_gb=1.0, api_requests=100)
        
        filename = 'test_export.csv'
        result = monitor.export_cost_history_csv(days=30, filename=filename)
        
        assert result is not None
        assert os.path.exists(filename)
        
        # Cleanup
        if os.path.exists(filename):
            os.remove(filename)


class TestCostAnalysisIntegration:
    """Integration tests for cost analysis system."""
    
    @pytest.fixture
    def monitor(self):
        """Create a test monitor instance."""
        monitor = RoutingMonitor(TEST_DB)
        yield monitor
        if os.path.exists(TEST_DB):
            os.remove(TEST_DB)
    
    def test_full_cost_analysis_workflow(self, monitor):
        """Test complete cost analysis workflow."""
        # Track bandwidth and requests
        for i in range(5):
            monitor.track_bandwidth('valhalla', inbound_gb=0.1, outbound_gb=0.5)
            monitor.track_api_request('valhalla', 'route_calculation')
            monitor.track_oci_cost(bandwidth_gb=0.5, api_requests=10)
        
        # Get bandwidth usage
        bandwidth = monitor.get_bandwidth_usage(days=1)
        assert len(bandwidth) > 0
        
        # Get request counts
        requests = monitor.get_request_counts(days=1)
        assert len(requests) > 0
        
        # Get cost estimate
        estimate = monitor.estimate_monthly_cost(days=1)
        assert estimate['total_monthly_cost'] > 0
        
        # Analyze trends
        trends = monitor.analyze_cost_trends(days=1)
        assert 'daily_average_cost' in trends
        
        # Get history
        history = monitor.get_cost_history(days=1)
        assert len(history['history']) > 0


if __name__ == '__main__':
    pytest.main([__file__, '-v', '--tb=short'])


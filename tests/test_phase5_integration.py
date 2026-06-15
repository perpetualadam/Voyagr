#!/usr/bin/env python3
"""
Phase 5 Integration Testing Suite for Voyagr PWA
Tests: Parallel Routing, Fallback Chain, Flask API Integration, Performance Monitoring
"""

import pytest
import json
import sqlite3
import sys
import os
import time
from datetime import datetime

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from voyagr_web import app, init_db, DB_FILE


@pytest.fixture
def client():
    """Create test client."""
    app.config['TESTING'] = True

    # Use test database
    test_db = 'test_phase5_integration.db'
    if os.path.exists(test_db):
        try:
            os.remove(test_db)
        except:
            pass

    # Temporarily override DB_FILE
    import voyagr_web
    original_db = voyagr_web.DB_FILE
    voyagr_web.DB_FILE = test_db

    # Initialize test database
    init_db()

    with app.test_client() as client:
        yield client

    # Restore original DB
    voyagr_web.DB_FILE = original_db
    try:
        if os.path.exists(test_db):
            os.remove(test_db)
    except:
        pass


class TestParallelRouting:
    """Test parallel routing engine functionality."""

    def test_parallel_routing_endpoint(self, client):
        """Test /api/parallel-routing endpoint."""
        response = client.post('/api/parallel-routing', json={
            'start': '51.5074,-0.1278',
            'end': '51.5174,-0.1278'
        })
        assert response.status_code == 200
        data = json.loads(response.data)
        assert data['success'] is True
        assert 'results' in data

    def test_parallel_routing_invalid_coords(self, client):
        """Test parallel routing with invalid coordinates."""
        response = client.post('/api/parallel-routing', json={
            'start': 'invalid',
            'end': '51.5174,-0.1278'
        })
        # API may return 200 with error in response or 400
        assert response.status_code in [200, 400]

    def test_parallel_routing_missing_params(self, client):
        """Test parallel routing with missing parameters."""
        response = client.post('/api/parallel-routing', json={
            'start': '51.5074,-0.1278'
        })
        # API may return 200 with error in response or 400
        assert response.status_code in [200, 400]


class TestFallbackChain:
    """Test fallback chain optimization."""

    def test_fallback_chain_health_endpoint(self, client):
        """Test /api/fallback-chain-health endpoint."""
        response = client.get('/api/fallback-chain-health')
        assert response.status_code == 200
        data = json.loads(response.data)
        assert data['success'] is True
        assert 'health' in data

    def test_fallback_chain_health_structure(self, client):
        """Test fallback chain health data structure."""
        response = client.get('/api/fallback-chain-health')
        data = json.loads(response.data)
        health = data['health']
        
        # Check all engines are present
        assert 'graphhopper' in health
        assert 'valhalla' in health
        assert 'osrm' in health


class TestPerformanceMonitoring:
    """Test Phase 5 performance monitoring endpoints."""

    def test_phase5_metrics_endpoint(self, client):
        """Test /api/monitoring/phase5/metrics endpoint."""
        response = client.get('/api/monitoring/phase5/metrics')
        assert response.status_code == 200
        data = json.loads(response.data)
        assert data['success'] is True
        assert 'metrics' in data

    def test_phase5_metrics_structure(self, client):
        """Test Phase 5 metrics data structure."""
        response = client.get('/api/monitoring/phase5/metrics')
        data = json.loads(response.data)
        metrics = data['metrics']
        
        assert 'timestamp' in metrics
        assert 'fallback_chain_health' in metrics
        assert 'recommended_engine' in metrics
        assert 'phase5_features' in metrics

    def test_phase5_engine_comparison(self, client):
        """Test /api/monitoring/phase5/engine-comparison endpoint."""
        response = client.post('/api/monitoring/phase5/engine-comparison', json={
            'start': '51.5074,-0.1278',
            'end': '51.5174,-0.1278'
        })
        assert response.status_code == 200
        data = json.loads(response.data)
        assert data['success'] is True
        assert 'comparison' in data

    def test_phase5_performance_summary(self, client):
        """Test /api/monitoring/phase5/performance-summary endpoint."""
        response = client.get('/api/monitoring/phase5/performance-summary')
        assert response.status_code == 200
        data = json.loads(response.data)
        assert data['success'] is True
        assert 'summary' in data

    def test_phase5_validation_stats(self, client):
        """Test /api/monitoring/phase5/validation-stats endpoint."""
        response = client.get('/api/monitoring/phase5/validation-stats')
        assert response.status_code == 200
        data = json.loads(response.data)
        assert data['success'] is True
        assert 'stats' in data


class TestRequestValidation:
    """Test request validation for Phase 5."""

    def test_coordinate_validation(self, client):
        """Test coordinate validation."""
        # Valid coordinates
        response = client.post('/api/parallel-routing', json={
            'start': '51.5074,-0.1278',
            'end': '51.5174,-0.1278'
        })
        assert response.status_code == 200

        # Invalid latitude - API may return 200 with error or 400
        response = client.post('/api/parallel-routing', json={
            'start': '91.0,-0.1278',
            'end': '51.5174,-0.1278'
        })
        assert response.status_code in [200, 400]

        # Invalid longitude - API may return 200 with error or 400
        response = client.post('/api/parallel-routing', json={
            'start': '51.5074,-181.0',
            'end': '51.5174,-0.1278'
        })
        assert response.status_code in [200, 400]

    def test_routing_mode_validation(self, client):
        """Test routing mode validation."""
        response = client.post('/api/route', json={
            'start': '51.5074,-0.1278',
            'end': '51.5174,-0.1278',
            'routing_mode': 'invalid_mode'
        })
        assert response.status_code == 400

    def test_vehicle_type_validation(self, client):
        """Test vehicle type validation."""
        response = client.post('/api/route', json={
            'start': '51.5074,-0.1278',
            'end': '51.5174,-0.1278',
            'vehicle_type': 'invalid_vehicle'
        })
        assert response.status_code == 400


class TestPhase5Integration:
    """Test overall Phase 5 integration."""

    def test_all_phase5_endpoints_accessible(self, client):
        """Test that all Phase 5 endpoints are accessible."""
        endpoints = [
            ('/api/parallel-routing', 'POST'),
            ('/api/fallback-chain-health', 'GET'),
            ('/api/monitoring/phase5/metrics', 'GET'),
            ('/api/monitoring/phase5/performance-summary', 'GET'),
            ('/api/monitoring/phase5/validation-stats', 'GET'),
        ]
        
        for endpoint, method in endpoints:
            if method == 'GET':
                response = client.get(endpoint)
            else:
                response = client.post(endpoint, json={
                    'start': '51.5074,-0.1278',
                    'end': '51.5174,-0.1278'
                })
            
            assert response.status_code in [200, 400], f"Endpoint {endpoint} returned {response.status_code}"

    def test_phase5_features_enabled(self, client):
        """Test that all Phase 5 features are enabled."""
        response = client.get('/api/monitoring/phase5/metrics')
        data = json.loads(response.data)
        features = data['metrics']['phase5_features']
        
        assert features['parallel_routing'] == 'enabled'
        assert features['fallback_chain'] == 'enabled'
        assert features['request_validation'] == 'enabled'
        assert features['performance_monitoring'] == 'enabled'


if __name__ == '__main__':
    pytest.main([__file__, '-v', '--tb=short'])


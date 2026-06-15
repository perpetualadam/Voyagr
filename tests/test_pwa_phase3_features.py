#!/usr/bin/env python3
"""
Tests for Voyagr PWA Phase 3 Features
Tests: Gesture Control, Battery Saving Mode, Map Themes, ML Predictions
"""

import pytest
import json
import sqlite3
import sys
import os
from datetime import datetime

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from voyagr_web import app, init_db, DB_FILE


@pytest.fixture
def client():
    """Create test client."""
    app.config['TESTING'] = True

    # Use test database
    test_db = 'test_voyagr_web_phase3.db'
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


class TestAppSettings:
    """Test app settings management."""
    
    def test_get_default_settings(self, client):
        """Test getting default app settings."""
        response = client.get('/api/app-settings')
        assert response.status_code == 200
        data = json.loads(response.data)
        assert data['success'] is True
        assert data['settings']['gesture_enabled'] == 1
        assert data['settings']['gesture_sensitivity'] == 'medium'
        assert data['settings']['map_theme'] == 'standard'
    
    def test_update_gesture_settings(self, client):
        """Test updating gesture settings."""
        response = client.post('/api/app-settings',
            json={'gesture_enabled': 0, 'gesture_sensitivity': 'high'}
        )
        assert response.status_code == 200
        data = json.loads(response.data)
        assert data['success'] is True
        
        # Verify update
        response = client.get('/api/app-settings')
        data = json.loads(response.data)
        assert data['settings']['gesture_enabled'] == 0
        assert data['settings']['gesture_sensitivity'] == 'high'
    
    def test_update_battery_mode(self, client):
        """Test updating battery saving mode."""
        response = client.post('/api/app-settings',
            json={'battery_saving_mode': 1}
        )
        assert response.status_code == 200
        
        response = client.get('/api/app-settings')
        data = json.loads(response.data)
        assert data['settings']['battery_saving_mode'] == 1
    
    def test_update_map_theme(self, client):
        """Test updating map theme."""
        response = client.post('/api/app-settings',
            json={'map_theme': 'dark'}
        )
        assert response.status_code == 200
        
        response = client.get('/api/app-settings')
        data = json.loads(response.data)
        assert data['settings']['map_theme'] == 'dark'


class TestGestureEvents:
    """Test gesture event logging."""
    
    def test_log_gesture_event(self, client):
        """Test logging gesture event."""
        response = client.post('/api/gesture-event',
            json={'gesture_type': 'shake', 'action': 'recalculate'}
        )
        assert response.status_code == 200
        data = json.loads(response.data)
        assert data['success'] is True
    
    def test_log_multiple_gestures(self, client):
        """Test logging multiple gesture events."""
        for i in range(3):
            response = client.post('/api/gesture-event',
                json={'gesture_type': 'shake', 'action': 'recalculate'}
            )
            assert response.status_code == 200


class TestMLPredictions:
    """Test ML prediction functionality."""
    
    def test_get_empty_predictions(self, client):
        """Test getting empty predictions."""
        response = client.get('/api/ml-predictions')
        assert response.status_code == 200
        data = json.loads(response.data)
        assert data['success'] is True
        assert data['predictions'] == []
    
    def test_record_trip_for_ml(self, client):
        """Test recording trip for ML training."""
        response = client.post('/api/ml-predictions',
            json={
                'start_lat': 51.5074,
                'start_lon': -0.1278,
                'end_lat': 51.5174,
                'end_lon': -0.1378,
                'duration_minutes': 30,
                'distance_km': 5.2,
                'fuel_cost': 1.50
            }
        )
        assert response.status_code == 200
        data = json.loads(response.data)
        assert data['success'] is True
    
    def test_get_predictions_after_recording(self, client):
        """Test getting predictions after recording trips."""
        # Record a trip
        client.post('/api/ml-predictions',
            json={
                'start_lat': 51.5074,
                'start_lon': -0.1278,
                'end_lat': 51.5174,
                'end_lon': -0.1378,
                'duration_minutes': 30,
                'distance_km': 5.2,
                'fuel_cost': 1.50
            }
        )
        
        # Get predictions
        response = client.get('/api/ml-predictions')
        data = json.loads(response.data)
        assert data['success'] is True
        # May or may not have predictions depending on current time
    
    def test_ml_prediction_structure(self, client):
        """Test ML prediction response structure."""
        # Record multiple trips
        for i in range(3):
            client.post('/api/ml-predictions',
                json={
                    'start_lat': 51.5074 + i*0.01,
                    'start_lon': -0.1278 + i*0.01,
                    'end_lat': 51.5174 + i*0.01,
                    'end_lon': -0.1378 + i*0.01,
                    'duration_minutes': 30 + i*5,
                    'distance_km': 5.2 + i*0.5,
                    'fuel_cost': 1.50 + i*0.2
                }
            )
        
        response = client.get('/api/ml-predictions')
        data = json.loads(response.data)
        assert data['success'] is True


class TestTrafficPatterns:
    """Test traffic pattern management."""
    
    def test_record_traffic_observation(self, client):
        """Test recording traffic observation."""
        response = client.post('/api/traffic-patterns',
            json={
                'lat': 51.5074,
                'lon': -0.1278,
                'congestion_level': 3,
                'speed_kmh': 25
            }
        )
        assert response.status_code == 200
        data = json.loads(response.data)
        assert data['success'] is True
    
    def test_get_traffic_patterns(self, client):
        """Test getting traffic patterns."""
        # Record observation
        client.post('/api/traffic-patterns',
            json={
                'lat': 51.5074,
                'lon': -0.1278,
                'congestion_level': 3,
                'speed_kmh': 25
            }
        )
        
        # Get patterns
        response = client.get('/api/traffic-patterns?lat=51.5074&lon=-0.1278')
        assert response.status_code == 200
        data = json.loads(response.data)
        assert data['success'] is True
        assert 'patterns' in data
    
    def test_traffic_patterns_missing_coords(self, client):
        """Test traffic patterns with missing coordinates."""
        response = client.get('/api/traffic-patterns')
        assert response.status_code == 200
        data = json.loads(response.data)
        assert data['success'] is False


class TestPhase3Integration:
    """Test Phase 3 features integration."""
    
    def test_gesture_and_battery_together(self, client):
        """Test gesture and battery settings together."""
        response = client.post('/api/app-settings',
            json={
                'gesture_enabled': 1,
                'gesture_sensitivity': 'high',
                'battery_saving_mode': 1
            }
        )
        assert response.status_code == 200
        
        response = client.get('/api/app-settings')
        data = json.loads(response.data)
        assert data['settings']['gesture_enabled'] == 1
        assert data['settings']['gesture_sensitivity'] == 'high'
        assert data['settings']['battery_saving_mode'] == 1
    
    def test_ml_and_traffic_together(self, client):
        """Test ML predictions and traffic patterns together."""
        # Record ML prediction
        client.post('/api/ml-predictions',
            json={
                'start_lat': 51.5074,
                'start_lon': -0.1278,
                'end_lat': 51.5174,
                'end_lon': -0.1378,
                'duration_minutes': 30,
                'distance_km': 5.2,
                'fuel_cost': 1.50
            }
        )
        
        # Record traffic pattern
        client.post('/api/traffic-patterns',
            json={
                'lat': 51.5074,
                'lon': -0.1278,
                'congestion_level': 2,
                'speed_kmh': 30
            }
        )
        
        # Verify both recorded
        ml_response = client.get('/api/ml-predictions')
        traffic_response = client.get('/api/traffic-patterns?lat=51.5074&lon=-0.1278')
        
        assert json.loads(ml_response.data)['success'] is True
        assert json.loads(traffic_response.data)['success'] is True


if __name__ == '__main__':
    pytest.main([__file__, '-v'])


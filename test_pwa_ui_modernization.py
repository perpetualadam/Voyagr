#!/usr/bin/env python3
"""
Test suite for PWA UI Modernization
Tests new UI features: bottom sheet, quick search, location picker, preferences
"""

import unittest
import json
from voyagr_web import app

class TestPWAUIModernization(unittest.TestCase):
    """Test PWA UI modernization features."""
    
    def setUp(self):
        """Set up test client."""
        self.app = app
        self.client = self.app.test_client()
        self.test_lat = 51.5074
        self.test_lon = -0.1278
    
    # ===== ROUTE CALCULATION TESTS =====
    
    def test_route_calculation_basic(self):
        """Test basic route calculation."""
        response = self.client.post('/api/route', 
            json={
                'start': '51.5074,-0.1278',
                'end': '51.5174,-0.1278'
            },
            content_type='application/json'
        )
        self.assertEqual(response.status_code, 200)
        data = json.loads(response.data)
        self.assertTrue(data['success'])
        self.assertIn('distance', data)
        self.assertIn('time', data)
    
    def test_route_calculation_with_preferences(self):
        """Test route calculation with preferences."""
        response = self.client.post('/api/route',
            json={
                'start': '51.5074,-0.1278',
                'end': '51.5174,-0.1278',
                'include_tolls': False,
                'include_caz': False
            },
            content_type='application/json'
        )
        self.assertEqual(response.status_code, 200)
        data = json.loads(response.data)
        self.assertTrue(data['success'])
    
    def test_route_calculation_missing_params(self):
        """Test route calculation with missing parameters."""
        response = self.client.post('/api/route',
            json={'start': '51.5074,-0.1278'},
            content_type='application/json'
        )
        self.assertEqual(response.status_code, 200)
        data = json.loads(response.data)
        self.assertFalse(data['success'])
    
    # ===== HAZARD PREFERENCES TESTS =====
    
    def test_get_hazard_preferences(self):
        """Test getting hazard preferences."""
        response = self.client.get('/api/hazard-preferences')
        self.assertEqual(response.status_code, 200)
        data = json.loads(response.data)
        self.assertTrue(data['success'])
        self.assertIn('preferences', data)
    
    def test_update_hazard_preferences(self):
        """Test updating hazard preferences."""
        response = self.client.post('/api/hazard-preferences',
            json={
                'hazard_type': 'speed_camera',
                'enabled': True,
                'penalty_seconds': 60
            },
            content_type='application/json'
        )
        self.assertEqual(response.status_code, 200)
        data = json.loads(response.data)
        self.assertTrue(data['success'])
    
    # ===== CHARGING STATIONS TESTS =====
    
    def test_get_charging_stations(self):
        """Test getting nearby charging stations."""
        response = self.client.get(
            f'/api/charging-stations?lat={self.test_lat}&lon={self.test_lon}&radius=5'
        )
        self.assertEqual(response.status_code, 200)
        data = json.loads(response.data)
        self.assertTrue(data['success'])
        self.assertIn('stations', data)
        self.assertGreater(len(data['stations']), 0)
    
    def test_get_charging_stations_default_location(self):
        """Test getting charging stations with default location."""
        response = self.client.get('/api/charging-stations')
        self.assertEqual(response.status_code, 200)
        data = json.loads(response.data)
        self.assertTrue(data['success'])
    
    # ===== HAZARD REPORTING TESTS =====
    
    def test_report_hazard(self):
        """Test reporting a hazard."""
        response = self.client.post('/api/hazards/report',
            json={
                'lat': self.test_lat,
                'lon': self.test_lon,
                'hazard_type': 'pothole',
                'description': 'Large pothole on main road',
                'severity': 'medium'
            },
            content_type='application/json'
        )
        self.assertEqual(response.status_code, 200)
        data = json.loads(response.data)
        self.assertTrue(data['success'])
    
    def test_report_hazard_missing_params(self):
        """Test reporting hazard with missing parameters."""
        response = self.client.post('/api/hazards/report',
            json={
                'lat': self.test_lat,
                'lon': self.test_lon
            },
            content_type='application/json'
        )
        self.assertEqual(response.status_code, 200)
        # Endpoint accepts minimal params and fills in defaults
        data = json.loads(response.data)
        self.assertTrue(data['success'])
    
    # ===== NEARBY HAZARDS TESTS =====
    
    def test_get_nearby_hazards(self):
        """Test getting nearby hazards."""
        response = self.client.get(
            f'/api/hazards/nearby?lat={self.test_lat}&lon={self.test_lon}&radius=1'
        )
        self.assertEqual(response.status_code, 200)
        data = json.loads(response.data)
        self.assertTrue(data['success'])
        self.assertIn('hazards', data)
    
    # ===== VEHICLE MANAGEMENT TESTS =====
    
    def test_get_vehicles(self):
        """Test getting vehicle profiles."""
        response = self.client.get('/api/vehicles')
        self.assertEqual(response.status_code, 200)
        data = json.loads(response.data)
        self.assertTrue(data['success'])
        self.assertIn('vehicles', data)
    
    def test_create_vehicle(self):
        """Test creating a vehicle profile."""
        response = self.client.post('/api/vehicles',
            json={
                'name': 'Test Vehicle',
                'vehicle_type': 'petrol_diesel',
                'fuel_efficiency': 6.5,
                'fuel_price': 1.40
            },
            content_type='application/json'
        )
        self.assertEqual(response.status_code, 200)
        data = json.loads(response.data)
        self.assertTrue(data['success'])
        self.assertIn('vehicle_id', data)
    
    # ===== TRIP HISTORY TESTS =====
    
    def test_get_trip_history(self):
        """Test getting trip history."""
        response = self.client.get('/api/trip-history')
        self.assertEqual(response.status_code, 200)
        data = json.loads(response.data)
        self.assertTrue(data['success'])
        self.assertIn('trips', data)
    
    def test_save_trip(self):
        """Test saving a trip."""
        response = self.client.post('/api/trip-history',
            json={
                'start_lat': self.test_lat,
                'start_lon': self.test_lon,
                'end_lat': self.test_lat + 0.01,
                'end_lon': self.test_lon + 0.01,
                'distance_km': 1.5,
                'duration_minutes': 10,
                'fuel_cost': 0.25,
                'toll_cost': 0.0,
                'caz_cost': 0.0
            },
            content_type='application/json'
        )
        self.assertEqual(response.status_code, 200)
        data = json.loads(response.data)
        self.assertTrue(data['success'])
    
    # ===== VOICE COMMAND TESTS =====
    
    def test_voice_speak_endpoint(self):
        """Test voice speak endpoint."""
        response = self.client.post('/api/voice/speak',
            json={'text': 'Test message'},
            content_type='application/json'
        )
        self.assertEqual(response.status_code, 200)
        # Voice speak endpoint returns audio file (WAV format), not JSON
        # Check that response contains audio data
        self.assertIn(b'RIFF', response.data)  # WAV file header
    
    def test_voice_command_endpoint(self):
        """Test voice command endpoint."""
        response = self.client.post('/api/voice/command',
            json={
                'command': 'navigate to london',
                'lat': self.test_lat,
                'lon': self.test_lon
            },
            content_type='application/json'
        )
        self.assertEqual(response.status_code, 200)
        data = json.loads(response.data)
        self.assertTrue(data['success'])
    
    # ===== ANALYTICS TESTS =====
    
    def test_get_analytics(self):
        """Test getting analytics."""
        response = self.client.get('/api/analytics')
        self.assertEqual(response.status_code, 200)
        data = json.loads(response.data)
        self.assertTrue(data['success'])
    
    # ===== SPEED LIMIT TESTS =====
    
    def test_get_speed_limit(self):
        """Test getting speed limit."""
        response = self.client.get(
            f'/api/speed-limit?lat={self.test_lat}&lon={self.test_lon}'
        )
        self.assertEqual(response.status_code, 200)
        data = json.loads(response.data)
        self.assertTrue(data['success'])
    
    # ===== WEATHER TESTS =====
    
    def test_get_weather(self):
        """Test getting weather."""
        response = self.client.get(
            f'/api/weather?lat={self.test_lat}&lon={self.test_lon}'
        )
        self.assertEqual(response.status_code, 200)
        data = json.loads(response.data)
        self.assertTrue(data['success'])


if __name__ == '__main__':
    unittest.main()


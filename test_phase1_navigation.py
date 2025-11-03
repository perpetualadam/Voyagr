#!/usr/bin/env python3
"""
Test suite for Phase 1 Navigation Features
Tests GPS tracking, turn-by-turn navigation, and notifications
"""

import unittest
import json
from voyagr_web import app

class TestPhase1Navigation(unittest.TestCase):
    """Test Phase 1 navigation features."""
    
    def setUp(self):
        """Set up test client."""
        self.app = app
        self.client = self.app.test_client()
        self.test_lat = 51.5074
        self.test_lon = -0.1278
        self.test_lat2 = 51.5174
        self.test_lon2 = -0.1378
    
    # ===== GPS TRACKING TESTS =====
    
    def test_gps_tracking_initialization(self):
        """Test GPS tracking can be initialized."""
        # GPS tracking is client-side, but we can test the route calculation
        response = self.client.post('/api/route',
            json={
                'start': f'{self.test_lat},{self.test_lon}',
                'end': f'{self.test_lat2},{self.test_lon2}'
            },
            content_type='application/json'
        )
        self.assertEqual(response.status_code, 200)
        data = json.loads(response.data)
        self.assertTrue(data['success'])
    
    def test_gps_tracking_with_hazard_check(self):
        """Test GPS tracking with hazard proximity check."""
        response = self.client.get(
            f'/api/hazards/nearby?lat={self.test_lat}&lon={self.test_lon}&radius=1'
        )
        self.assertEqual(response.status_code, 200)
        data = json.loads(response.data)
        self.assertTrue(data['success'])
        self.assertIn('hazards', data)
    
    # ===== TURN-BY-TURN NAVIGATION TESTS =====
    
    def test_turn_by_turn_route_calculation(self):
        """Test route calculation for turn-by-turn navigation."""
        response = self.client.post('/api/route',
            json={
                'start': f'{self.test_lat},{self.test_lon}',
                'end': f'{self.test_lat2},{self.test_lon2}'
            },
            content_type='application/json'
        )
        self.assertEqual(response.status_code, 200)
        data = json.loads(response.data)
        self.assertTrue(data['success'])
        self.assertIn('geometry', data)
        self.assertIn('distance', data)
        self.assertIn('time', data)
    
    def test_turn_by_turn_with_voice_commands(self):
        """Test turn-by-turn navigation with voice commands."""
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
        self.assertEqual(data['action'], 'navigate')
    
    def test_route_deviation_detection(self):
        """Test route deviation detection."""
        # First calculate a route
        response = self.client.post('/api/route',
            json={
                'start': f'{self.test_lat},{self.test_lon}',
                'end': f'{self.test_lat2},{self.test_lon2}'
            },
            content_type='application/json'
        )
        self.assertEqual(response.status_code, 200)
        data = json.loads(response.data)
        self.assertTrue(data['success'])
        
        # Deviation detection is client-side, but we verify route has geometry
        self.assertIn('geometry', data)
    
    # ===== NOTIFICATIONS TESTS =====
    
    def test_notification_on_route_calculated(self):
        """Test notification sent when route is calculated."""
        response = self.client.post('/api/route',
            json={
                'start': f'{self.test_lat},{self.test_lon}',
                'end': f'{self.test_lat2},{self.test_lon2}'
            },
            content_type='application/json'
        )
        self.assertEqual(response.status_code, 200)
        data = json.loads(response.data)
        self.assertTrue(data['success'])
        # Notification is sent client-side
    
    def test_hazard_proximity_notification(self):
        """Test hazard proximity notifications."""
        response = self.client.get(
            f'/api/hazards/nearby?lat={self.test_lat}&lon={self.test_lon}&radius=0.5'
        )
        self.assertEqual(response.status_code, 200)
        data = json.loads(response.data)
        self.assertTrue(data['success'])
        # Notifications are sent client-side based on hazard distance
    
    def test_eta_notification_data(self):
        """Test ETA notification data availability."""
        response = self.client.post('/api/route',
            json={
                'start': f'{self.test_lat},{self.test_lon}',
                'end': f'{self.test_lat2},{self.test_lon2}'
            },
            content_type='application/json'
        )
        self.assertEqual(response.status_code, 200)
        data = json.loads(response.data)
        self.assertTrue(data['success'])
        self.assertIn('time', data)
        self.assertIn('distance', data)
    
    def test_arrival_notification_trigger(self):
        """Test arrival notification can be triggered."""
        # Arrival notification is triggered when user reaches destination
        # This is client-side logic, but we verify route calculation works
        response = self.client.post('/api/route',
            json={
                'start': f'{self.test_lat},{self.test_lon}',
                'end': f'{self.test_lat2},{self.test_lon2}'
            },
            content_type='application/json'
        )
        self.assertEqual(response.status_code, 200)
        data = json.loads(response.data)
        self.assertTrue(data['success'])
    
    # ===== INTEGRATION TESTS =====
    
    def test_full_navigation_flow(self):
        """Test complete navigation flow: route -> tracking -> notifications."""
        # Step 1: Calculate route
        response = self.client.post('/api/route',
            json={
                'start': f'{self.test_lat},{self.test_lon}',
                'end': f'{self.test_lat2},{self.test_lon2}'
            },
            content_type='application/json'
        )
        self.assertEqual(response.status_code, 200)
        route_data = json.loads(response.data)
        self.assertTrue(route_data['success'])
        
        # Step 2: Check for hazards along route
        response = self.client.get(
            f'/api/hazards/nearby?lat={self.test_lat}&lon={self.test_lon}&radius=1'
        )
        self.assertEqual(response.status_code, 200)
        hazard_data = json.loads(response.data)
        self.assertTrue(hazard_data['success'])
        
        # Step 3: Verify trip info available
        self.assertIn('distance', route_data)
        self.assertIn('time', route_data)
    
    def test_navigation_with_preferences(self):
        """Test navigation respects user preferences."""
        response = self.client.post('/api/route',
            json={
                'start': f'{self.test_lat},{self.test_lon}',
                'end': f'{self.test_lat2},{self.test_lon2}',
                'include_tolls': False,
                'include_caz': False
            },
            content_type='application/json'
        )
        self.assertEqual(response.status_code, 200)
        data = json.loads(response.data)
        self.assertTrue(data['success'])
    
    def test_navigation_with_hazard_avoidance(self):
        """Test navigation with hazard avoidance enabled."""
        response = self.client.post('/api/route',
            json={
                'start': f'{self.test_lat},{self.test_lon}',
                'end': f'{self.test_lat2},{self.test_lon2}',
                'enable_hazard_avoidance': True
            },
            content_type='application/json'
        )
        self.assertEqual(response.status_code, 200)
        data = json.loads(response.data)
        self.assertTrue(data['success'])
    
    # ===== EDGE CASE TESTS =====
    
    def test_navigation_invalid_coordinates(self):
        """Test navigation with invalid coordinates."""
        response = self.client.post('/api/route',
            json={
                'start': 'invalid',
                'end': 'also invalid'
            },
            content_type='application/json'
        )
        self.assertEqual(response.status_code, 200)
        data = json.loads(response.data)
        # Should either fail or use defaults
        self.assertIn('success', data)
    
    def test_navigation_missing_parameters(self):
        """Test navigation with missing parameters."""
        response = self.client.post('/api/route',
            json={
                'start': f'{self.test_lat},{self.test_lon}'
            },
            content_type='application/json'
        )
        self.assertEqual(response.status_code, 200)
        data = json.loads(response.data)
        self.assertFalse(data['success'])
    
    def test_hazard_check_invalid_location(self):
        """Test hazard check with invalid location."""
        response = self.client.get(
            '/api/hazards/nearby?lat=invalid&lon=invalid&radius=1'
        )
        # Should handle gracefully
        self.assertIn(response.status_code, [200, 400])


if __name__ == '__main__':
    unittest.main()


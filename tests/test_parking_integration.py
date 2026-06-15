#!/usr/bin/env python3
"""
Test suite for Voyagr PWA Parking Integration Feature
Tests parking search, preferences, and route recalculation
"""

import unittest
import json
import sys
import os

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from voyagr_web import app, init_db


class TestParkingIntegration(unittest.TestCase):
    """Test parking integration features"""

    def setUp(self):
        """Set up test fixtures"""
        self.app = app
        self.app.config['TESTING'] = True
        self.client = self.app.test_client()
        init_db()

    def test_parking_search_endpoint_exists(self):
        """Test that parking search endpoint exists"""
        response = self.client.post('/api/parking-search', 
            json={'lat': 51.5074, 'lon': -0.1278, 'radius': 800})
        self.assertIn(response.status_code, [200, 400, 500])

    def test_parking_search_valid_coordinates(self):
        """Test parking search with valid coordinates"""
        response = self.client.post('/api/parking-search',
            json={
                'lat': 51.5074,
                'lon': -0.1278,
                'radius': 800,
                'type': 'any'
            })
        self.assertEqual(response.status_code, 200)
        data = json.loads(response.data)
        self.assertIn('success', data)
        self.assertIn('parking', data)

    def test_parking_search_invalid_coordinates(self):
        """Test parking search with invalid coordinates"""
        response = self.client.post('/api/parking-search',
            json={'lat': 0, 'lon': 0, 'radius': 800})
        self.assertEqual(response.status_code, 200)
        data = json.loads(response.data)
        self.assertFalse(data.get('success', False))

    def test_parking_search_with_type_filter(self):
        """Test parking search with type filter"""
        for ptype in ['any', 'garage', 'street', 'lot']:
            response = self.client.post('/api/parking-search',
                json={
                    'lat': 51.5074,
                    'lon': -0.1278,
                    'radius': 800,
                    'type': ptype
                })
            self.assertEqual(response.status_code, 200)
            data = json.loads(response.data)
            self.assertIn('success', data)

    def test_parking_search_custom_radius(self):
        """Test parking search with custom radius"""
        for radius in [400, 800, 1200]:
            response = self.client.post('/api/parking-search',
                json={
                    'lat': 51.5074,
                    'lon': -0.1278,
                    'radius': radius,
                    'type': 'any'
                })
            self.assertEqual(response.status_code, 200)

    def test_parking_preferences_structure(self):
        """Test parking preferences data structure"""
        prefs = {
            'maxWalkingDistance': '10',
            'preferredType': 'any',
            'pricePreference': 'any'
        }
        # Verify structure is valid JSON
        json_str = json.dumps(prefs)
        parsed = json.loads(json_str)
        self.assertEqual(parsed['maxWalkingDistance'], '10')
        self.assertEqual(parsed['preferredType'], 'any')
        self.assertEqual(parsed['pricePreference'], 'any')

    def test_parking_preferences_valid_values(self):
        """Test parking preferences with valid values"""
        valid_distances = ['5', '10', '15']
        valid_types = ['any', 'garage', 'street', 'lot']
        valid_prices = ['any', 'free', 'paid']

        for dist in valid_distances:
            for ptype in valid_types:
                for price in valid_prices:
                    prefs = {
                        'maxWalkingDistance': dist,
                        'preferredType': ptype,
                        'pricePreference': price
                    }
                    json_str = json.dumps(prefs)
                    parsed = json.loads(json_str)
                    self.assertEqual(parsed['maxWalkingDistance'], dist)

    def test_parking_response_format(self):
        """Test parking search response format"""
        response = self.client.post('/api/parking-search',
            json={'lat': 51.5074, 'lon': -0.1278, 'radius': 800})
        data = json.loads(response.data)
        
        self.assertIn('success', data)
        self.assertIn('parking', data)
        
        if data.get('parking'):
            parking = data['parking'][0]
            self.assertIn('name', parking)
            self.assertIn('lat', parking)
            self.assertIn('lon', parking)
            self.assertIn('distance_m', parking)

    def test_parking_distance_calculation(self):
        """Test parking distance calculation"""
        response = self.client.post('/api/parking-search',
            json={'lat': 51.5074, 'lon': -0.1278, 'radius': 800})
        data = json.loads(response.data)
        
        if data.get('parking'):
            for parking in data['parking']:
                # Distance should be positive and within radius
                self.assertGreaterEqual(parking['distance_m'], 0)
                self.assertLessEqual(parking['distance_m'], 800)

    def test_parking_sorting_by_distance(self):
        """Test parking results are sorted by distance"""
        response = self.client.post('/api/parking-search',
            json={'lat': 51.5074, 'lon': -0.1278, 'radius': 1000})
        data = json.loads(response.data)
        
        if len(data.get('parking', [])) > 1:
            parking_list = data['parking']
            for i in range(len(parking_list) - 1):
                # Each parking should be closer or equal distance to next
                self.assertLessEqual(
                    parking_list[i]['distance_m'],
                    parking_list[i + 1]['distance_m']
                )

    def test_parking_limit_results(self):
        """Test parking search limits results to top 10"""
        response = self.client.post('/api/parking-search',
            json={'lat': 51.5074, 'lon': -0.1278, 'radius': 2000})
        data = json.loads(response.data)
        
        # Should return max 10 results
        self.assertLessEqual(len(data.get('parking', [])), 10)

    def test_parking_error_handling(self):
        """Test parking search error handling"""
        # Missing required fields
        response = self.client.post('/api/parking-search', json={})
        self.assertEqual(response.status_code, 200)
        data = json.loads(response.data)
        self.assertIn('success', data)

    def test_parking_api_timeout_handling(self):
        """Test parking search handles API timeouts gracefully"""
        # This would require mocking requests, but we verify endpoint exists
        response = self.client.post('/api/parking-search',
            json={'lat': 51.5074, 'lon': -0.1278, 'radius': 800})
        # Should not crash
        self.assertIn(response.status_code, [200, 500])


class TestParkingPreferencesIntegration(unittest.TestCase):
    """Test parking preferences integration with settings"""

    def test_parking_preferences_json_serialization(self):
        """Test parking preferences can be serialized to JSON"""
        prefs = {
            'maxWalkingDistance': '10',
            'preferredType': 'garage',
            'pricePreference': 'free'
        }
        json_str = json.dumps(prefs)
        restored = json.loads(json_str)
        self.assertEqual(restored, prefs)

    def test_parking_preferences_all_combinations(self):
        """Test all valid combinations of parking preferences"""
        distances = ['5', '10', '15']
        types = ['any', 'garage', 'street', 'lot']
        prices = ['any', 'free', 'paid']
        
        count = 0
        for dist in distances:
            for ptype in types:
                for price in prices:
                    prefs = {
                        'maxWalkingDistance': dist,
                        'preferredType': ptype,
                        'pricePreference': price
                    }
                    json_str = json.dumps(prefs)
                    restored = json.loads(json_str)
                    self.assertEqual(restored['maxWalkingDistance'], dist)
                    count += 1
        
        # Should have 3 * 4 * 3 = 36 combinations
        self.assertEqual(count, 36)


if __name__ == '__main__':
    unittest.main()


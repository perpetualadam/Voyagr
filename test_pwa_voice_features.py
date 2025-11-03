#!/usr/bin/env python3
"""
Test suite for PWA Voice Features
Tests voice command parsing, TTS, and voice action handling
"""

import unittest
import json
from voyagr_web import app, parse_voice_command_web

class TestPWAVoiceFeatures(unittest.TestCase):
    """Test PWA voice command system."""
    
    def setUp(self):
        """Set up test client."""
        self.app = app
        self.client = self.app.test_client()
        self.test_lat = 51.5074
        self.test_lon = -0.1278
    
    # ===== NAVIGATION COMMAND TESTS =====
    
    def test_navigate_to_command(self):
        """Test 'navigate to' command."""
        result = parse_voice_command_web('navigate to manchester', self.test_lat, self.test_lon)
        self.assertTrue(result['success'])
        self.assertEqual(result['action'], 'navigate')
        self.assertEqual(result['location'], 'manchester')
    
    def test_go_to_command(self):
        """Test 'go to' command."""
        result = parse_voice_command_web('go to london', self.test_lat, self.test_lon)
        self.assertTrue(result['success'])
        self.assertEqual(result['action'], 'navigate')
        self.assertEqual(result['location'], 'london')
    
    def test_take_me_to_command(self):
        """Test 'take me to' command."""
        result = parse_voice_command_web('take me to birmingham', self.test_lat, self.test_lon)
        self.assertTrue(result['success'])
        self.assertEqual(result['action'], 'navigate')
        self.assertEqual(result['location'], 'birmingham')
    
    # ===== SEARCH COMMAND TESTS =====
    
    def test_find_gas_station(self):
        """Test 'find nearest gas station' command."""
        result = parse_voice_command_web('find nearest gas station', self.test_lat, self.test_lon)
        self.assertTrue(result['success'])
        self.assertEqual(result['action'], 'search')
        self.assertEqual(result['search_term'], 'gas station')
    
    def test_find_charging_station(self):
        """Test 'find nearest charging station' command."""
        result = parse_voice_command_web('find nearest charging station', self.test_lat, self.test_lon)
        self.assertTrue(result['success'])
        self.assertEqual(result['action'], 'search')
        self.assertEqual(result['search_term'], 'charging station')
    
    def test_find_restaurant(self):
        """Test 'find nearest restaurant' command."""
        result = parse_voice_command_web('find nearest restaurant', self.test_lat, self.test_lon)
        self.assertTrue(result['success'])
        self.assertEqual(result['action'], 'search')
        self.assertEqual(result['search_term'], 'restaurant')
    
    # ===== ROUTE PREFERENCE TESTS =====
    
    def test_avoid_tolls(self):
        """Test 'avoid tolls' command."""
        result = parse_voice_command_web('avoid tolls', self.test_lat, self.test_lon)
        self.assertTrue(result['success'])
        self.assertEqual(result['action'], 'set_preference')
        self.assertEqual(result['preference'], 'tolls')
        self.assertFalse(result['value'])
    
    def test_include_tolls(self):
        """Test 'include tolls' command."""
        result = parse_voice_command_web('include tolls', self.test_lat, self.test_lon)
        self.assertTrue(result['success'])
        self.assertEqual(result['action'], 'set_preference')
        self.assertEqual(result['preference'], 'tolls')
        self.assertTrue(result['value'])
    
    def test_avoid_caz(self):
        """Test 'avoid caz' command."""
        result = parse_voice_command_web('avoid caz', self.test_lat, self.test_lon)
        self.assertTrue(result['success'])
        self.assertEqual(result['action'], 'set_preference')
        self.assertEqual(result['preference'], 'caz')
        self.assertTrue(result['value'])
    
    def test_fastest_route(self):
        """Test 'fastest route' command."""
        result = parse_voice_command_web('fastest route', self.test_lat, self.test_lon)
        self.assertTrue(result['success'])
        self.assertEqual(result['action'], 'set_preference')
        self.assertEqual(result['preference'], 'route_type')
        self.assertEqual(result['value'], 'fastest')
    
    def test_cheapest_route(self):
        """Test 'cheapest route' command."""
        result = parse_voice_command_web('cheapest route', self.test_lat, self.test_lon)
        self.assertTrue(result['success'])
        self.assertEqual(result['action'], 'set_preference')
        self.assertEqual(result['preference'], 'route_type')
        self.assertEqual(result['value'], 'economical')
    
    # ===== INFORMATION COMMAND TESTS =====
    
    def test_eta_command(self):
        """Test 'ETA' command."""
        result = parse_voice_command_web('what is my eta', self.test_lat, self.test_lon)
        self.assertTrue(result['success'])
        self.assertEqual(result['action'], 'get_info')
        self.assertEqual(result['info_type'], 'eta')
    
    def test_cost_command(self):
        """Test 'cost' command."""
        result = parse_voice_command_web('how much will this cost', self.test_lat, self.test_lon)
        self.assertTrue(result['success'])
        self.assertEqual(result['action'], 'get_info')
        self.assertEqual(result['info_type'], 'cost')
    
    def test_traffic_command(self):
        """Test 'traffic' command."""
        result = parse_voice_command_web('what is the traffic like', self.test_lat, self.test_lon)
        self.assertTrue(result['success'])
        self.assertEqual(result['action'], 'get_info')
        self.assertEqual(result['info_type'], 'traffic')
    
    # ===== HAZARD REPORTING TESTS =====
    
    def test_report_speed_camera(self):
        """Test speed camera report."""
        result = parse_voice_command_web('report speed camera', self.test_lat, self.test_lon)
        self.assertTrue(result['success'])
        self.assertEqual(result['action'], 'report_hazard')
        self.assertEqual(result['hazard_type'], 'speed_camera')
    
    def test_report_traffic_light_camera(self):
        """Test traffic light camera report."""
        result = parse_voice_command_web('report traffic light camera', self.test_lat, self.test_lon)
        self.assertTrue(result['success'])
        self.assertEqual(result['action'], 'report_hazard')
        self.assertEqual(result['hazard_type'], 'traffic_light_camera')
    
    def test_report_pothole(self):
        """Test pothole report."""
        result = parse_voice_command_web('report pothole', self.test_lat, self.test_lon)
        self.assertTrue(result['success'])
        self.assertEqual(result['action'], 'report_hazard')
        self.assertEqual(result['hazard_type'], 'pothole')
    
    # ===== API ENDPOINT TESTS =====
    
    def test_voice_command_api(self):
        """Test /api/voice/command endpoint."""
        response = self.client.post('/api/voice/command',
            data=json.dumps({
                'command': 'navigate to london',
                'lat': self.test_lat,
                'lon': self.test_lon
            }),
            content_type='application/json'
        )
        self.assertEqual(response.status_code, 200)
        data = json.loads(response.data)
        self.assertTrue(data['success'])
        self.assertEqual(data['action'], 'navigate')
    
    def test_voice_speak_api(self):
        """Test /api/voice/speak endpoint."""
        response = self.client.post('/api/voice/speak',
            data=json.dumps({
                'text': 'Hello world'
            }),
            content_type='application/json'
        )
        self.assertEqual(response.status_code, 200)
    
    # ===== EDGE CASES =====
    
    def test_unrecognized_command(self):
        """Test unrecognized command."""
        result = parse_voice_command_web('xyz abc def', self.test_lat, self.test_lon)
        self.assertFalse(result['success'])
        self.assertIn('not recognized', result['error'].lower())
    
    def test_empty_command(self):
        """Test empty command."""
        result = parse_voice_command_web('', self.test_lat, self.test_lon)
        self.assertFalse(result['success'])
    
    def test_case_insensitivity(self):
        """Test case insensitivity."""
        result1 = parse_voice_command_web('NAVIGATE TO LONDON', self.test_lat, self.test_lon)
        result2 = parse_voice_command_web('navigate to london', self.test_lat, self.test_lon)
        self.assertEqual(result1['action'], result2['action'])
        self.assertEqual(result1['location'], result2['location'])

if __name__ == '__main__':
    unittest.main()


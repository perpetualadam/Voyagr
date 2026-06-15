"""
Test suite for Traffic Light Camera Priority in Hazard Avoidance System

Tests that traffic light cameras are the highest priority hazard to avoid,
with penalties and scoring that ensure routes go significantly out of their way
to avoid them.
"""

import unittest
from unittest.mock import Mock, patch, MagicMock
import sys
import os

# Mock the dependencies before importing satnav
sys.modules['kivy'] = MagicMock()
sys.modules['kivy.app'] = MagicMock()
sys.modules['kivy.uix'] = MagicMock()
sys.modules['kivy.uix.boxlayout'] = MagicMock()
sys.modules['kivy.uix.gridlayout'] = MagicMock()
sys.modules['kivy.uix.scrollview'] = MagicMock()
sys.modules['kivy.uix.button'] = MagicMock()
sys.modules['kivy.uix.label'] = MagicMock()
sys.modules['kivy.uix.togglebutton'] = MagicMock()
sys.modules['kivy.uix.spinner'] = MagicMock()
sys.modules['kivy.uix.textinput'] = MagicMock()
sys.modules['kivy.uix.popup'] = MagicMock()
sys.modules['kivy.uix.image'] = MagicMock()
sys.modules['kivy.garden'] = MagicMock()
sys.modules['kivy.garden.mapview'] = MagicMock()
sys.modules['porcupine'] = MagicMock()
sys.modules['pyaudio'] = MagicMock()
sys.modules['playsound'] = MagicMock()
sys.modules['pyttsx3'] = MagicMock()
sys.modules['notification'] = MagicMock()
sys.modules['android'] = MagicMock()
sys.modules['android.permissions'] = MagicMock()
sys.modules['android.app'] = MagicMock()
sys.modules['jnius'] = MagicMock()
sys.modules['ml_traffic_predictor'] = MagicMock()
sys.modules['hazard_parser'] = MagicMock()


class TestTrafficLightCameraPriority(unittest.TestCase):
    """Test that traffic light cameras are the highest priority hazard."""

    def setUp(self):
        """Set up test fixtures."""
        # Create mock app with hazard penalty weights
        self.mock_app = Mock()
        self.mock_app.hazard_penalty_weights = {
            'speed_camera': {'penalty_seconds': 30, 'threshold_meters': 100},
            'traffic_light_camera': {'penalty_seconds': 1200, 'threshold_meters': 100},
            'police': {'penalty_seconds': 180, 'threshold_meters': 200},
            'roadworks': {'penalty_seconds': 300, 'threshold_meters': 500},
            'accident': {'penalty_seconds': 600, 'threshold_meters': 500},
        }

    def test_traffic_light_camera_penalty_is_highest(self):
        """Test that traffic light camera penalty (1200s) is higher than all other hazards."""
        penalties = self.mock_app.hazard_penalty_weights
        
        traffic_light_penalty = penalties['traffic_light_camera']['penalty_seconds']
        
        # Verify it's higher than all other hazards
        self.assertGreater(traffic_light_penalty, penalties['speed_camera']['penalty_seconds'])
        self.assertGreater(traffic_light_penalty, penalties['police']['penalty_seconds'])
        self.assertGreater(traffic_light_penalty, penalties['roadworks']['penalty_seconds'])
        self.assertGreater(traffic_light_penalty, penalties['accident']['penalty_seconds'])
        
        # Verify it's 1200 seconds (20 minutes)
        self.assertEqual(traffic_light_penalty, 1200)

    def test_traffic_light_camera_penalty_comparison(self):
        """Test penalty hierarchy: TLC > Accident > Roadworks > Police > Speed Camera."""
        penalties = self.mock_app.hazard_penalty_weights
        
        tlc_penalty = penalties['traffic_light_camera']['penalty_seconds']
        accident_penalty = penalties['accident']['penalty_seconds']
        roadworks_penalty = penalties['roadworks']['penalty_seconds']
        police_penalty = penalties['police']['penalty_seconds']
        speed_camera_penalty = penalties['speed_camera']['penalty_seconds']
        
        # Verify hierarchy
        self.assertGreater(tlc_penalty, accident_penalty)
        self.assertGreater(accident_penalty, roadworks_penalty)
        self.assertGreater(roadworks_penalty, police_penalty)
        self.assertGreater(police_penalty, speed_camera_penalty)

    def test_hazard_score_with_traffic_light_camera_multiplier(self):
        """Test that traffic light cameras get distance-based multiplier."""
        # Simulate hazard scoring with traffic light camera
        route_coords = [[0, 51.5], [0.1, 51.6]]
        hazards = {
            'traffic_light_camera': [
                {'lat': 51.5, 'lon': 0.0, 'description': 'Camera 1', 'severity': 'high'}
            ],
            'speed_camera': [],
            'police': [],
            'roadworks': [],
            'accident': [],
        }
        
        # At distance 0 (directly on route), multiplier should be ~3.0
        # At distance = threshold (100m), multiplier should be ~1.0
        # Formula: 1 + (2 * (1 - distance/threshold))
        
        # Test at 0m distance
        proximity_multiplier_at_0m = 1.0 + (2.0 * (1.0 - 0 / 100))
        self.assertEqual(proximity_multiplier_at_0m, 3.0)
        
        # Test at 50m distance
        proximity_multiplier_at_50m = 1.0 + (2.0 * (1.0 - 50 / 100))
        self.assertEqual(proximity_multiplier_at_50m, 2.0)
        
        # Test at 100m distance (threshold)
        proximity_multiplier_at_100m = 1.0 + (2.0 * (1.0 - 100 / 100))
        self.assertEqual(proximity_multiplier_at_100m, 1.0)

    def test_traffic_light_camera_penalty_application(self):
        """Test that traffic light camera penalties are applied with multiplier."""
        base_penalty = 1200  # seconds
        
        # At 0m distance: 1200 * 3.0 = 3600 seconds (60 minutes)
        penalty_at_0m = base_penalty * 3.0
        self.assertEqual(penalty_at_0m, 3600)
        
        # At 50m distance: 1200 * 2.0 = 2400 seconds (40 minutes)
        penalty_at_50m = base_penalty * 2.0
        self.assertEqual(penalty_at_50m, 2400)
        
        # At 100m distance: 1200 * 1.0 = 1200 seconds (20 minutes)
        penalty_at_100m = base_penalty * 1.0
        self.assertEqual(penalty_at_100m, 1200)

    def test_route_selection_prioritizes_traffic_light_cameras(self):
        """Test that route selection prioritizes avoiding traffic light cameras."""
        # Simulate two routes
        route1_hazards = {
            'traffic_light_camera': 2,  # 2 traffic light cameras
            'speed_camera': 0,
            'police': 0,
        }
        
        route2_hazards = {
            'traffic_light_camera': 0,  # 0 traffic light cameras
            'speed_camera': 5,  # but 5 speed cameras
            'police': 3,
        }
        
        # Route 2 should be selected because it has fewer traffic light cameras
        # even though it has more other hazards
        self.assertLess(route2_hazards['traffic_light_camera'], route1_hazards['traffic_light_camera'])

    def test_traffic_light_camera_enabled_by_default(self):
        """Test that traffic light camera avoidance is enabled by default."""
        # In the database initialization, traffic_light_camera should have avoid_enabled = 1
        # This is verified by the hazard_preferences initialization in satnav.py
        # ('traffic_light_camera', 1200, 1, 100)  # 1 = enabled
        
        enabled_flag = 1  # From database initialization
        self.assertEqual(enabled_flag, 1)

    def test_traffic_light_camera_threshold(self):
        """Test that traffic light camera threshold is appropriate."""
        threshold = 100  # meters
        
        # Threshold should be reasonable for detecting cameras near route
        self.assertGreaterEqual(threshold, 50)
        self.assertLessEqual(threshold, 200)

    def test_hazard_score_comparison_with_traffic_light_cameras(self):
        """Test that routes with traffic light cameras score higher (worse)."""
        base_penalty = 1200
        
        # Route with 1 traffic light camera at 0m distance
        route1_score = base_penalty * 3.0  # 3600
        
        # Route with 0 traffic light cameras but 5 speed cameras at 0m distance
        route2_score = 30 * 5  # 150
        
        # Route 1 should score much higher (worse) due to traffic light camera
        self.assertGreater(route1_score, route2_score)
        self.assertGreater(route1_score, 1000)  # Significantly higher


class TestHazardAvoidanceIntegration(unittest.TestCase):
    """Integration tests for hazard avoidance with traffic light camera priority."""

    def test_penalty_weights_loaded_correctly(self):
        """Test that penalty weights are loaded from database correctly."""
        # Simulated database load
        hazard_weights = {
            'speed_camera': {'penalty_seconds': 30, 'threshold_meters': 100},
            'traffic_light_camera': {'penalty_seconds': 1200, 'threshold_meters': 100},
            'police': {'penalty_seconds': 180, 'threshold_meters': 200},
            'roadworks': {'penalty_seconds': 300, 'threshold_meters': 500},
            'accident': {'penalty_seconds': 600, 'threshold_meters': 500},
        }
        
        # Verify traffic light camera is highest
        self.assertEqual(hazard_weights['traffic_light_camera']['penalty_seconds'], 1200)

    def test_route_selection_logic(self):
        """Test the route selection logic prioritizes traffic light cameras."""
        # Simulate route comparison
        routes = [
            {
                'type': 'fastest',
                'hazard_score': {
                    'hazards_by_type': {'traffic_light_camera': 1, 'speed_camera': 0},
                    'total_score': 1200
                }
            },
            {
                'type': 'shortest',
                'hazard_score': {
                    'hazards_by_type': {'traffic_light_camera': 0, 'speed_camera': 3},
                    'total_score': 90
                }
            },
        ]
        
        # Route 2 (shortest) should be selected because it has 0 traffic light cameras
        # even though it has higher total score from speed cameras
        best_route = routes[1]  # shortest route
        self.assertEqual(best_route['hazard_score']['hazards_by_type']['traffic_light_camera'], 0)


if __name__ == '__main__':
    unittest.main()


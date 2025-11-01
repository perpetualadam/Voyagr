"""
Test suite for Speed Limit Detector module
Tests speed limit detection, smart motorway support, and speed warnings
"""

import unittest
import time
from speed_limit_detector import SpeedLimitDetector, SMART_MOTORWAYS, DEFAULT_SPEED_LIMITS


class TestSpeedLimitDetector(unittest.TestCase):
    """Test cases for SpeedLimitDetector class."""
    
    def setUp(self):
        """Set up test fixtures."""
        self.detector = SpeedLimitDetector()
    
    def test_initialization(self):
        """Test SpeedLimitDetector initialization."""
        self.assertIsNotNone(self.detector)
        self.assertIsNone(self.detector.current_speed_limit)
        self.assertEqual(self.detector.cache_expiry, 300)
    
    def test_get_speed_limit_for_location(self):
        """Test getting speed limit for a location."""
        result = self.detector.get_speed_limit_for_location(
            lat=51.5, lon=-0.1, road_type='motorway', vehicle_type='car'
        )
        
        self.assertIn('speed_limit_mph', result)
        self.assertIn('speed_limit_kmh', result)
        self.assertIn('road_type', result)
        self.assertIn('vehicle_type', result)
        self.assertGreater(result['speed_limit_mph'], 0)
    
    def test_smart_motorway_detection_m1(self):
        """Test detection of M1 smart motorway."""
        # M1 coordinates (approximate)
        result = self.detector._check_smart_motorway(lat=52.0, lon=-1.5)
        
        self.assertIn('is_smart_motorway', result)
        self.assertIn('motorway_name', result)
    
    def test_smart_motorway_detection_m25(self):
        """Test detection of M25 smart motorway."""
        # M25 coordinates (approximate)
        result = self.detector._check_smart_motorway(lat=51.4, lon=0.2)
        
        self.assertIn('is_smart_motorway', result)
        self.assertIn('motorway_name', result)
    
    def test_non_smart_motorway_location(self):
        """Test location not on smart motorway."""
        result = self.detector._check_smart_motorway(lat=55.0, lon=-3.0)
        
        self.assertFalse(result['is_smart_motorway'])
        self.assertIsNone(result['motorway_name'])
    
    def test_smart_motorway_speed_limit(self):
        """Test getting variable speed limit for smart motorway."""
        speed_limit = self.detector._get_smart_motorway_speed_limit(
            lat=52.0, lon=-1.5, motorway_name='M1'
        )
        
        self.assertIn(speed_limit, [50, 60, 70])
    
    def test_default_speed_limits(self):
        """Test default speed limits for road types."""
        self.assertEqual(DEFAULT_SPEED_LIMITS['motorway'], 70)
        self.assertEqual(DEFAULT_SPEED_LIMITS['trunk_road'], 70)
        self.assertEqual(DEFAULT_SPEED_LIMITS['primary_road'], 60)
        self.assertEqual(DEFAULT_SPEED_LIMITS['residential'], 30)
    
    def test_vehicle_specific_speed_limits(self):
        """Test vehicle-specific speed limits."""
        # Car on motorway
        result = self.detector.get_speed_limit_for_location(
            lat=51.5, lon=-0.1, road_type='motorway', vehicle_type='car'
        )
        self.assertEqual(result['vehicle_type'], 'car')
        
        # Truck on motorway (should be lower)
        result_truck = self.detector.get_speed_limit_for_location(
            lat=51.5, lon=-0.1, road_type='motorway', vehicle_type='truck'
        )
        self.assertEqual(result_truck['vehicle_type'], 'truck')
    
    def test_speed_violation_compliant(self):
        """Test speed violation check - compliant."""
        result = self.detector.check_speed_violation(
            current_speed_mph=60, speed_limit_mph=70, warning_threshold_mph=5
        )
        
        self.assertEqual(result['status'], 'compliant')
        self.assertEqual(result['color'], 'green')
    
    def test_speed_violation_approaching(self):
        """Test speed violation check - approaching limit."""
        result = self.detector.check_speed_violation(
            current_speed_mph=72, speed_limit_mph=70, warning_threshold_mph=5
        )

        self.assertEqual(result['status'], 'approaching')
        self.assertEqual(result['color'], 'amber')
    
    def test_speed_violation_exceeding(self):
        """Test speed violation check - exceeding limit."""
        result = self.detector.check_speed_violation(
            current_speed_mph=76, speed_limit_mph=70, warning_threshold_mph=5
        )
        
        self.assertEqual(result['status'], 'exceeding')
        self.assertEqual(result['color'], 'red')
    
    def test_speed_limit_change_detection(self):
        """Test detection of speed limit changes."""
        # First update
        self.detector._update_speed_limit(70)
        self.assertTrue(self.detector.get_speed_limit_changed())
        
        # Same speed limit
        self.detector._update_speed_limit(70)
        self.assertFalse(self.detector.get_speed_limit_changed())
        
        # Different speed limit
        self.detector._update_speed_limit(50)
        self.assertTrue(self.detector.get_speed_limit_changed())
    
    def test_cache_functionality(self):
        """Test speed limit caching."""
        # First call
        result1 = self.detector.get_speed_limit_for_location(
            lat=51.5, lon=-0.1, road_type='motorway', vehicle_type='car'
        )
        
        # Second call (should use cache)
        result2 = self.detector.get_speed_limit_for_location(
            lat=51.5, lon=-0.1, road_type='motorway', vehicle_type='car'
        )
        
        self.assertEqual(result1['speed_limit_mph'], result2['speed_limit_mph'])
    
    def test_cache_expiry(self):
        """Test cache expiry."""
        self.detector.cache_expiry = 1  # 1 second
        
        # First call
        self.detector.get_speed_limit_for_location(
            lat=51.5, lon=-0.1, road_type='motorway', vehicle_type='car'
        )
        
        # Wait for cache to expire
        time.sleep(1.1)
        
        # Cache should be expired
        cache_key = "51.5000,-0.1000"
        self.assertNotIn(cache_key, self.detector.speed_limit_cache)
    
    def test_clear_cache(self):
        """Test clearing cache."""
        # Manually add to cache to test clearing
        cache_key = "51.5000,-0.1000"
        self.detector.speed_limit_cache[cache_key] = {
            'speed_limit': 70,
            'timestamp': time.time()
        }

        self.assertGreater(len(self.detector.speed_limit_cache), 0)

        # Clear cache
        self.detector.clear_cache()

        self.assertEqual(len(self.detector.speed_limit_cache), 0)
    
    def test_error_handling(self):
        """Test error handling."""
        # Invalid coordinates
        result = self.detector.get_speed_limit_for_location(
            lat=999, lon=999, road_type='motorway', vehicle_type='car'
        )
        
        self.assertIn('speed_limit_mph', result)
        self.assertGreater(result['speed_limit_mph'], 0)


class TestSmartMotorways(unittest.TestCase):
    """Test cases for smart motorway support."""
    
    def setUp(self):
        """Set up test fixtures."""
        self.detector = SpeedLimitDetector()
    
    def test_smart_motorways_defined(self):
        """Test that smart motorways are defined."""
        self.assertGreater(len(SMART_MOTORWAYS), 0)
        self.assertIn('M1', SMART_MOTORWAYS)
        self.assertIn('M6', SMART_MOTORWAYS)
        self.assertIn('M25', SMART_MOTORWAYS)
        self.assertIn('M42', SMART_MOTORWAYS)
        self.assertIn('M62', SMART_MOTORWAYS)
    
    def test_smart_motorway_data_structure(self):
        """Test smart motorway data structure."""
        for motorway_name, motorway_data in SMART_MOTORWAYS.items():
            self.assertIn('sections', motorway_data)
            self.assertIn('active', motorway_data)
            self.assertTrue(motorway_data['active'])
            self.assertGreater(len(motorway_data['sections']), 0)


class TestSpeedWarnings(unittest.TestCase):
    """Test cases for speed warnings."""
    
    def setUp(self):
        """Set up test fixtures."""
        self.detector = SpeedLimitDetector()
    
    def test_speed_warning_threshold(self):
        """Test speed warning threshold."""
        # At threshold
        result = self.detector.check_speed_violation(
            current_speed_mph=75, speed_limit_mph=70, warning_threshold_mph=5
        )
        self.assertEqual(result['status'], 'exceeding')
        
        # Below threshold
        result = self.detector.check_speed_violation(
            current_speed_mph=74, speed_limit_mph=70, warning_threshold_mph=5
        )
        self.assertEqual(result['status'], 'approaching')
    
    def test_speed_diff_calculation(self):
        """Test speed difference calculation."""
        result = self.detector.check_speed_violation(
            current_speed_mph=75, speed_limit_mph=70, warning_threshold_mph=5
        )
        
        self.assertEqual(result['speed_diff_mph'], 5.0)
        self.assertEqual(result['current_speed_mph'], 75)
        self.assertEqual(result['speed_limit_mph'], 70)


if __name__ == '__main__':
    unittest.main()


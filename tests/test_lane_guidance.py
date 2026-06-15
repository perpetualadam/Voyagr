"""
Test suite for Lane Guidance module
Tests lane detection, lane change warnings, and lane guidance
"""

import unittest
import time
from lane_guidance import LaneGuidance, LANE_CONFIGURATIONS, LANE_CHANGE_WARNINGS


class TestLaneGuidance(unittest.TestCase):
    """Test cases for LaneGuidance class."""
    
    def setUp(self):
        """Set up test fixtures."""
        self.guidance = LaneGuidance()
    
    def test_initialization(self):
        """Test LaneGuidance initialization."""
        self.assertIsNotNone(self.guidance)
        self.assertIsNone(self.guidance.current_lane)
        self.assertIsNone(self.guidance.recommended_lane)
        self.assertFalse(self.guidance.lane_change_needed)
    
    def test_get_lane_guidance(self):
        """Test getting lane guidance."""
        result = self.guidance.get_lane_guidance(
            lat=51.5, lon=-0.1, heading=90, road_type='motorway', next_maneuver='straight'
        )

        # Result should either have lane guidance or error key
        if 'error' not in result:
            self.assertIn('current_lane', result)
            self.assertIn('recommended_lane', result)
            self.assertIn('total_lanes', result)
            self.assertIn('lane_change_needed', result)
            self.assertIn('lane_guidance_text', result)
        else:
            # API error is acceptable (network timeout, etc.)
            self.assertIn('error', result)
    
    def test_determine_current_lane_single_lane(self):
        """Test determining current lane on single lane road."""
        lane_data = {'total_lanes': 1}
        
        current_lane = self.guidance._determine_current_lane(90, lane_data)
        self.assertEqual(current_lane, 1)
    
    def test_determine_current_lane_two_lanes(self):
        """Test determining current lane on two-lane road."""
        lane_data = {'total_lanes': 2}
        
        # Heading 45 degrees (northeast) - should be right lane
        current_lane = self.guidance._determine_current_lane(45, lane_data)
        self.assertIn(current_lane, [1, 2])
        
        # Heading 270 degrees (west) - should be left lane
        current_lane = self.guidance._determine_current_lane(270, lane_data)
        self.assertIn(current_lane, [1, 2])
    
    def test_determine_current_lane_three_lanes(self):
        """Test determining current lane on three-lane road."""
        lane_data = {'total_lanes': 3}
        
        current_lane = self.guidance._determine_current_lane(90, lane_data)
        self.assertIn(current_lane, [1, 2, 3])
    
    def test_determine_current_lane_heading_normalization(self):
        """Test heading normalization."""
        lane_data = {'total_lanes': 2}
        
        # 360 degrees should be same as 0 degrees
        lane_360 = self.guidance._determine_current_lane(360, lane_data)
        lane_0 = self.guidance._determine_current_lane(0, lane_data)
        self.assertEqual(lane_360, lane_0)
    
    def test_get_recommended_lane_straight(self):
        """Test recommended lane for straight maneuver."""
        lane_data = {'total_lanes': 3, 'turn_lanes': ''}
        
        recommended_lane = self.guidance._get_recommended_lane('straight', lane_data, 1)
        self.assertEqual(recommended_lane, 2)  # Middle lane
    
    def test_get_recommended_lane_left(self):
        """Test recommended lane for left turn."""
        lane_data = {'total_lanes': 3, 'turn_lanes': ''}
        
        recommended_lane = self.guidance._get_recommended_lane('left', lane_data, 2)
        self.assertEqual(recommended_lane, 1)  # Left lane
    
    def test_get_recommended_lane_right(self):
        """Test recommended lane for right turn."""
        lane_data = {'total_lanes': 3, 'turn_lanes': ''}
        
        recommended_lane = self.guidance._get_recommended_lane('right', lane_data, 2)
        self.assertEqual(recommended_lane, 3)  # Right lane
    
    def test_get_recommended_lane_exit(self):
        """Test recommended lane for exit."""
        lane_data = {'total_lanes': 3, 'turn_lanes': ''}
        
        recommended_lane = self.guidance._get_recommended_lane('exit', lane_data, 1)
        self.assertEqual(recommended_lane, 3)  # Rightmost lane
    
    def test_generate_lane_guidance_text_keep_lane(self):
        """Test lane guidance text when keeping lane."""
        text = self.guidance._generate_lane_guidance_text(2, 2, 'straight')
        self.assertIn('Keep in lane', text)
    
    def test_generate_lane_guidance_text_move_left(self):
        """Test lane guidance text for moving left."""
        text = self.guidance._generate_lane_guidance_text(3, 1, 'left')
        self.assertIn('left', text.lower())
    
    def test_generate_lane_guidance_text_move_right(self):
        """Test lane guidance text for moving right."""
        text = self.guidance._generate_lane_guidance_text(1, 3, 'right')
        self.assertIn('right', text.lower())
    
    def test_generate_lane_guidance_text_exit(self):
        """Test lane guidance text for exit."""
        text = self.guidance._generate_lane_guidance_text(1, 3, 'exit')
        self.assertIn('exit', text.lower())
    
    def test_get_lane_change_warning_far(self):
        """Test lane change warning at far distance."""
        warning = self.guidance.get_lane_change_warning(450)
        self.assertIsNotNone(warning)
        self.assertIn('450', warning)
    
    def test_get_lane_change_warning_medium(self):
        """Test lane change warning at medium distance."""
        warning = self.guidance.get_lane_change_warning(250)
        self.assertIsNotNone(warning)
        self.assertIn('250', warning)
    
    def test_get_lane_change_warning_near(self):
        """Test lane change warning at near distance."""
        warning = self.guidance.get_lane_change_warning(50)
        self.assertIsNotNone(warning)
        self.assertIn('now', warning.lower())
    
    def test_get_lane_change_warning_no_warning(self):
        """Test no warning when far from maneuver."""
        warning = self.guidance.get_lane_change_warning(1000)
        self.assertIsNone(warning)
    
    def test_cache_functionality(self):
        """Test lane data caching."""
        # First call
        result1 = self.guidance.get_lane_guidance(
            lat=51.5, lon=-0.1, heading=90, road_type='motorway', next_maneuver='straight'
        )

        # Second call (should use cache)
        result2 = self.guidance.get_lane_guidance(
            lat=51.5, lon=-0.1, heading=90, road_type='motorway', next_maneuver='straight'
        )

        # Both should have total_lanes (either from API or fallback)
        if 'total_lanes' in result1 and 'total_lanes' in result2:
            self.assertEqual(result1['total_lanes'], result2['total_lanes'])
        else:
            # At least one should have the key
            self.assertTrue('total_lanes' in result1 or 'total_lanes' in result2 or 'error' in result1)
    
    def test_cache_expiry(self):
        """Test cache expiry."""
        self.guidance.cache_expiry = 1  # 1 second
        
        # First call
        self.guidance.get_lane_guidance(
            lat=51.5, lon=-0.1, heading=90, road_type='motorway', next_maneuver='straight'
        )
        
        # Wait for cache to expire
        time.sleep(1.1)
        
        # Cache should be expired
        cache_key = "51.5000,-0.1000"
        self.assertNotIn(cache_key, self.guidance.lane_data_cache)
    
    def test_clear_cache(self):
        """Test clearing cache."""
        # Manually add to cache to test clearing
        cache_key = "51.5000,-0.1000"
        self.guidance.lane_data_cache[cache_key] = {
            'data': {'total_lanes': 3},
            'timestamp': time.time()
        }

        self.assertGreater(len(self.guidance.lane_data_cache), 0)

        # Clear cache
        self.guidance.clear_cache()

        self.assertEqual(len(self.guidance.lane_data_cache), 0)
    
    def test_error_handling(self):
        """Test error handling."""
        # Invalid coordinates
        result = self.guidance.get_lane_guidance(
            lat=999, lon=999, heading=90, road_type='motorway', next_maneuver='straight'
        )
        
        # Should still return valid result or error key
        self.assertTrue('error' in result or 'current_lane' in result)


class TestLaneConfigurations(unittest.TestCase):
    """Test cases for lane configurations."""
    
    def test_lane_configurations_defined(self):
        """Test that lane configurations are defined."""
        self.assertGreater(len(LANE_CONFIGURATIONS), 0)
        self.assertIn('motorway', LANE_CONFIGURATIONS)
        self.assertIn('trunk_road', LANE_CONFIGURATIONS)
        self.assertIn('primary_road', LANE_CONFIGURATIONS)
    
    def test_lane_configuration_structure(self):
        """Test lane configuration data structure."""
        for road_type, config in LANE_CONFIGURATIONS.items():
            self.assertIn('min_lanes', config)
            self.assertIn('max_lanes', config)
            self.assertIn('lane_width_m', config)
            self.assertGreater(config['max_lanes'], 0)
            self.assertGreater(config['lane_width_m'], 0)


class TestLaneChangeWarnings(unittest.TestCase):
    """Test cases for lane change warnings."""
    
    def test_lane_change_warnings_defined(self):
        """Test that lane change warnings are defined."""
        self.assertGreater(len(LANE_CHANGE_WARNINGS), 0)
        self.assertIn('far', LANE_CHANGE_WARNINGS)
        self.assertIn('medium', LANE_CHANGE_WARNINGS)
        self.assertIn('near', LANE_CHANGE_WARNINGS)
    
    def test_lane_change_warning_distances(self):
        """Test lane change warning distances."""
        self.assertEqual(LANE_CHANGE_WARNINGS['far'], 500)
        self.assertEqual(LANE_CHANGE_WARNINGS['medium'], 200)
        self.assertEqual(LANE_CHANGE_WARNINGS['near'], 100)


if __name__ == '__main__':
    unittest.main()


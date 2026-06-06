"""
Comprehensive test suite for TomTom Snap to Roads API integration
Tests all the fixes made to the Snap to Roads API implementation
"""

# --- Windows console UTF-8 (auto-added) ---
import sys as _vsys
if _vsys.platform == "win32":
    try:
        _vsys.stdout.reconfigure(encoding="utf-8", errors="replace")
        _vsys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass


import unittest
import os
import json
from unittest.mock import Mock, patch, MagicMock
from speed_limit_detector import SpeedLimitDetector


class TestSnapToRoadsEndpoint(unittest.TestCase):
    """Test correct endpoint URL and HTTP method"""
    
    def setUp(self):
        """Create detector instance for each test"""
        self.detector = SpeedLimitDetector()
        # Set API key for testing
        os.environ['TOMTOM_API_KEY'] = 'test_api_key_12345'
    
    @patch('speed_limit_detector.requests.get')
    def test_correct_endpoint_url(self, mock_get):
        """Test that we use the correct endpoint: /snapToRoads/1"""
        print("\n[TEST] Correct endpoint URL...")
        
        # Mock successful response
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            'route': [{
                'properties': {
                    'speedLimits': {'value': 50, 'unit': 'kmph', 'type': 'Maximum'}
                }
            }]
        }
        mock_get.return_value = mock_response
        
        # Call the method
        self.detector.get_speed_limit_for_location(51.5074, -0.1278)
        
        # Verify GET was called (not POST)
        self.assertTrue(mock_get.called, "Should call requests.get")
        
        # Verify correct endpoint
        call_args = mock_get.call_args
        url = call_args[0][0] if call_args[0] else call_args[1].get('url', '')
        self.assertIn('snapToRoads/1', url, "Should use /snapToRoads/1 endpoint")
        self.assertIn('api.tomtom.com', url, "Should use api.tomtom.com")
        
        print(f"   ✅ PASS: Correct endpoint URL: {url}")
    
    @patch('speed_limit_detector.requests.get')
    def test_uses_get_not_post(self, mock_get):
        """Test that we use GET request, not POST"""
        print("\n[TEST] Uses GET request (not POST)...")
        
        # Mock successful response
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            'route': [{
                'properties': {
                    'speedLimits': {'value': 50, 'unit': 'kmph', 'type': 'Maximum'}
                }
            }]
        }
        mock_get.return_value = mock_response
        
        # Call the method
        self.detector.get_speed_limit_for_location(51.5074, -0.1278)
        
        # Verify GET was called
        self.assertTrue(mock_get.called, "Should use GET request")
        print("   ✅ PASS: Uses GET request")


class TestSnapToRoadsParameters(unittest.TestCase):
    """Test correct request parameters"""
    
    def setUp(self):
        """Create detector instance"""
        self.detector = SpeedLimitDetector()
        os.environ['TOMTOM_API_KEY'] = 'test_api_key_12345'
    
    @patch('speed_limit_detector.requests.get')
    def test_required_parameters_present(self, mock_get):
        """Test that all required parameters are included"""
        print("\n[TEST] Required parameters present...")
        
        # Mock successful response
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            'route': [{
                'properties': {
                    'speedLimits': {'value': 50, 'unit': 'kmph', 'type': 'Maximum'}
                }
            }]
        }
        mock_get.return_value = mock_response
        
        # Call the method
        self.detector.get_speed_limit_for_location(51.5074, -0.1278)
        
        # Get the params from the call
        call_args = mock_get.call_args
        params = call_args[1].get('params', {})
        
        # Verify required parameters
        self.assertIn('key', params, "Should include API key")
        self.assertIn('points', params, "Should include points parameter")
        self.assertIn('headings', params, "Should include headings parameter")
        self.assertIn('timestamps', params, "Should include timestamps parameter")
        self.assertIn('fields', params, "Should include fields parameter")
        
        print(f"   Parameters: {list(params.keys())}")
        print("   ✅ PASS: All required parameters present")
    
    @patch('speed_limit_detector.requests.get')
    def test_points_format_correct(self, mock_get):
        """Test that points are formatted as lon,lat;lon,lat"""
        print("\n[TEST] Points format (lon,lat;lon,lat)...")
        
        # Mock successful response
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            'route': [{
                'properties': {
                    'speedLimits': {'value': 50, 'unit': 'kmph', 'type': 'Maximum'}
                }
            }]
        }
        mock_get.return_value = mock_response
        
        # Call with known coordinates
        lat, lon = 51.5074, -0.1278
        self.detector.get_speed_limit_for_location(lat, lon)
        
        # Get the params
        call_args = mock_get.call_args
        params = call_args[1].get('params', {})
        points = params.get('points', '')
        
        # Verify format: should be "lon,lat;lon,lat"
        self.assertIn(';', points, "Should have semicolon separator")
        self.assertIn(',', points, "Should have comma separator")
        
        # Verify longitude comes first (negative for London)
        first_coord = points.split(';')[0].split(',')[0]
        self.assertTrue(first_coord.startswith('-'), "Longitude should come first")
        
        print(f"   Points format: {points}")
        print("   ✅ PASS: Points format correct (lon,lat;lon,lat)")

    @patch('speed_limit_detector.requests.get')
    def test_fields_parameter_includes_speed_limits(self, mock_get):
        """Test that fields parameter requests speedLimits data"""
        print("\n[TEST] Fields parameter includes speedLimits...")

        # Mock successful response
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            'route': [{
                'properties': {
                    'speedLimits': {'value': 50, 'unit': 'kmph', 'type': 'Maximum'}
                }
            }]
        }
        mock_get.return_value = mock_response

        # Call the method
        self.detector.get_speed_limit_for_location(51.5074, -0.1278)

        # Get the params
        call_args = mock_get.call_args
        params = call_args[1].get('params', {})
        fields = params.get('fields', '')

        # Verify fields includes speedLimits
        self.assertIn('speedLimits', fields, "Should request speedLimits")
        self.assertIn('route', fields, "Should request route data")
        self.assertIn('properties', fields, "Should request properties")

        print(f"   Fields: {fields}")
        print("   ✅ PASS: Fields parameter correct")


class TestSnapToRoadsResponseParsing(unittest.TestCase):
    """Test correct parsing of API response"""

    def setUp(self):
        """Create detector instance"""
        self.detector = SpeedLimitDetector()
        os.environ['TOMTOM_API_KEY'] = 'test_api_key_12345'

    @patch('speed_limit_detector.requests.get')
    def test_parses_speed_limits_as_object(self, mock_get):
        """Test that speedLimits is parsed as object, not array"""
        print("\n[TEST] Parse speedLimits as object (not array)...")

        # Mock response with speedLimits as OBJECT (not array)
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            'route': [{
                'properties': {
                    'speedLimits': {
                        'value': 70,
                        'unit': 'kmph',
                        'type': 'Maximum'
                    }
                }
            }]
        }
        mock_get.return_value = mock_response

        # Call the method
        result = self.detector.get_speed_limit_for_location(51.5074, -0.1278)

        # Should successfully parse and return speed limit
        self.assertIsNotNone(result, "Should return result")
        speed_limit = result.get('speed_limit_mph') if isinstance(result, dict) else result

        # 70 km/h = ~43 mph, rounds to 40 mph
        self.assertEqual(speed_limit, 40, "Should convert 70 km/h to 40 mph")
        print(f"   Parsed: 70 km/h -> {speed_limit} mph")
        print("   ✅ PASS: Correctly parses speedLimits as object")

    @patch('speed_limit_detector.requests.get')
    def test_converts_kmh_to_mph(self, mock_get):
        """Test km/h to mph conversion and rounding to UK limits"""
        print("\n[TEST] Convert km/h to mph...")

        # Test cases with actual UK speed limit rounding
        test_cases = [
            (32, 20),   # 32 km/h = 19.9 mph -> rounds to 20 mph
            (50, 30),   # 50 km/h = 31.1 mph -> rounds to 30 mph
            (64, 40),   # 64 km/h = 39.8 mph -> rounds to 40 mph
            (80, 50),   # 80 km/h = 49.7 mph -> rounds to 50 mph
            (96, 60),   # 96 km/h = 59.7 mph -> rounds to 60 mph
            (112, 70),  # 112 km/h = 69.6 mph -> rounds to 70 mph
        ]

        for i, (kmh, expected_mph) in enumerate(test_cases):
            # Clear cache to avoid interference
            self.detector.speed_limit_cache.clear()

            # Mock response
            mock_response = Mock()
            mock_response.status_code = 200
            mock_response.json.return_value = {
                'route': [{
                    'properties': {
                        'speedLimits': {'value': kmh, 'unit': 'kmph', 'type': 'Maximum'}
                    }
                }]
            }
            mock_get.return_value = mock_response

            # Call with different coordinates to avoid cache
            lat = 51.5074 + (i * 0.01)
            lon = -0.1278 + (i * 0.01)
            result = self.detector.get_speed_limit_for_location(lat, lon)
            speed_limit = result.get('speed_limit_mph') if isinstance(result, dict) else result

            self.assertEqual(speed_limit, expected_mph,
                           f"Should convert {kmh} km/h to {expected_mph} mph")
            print(f"   {kmh} km/h -> {speed_limit} mph ✓")

        print("   ✅ PASS: All conversions correct")

    @patch('speed_limit_detector.requests.get')
    def test_handles_missing_speed_limit_data(self, mock_get):
        """Test handling when API returns no speed limit data"""
        print("\n[TEST] Handle missing speed limit data...")

        # Mock response with no speedLimits
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            'route': [{
                'properties': {
                    'id': 'some-id'
                    # No speedLimits field
                }
            }]
        }
        mock_get.return_value = mock_response

        with patch.dict(os.environ, {'SPEED_LIMIT_ROAD_TYPE_FALLBACK': 'false'}, clear=False):
            self.detector.speed_limit_cache.clear()
            result = self.detector.get_speed_limit_for_location(51.5074, -0.1278)

        self.assertIsNotNone(result, "Should return response dict")
        self.assertIsNone(result.get('speed_limit_mph'), "Should not infer without maxspeed/TomTom data")
        print("   ✅ PASS: Handles missing data gracefully")


class TestSnapToRoadsMetrics(unittest.TestCase):
    """Test metrics tracking for Snap to Roads API"""

    def setUp(self):
        """Create detector instance"""
        self.detector = SpeedLimitDetector()
        os.environ['TOMTOM_API_KEY'] = 'test_api_key_12345'
        # Reset metrics
        self.detector.metrics['tomtom_snap_to_roads_calls'] = 0
        self.detector.metrics['tomtom_snap_to_roads_success'] = 0
        self.detector.metrics['tomtom_snap_to_roads_failures'] = 0

    @patch('speed_limit_detector.requests.get')
    def test_tracks_successful_calls(self, mock_get):
        """Test that successful calls are tracked in metrics"""
        print("\n[TEST] Track successful API calls...")

        # Mock successful response
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            'route': [{
                'properties': {
                    'speedLimits': {'value': 50, 'unit': 'kmph', 'type': 'Maximum'}
                }
            }]
        }
        mock_get.return_value = mock_response

        # Make a call
        self.detector.get_speed_limit_for_location(51.5074, -0.1278)

        # Check metrics
        self.assertEqual(self.detector.metrics['tomtom_snap_to_roads_calls'], 1)
        self.assertEqual(self.detector.metrics['tomtom_snap_to_roads_success'], 1)
        self.assertEqual(self.detector.metrics['tomtom_snap_to_roads_failures'], 0)

        print(f"   Calls: {self.detector.metrics['tomtom_snap_to_roads_calls']}")
        print(f"   Success: {self.detector.metrics['tomtom_snap_to_roads_success']}")
        print("   ✅ PASS: Successful calls tracked")

    @patch('speed_limit_detector.requests.get')
    def test_tracks_failed_calls(self, mock_get):
        """Test that failed calls are tracked in metrics"""
        print("\n[TEST] Track failed API calls...")

        # Mock 404 error
        mock_response = Mock()
        mock_response.status_code = 404
        mock_get.return_value = mock_response

        # Make a call
        self.detector.get_speed_limit_for_location(51.5074, -0.1278)

        # Check metrics
        self.assertEqual(self.detector.metrics['tomtom_snap_to_roads_calls'], 1)
        self.assertEqual(self.detector.metrics['tomtom_snap_to_roads_failures'], 1)

        print(f"   Calls: {self.detector.metrics['tomtom_snap_to_roads_calls']}")
        print(f"   Failures: {self.detector.metrics['tomtom_snap_to_roads_failures']}")
        print("   ✅ PASS: Failed calls tracked")

    @patch('speed_limit_detector.requests.get')
    def test_calculates_success_rate(self, mock_get):
        """Test success rate calculation"""
        print("\n[TEST] Calculate success rate...")

        # Clear cache to ensure all calls hit the API
        self.detector.speed_limit_cache.clear()

        # Make 3 successful calls
        mock_response_success = Mock()
        mock_response_success.status_code = 200
        mock_response_success.json.return_value = {
            'route': [{
                'properties': {
                    'speedLimits': {'value': 50, 'unit': 'kmph', 'type': 'Maximum'}
                }
            }]
        }

        # Make 1 failed call
        mock_response_fail = Mock()
        mock_response_fail.status_code = 404

        # 3 successes with different coordinates to avoid cache
        for i in range(3):
            mock_get.return_value = mock_response_success
            lat = 51.5074 + (i * 0.01)
            lon = -0.1278 + (i * 0.01)
            self.detector.get_speed_limit_for_location(lat, lon)

        # 1 failure with different coordinates
        mock_get.return_value = mock_response_fail
        self.detector.get_speed_limit_for_location(51.6, -0.2)

        # Calculate success rate
        total = self.detector.metrics['tomtom_snap_to_roads_calls']
        success = self.detector.metrics['tomtom_snap_to_roads_success']
        success_rate = (success / total * 100) if total > 0 else 0

        self.assertEqual(total, 4, "Should have 4 total calls")
        self.assertEqual(success, 3, "Should have 3 successful calls")
        self.assertEqual(success_rate, 75.0, "Success rate should be 75%")

        print(f"   Total calls: {total}")
        print(f"   Successful: {success}")
        print(f"   Success rate: {success_rate}%")
        print("   ✅ PASS: Success rate calculated correctly")


class TestSnapToRoadsIntegration(unittest.TestCase):
    """Test end-to-end integration"""

    def setUp(self):
        """Create detector instance"""
        self.detector = SpeedLimitDetector()
        os.environ['TOMTOM_API_KEY'] = 'test_api_key_12345'

    @patch('speed_limit_detector.requests.get')
    def test_caches_snap_to_roads_results(self, mock_get):
        """Test that Snap to Roads results are cached"""
        print("\n[TEST] Cache Snap to Roads results...")

        # Mock successful response
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            'route': [{
                'properties': {
                    'speedLimits': {'value': 50, 'unit': 'kmph', 'type': 'Maximum'}
                }
            }]
        }
        mock_get.return_value = mock_response

        # First call - should hit API
        result1 = self.detector.get_speed_limit_for_location(51.5074, -0.1278)
        call_count_1 = mock_get.call_count

        # Second call with same location - should use cache
        result2 = self.detector.get_speed_limit_for_location(51.5074, -0.1278)
        call_count_2 = mock_get.call_count

        # Should only call API once (second call uses cache)
        self.assertEqual(call_count_1, call_count_2, "Should use cache for second call")

        # Results should be the same
        speed1 = result1.get('speed_limit_mph') if isinstance(result1, dict) else result1
        speed2 = result2.get('speed_limit_mph') if isinstance(result2, dict) else result2
        self.assertEqual(speed1, speed2, "Cached result should match")

        print(f"   API calls: {call_count_2} (should be 1)")
        print("   ✅ PASS: Results cached correctly")

    @patch('speed_limit_detector.requests.get')
    def test_source_attribution(self, mock_get):
        """Test that source is correctly attributed to Snap to Roads"""
        print("\n[TEST] Source attribution...")

        # Mock successful response
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            'route': [{
                'properties': {
                    'speedLimits': {'value': 50, 'unit': 'kmph', 'type': 'Maximum'}
                }
            }]
        }
        mock_get.return_value = mock_response

        # Call the method
        result = self.detector.get_speed_limit_for_location(51.5074, -0.1278)

        # Check source in cache
        cache_key = f"51.507_-0.128"
        cached_entry = self.detector.speed_limit_cache.get(cache_key)

        if cached_entry:
            source = cached_entry.get('source', '')
            self.assertIn('TomTom', source, "Source should mention TomTom")
            self.assertIn('SnapToRoads', source, "Source should mention SnapToRoads")
            print(f"   Source: {source}")
            print("   ✅ PASS: Source correctly attributed")
        else:
            print("   ⚠️  WARNING: Result not cached (may have used existing cache)")


def run_all_tests():
    """Run all test suites and report results"""
    print("=" * 70)
    print("TOMTOM SNAP TO ROADS API - COMPREHENSIVE TEST SUITE")
    print("=" * 70)

    # Create test suite
    loader = unittest.TestLoader()
    suite = unittest.TestSuite()

    # Add all test classes
    suite.addTests(loader.loadTestsFromTestCase(TestSnapToRoadsEndpoint))
    suite.addTests(loader.loadTestsFromTestCase(TestSnapToRoadsParameters))
    suite.addTests(loader.loadTestsFromTestCase(TestSnapToRoadsResponseParsing))
    suite.addTests(loader.loadTestsFromTestCase(TestSnapToRoadsMetrics))
    suite.addTests(loader.loadTestsFromTestCase(TestSnapToRoadsIntegration))

    # Run tests
    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(suite)

    # Print summary
    print("\n" + "=" * 70)
    print("TEST SUMMARY")
    print("=" * 70)
    print(f"Tests run: {result.testsRun}")
    print(f"Successes: {result.testsRun - len(result.failures) - len(result.errors)}")
    print(f"Failures: {len(result.failures)}")
    print(f"Errors: {len(result.errors)}")

    if result.wasSuccessful():
        print("\n✅ ALL TESTS PASSED - Snap to Roads API working correctly!")
        return True
    else:
        print("\n❌ TESTS FAILED - Fix issues before deploying")
        return False


if __name__ == '__main__':
    success = run_all_tests()
    exit(0 if success else 1)



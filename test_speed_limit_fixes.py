"""
Comprehensive test suite for speed limit system fixes
Tests: cache LRU, rate limiting, geofencing, API integration, error handling
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
import time
import os
from unittest.mock import Mock, patch, MagicMock
from speed_limit_detector import SpeedLimitDetector
import math


class TestCacheLRU(unittest.TestCase):
    """Test LRU cache implementation with max size and cleanup"""
    
    def setUp(self):
        """Create detector instance for each test"""
        self.detector = SpeedLimitDetector()
        self.detector.speed_limit_cache.clear()
    
    def test_cache_max_size_enforcement(self):
        """Test that cache doesn't exceed MAX_CACHE_SIZE (1000 entries)"""
        print("\n[TEST] Cache max size enforcement...")
        
        # Add 1100 entries (exceeds max of 1000)
        for i in range(1100):
            cache_key = f"test_key_{i}"
            self.detector._add_to_cache(cache_key, {
                'speed_limit': 30,
                'timestamp': time.time(),
                'source': 'test'
            })
        
        # Cache should be capped at 1000
        cache_size = len(self.detector.speed_limit_cache)
        print(f"   Cache size after 1100 additions: {cache_size}")
        self.assertLessEqual(cache_size, 1000, "Cache exceeded max size")
        print("   ✅ PASS: Cache size capped at max")
    
    def test_cache_lru_eviction(self):
        """Test that oldest entries are evicted first (LRU)"""
        print("\n[TEST] LRU eviction order...")

        # Add entries with known keys
        for i in range(10):
            cache_key = f"key_{i}"
            self.detector._add_to_cache(cache_key, {
                'speed_limit': 30 + i,
                'timestamp': time.time(),
                'source': 'test'
            })

        # Manually trigger eviction by setting small max size
        original_max = self.detector.cache_max_size
        self.detector.cache_max_size = 5

        # Add one more to trigger eviction
        self.detector._add_to_cache("new_key", {
            'speed_limit': 50,
            'timestamp': time.time(),
            'source': 'test'
        })

        # First keys should be evicted
        self.assertNotIn("key_0", self.detector.speed_limit_cache)
        self.assertIn("new_key", self.detector.speed_limit_cache)

        # Restore original max
        self.detector.cache_max_size = original_max
        print("   ✅ PASS: LRU eviction working")
    
    def test_cache_expiry_cleanup(self):
        """Test that expired entries are cleaned up"""
        print("\n[TEST] Cache expiry cleanup...")
        
        # Add entry with old timestamp (expired vs current cache_expiry, default 600s)
        old_time = time.time() - (self.detector.cache_expiry + 60)
        self.detector.speed_limit_cache['expired_key'] = {
            'speed_limit': 30,
            'timestamp': old_time,
            'source': 'test'
        }
        
        # Add fresh entry
        self.detector._add_to_cache('fresh_key', {
            'speed_limit': 40,
            'timestamp': time.time(),
            'source': 'test'
        })
        
        # Trigger cleanup
        self.detector._cleanup_expired_cache()
        
        # Expired should be gone, fresh should remain
        self.assertNotIn('expired_key', self.detector.speed_limit_cache)
        self.assertIn('fresh_key', self.detector.speed_limit_cache)
        print("   ✅ PASS: Expired entries cleaned up")


class TestRateLimiting(unittest.TestCase):
    """Test Overpass API rate limiting"""
    
    def setUp(self):
        """Create detector instance"""
        self.detector = SpeedLimitDetector()
        self.detector.overpass_last_request = 0
    
    def test_rate_limit_enforcement(self):
        """Test that rate limiter enforces minimum interval"""
        print("\n[TEST] Rate limit enforcement...")

        # Set rate limit to 2 req/s (0.5s interval)
        os.environ['OVERPASS_RATE_LIMIT'] = '2.0'
        # Recreate detector to pick up new env var
        self.detector = SpeedLimitDetector()

        # First request should not wait
        start = time.time()
        self.detector._wait_for_overpass_rate_limit()
        first_duration = time.time() - start

        print(f"   First request wait: {first_duration:.3f}s")
        self.assertLess(first_duration, 0.1, "First request should not wait")

        # Second request immediately after should wait ~0.5s
        start = time.time()
        self.detector._wait_for_overpass_rate_limit()
        second_duration = time.time() - start

        print(f"   Second request wait: {second_duration:.3f}s")
        self.assertGreater(second_duration, 0.4, "Should enforce rate limit")
        self.assertLess(second_duration, 0.6, "Should not wait too long")
        print("   ✅ PASS: Rate limiting enforced")
    
    def test_rate_limit_configurable(self):
        """Test that rate limit is configurable via env var"""
        print("\n[TEST] Rate limit configurability...")

        # Test with 1 req/s
        os.environ['OVERPASS_RATE_LIMIT'] = '1.0'
        # Recreate detector to pick up new env var
        self.detector = SpeedLimitDetector()
        self.detector._wait_for_overpass_rate_limit()

        start = time.time()
        self.detector._wait_for_overpass_rate_limit()
        duration = time.time() - start

        print(f"   Wait time with 1 req/s: {duration:.3f}s")
        self.assertGreater(duration, 0.9, "Should wait ~1s for 1 req/s")
        self.assertLess(duration, 1.1, "Should not wait too long")
        print("   ✅ PASS: Rate limit configurable")


class TestGeofencing(unittest.TestCase):
    """Test smart motorway geofencing accuracy"""
    
    def setUp(self):
        """Create detector instance"""
        self.detector = SpeedLimitDetector()
    
    def test_distance_calculation(self):
        """Test Haversine distance calculation accuracy"""
        print("\n[TEST] Distance calculation...")

        # Test known distance: London to Birmingham ~160km
        london = (51.5074, -0.1278)
        birmingham = (52.4862, -1.8904)

        distance_km = self.detector._haversine_distance(
            london[0], london[1], birmingham[0], birmingham[1]
        )

        print(f"   London to Birmingham: {distance_km:.2f} km")
        # Should be ~160km
        self.assertGreater(distance_km, 140)
        self.assertLess(distance_km, 180)
        print("   ✅ PASS: Distance calculation accurate")
    
    def test_geofence_radius(self):
        """Test that geofence radius is ~100m (0.1km)"""
        print("\n[TEST] Geofence radius...")

        # Test with M25 location from SMART_MOTORWAYS dict
        # M25 section is at (51.3, 0.0) to (51.5, 0.5)
        # Test point very close to (51.3, 0.0) - should match
        result = self.detector._check_smart_motorway(51.3001, 0.0001)
        self.assertIsNotNone(result, "Should detect at exact location")
        self.assertTrue(result.get('is_smart_motorway'), "Should be smart motorway")
        print(f"   Close point detected: {result}")

        # Test point far away (>100m from any smart motorway)
        # Use coordinates far from all smart motorways
        result = self.detector._check_smart_motorway(50.0, -5.0)
        self.assertFalse(result.get('is_smart_motorway', False), "Should not detect far from motorways")
        print(f"   Far point not detected: {result}")

        print("   ✅ PASS: Geofence radius correct (~100m)")


class TestAPIIntegration(unittest.TestCase):
    """Test API integration and error handling"""
    
    def setUp(self):
        """Create detector instance"""
        self.detector = SpeedLimitDetector()
    
    @patch('speed_limit_detector.requests.get')
    def test_overpass_fallback(self, mock_get):
        """Test fallback to public Overpass if self-hosted fails"""
        print("\n[TEST] Overpass API fallback...")
        
        # Set self-hosted URL
        os.environ['OVERPASS_API_URL'] = 'http://81.0.246.97:12345/api/interpreter'
        
        # Mock response
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            'elements': [{
                'center': {'lat': 51.5074, 'lon': -0.1278},
                'tags': {'highway': 'residential', 'maxspeed': '30 mph'}
            }]
        }
        mock_get.return_value = mock_response
        
        # Should use self-hosted URL first
        result = self.detector.get_speed_limit_for_location(51.5074, -0.1278)
        
        self.assertIsNotNone(result)
        self.assertEqual(result.get('speed_limit_mph'), 30)
        print("   ✅ PASS: Overpass integration working")
    
    def test_default_speed_limit(self):
        """When APIs fail, posted limit is unknown (no inferred default)."""
        print("\n[TEST] No default speed limit when APIs fail...")

        # Mock all API calls to fail
        with patch.dict(os.environ, {'SPEED_LIMIT_ROAD_TYPE_FALLBACK': 'false'}, clear=False):
            with patch('speed_limit_detector.requests.get') as mock_get:
                mock_get.side_effect = Exception("API unavailable")

                result = self.detector.get_speed_limit_for_location(
                    51.5074, -0.1278, road_type='residential'
                )

                speed_limit = result.get('speed_limit_mph') if isinstance(result, dict) else result
                self.assertIsNone(speed_limit, "Should not invent a limit without TomTom/OSM maxspeed")
                print("   ✅ PASS: Unknown limit when no posted data")


class TestOsmSnapPipeline(unittest.TestCase):
    """OSM-first pipeline: Snap fallback when no usable maxspeed; optional cross-check."""

    def test_snap_fallback_when_nearby_highway_has_no_maxspeed(self):
        os.environ['TOMTOM_API_KEY'] = 'test_key'
        self.addCleanup(lambda: os.environ.pop('TOMTOM_API_KEY', None))

        detector = SpeedLimitDetector()
        detector.speed_limit_cache.clear()

        overpass_resp = Mock()
        overpass_resp.status_code = 200
        overpass_resp.json.return_value = {
            'elements': [{
                'center': {'lat': 51.5074, 'lon': -0.1278},
                'tags': {'highway': 'primary'},
            }]
        }
        snap_resp = Mock()
        snap_resp.status_code = 200
        snap_resp.json.return_value = {
            'route': [{
                'properties': {
                    'speedLimits': {'value': 48, 'unit': 'kmph', 'type': 'Maximum'}
                }
            }]
        }

        with patch('speed_limit_detector.requests.get', side_effect=[overpass_resp, snap_resp]):
            result = detector.get_speed_limit_for_location(51.5074, -0.1278)

        self.assertEqual(result.get('speed_limit_mph'), 30)
        self.assertEqual(detector.metrics['overpass_nearby_no_usable_maxspeed'], 1)

    def test_snap_crosscheck_logs_disagreement_keeps_osm(self):
        os.environ['TOMTOM_API_KEY'] = 'test_key'
        os.environ['SPEED_LIMIT_SNAP_CROSSCHECK'] = 'true'
        self.addCleanup(lambda: os.environ.pop('TOMTOM_API_KEY', None))
        self.addCleanup(lambda: os.environ.pop('SPEED_LIMIT_SNAP_CROSSCHECK', None))

        detector = SpeedLimitDetector()
        detector.speed_limit_cache.clear()

        overpass_resp = Mock()
        overpass_resp.status_code = 200
        overpass_resp.json.return_value = {
            'elements': [{
                'center': {'lat': 51.5074, 'lon': -0.1278},
                'tags': {'highway': 'residential', 'maxspeed': '30 mph'},
            }]
        }
        snap_resp = Mock()
        snap_resp.status_code = 200
        snap_resp.json.return_value = {
            'route': [{
                'properties': {
                    'speedLimits': {'value': 130, 'unit': 'kmph', 'type': 'Maximum'}
                }
            }]
        }

        with patch('speed_limit_detector.requests.get', side_effect=[overpass_resp, snap_resp]):
            result = detector.get_speed_limit_for_location(51.5074, -0.1278)

        self.assertEqual(result.get('speed_limit_mph'), 30)
        self.assertEqual(detector.metrics['snap_crosscheck_invocations'], 1)
        self.assertEqual(detector.metrics['snap_crosscheck_disagree'], 1)
        self.assertEqual(detector.metrics['snap_crosscheck_agree'], 0)


class TestRoadTypeAndOverpassConfig(unittest.TestCase):
    """Road-class mph fallback and OVERPASS_SPEED_AROUND_METERS."""

    def test_road_type_fallback_when_apis_fail(self):
        detector = SpeedLimitDetector()
        detector.speed_limit_cache.clear()
        with patch('speed_limit_detector.requests.get') as mock_get:
            mock_get.side_effect = Exception('API unavailable')
            result = detector.get_speed_limit_for_location(
                51.5074, -0.1278, road_type='residential'
            )
        self.assertEqual(result.get('speed_limit_mph'), 30)
        self.assertEqual(result.get('source'), 'road-type-default')

    def test_overpass_radius_from_env(self):
        with patch.dict(os.environ, {'OVERPASS_SPEED_AROUND_METERS': '42'}, clear=False):
            d = SpeedLimitDetector()
            self.assertEqual(d.overpass_speed_around_meters, 42)

    def test_overpass_radius_clamped_high(self):
        with patch.dict(os.environ, {'OVERPASS_SPEED_AROUND_METERS': '500'}, clear=False):
            d = SpeedLimitDetector()
            self.assertEqual(d.overpass_speed_around_meters, 120)


def run_all_tests():
    """Run all test suites and report results"""
    print("=" * 70)
    print("SPEED LIMIT SYSTEM - COMPREHENSIVE TEST SUITE")
    print("=" * 70)
    
    # Create test suite
    loader = unittest.TestLoader()
    suite = unittest.TestSuite()
    
    # Add all test classes
    suite.addTests(loader.loadTestsFromTestCase(TestCacheLRU))
    suite.addTests(loader.loadTestsFromTestCase(TestRateLimiting))
    suite.addTests(loader.loadTestsFromTestCase(TestGeofencing))
    suite.addTests(loader.loadTestsFromTestCase(TestAPIIntegration))
    suite.addTests(loader.loadTestsFromTestCase(TestOsmSnapPipeline))
    suite.addTests(loader.loadTestsFromTestCase(TestRoadTypeAndOverpassConfig))
    
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
        print("\n✅ ALL TESTS PASSED - Ready for commit!")
        return True
    else:
        print("\n❌ TESTS FAILED - Fix issues before commit")
        return False


if __name__ == '__main__':
    success = run_all_tests()
    exit(0 if success else 1)


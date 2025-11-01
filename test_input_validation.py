"""
Test suite for Voyagr input validation and security improvements.
Tests coordinate validation, search query validation, and SQL injection prevention.
"""

import sys
import os

# Add parent directory to path to import satnav
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Import validation functions from satnav
from satnav import (
    validate_coordinates,
    validate_search_query,
    sanitize_string_for_api,
    log_validation_error
)


class TestInputValidation:
    """Test input validation functions."""
    
    def __init__(self):
        self.passed = 0
        self.failed = 0
    
    def test_valid_coordinates(self):
        """Test valid coordinate validation."""
        print("\n✓ Testing valid coordinates...")
        
        # Valid coordinates
        test_cases = [
            (51.5074, -0.1278, "London"),
            (53.5526, -1.4797, "Barnsley"),
            (-33.8688, 151.2093, "Sydney"),
            (0, 0, "Equator/Prime Meridian"),
            (90, 180, "Max valid"),
            (-90, -180, "Min valid"),
        ]
        
        for lat, lon, name in test_cases:
            is_valid, error = validate_coordinates(lat, lon, f"test_{name}")
            if is_valid:
                print(f"  ✓ {name}: ({lat}, {lon}) - PASS")
                self.passed += 1
            else:
                print(f"  ✗ {name}: ({lat}, {lon}) - FAIL: {error}")
                self.failed += 1
    
    def test_invalid_coordinates(self):
        """Test invalid coordinate validation."""
        print("\n✓ Testing invalid coordinates...")
        
        # Invalid coordinates
        test_cases = [
            (91, 0, "Latitude > 90"),
            (-91, 0, "Latitude < -90"),
            (0, 181, "Longitude > 180"),
            (0, -181, "Longitude < -180"),
            ("51.5", 0, "String latitude"),
            (51.5, "0", "String longitude"),
            (None, 0, "None latitude"),
            (0, None, "None longitude"),
        ]
        
        for lat, lon, name in test_cases:
            is_valid, error = validate_coordinates(lat, lon, f"test_{name}")
            if not is_valid:
                print(f"  ✓ {name} - Correctly rejected")
                self.passed += 1
            else:
                print(f"  ✗ {name} - Should have been rejected")
                self.failed += 1
    
    def test_valid_search_queries(self):
        """Test valid search query validation."""
        print("\n✓ Testing valid search queries...")
        
        test_cases = [
            ("London", "Simple city"),
            ("New York", "City with space"),
            ("M6 Toll Road", "Road name"),
            ("Starbucks Coffee Shop", "Business name"),
            ("a" * 255, "Max length (255)"),
        ]
        
        for query, name in test_cases:
            is_valid, error, sanitized = validate_search_query(query, f"test_{name}")
            if is_valid:
                print(f"  ✓ {name}: '{query[:30]}...' - PASS")
                self.passed += 1
            else:
                print(f"  ✗ {name}: '{query[:30]}...' - FAIL: {error}")
                self.failed += 1
    
    def test_invalid_search_queries(self):
        """Test invalid search query validation."""
        print("\n✓ Testing invalid search queries...")
        
        test_cases = [
            ("", "Empty string"),
            ("a", "Too short (1 char)"),
            ("a" * 256, "Too long (256 chars)"),
            (123, "Integer instead of string"),
            (None, "None value"),
            ("<script>alert('xss')</script>", "XSS attempt"),
            ("test' OR '1'='1", "SQL injection attempt"),
        ]
        
        for query, name in test_cases:
            is_valid, error, sanitized = validate_search_query(query, f"test_{name}")
            if not is_valid:
                print(f"  ✓ {name} - Correctly rejected")
                self.passed += 1
            else:
                print(f"  ✗ {name} - Should have been rejected")
                self.failed += 1
    
    def test_string_sanitization(self):
        """Test string sanitization for API requests."""
        print("\n✓ Testing string sanitization...")
        
        test_cases = [
            ("  London  ", "London", "Whitespace trimming"),
            ("New York", "New York", "Normal string"),
            ("Test\x00String", "TestString", "Control character removal"),
        ]
        
        for input_str, expected, name in test_cases:
            result = sanitize_string_for_api(input_str)
            if result == expected:
                print(f"  ✓ {name}: '{input_str}' -> '{result}' - PASS")
                self.passed += 1
            else:
                print(f"  ✗ {name}: '{input_str}' -> '{result}' (expected '{expected}') - FAIL")
                self.failed += 1
    
    def test_edge_cases(self):
        """Test edge cases and boundary conditions."""
        print("\n✓ Testing edge cases...")
        
        # Boundary coordinates
        is_valid, _ = validate_coordinates(90.0, 180.0, "test_max")
        if is_valid:
            print(f"  ✓ Max valid coordinates (90, 180) - PASS")
            self.passed += 1
        else:
            print(f"  ✗ Max valid coordinates should be accepted - FAIL")
            self.failed += 1
        
        # Boundary coordinates
        is_valid, _ = validate_coordinates(-90.0, -180.0, "test_min")
        if is_valid:
            print(f"  ✓ Min valid coordinates (-90, -180) - PASS")
            self.passed += 1
        else:
            print(f"  ✗ Min valid coordinates should be accepted - FAIL")
            self.failed += 1
        
        # Query at minimum length
        is_valid, _, _ = validate_search_query("ab", "test_min_query")
        if is_valid:
            print(f"  ✓ Minimum query length (2 chars) - PASS")
            self.passed += 1
        else:
            print(f"  ✗ Minimum query length should be accepted - FAIL")
            self.failed += 1
    
    def run_all_tests(self):
        """Run all validation tests."""
        print("\n" + "="*80)
        print("🧪 VOYAGR INPUT VALIDATION TEST SUITE")
        print("="*80)
        
        self.test_valid_coordinates()
        self.test_invalid_coordinates()
        self.test_valid_search_queries()
        self.test_invalid_search_queries()
        self.test_string_sanitization()
        self.test_edge_cases()
        
        print("\n" + "="*80)
        print("📊 TEST RESULTS")
        print("="*80)
        print(f"✓ Passed: {self.passed}")
        print(f"✗ Failed: {self.failed}")
        print(f"📈 Total:  {self.passed + self.failed}")
        
        if self.failed == 0:
            print("\n🎉 ALL TESTS PASSED!")
            return True
        else:
            print(f"\n⚠️  {self.failed} TEST(S) FAILED")
            return False


if __name__ == "__main__":
    tester = TestInputValidation()
    success = tester.run_all_tests()
    sys.exit(0 if success else 1)


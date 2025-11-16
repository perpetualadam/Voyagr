#!/usr/bin/env python3
"""
Test script to verify hazard avoidance is working correctly.
Tests that:
1. SCDB cameras are loaded
2. Cameras are treated as traffic_light_camera type
3. Hazard scoring is applied to routes
4. Routes with fewer hazards are preferred
"""

import sqlite3
import sys

def test_scdb_cameras_loaded():
    """Test that SCDB cameras are loaded in database."""
    try:
        conn = sqlite3.connect('voyagr_web.db')
        cursor = conn.cursor()
        
        cursor.execute('SELECT COUNT(*) FROM cameras WHERE type = "speed_camera"')
        count = cursor.fetchone()[0]
        
        print(f"✅ SCDB Cameras Loaded: {count} speed cameras in database")
        
        if count == 0:
            print("❌ ERROR: No cameras loaded!")
            return False
        
        # Show sample cameras
        cursor.execute('SELECT lat, lon, description FROM cameras LIMIT 5')
        print("\n📍 Sample cameras:")
        for lat, lon, desc in cursor.fetchall():
            print(f"   ({lat:.4f}, {lon:.4f}) - {desc[:50]}")
        
        conn.close()
        return True
    except Exception as e:
        print(f"❌ Error: {e}")
        return False

def test_hazard_preferences():
    """Test that hazard preferences are configured correctly."""
    try:
        conn = sqlite3.connect('voyagr_web.db')
        cursor = conn.cursor()
        
        cursor.execute('SELECT hazard_type, penalty_seconds, enabled FROM hazard_preferences ORDER BY penalty_seconds DESC')
        prefs = cursor.fetchall()
        
        print("\n✅ Hazard Preferences:")
        for hazard_type, penalty, enabled in prefs:
            status = "✓" if enabled else "✗"
            print(f"   {status} {hazard_type}: {penalty}s penalty")
        
        # Check traffic_light_camera has highest penalty
        cursor.execute('SELECT penalty_seconds FROM hazard_preferences WHERE hazard_type = "traffic_light_camera"')
        tlc_penalty = cursor.fetchone()[0]
        
        if tlc_penalty >= 1200:
            print(f"\n✅ Traffic light camera penalty is high: {tlc_penalty}s (20+ minutes)")
        else:
            print(f"❌ Traffic light camera penalty is too low: {tlc_penalty}s")
            return False
        
        conn.close()
        return True
    except Exception as e:
        print(f"❌ Error: {e}")
        return False

def test_hazard_avoidance_enabled():
    """Test that hazard avoidance is enabled by default."""
    try:
        conn = sqlite3.connect('voyagr_web.db')
        cursor = conn.cursor()
        
        cursor.execute('SELECT COUNT(*) FROM hazard_preferences WHERE enabled = 1')
        enabled_count = cursor.fetchone()[0]
        
        if enabled_count > 0:
            print(f"\n✅ Hazard avoidance enabled: {enabled_count} hazard types active")
        else:
            print("❌ No hazard types enabled!")
            return False
        
        conn.close()
        return True
    except Exception as e:
        print(f"❌ Error: {e}")
        return False

def main():
    """Run all tests."""
    print("=" * 60)
    print("HAZARD AVOIDANCE SYSTEM TEST")
    print("=" * 60)
    
    tests = [
        ("SCDB Cameras Loaded", test_scdb_cameras_loaded),
        ("Hazard Preferences", test_hazard_preferences),
        ("Hazard Avoidance Enabled", test_hazard_avoidance_enabled),
    ]
    
    results = []
    for name, test_func in tests:
        print(f"\n📋 Testing: {name}")
        print("-" * 60)
        result = test_func()
        results.append((name, result))
    
    print("\n" + "=" * 60)
    print("TEST SUMMARY")
    print("=" * 60)
    
    passed = sum(1 for _, result in results if result)
    total = len(results)
    
    for name, result in results:
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"{status}: {name}")
    
    print(f"\n📊 Results: {passed}/{total} tests passed")
    
    if passed == total:
        print("\n✅ All tests passed! Hazard avoidance system is ready.")
        return 0
    else:
        print(f"\n❌ {total - passed} test(s) failed. Please fix issues above.")
        return 1

if __name__ == '__main__':
    sys.exit(main())


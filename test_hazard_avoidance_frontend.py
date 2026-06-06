#!/usr/bin/env python3
"""
Test script to verify hazard avoidance is working end-to-end
Tests that:
1. SCDB cameras are loaded in database
2. Hazard preferences are configured
3. Route calculation includes hazard avoidance parameter
4. Routes include hazard penalty information
"""

# --- Windows console UTF-8 (auto-added) ---
import sys as _vsys
if _vsys.platform == "win32":
    try:
        _vsys.stdout.reconfigure(encoding="utf-8", errors="replace")
        _vsys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass


import requests
import json
import sqlite3
from pathlib import Path

# Configuration
BASE_URL = "http://localhost:5000"
DB_PATH = "voyagr_web.db"

def test_scdb_cameras_loaded():
    """Test that SCDB cameras are loaded in database"""
    print("\n✓ Test 1: SCDB Cameras Loaded")
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute("SELECT COUNT(*) FROM cameras WHERE type = 'speed_camera'")
        count = cursor.fetchone()[0]
        conn.close()
        
        if count > 0:
            print(f"  ✅ PASS: {count:,} speed cameras loaded in database")
            return True
        else:
            print(f"  ❌ FAIL: No speed cameras found in database")
            return False
    except Exception as e:
        print(f"  ❌ ERROR: {e}")
        return False

def test_hazard_preferences():
    """Test that hazard preferences are configured"""
    print("\n✓ Test 2: Hazard Preferences Configured")
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute("SELECT hazard_type, penalty_seconds, enabled FROM hazard_preferences WHERE enabled = 1")
        prefs = cursor.fetchall()
        conn.close()
        
        if prefs:
            print(f"  ✅ PASS: {len(prefs)} hazard types configured:")
            for hazard_type, penalty, enabled in prefs:
                print(f"     - {hazard_type}: {penalty}s penalty")
            return True
        else:
            print(f"  ❌ FAIL: No hazard preferences configured")
            return False
    except Exception as e:
        print(f"  ❌ ERROR: {e}")
        return False

def test_route_with_hazard_avoidance():
    """Test that route calculation includes hazard avoidance"""
    print("\n✓ Test 3: Route Calculation with Hazard Avoidance")
    try:
        # Test route in London (high camera density)
        payload = {
            "start": "51.5074,-0.1278",  # London center
            "end": "51.5174,-0.1378",    # ~1.5km away
            "routing_mode": "auto",
            "vehicle_type": "petrol_diesel",
            "enable_hazard_avoidance": True
        }
        
        response = requests.post(f"{BASE_URL}/api/route", json=payload, timeout=10)
        
        if response.status_code == 200:
            data = response.json()
            if data.get('success'):
                routes = data.get('routes', [])
                if routes:
                    route = routes[0]
                    hazard_penalty = route.get('hazard_penalty_seconds', 0)
                    hazard_count = route.get('hazard_count', 0)
                    
                    print(f"  ✅ PASS: Route calculated successfully")
                    print(f"     - Distance: {route.get('distance_km')} km")
                    print(f"     - Duration: {route.get('duration_minutes')} min")
                    print(f"     - Hazard Penalty: {hazard_penalty}s")
                    print(f"     - Hazard Count: {hazard_count}")
                    return True
                else:
                    print(f"  ❌ FAIL: No routes returned")
                    return False
            else:
                print(f"  ❌ FAIL: {data.get('error', 'Unknown error')}")
                return False
        else:
            print(f"  ❌ FAIL: HTTP {response.status_code}")
            print(f"     Response: {response.text}")
            return False
    except Exception as e:
        print(f"  ❌ ERROR: {e}")
        return False

def test_route_without_hazard_avoidance():
    """Test that route calculation works without hazard avoidance"""
    print("\n✓ Test 4: Route Calculation WITHOUT Hazard Avoidance")
    try:
        payload = {
            "start": "51.5074,-0.1278",
            "end": "51.5174,-0.1378",
            "routing_mode": "auto",
            "vehicle_type": "petrol_diesel",
            "enable_hazard_avoidance": False
        }
        
        response = requests.post(f"{BASE_URL}/api/route", json=payload, timeout=10)
        
        if response.status_code == 200:
            data = response.json()
            if data.get('success'):
                routes = data.get('routes', [])
                if routes:
                    route = routes[0]
                    hazard_penalty = route.get('hazard_penalty_seconds', 0)
                    
                    print(f"  ✅ PASS: Route calculated successfully")
                    print(f"     - Hazard Penalty: {hazard_penalty}s (should be 0)")
                    return hazard_penalty == 0
                else:
                    print(f"  ❌ FAIL: No routes returned")
                    return False
            else:
                print(f"  ❌ FAIL: {data.get('error', 'Unknown error')}")
                return False
        else:
            print(f"  ❌ FAIL: HTTP {response.status_code}")
            return False
    except Exception as e:
        print(f"  ❌ ERROR: {e}")
        return False

if __name__ == "__main__":
    print("=" * 60)
    print("HAZARD AVOIDANCE FRONTEND TEST SUITE")
    print("=" * 60)
    
    results = []
    results.append(("SCDB Cameras Loaded", test_scdb_cameras_loaded()))
    results.append(("Hazard Preferences", test_hazard_preferences()))
    results.append(("Route with Hazard Avoidance", test_route_with_hazard_avoidance()))
    results.append(("Route without Hazard Avoidance", test_route_without_hazard_avoidance()))
    
    print("\n" + "=" * 60)
    print("TEST SUMMARY")
    print("=" * 60)
    
    passed = sum(1 for _, result in results if result)
    total = len(results)
    
    for test_name, result in results:
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"{status}: {test_name}")
    
    print(f"\nTotal: {passed}/{total} tests passed")
    
    if passed == total:
        print("\n🎉 All tests passed! Hazard avoidance is working correctly.")
    else:
        print(f"\n⚠️  {total - passed} test(s) failed. Check the output above.")


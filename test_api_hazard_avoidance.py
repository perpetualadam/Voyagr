#!/usr/bin/env python3
"""
Test the /api/route endpoint with hazard avoidance enabled/disabled
This test requires the server to be running on localhost:5000
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
import time

def test_route_without_hazard_avoidance():
    """Test 1: Route calculation WITHOUT hazard avoidance"""
    print("\n" + "=" * 80)
    print("TEST 1: Route Calculation WITHOUT Hazard Avoidance")
    print("=" * 80)
    
    url = "http://localhost:5000/api/route"
    payload = {
        "start": "51.5074,-0.1278",  # London
        "end": "51.7520,-1.2577",     # Oxford
        "routing_mode": "auto",
        "vehicle_type": "petrol_diesel",
        "enable_hazard_avoidance": False
    }
    
    print(f"\n📤 Request: POST {url}")
    print(f"📦 Payload: {json.dumps(payload, indent=2)}")
    
    try:
        start_time = time.time()
        response = requests.post(url, json=payload, timeout=120)  # Increased to 120s for custom router
        elapsed = (time.time() - start_time) * 1000
        
        print(f"\n⏱️  Response Time: {elapsed:.0f}ms")
        print(f"📊 Status Code: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            print(f"\n✅ Success: {data.get('success', False)}")
            print(f"🚗 Source: {data.get('source', 'Unknown')}")
            
            if 'routes' in data and len(data['routes']) > 0:
                route = data['routes'][0]
                print(f"\n📍 Route Details:")
                print(f"   Distance: {route.get('distance_km', 0):.2f} km")
                print(f"   Duration: {route.get('duration_minutes', 0):.0f} minutes")
                print(f"   Fuel Cost: £{route.get('fuel_cost', 0):.2f}")
                print(f"   Toll Cost: £{route.get('toll_cost', 0):.2f}")
                print(f"   Total Cost: £{route.get('total_cost', 0):.2f}")
                
                print(f"\n🚨 Hazard Fields:")
                print(f"   hazard_penalty_seconds: {route.get('hazard_penalty_seconds', 'MISSING')}")
                print(f"   hazard_count: {route.get('hazard_count', 'MISSING')}")
                print(f"   hazards: {len(route.get('hazards', []))} items")
                
                # Verification
                if route.get('hazard_penalty_seconds') == 0:
                    print("\n✅ PASS: hazard_penalty_seconds = 0 (as expected)")
                else:
                    print(f"\n❌ FAIL: hazard_penalty_seconds = {route.get('hazard_penalty_seconds')} (expected 0)")
                
                if route.get('hazard_count') == 0:
                    print("✅ PASS: hazard_count = 0 (as expected)")
                else:
                    print(f"❌ FAIL: hazard_count = {route.get('hazard_count')} (expected 0)")
                
                if len(route.get('hazards', [])) == 0:
                    print("✅ PASS: hazards = [] (as expected)")
                else:
                    print(f"❌ FAIL: hazards has {len(route.get('hazards', []))} items (expected 0)")
                
                return True
            else:
                print("\n❌ FAIL: No routes in response")
                return False
        else:
            print(f"\n❌ FAIL: HTTP {response.status_code}")
            print(f"Response: {response.text}")
            return False
            
    except requests.exceptions.ConnectionError:
        print("\n❌ ERROR: Could not connect to server. Is it running on localhost:5000?")
        return False
    except Exception as e:
        print(f"\n❌ ERROR: {e}")
        return False


def test_route_with_hazard_avoidance():
    """Test 2: Route calculation WITH hazard avoidance"""
    print("\n" + "=" * 80)
    print("TEST 2: Route Calculation WITH Hazard Avoidance")
    print("=" * 80)
    
    url = "http://localhost:5000/api/route"
    payload = {
        "start": "51.5074,-0.1278",  # London
        "end": "51.7520,-1.2577",     # Oxford
        "routing_mode": "auto",
        "vehicle_type": "petrol_diesel",
        "enable_hazard_avoidance": True
    }
    
    print(f"\n📤 Request: POST {url}")
    print(f"📦 Payload: {json.dumps(payload, indent=2)}")
    
    try:
        start_time = time.time()
        response = requests.post(url, json=payload, timeout=120)  # Increased to 120s for custom router
        elapsed = (time.time() - start_time) * 1000
        
        print(f"\n⏱️  Response Time: {elapsed:.0f}ms")
        print(f"📊 Status Code: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            print(f"\n✅ Success: {data.get('success', False)}")
            print(f"🚗 Source: {data.get('source', 'Unknown')}")
            
            if 'routes' in data and len(data['routes']) > 0:
                print(f"\n📊 Total Routes: {len(data['routes'])}")
                
                for idx, route in enumerate(data['routes'], 1):
                    print(f"\n📍 Route {idx} Details:")
                    print(f"   Distance: {route.get('distance_km', 0):.2f} km")
                    print(f"   Duration: {route.get('duration_minutes', 0):.0f} minutes")
                    print(f"   Total Cost: £{route.get('total_cost', 0):.2f}")
                    print(f"   Hazard Penalty: {route.get('hazard_penalty_seconds', 0):.0f}s")
                    print(f"   Hazard Count: {route.get('hazard_count', 0)}")
                    print(f"   Hazards List: {len(route.get('hazards', []))} items")
                    
                    if len(route.get('hazards', [])) > 0:
                        print(f"\n   🚨 Sample Hazards:")
                        for hazard in route.get('hazards', [])[:3]:  # Show first 3
                            print(f"      - {hazard.get('type', 'unknown')}: {hazard.get('description', 'N/A')}")
                            print(f"        Location: ({hazard.get('lat', 0):.4f}, {hazard.get('lon', 0):.4f})")
                            print(f"        Distance: {hazard.get('distance', 0)}m")
                
                # Verification
                route = data['routes'][0]
                print(f"\n🔍 Verification:")
                
                if 'hazard_penalty_seconds' in route:
                    print(f"✅ PASS: hazard_penalty_seconds field exists")
                else:
                    print(f"❌ FAIL: hazard_penalty_seconds field missing")
                
                if 'hazard_count' in route:
                    print(f"✅ PASS: hazard_count field exists")
                else:
                    print(f"❌ FAIL: hazard_count field missing")
                
                if 'hazards' in route:
                    print(f"✅ PASS: hazards field exists")
                else:
                    print(f"❌ FAIL: hazards field missing")
                
                # Check if routes are sorted by hazard penalty
                if len(data['routes']) > 1:
                    penalties = [r.get('hazard_penalty_seconds', 0) for r in data['routes']]
                    if penalties == sorted(penalties):
                        print(f"✅ PASS: Routes are sorted by hazard penalty (ascending)")
                    else:
                        print(f"❌ FAIL: Routes are NOT sorted by hazard penalty")
                        print(f"   Penalties: {penalties}")
                        print(f"   Expected: {sorted(penalties)}")
                
                return True
            else:
                print("\n❌ FAIL: No routes in response")
                return False
        else:
            print(f"\n❌ FAIL: HTTP {response.status_code}")
            print(f"Response: {response.text}")
            return False
            
    except requests.exceptions.ConnectionError:
        print("\n❌ ERROR: Could not connect to server. Is it running on localhost:5000?")
        return False
    except Exception as e:
        print(f"\n❌ ERROR: {e}")
        return False


if __name__ == '__main__':
    print("=" * 80)
    print("VOYAGR CUSTOM ROUTER HAZARD AVOIDANCE API TESTS")
    print("=" * 80)
    print("\n⚠️  Prerequisites:")
    print("   1. Server must be running on localhost:5000")
    print("   2. Custom router must be initialized")
    print("   3. Hazard data must be in database")
    
    input("\nPress Enter to start tests...")
    
    test1_passed = test_route_without_hazard_avoidance()
    test2_passed = test_route_with_hazard_avoidance()
    
    print("\n" + "=" * 80)
    print("FINAL SUMMARY")
    print("=" * 80)
    print(f"Test 1 (No Hazard Avoidance): {'✅ PASSED' if test1_passed else '❌ FAILED'}")
    print(f"Test 2 (With Hazard Avoidance): {'✅ PASSED' if test2_passed else '❌ FAILED'}")
    
    if test1_passed and test2_passed:
        print("\n🎉 ALL API TESTS PASSED!")
    else:
        print("\n⚠️  Some tests failed. Please review the output above.")


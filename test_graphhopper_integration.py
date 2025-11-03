#!/usr/bin/env python3
"""
Test GraphHopper integration with Voyagr
"""

import requests
import json

def test_graphhopper_info():
    """Test GraphHopper /info endpoint"""
    print("\n1️⃣ Testing GraphHopper /info endpoint...")
    try:
        response = requests.get("http://81.0.246.97:8989/info", timeout=5)
        if response.status_code == 200:
            data = response.json()
            print(f"✅ GraphHopper API responding")
            print(f"   Version: {data.get('version')}")
            print(f"   Profiles: {[p['name'] for p in data.get('profiles', [])]}")
            print(f"   Bounds: {data.get('bbox')}")
            return True
        else:
            print(f"❌ GraphHopper returned HTTP {response.status_code}")
            return False
    except Exception as e:
        print(f"❌ Error: {e}")
        return False

def test_graphhopper_route():
    """Test GraphHopper /route endpoint"""
    print("\n2️⃣ Testing GraphHopper /route endpoint...")
    try:
        params = {
            "point": ["51.5074,-0.1278", "51.5174,-0.1278"],
            "profile": "car",
            "locale": "en"
        }

        response = requests.get(
            "http://81.0.246.97:8989/route",
            params=params,
            timeout=10
        )

        if response.status_code == 200:
            data = response.json()
            if 'paths' in data and len(data['paths']) > 0:
                path = data['paths'][0]
                distance_km = path.get('distance', 0) / 1000
                time_min = path.get('time', 0) / 60000
                print(f"✅ Route calculated successfully")
                print(f"   Distance: {distance_km:.2f} km")
                print(f"   Time: {time_min:.0f} minutes")
                print(f"   Points: {len(path.get('points', []))}")
                return True
            else:
                print(f"❌ Unexpected response format: {data.keys()}")
                return False
        else:
            print(f"❌ GraphHopper returned HTTP {response.status_code}")
            print(f"   Response: {response.text}")
            return False
    except Exception as e:
        print(f"❌ Error: {e}")
        return False

def test_voyagr_web_route():
    """Test voyagr_web.py /api/route endpoint"""
    print("\n3️⃣ Testing voyagr_web.py /api/route endpoint...")
    try:
        payload = {
            "start": "51.5074,-0.1278",
            "end": "51.5174,-0.1278",
            "routing_mode": "auto",
            "vehicle_type": "petrol_diesel",
            "fuel_efficiency": 6.5,
            "fuel_price": 1.40,
            "energy_efficiency": 18.5,
            "electricity_price": 0.30,
            "include_tolls": True,
            "include_caz": True,
            "caz_exempt": False,
            "enable_hazard_avoidance": False
        }
        
        response = requests.post(
            "http://localhost:5000/api/route",
            json=payload,
            timeout=15
        )
        
        if response.status_code == 200:
            data = response.json()
            if data.get('success'):
                print(f"✅ Route calculated via voyagr_web.py")
                print(f"   Distance: {data.get('distance')}")
                print(f"   Time: {data.get('time')}")
                print(f"   Source: {data.get('source')}")
                return True
            else:
                print(f"❌ Route calculation failed: {data.get('error')}")
                return False
        else:
            print(f"❌ voyagr_web.py returned HTTP {response.status_code}")
            return False
    except Exception as e:
        print(f"❌ Error: {e}")
        print("   (voyagr_web.py may not be running)")
        return False

if __name__ == "__main__":
    print("=" * 60)
    print("🧪 GraphHopper Integration Test Suite")
    print("=" * 60)
    
    results = []
    results.append(("GraphHopper /info", test_graphhopper_info()))
    results.append(("GraphHopper /route", test_graphhopper_route()))
    results.append(("voyagr_web.py /api/route", test_voyagr_web_route()))
    
    print("\n" + "=" * 60)
    print("📊 Test Results Summary")
    print("=" * 60)
    for test_name, result in results:
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"{status}: {test_name}")
    
    passed = sum(1 for _, result in results if result)
    total = len(results)
    print(f"\nTotal: {passed}/{total} tests passed")
    print("=" * 60)


#!/usr/bin/env python3
"""
Integration test to verify hazard avoidance routing is working correctly.
Tests that routes are reordered by hazard penalty.
"""

import requests
import json
import time

BASE_URL = "http://localhost:5000"

def test_hazard_avoidance():
    """Test hazard avoidance routing with Barnsley-Balby route."""
    
    # Barnsley to Balby (known to have many speed cameras)
    start = "53.5505,-1.4751"  # Barnsley
    end = "53.5236,-1.3236"    # Balby
    
    payload = {
        "start": start,
        "end": end,
        "routing_mode": "auto",
        "vehicle_type": "petrol_diesel",
        "enable_hazard_avoidance": True,
        "pref_speedCameras": True,
        "pref_trafficCameras": True,
        "pref_police": False,
        "pref_roadworks": False,
        "pref_accidents": False
    }
    
    print("=" * 80)
    print("HAZARD AVOIDANCE INTEGRATION TEST")
    print("=" * 80)
    print(f"\nRoute: {start} → {end}")
    print(f"Hazard Avoidance: ENABLED")
    print(f"Preferences: Speed Cameras ✓, Traffic Cameras ✓")
    print("\nSending request to /api/route...")
    
    try:
        response = requests.post(f"{BASE_URL}/api/route", json=payload, timeout=30)
        data = response.json()
        
        if data.get('success'):
            routes = data.get('routes', [])
            print(f"\n✅ SUCCESS: {len(routes)} routes returned")
            print(f"Source: {data.get('source')}")
            print(f"Response time: {data.get('response_time_ms', 'N/A')}ms")
            
            print("\n" + "=" * 80)
            print("ROUTE DETAILS (sorted by hazard penalty):")
            print("=" * 80)
            
            for idx, route in enumerate(routes):
                print(f"\n📍 Route {idx + 1}: {route.get('name', 'Unknown')}")
                print(f"   Distance: {route.get('distance_km', 0)} km")
                print(f"   Duration: {route.get('duration_minutes', 0)} minutes")
                print(f"   Fuel Cost: £{route.get('fuel_cost', 0)}")
                print(f"   🚨 Hazard Penalty: {route.get('hazard_penalty_seconds', 0):.0f} seconds")
                print(f"   📷 Hazard Count: {route.get('hazard_count', 0)}")
            
            # Verify routes are sorted by hazard penalty
            print("\n" + "=" * 80)
            print("VERIFICATION:")
            print("=" * 80)
            
            penalties = [r.get('hazard_penalty_seconds', 0) for r in routes]
            is_sorted = all(penalties[i] <= penalties[i+1] for i in range(len(penalties)-1))
            
            if is_sorted:
                print("✅ Routes are correctly sorted by hazard penalty (ascending)")
                print(f"   Penalties: {penalties}")
            else:
                print("❌ Routes are NOT sorted by hazard penalty!")
                print(f"   Penalties: {penalties}")
            
            return is_sorted
        else:
            print(f"\n❌ ERROR: {data.get('error', 'Unknown error')}")
            return False
            
    except Exception as e:
        print(f"\n❌ Exception: {str(e)}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    print("Waiting for app to be ready...")
    time.sleep(2)
    success = test_hazard_avoidance()
    exit(0 if success else 1)


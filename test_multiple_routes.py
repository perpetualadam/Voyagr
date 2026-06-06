#!/usr/bin/env python3
"""
Test hazard avoidance with multiple different routes.
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

# Test routes with different characteristics
TEST_ROUTES = [
    {
        "name": "Barnsley to Doncaster (Original)",
        "start": "53.5526,-1.4797",
        "end": "53.5167,-1.0833",
        "description": "Original test route - medium distance, high camera density"
    },
    {
        "name": "Sheffield to Rotherham",
        "start": "53.3811,-1.4701",
        "end": "53.4326,-1.3635",
        "description": "Short urban route - high camera density"
    },
    {
        "name": "Leeds to York",
        "start": "53.8008,-1.5491",
        "end": "53.9600,-1.0873",
        "description": "Medium distance - moderate camera density"
    },
    {
        "name": "Manchester to Liverpool",
        "start": "53.4808,-2.2426",
        "end": "53.4084,-2.9916",
        "description": "Long distance - high camera density"
    },
    {
        "name": "Newcastle to Durham",
        "start": "54.9783,-1.6178",
        "end": "54.7753,-1.5849",
        "description": "Medium distance - lower camera density"
    }
]

def test_route(route_info):
    """Test a single route with and without hazard avoidance."""
    print(f"\n{'='*80}")
    print(f"Testing: {route_info['name']}")
    print(f"Description: {route_info['description']}")
    print(f"{'='*80}\n")
    
    # Test WITHOUT hazard avoidance (baseline)
    print("📍 Baseline (No Avoidance):")
    baseline_request = {
        "start": route_info["start"],
        "end": route_info["end"],
        "routing_mode": "auto",
        "vehicle_type": "petrol_diesel",
        "enable_hazard_avoidance": False
    }
    
    try:
        response = requests.post('http://localhost:5000/api/route', json=baseline_request, timeout=30)
        if response.status_code == 200:
            data = response.json()
            if data.get('success'):
                route = data['routes'][0]
                baseline_hazards = route.get('hazard_count', 0)
                baseline_distance = route.get('distance_km', 0)
                baseline_duration = route.get('duration_minutes', 0)
                print(f"  ✅ Source: {data.get('source', 'Unknown')}")
                print(f"  Distance: {baseline_distance:.2f} km")
                print(f"  Duration: {baseline_duration:.0f} min")
                print(f"  Hazards: {baseline_hazards}")
            else:
                print(f"  ❌ Failed: {data.get('error', 'Unknown error')}")
                return
        else:
            print(f"  ❌ HTTP {response.status_code}")
            return
    except Exception as e:
        print(f"  ❌ Error: {e}")
        return
    
    # Test WITH hazard avoidance
    print("\n🛡️ With Hazard Avoidance:")
    avoidance_request = {
        "start": route_info["start"],
        "end": route_info["end"],
        "routing_mode": "auto",
        "vehicle_type": "petrol_diesel",
        "enable_hazard_avoidance": True
    }
    
    try:
        response = requests.post('http://localhost:5000/api/route', json=avoidance_request, timeout=30)
        if response.status_code == 200:
            data = response.json()
            if data.get('success'):
                route = data['routes'][0]
                avoidance_hazards = route.get('hazard_count', 0)
                avoidance_distance = route.get('distance_km', 0)
                avoidance_duration = route.get('duration_minutes', 0)
                print(f"  ✅ Source: {data.get('source', 'Unknown')}")
                print(f"  Distance: {avoidance_distance:.2f} km")
                print(f"  Duration: {avoidance_duration:.0f} min")
                print(f"  Hazards: {avoidance_hazards}")
                
                # Calculate improvements
                hazard_reduction = ((baseline_hazards - avoidance_hazards) / baseline_hazards * 100) if baseline_hazards > 0 else 0
                distance_increase = ((avoidance_distance - baseline_distance) / baseline_distance * 100) if baseline_distance > 0 else 0
                duration_increase = ((avoidance_duration - baseline_duration) / baseline_duration * 100) if baseline_duration > 0 else 0
                
                print(f"\n📊 Comparison:")
                print(f"  Hazard Reduction: {hazard_reduction:.1f}% ({baseline_hazards} → {avoidance_hazards})")
                print(f"  Distance Increase: {distance_increase:+.1f}% ({baseline_distance:.2f} → {avoidance_distance:.2f} km)")
                print(f"  Duration Increase: {duration_increase:+.1f}% ({baseline_duration:.0f} → {avoidance_duration:.0f} min)")
                
                # Evaluate effectiveness
                if hazard_reduction >= 70:
                    print(f"  🎯 EXCELLENT - {hazard_reduction:.0f}% hazard reduction!")
                elif hazard_reduction >= 50:
                    print(f"  ✅ GOOD - {hazard_reduction:.0f}% hazard reduction")
                elif hazard_reduction >= 25:
                    print(f"  ⚠️ MODERATE - {hazard_reduction:.0f}% hazard reduction")
                else:
                    print(f"  ❌ POOR - Only {hazard_reduction:.0f}% hazard reduction")
                
            else:
                print(f"  ❌ Failed: {data.get('error', 'Unknown error')}")
        else:
            print(f"  ❌ HTTP {response.status_code}")
    except Exception as e:
        print(f"  ❌ Error: {e}")

if __name__ == "__main__":
    print("="*80)
    print("TESTING HAZARD AVOIDANCE WITH MULTIPLE ROUTES")
    print("="*80)
    
    results = []
    
    for route in TEST_ROUTES:
        test_route(route)
    
    print(f"\n{'='*80}")
    print("ALL TESTS COMPLETE")
    print(f"{'='*80}\n")


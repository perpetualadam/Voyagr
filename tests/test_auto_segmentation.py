#!/usr/bin/env python3
"""
Test automatic segmentation for high-density routes.
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

def test_route(name, start, end, expected_cameras):
    """Test a route with automatic segmentation."""
    print(f"\n{'='*80}")
    print(f"Testing: {name}")
    print(f"Expected cameras in bbox: ~{expected_cameras}")
    print(f"{'='*80}\n")
    
    # Test WITHOUT hazard avoidance (baseline)
    print("📍 Baseline (No Avoidance):")
    baseline_request = {
        "start": start,
        "end": end,
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
    
    # Test WITH hazard avoidance (automatic segmentation)
    print("\n🛡️ With Hazard Avoidance (Auto Segmentation):")
    avoidance_request = {
        "start": start,
        "end": end,
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
    print("TESTING AUTOMATIC SEGMENTATION FOR HIGH-DENSITY ROUTES")
    print("="*80)
    
    # Test routes with different camera densities
    test_route(
        "Barnsley to Doncaster (Medium Density)",
        "53.5526,-1.4797",
        "53.5167,-1.0833",
        91
    )
    
    test_route(
        "Leeds to York (High Density)",
        "53.8008,-1.5491",
        "53.9600,-1.0873",
        164
    )
    
    test_route(
        "Manchester to Liverpool (Very High Density)",
        "53.4808,-2.2426",
        "53.4084,-2.9916",
        345
    )
    
    print(f"\n{'='*80}")
    print("ALL TESTS COMPLETE")
    print(f"{'='*80}\n")


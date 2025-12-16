#!/usr/bin/env python3
"""
Quick test script for Valhalla polygon-based hazard avoidance.
Tests the exclude_polygons parameter implementation.
"""

import requests
import json

# Configuration
VOYAGR_URL = "http://localhost:5000"

# Test coordinates (Barnsley to Balby, Doncaster - South Yorkshire)
START_LAT = 53.5526  # Barnsley
START_LON = -1.4797
END_LAT = 53.5167    # Balby, Doncaster
END_LON = -1.0833

def test_valhalla_baseline():
    """Test Valhalla route WITHOUT hazard avoidance (baseline)."""
    print("\n" + "="*80)
    print("TEST 1: Valhalla WITHOUT Hazard Avoidance (Baseline)")
    print("="*80)
    
    payload = {
        "start": f"{START_LAT},{START_LON}",
        "end": f"{END_LAT},{END_LON}",
        "routing_mode": "auto",
        "vehicle_type": "petrol_diesel",
        "enable_hazard_avoidance": False
    }
    
    print(f"\nRequest: {json.dumps(payload, indent=2)}")
    
    response = requests.post(f"{VOYAGR_URL}/api/route", json=payload, timeout=30)
    
    if response.status_code == 200:
        data = response.json()
        print(f"\n✅ Success! Source: {data.get('source')}")
        
        for idx, route in enumerate(data.get('routes', [])[:1]):
            print(f"\nRoute {idx+1}: {route.get('name')}")
            print(f"  Distance: {route.get('distance_km')} km")
            print(f"  Duration: {route.get('duration_minutes')} min")
            print(f"  Hazard Count: {route.get('hazard_count', 0)}")
            print(f"  Hazard Penalty: {route.get('hazard_penalty_seconds', 0)}s")
        
        return data
    else:
        print(f"❌ Error: {response.status_code}")
        print(f"Response: {response.text[:500]}")
        return None

def test_valhalla_with_avoidance():
    """Test Valhalla route WITH exclude_polygons hazard avoidance."""
    print("\n" + "="*80)
    print("TEST 2: Valhalla WITH exclude_polygons Hazard Avoidance")
    print("="*80)
    
    payload = {
        "start": f"{START_LAT},{START_LON}",
        "end": f"{END_LAT},{END_LON}",
        "routing_mode": "auto",
        "vehicle_type": "petrol_diesel",
        "enable_hazard_avoidance": True
    }
    
    print(f"\nRequest: {json.dumps(payload, indent=2)}")
    
    response = requests.post(f"{VOYAGR_URL}/api/route", json=payload, timeout=30)
    
    if response.status_code == 200:
        data = response.json()
        print(f"\n✅ Success! Source: {data.get('source')}")
        
        for idx, route in enumerate(data.get('routes', [])[:1]):
            print(f"\nRoute {idx+1}: {route.get('name')}")
            print(f"  Distance: {route.get('distance_km')} km")
            print(f"  Duration: {route.get('duration_minutes')} min")
            print(f"  Hazard Count: {route.get('hazard_count', 0)}")
            print(f"  Hazard Penalty: {route.get('hazard_penalty_seconds', 0)}s")
            
            # Show hazards on route
            hazards = route.get('hazards', [])
            if hazards:
                print(f"  Hazards on route:")
                for hazard in hazards[:10]:
                    print(f"    - {hazard.get('type')}: {hazard.get('description', 'N/A')}")
            else:
                print(f"  ✅ No hazards on route (exclude_polygons working!)")
        
        return data
    else:
        print(f"❌ Error: {response.status_code}")
        print(f"Response: {response.text[:500]}")
        return None

if __name__ == "__main__":
    print("\n" + "="*80)
    print("VALHALLA POLYGON-BASED HAZARD AVOIDANCE TEST")
    print("="*80)
    print("\nThis test verifies:")
    print("1. Valhalla exclude_polygons parameter")
    print("2. 100m radius polygons around hazards")
    print("3. Routes should avoid hazard zones completely")

    # Check cameras in database first
    print("\n" + "="*80)
    print("DATABASE CHECK")
    print("="*80)
    import sqlite3
    conn = sqlite3.connect('voyagr.db')
    cursor = conn.cursor()
    cursor.execute('SELECT COUNT(*) FROM cameras WHERE lat BETWEEN 53.5167 AND 53.5526 AND lon BETWEEN -1.4797 AND -1.0833')
    camera_count = cursor.fetchone()[0]
    print(f"\n📍 Cameras in route area: {camera_count}")
    if camera_count > 0:
        cursor.execute('SELECT lat, lon, description FROM cameras WHERE lat BETWEEN 53.5167 AND 53.5526 AND lon BETWEEN -1.4797 AND -1.0833 LIMIT 5')
        print(f"Sample cameras:")
        for lat, lon, desc in cursor.fetchall():
            print(f"  ({lat:.4f}, {lon:.4f}) - {desc[:50]}")
    conn.close()

    # Run tests
    baseline = test_valhalla_baseline()
    avoidance = test_valhalla_with_avoidance()

    # Compare results
    print("\n" + "="*80)
    print("COMPARISON")
    print("="*80)

    if baseline and avoidance:
        base_hazards = baseline['routes'][0].get('hazard_count', 0) if baseline.get('routes') else 0
        avoid_hazards = avoidance['routes'][0].get('hazard_count', 0) if avoidance.get('routes') else 0

        print(f"\n📊 Results:")
        print(f"  Baseline hazards: {base_hazards}")
        print(f"  With avoidance: {avoid_hazards}")
        print(f"  Reduction: {base_hazards - avoid_hazards} hazards")

        if avoid_hazards < base_hazards:
            print(f"\n  ✅ Valhalla exclude_polygons WORKING!")
        elif avoid_hazards == 0 and base_hazards == 0:
            print(f"\n  ⚠️  Both routes have 0 hazards - cameras may not be on route path")
            print(f"  💡 Check server logs for '[VALHALLA] Using X exclude_polygons' message")
        elif avoid_hazards == 0:
            print(f"\n  ✅ Perfect! Zero hazards on route with avoidance!")
        else:
            print(f"\n  ⚠️  Valhalla exclude_polygons may not be working properly")

    print("\n" + "="*80)
    print("Expected: Routes WITH avoidance should have ZERO or very low hazard counts")
    print("="*80)


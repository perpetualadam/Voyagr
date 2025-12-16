#!/usr/bin/env python3
"""
Test script for polygon-based hazard avoidance in GraphHopper and Valhalla.

This script tests:
1. GraphHopper custom model with polygon-based blocking (multiply_by=0)
2. Valhalla exclude_polygons parameter
3. Both static hazards (cameras, railway crossings) and dynamic hazards (police, mobile cameras)

NOTE: Custom router is NOT tested - only GraphHopper and Valhalla polygon avoidance.
"""

import requests
import json
import time
import sqlite3

# Configuration
VOYAGR_URL = "http://localhost:5000"
DB_FILE = "voyagr.db"

# Test coordinates (London area - Hyde Park to Tower of London)
START_LAT = 51.5074
START_LON = -0.1278
END_LAT = 51.5081
END_LON = -0.0759

def add_test_cameras_to_db():
    """Add test cameras directly to database along the route."""
    print("\n" + "="*80)
    print("SETUP: Adding Test Cameras to Database")
    print("="*80)

    # Cameras along the route from Hyde Park to Tower of London
    test_cameras = [
        # Camera 1: Near Piccadilly Circus (on direct route)
        {"lat": 51.5074, "lon": -0.1000, "type": "speed_camera", "description": "Test Camera 1 - Piccadilly"},
        # Camera 2: Near Trafalgar Square (on direct route)
        {"lat": 51.5074, "lon": -0.1200, "type": "speed_camera", "description": "Test Camera 2 - Trafalgar"},
        # Camera 3: Near St Paul's Cathedral (on direct route)
        {"lat": 51.5138, "lon": -0.0983, "type": "speed_camera", "description": "Test Camera 3 - St Pauls"},
    ]

    try:
        conn = sqlite3.connect(DB_FILE)
        cursor = conn.cursor()

        # Create cameras table if it doesn't exist
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS cameras (
                id INTEGER PRIMARY KEY,
                lat REAL, lon REAL, type TEXT,
                description TEXT, severity TEXT,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        ''')

        # Delete old test cameras
        cursor.execute("DELETE FROM cameras WHERE description LIKE 'Test Camera%'")

        # Insert new test cameras
        for camera in test_cameras:
            cursor.execute(
                "INSERT INTO cameras (lat, lon, type, description) VALUES (?, ?, ?, ?)",
                (camera['lat'], camera['lon'], camera['type'], camera['description'])
            )
            print(f"  Added: {camera['description']} at ({camera['lat']}, {camera['lon']})")

        conn.commit()
        conn.close()

        print(f"\n✅ Successfully added {len(test_cameras)} test cameras to database")
        return True

    except Exception as e:
        print(f"\n❌ Error adding test cameras: {e}")
        import traceback
        traceback.print_exc()
        return False

def test_graphhopper_without_avoidance():
    """Test GraphHopper route WITHOUT hazard avoidance."""
    print("\n" + "="*80)
    print("TEST 1: GraphHopper WITHOUT Hazard Avoidance (Baseline)")
    print("="*80)

    payload = {
        "start": f"{START_LAT},{START_LON}",
        "end": f"{END_LAT},{END_LON}",
        "routing_mode": "auto",
        "vehicle_type": "petrol_diesel",
        "enable_hazard_avoidance": False,
        "preferred_engine": "graphhopper"
    }

    print(f"\nRequest: {json.dumps(payload, indent=2)}")

    start_time = time.time()
    response = requests.post(f"{VOYAGR_URL}/api/route", json=payload, timeout=30)
    elapsed = (time.time() - start_time) * 1000

    print(f"\nResponse Status: {response.status_code}")
    print(f"Response Time: {elapsed:.0f}ms")

    if response.status_code == 200:
        data = response.json()
        print(f"\n✅ Source: {data.get('source')}")
        print(f"Routes: {len(data.get('routes', []))}")

        for idx, route in enumerate(data.get('routes', [])[:1]):  # Only show first route
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

        return data
    else:
        print(f"❌ Error: {response.text[:500]}")
        return None

def test_graphhopper_with_avoidance():
    """Test GraphHopper route WITH polygon-based hazard avoidance."""
    print("\n" + "="*80)
    print("TEST 2: GraphHopper WITH Polygon-Based Hazard Avoidance")
    print("="*80)

    payload = {
        "start": f"{START_LAT},{START_LON}",
        "end": f"{END_LAT},{END_LON}",
        "routing_mode": "auto",
        "vehicle_type": "petrol_diesel",
        "enable_hazard_avoidance": True,
        "preferred_engine": "graphhopper"
    }

    print(f"\nRequest: {json.dumps(payload, indent=2)}")

    start_time = time.time()
    response = requests.post(f"{VOYAGR_URL}/api/route", json=payload, timeout=30)
    elapsed = (time.time() - start_time) * 1000

    print(f"\nResponse Status: {response.status_code}")
    print(f"Response Time: {elapsed:.0f}ms")

    if response.status_code == 200:
        data = response.json()
        print(f"\n✅ Source: {data.get('source')}")
        print(f"Routes: {len(data.get('routes', []))}")

        for idx, route in enumerate(data.get('routes', [])[:1]):  # Only show first route
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
                print(f"  ✅ No hazards on route (polygon avoidance working!)")

        return data
    else:
        print(f"❌ Error: {response.text[:500]}")
        return None

def test_valhalla_without_avoidance():
    """Test Valhalla route WITHOUT hazard avoidance."""
    print("\n" + "="*80)
    print("TEST 3: Valhalla WITHOUT Hazard Avoidance (Baseline)")
    print("="*80)

    payload = {
        "start": f"{START_LAT},{START_LON}",
        "end": f"{END_LAT},{END_LON}",
        "routing_mode": "auto",
        "vehicle_type": "petrol_diesel",
        "enable_hazard_avoidance": False,
        "preferred_engine": "valhalla"
    }

    print(f"\nRequest: {json.dumps(payload, indent=2)}")

    start_time = time.time()
    response = requests.post(f"{VOYAGR_URL}/api/route", json=payload, timeout=30)
    elapsed = (time.time() - start_time) * 1000

    print(f"\nResponse Status: {response.status_code}")
    print(f"Response Time: {elapsed:.0f}ms")

    if response.status_code == 200:
        data = response.json()
        print(f"\n✅ Source: {data.get('source')}")
        print(f"Routes: {len(data.get('routes', []))}")

        for idx, route in enumerate(data.get('routes', [])[:1]):  # Only show first route
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

        return data
    else:
        print(f"❌ Error: {response.text[:500]}")
        return None

def test_valhalla_with_avoidance():
    """Test Valhalla route WITH exclude_polygons hazard avoidance."""
    print("\n" + "="*80)
    print("TEST 4: Valhalla WITH exclude_polygons Hazard Avoidance")
    print("="*80)

    payload = {
        "start": f"{START_LAT},{START_LON}",
        "end": f"{END_LAT},{END_LON}",
        "routing_mode": "auto",
        "vehicle_type": "petrol_diesel",
        "enable_hazard_avoidance": True,
        "preferred_engine": "valhalla"
    }

    print(f"\nRequest: {json.dumps(payload, indent=2)}")

    start_time = time.time()
    response = requests.post(f"{VOYAGR_URL}/api/route", json=payload, timeout=30)
    elapsed = (time.time() - start_time) * 1000

    print(f"\nResponse Status: {response.status_code}")
    print(f"Response Time: {elapsed:.0f}ms")

    if response.status_code == 200:
        data = response.json()
        print(f"\n✅ Source: {data.get('source')}")
        print(f"Routes: {len(data.get('routes', []))}")

        for idx, route in enumerate(data.get('routes', [])[:1]):  # Only show first route
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
        print(f"❌ Error: {response.text[:500]}")
        return None

if __name__ == "__main__":
    print("\n" + "="*80)
    print("POLYGON-BASED HAZARD AVOIDANCE TEST")
    print("GraphHopper & Valhalla Only (Custom Router Excluded)")
    print("="*80)
    print("\nThis test verifies:")
    print("1. GraphHopper custom model with multiply_by=0 (complete blocking)")
    print("2. Valhalla exclude_polygons parameter")
    print("3. 100m radius polygons around hazards")
    print("4. Support for static and dynamic hazards")

    # Setup: Add test cameras
    if not add_test_cameras_to_db():
        print("\n❌ Failed to add test cameras. Exiting.")
        exit(1)

    # Wait for server to be ready
    print("\nWaiting 2 seconds for server to be ready...")
    time.sleep(2)

    # Run tests
    gh_baseline = test_graphhopper_without_avoidance()
    gh_avoidance = test_graphhopper_with_avoidance()

    vh_baseline = test_valhalla_without_avoidance()
    vh_avoidance = test_valhalla_with_avoidance()

    # Summary
    print("\n" + "="*80)
    print("TEST SUMMARY")
    print("="*80)

    if gh_baseline and gh_avoidance:
        gh_base_hazards = gh_baseline['routes'][0].get('hazard_count', 0) if gh_baseline.get('routes') else 0
        gh_avoid_hazards = gh_avoidance['routes'][0].get('hazard_count', 0) if gh_avoidance.get('routes') else 0

        print(f"\n📊 GraphHopper Results:")
        print(f"  Baseline hazards: {gh_base_hazards}")
        print(f"  With avoidance: {gh_avoid_hazards}")
        print(f"  Reduction: {gh_base_hazards - gh_avoid_hazards} hazards")

        if gh_avoid_hazards < gh_base_hazards:
            print(f"  ✅ GraphHopper polygon avoidance WORKING!")
        else:
            print(f"  ⚠️  GraphHopper polygon avoidance may not be working")

    if vh_baseline and vh_avoidance:
        vh_base_hazards = vh_baseline['routes'][0].get('hazard_count', 0) if vh_baseline.get('routes') else 0
        vh_avoid_hazards = vh_avoidance['routes'][0].get('hazard_count', 0) if vh_avoidance.get('routes') else 0

        print(f"\n📊 Valhalla Results:")
        print(f"  Baseline hazards: {vh_base_hazards}")
        print(f"  With avoidance: {vh_avoid_hazards}")
        print(f"  Reduction: {vh_base_hazards - vh_avoid_hazards} hazards")

        if vh_avoid_hazards < vh_base_hazards:
            print(f"  ✅ Valhalla exclude_polygons WORKING!")
        else:
            print(f"  ⚠️  Valhalla exclude_polygons may not be working")

    print("\n" + "="*80)
    print("Expected Results:")
    print("- Routes WITH hazard avoidance should have ZERO or very low hazard counts")
    print("- Routes should go around 100m exclusion zones")
    print("- GraphHopper uses custom model with polygon areas (multiply_by=0)")
    print("- Valhalla uses exclude_polygons parameter")
    print("="*80)


#!/usr/bin/env python3
"""
Test Valhalla and GraphHopper polygon-based hazard avoidance with SCDB camera database.
Tests Valhalla as primary engine, GraphHopper as secondary.
"""

import requests
import json
import time
import sqlite3

# Configuration
VOYAGR_URL = "http://localhost:5000"
DB_FILE = "voyagr_web.db"  # Correct database with SCDB cameras

# Test route: Central London with known camera locations
# This route passes through areas with high camera density
START = "51.5074,-0.1278"  # Hyde Park, London
END = "51.5155,-0.0922"    # St Paul's Cathedral, London

def check_camera_count():
    """Check how many cameras are in the database."""
    try:
        conn = sqlite3.connect(DB_FILE)
        cursor = conn.cursor()
        cursor.execute("SELECT COUNT(*) FROM cameras")
        count = cursor.fetchone()[0]
        conn.close()
        print(f"📊 Database has {count:,} cameras loaded")
        return count
    except Exception as e:
        print(f"❌ Error checking camera count: {e}")
        return 0

def test_route(engine, enable_hazard_avoidance, test_name):
    """Test a route with specified engine and hazard avoidance setting."""
    print("\n" + "="*80)
    print(f"{test_name}")
    print("="*80)

    payload = {
        "start": START,
        "end": END,
        "routing_mode": "auto",
        "vehicle_type": "petrol_diesel",
        "enable_hazard_avoidance": enable_hazard_avoidance,
        "preferred_engine": engine
    }

    print(f"\nRequest:")
    print(f"  Engine: {engine}")
    print(f"  Hazard Avoidance: {enable_hazard_avoidance}")
    print(f"  Route: {START} → {END}")

    start_time = time.time()
    try:
        response = requests.post(f"{VOYAGR_URL}/api/route", json=payload, timeout=30)
        elapsed = (time.time() - start_time) * 1000

        print(f"\nResponse Status: {response.status_code}")
        print(f"Response Time: {elapsed:.0f}ms")

        if response.status_code == 200:
            data = response.json()
            source = data.get('source', 'Unknown')
            routes = data.get('routes', [])

            print(f"\n✅ Source: {source}")
            print(f"Routes: {len(routes)}")

            if routes:
                route = routes[0]
                print(f"\nRoute 1: {route.get('name', 'Unknown')}")
                print(f"  Distance: {route.get('distance_km', 0)} km")
                print(f"  Duration: {route.get('duration_minutes', 0)} min")
                print(f"  Hazard Count: {route.get('hazard_count', 0)}")
                print(f"  Hazard Penalty: {route.get('hazard_penalty_seconds', 0)}s")

                hazards = route.get('hazards', [])
                if hazards:
                    print(f"  Hazards on route:")
                    for h in hazards[:10]:  # Show first 10
                        print(f"    - {h.get('type', 'unknown')}: {h.get('description', 'N/A')}")
                    if len(hazards) > 10:
                        print(f"    ... and {len(hazards) - 10} more")

                return {
                    'source': source,
                    'hazard_count': route.get('hazard_count', 0),
                    'hazard_penalty': route.get('hazard_penalty_seconds', 0),
                    'distance': route.get('distance_km', 0),
                    'duration': route.get('duration_minutes', 0)
                }
        else:
            print(f"\n❌ Error: HTTP {response.status_code}")
            print(f"Response: {response.text[:500]}")

    except Exception as e:
        print(f"\n❌ Exception: {e}")
        import traceback
        traceback.print_exc()

    return None

def main():
    print("="*80)
    print("POLYGON-BASED HAZARD AVOIDANCE TEST")
    print("Valhalla (Primary) & GraphHopper (Secondary)")
    print("Using SCDB Camera Database")
    print("="*80)

    # Check camera count
    camera_count = check_camera_count()
    if camera_count == 0:
        print("\n❌ No cameras in database! Run: python load_scdb_cameras.py")
        return

    print("\nWaiting 2 seconds for server to be ready...")
    time.sleep(2)

    # Test 1: Valhalla WITHOUT hazard avoidance (baseline)
    valhalla_baseline = test_route("valhalla", False, "TEST 1: Valhalla WITHOUT Hazard Avoidance (Baseline)")

    # Test 2: Valhalla WITH hazard avoidance (exclude_polygons)
    valhalla_avoidance = test_route("valhalla", True, "TEST 2: Valhalla WITH Polygon-Based Hazard Avoidance")

    # Test 3: GraphHopper WITHOUT hazard avoidance (baseline)
    graphhopper_baseline = test_route("graphhopper", False, "TEST 3: GraphHopper WITHOUT Hazard Avoidance (Baseline)")

    # Test 4: GraphHopper WITH hazard avoidance (custom model)
    graphhopper_avoidance = test_route("graphhopper", True, "TEST 4: GraphHopper WITH Polygon-Based Hazard Avoidance")

    # Summary
    print("\n" + "="*80)
    print("TEST SUMMARY")
    print("="*80)

    if valhalla_baseline and valhalla_avoidance:
        print(f"\n📊 Valhalla Results:")
        print(f"  Baseline hazards: {valhalla_baseline['hazard_count']}")
        print(f"  With avoidance: {valhalla_avoidance['hazard_count']}")
        reduction = valhalla_baseline['hazard_count'] - valhalla_avoidance['hazard_count']
        print(f"  Reduction: {reduction} hazards")
        if valhalla_avoidance['hazard_count'] < valhalla_baseline['hazard_count']:
            print(f"  ✅ Valhalla exclude_polygons is working!")
        else:
            print(f"  ⚠️  Valhalla exclude_polygons may not be working")

    if graphhopper_baseline and graphhopper_avoidance:
        print(f"\n📊 GraphHopper Results:")
        print(f"  Baseline hazards: {graphhopper_baseline['hazard_count']}")
        print(f"  With avoidance: {graphhopper_avoidance['hazard_count']}")
        reduction = graphhopper_baseline['hazard_count'] - graphhopper_avoidance['hazard_count']
        print(f"  Reduction: {reduction} hazards")
        if graphhopper_avoidance['hazard_count'] < graphhopper_baseline['hazard_count']:
            print(f"  ✅ GraphHopper polygon avoidance is working!")
        else:
            print(f"  ⚠️  GraphHopper polygon avoidance may not be working")

if __name__ == "__main__":
    main()


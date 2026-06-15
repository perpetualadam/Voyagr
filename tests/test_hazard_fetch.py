#!/usr/bin/env python3
"""
Direct test of hazard fetching and scoring functions.
"""

# --- Windows console UTF-8 (auto-added) ---
import sys as _vsys
if _vsys.platform == "win32":
    try:
        _vsys.stdout.reconfigure(encoding="utf-8", errors="replace")
        _vsys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass


import sqlite3
import sys
import math

# Test coordinates (Barnsley to Balby, Doncaster)
START_LAT = 53.5526
START_LON = -1.4797
END_LAT = 53.5167
END_LON = -1.0833

def get_distance_between_points(lat1, lon1, lat2, lon2):
    """Calculate distance between two points in meters using Haversine formula."""
    R = 6371000  # Earth radius in meters
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)

    a = math.sin(delta_phi/2)**2 + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda/2)**2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))
    return R * c

def fetch_hazards_for_route(start_lat, start_lon, end_lat, end_lon):
    """Fetch hazards within bounding box of route."""
    conn = sqlite3.connect('voyagr.db')
    cursor = conn.cursor()

    # Calculate bounding box with 10km buffer
    north = max(start_lat, end_lat) + 0.1
    south = min(start_lat, end_lat) - 0.1
    east = max(start_lon, end_lon) + 0.1
    west = min(start_lon, end_lon) - 0.1

    print(f"\n📍 Bounding Box:")
    print(f"  North: {north:.4f}")
    print(f"  South: {south:.4f}")
    print(f"  East: {east:.4f}")
    print(f"  West: {west:.4f}")

    hazards = {
        'speed_camera': [],
        'police': [],
        'roadworks': [],
        'accident': [],
        'railway_crossing': [],
        'pothole': [],
        'debris': []
    }

    # Fetch cameras (only speed_camera type)
    cursor.execute(
        "SELECT lat, lon, type, description FROM cameras WHERE lat BETWEEN ? AND ? AND lon BETWEEN ? AND ? AND type = 'speed_camera'",
        (south, north, west, east)
    )
    
    cameras = cursor.fetchall()
    print(f"\n📷 Cameras fetched from database: {len(cameras)}")
    
    for lat, lon, camera_type, desc in cameras:
        hazards['speed_camera'].append({'lat': lat, 'lon': lon, 'description': desc, 'severity': 'high'})
        print(f"  - ({lat:.4f}, {lon:.4f}) - {desc[:50]}")

    conn.close()
    return hazards

def test_hazard_preferences():
    """Check hazard preferences table."""
    conn = sqlite3.connect('voyagr.db')
    cursor = conn.cursor()
    
    cursor.execute("SELECT hazard_type, penalty_seconds, proximity_threshold_meters, enabled FROM hazard_preferences")
    prefs = cursor.fetchall()
    
    print(f"\n⚙️ Hazard Preferences:")
    for hazard_type, penalty, threshold, enabled in prefs:
        status = "✅ ENABLED" if enabled else "❌ DISABLED"
        print(f"  {status} {hazard_type}: penalty={penalty}s, threshold={threshold}m")
    
    conn.close()
    return prefs

if __name__ == "__main__":
    print("="*80)
    print("HAZARD FETCH TEST")
    print("="*80)
    
    # Test 1: Check hazard preferences
    prefs = test_hazard_preferences()
    
    # Test 2: Fetch hazards
    print(f"\n" + "="*80)
    print("FETCHING HAZARDS")
    print("="*80)
    hazards = fetch_hazards_for_route(START_LAT, START_LON, END_LAT, END_LON)
    
    print(f"\n📊 Summary:")
    for hazard_type, hazard_list in hazards.items():
        if hazard_list:
            print(f"  {hazard_type}: {len(hazard_list)} hazards")
    
    total_hazards = sum(len(v) for v in hazards.values())
    print(f"\n✅ Total hazards fetched: {total_hazards}")
    
    if total_hazards == 0:
        print("\n❌ ERROR: No hazards fetched!")
        print("   This explains why the API returns 0 hazards.")
        sys.exit(1)
    else:
        print("\n✅ SUCCESS: Hazards are being fetched correctly!")
        print("   The issue must be in the scoring or API response.")


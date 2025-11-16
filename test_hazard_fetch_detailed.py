#!/usr/bin/env python3
"""Test hazard fetching in detail"""

import sys
sys.path.insert(0, '/Users/Brian/OneDrive/Documents/augment-projects/Voyagr')

# Import the function from voyagr_web
import sqlite3
import json
import time
from typing import Dict, List, Tuple, Any

def get_db_connection():
    """Get database connection"""
    conn = sqlite3.connect('voyagr_web.db')
    conn.row_factory = sqlite3.Row
    return conn

def fetch_hazards_for_route(start_lat: float, start_lon: float, end_lat: float, end_lon: float) -> Dict[str, List[Dict[str, Any]]]:
    """Fetch hazards within bounding box of route."""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()

        # Calculate bounding box with 10km buffer
        north = max(start_lat, end_lat) + 0.1
        south = min(start_lat, end_lat) - 0.1
        east = max(start_lon, end_lon) + 0.1
        west = min(start_lon, end_lon) - 0.1

        print(f"Bounding box: Lat {south:.4f} to {north:.4f}, Lon {west:.4f} to {east:.4f}")

        hazards = {
            'speed_camera': [],
            'traffic_light_camera': [],
            'police': [],
            'roadworks': [],
            'accident': [],
            'railway_crossing': [],
            'pothole': [],
            'debris': []
        }

        # Fetch cameras
        cursor.execute(
            "SELECT lat, lon, type, description FROM cameras WHERE lat BETWEEN ? AND ? AND lon BETWEEN ? AND ?",
            (south, north, west, east)
        )
        cameras = cursor.fetchall()
        print(f"Found {len(cameras)} cameras in bounding box")
        
        for lat, lon, camera_type, desc in cameras:
            print(f"  Processing camera: ({lat}, {lon}) - {camera_type}")
            # CRITICAL FIX: Treat speed_camera as traffic_light_camera for hazard avoidance
            if camera_type == 'speed_camera':
                hazards['traffic_light_camera'].append({'lat': lat, 'lon': lon, 'description': desc, 'severity': 'high'})
                print(f"    → Added to traffic_light_camera")
            elif camera_type in hazards:
                hazards[camera_type].append({'lat': lat, 'lon': lon, 'description': desc, 'severity': 'high'})
                print(f"    → Added to {camera_type}")

        conn.close()
        
        print()
        print("Hazards summary:")
        for hazard_type, hazard_list in hazards.items():
            if len(hazard_list) > 0:
                print(f"  {hazard_type}: {len(hazard_list)}")
        
        return hazards
    except Exception as e:
        print(f"Error fetching hazards: {e}")
        return {}

# Test with Barnsley to Balby
print("=" * 60)
print("Testing hazard fetch for Barnsley → Balby")
print("=" * 60)
print()

start_lat, start_lon = 53.5505, -1.4793
end_lat, end_lon = 53.5000, -1.1500

hazards = fetch_hazards_for_route(start_lat, start_lon, end_lat, end_lon)

print()
print("=" * 60)
print("Result:")
print("=" * 60)
print(f"Total hazards: {sum(len(v) for v in hazards.values())}")
print(f"Hazards dict is truthy: {bool(hazards)}")
print(f"Any hazards present: {any(len(v) > 0 for v in hazards.values())}")


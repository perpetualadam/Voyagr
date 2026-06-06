#!/usr/bin/env python3
"""
Test hazard avoidance in custom router.

This script tests:
1. Static hazard avoidance (cameras) - pre-calculated penalties
2. Dynamic hazard avoidance (accidents, roadworks) - runtime penalties
3. Route comparison with/without hazard avoidance

Usage:
    python test_custom_router_hazards.py
"""

# --- Windows console UTF-8 (auto-added) ---
import sys as _vsys
if _vsys.platform == "win32":
    try:
        _vsys.stdout.reconfigure(encoding="utf-8", errors="replace")
        _vsys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass


import os
import sys
import time
import sqlite3

# Add custom_router to path
sys.path.insert(0, os.path.dirname(__file__))

from custom_router.graph import RoadNetwork
from custom_router.dijkstra import Router
from custom_router.hazards import HazardManager


def add_test_camera(lat, lon, description="Test Camera"):
    """Add a test camera to the database."""
    conn = sqlite3.connect('data/voyagr.db')
    cursor = conn.cursor()
    
    # Check if cameras table exists
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='cameras'")
    if not cursor.fetchone():
        print("⚠️  WARNING: cameras table does not exist in voyagr.db")
        print("Creating cameras table...")
        cursor.execute("""
            CREATE TABLE cameras (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                lat REAL NOT NULL,
                lon REAL NOT NULL,
                type TEXT NOT NULL,
                description TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
    
    # Insert test camera
    cursor.execute(
        "INSERT INTO cameras (lat, lon, type, description) VALUES (?, ?, ?, ?)",
        (lat, lon, 'speed_camera', description)
    )
    conn.commit()
    camera_id = cursor.lastrowid
    conn.close()
    
    print(f"✅ Added test camera at ({lat}, {lon}): {description}")
    return camera_id


def test_hazard_avoidance():
    """Test hazard avoidance functionality."""
    print("=" * 80)
    print("CUSTOM ROUTER HAZARD AVOIDANCE TEST")
    print("=" * 80)
    print()
    
    # Test coordinates (London area)
    start_lat, start_lon = 51.5074, -0.1278  # London center
    end_lat, end_lon = 51.5155, -0.0922      # East London
    
    # Add test camera between start and end
    camera_lat = (start_lat + end_lat) / 2
    camera_lon = (start_lon + end_lon) / 2
    camera_id = add_test_camera(camera_lat, camera_lon, "Test Camera - Between Start/End")
    
    print()
    print("Test Setup:")
    print(f"  Start: ({start_lat}, {start_lon})")
    print(f"  End: ({end_lat}, {end_lon})")
    print(f"  Camera: ({camera_lat}, {camera_lon})")
    print()
    
    # Test 1: Route WITHOUT hazard avoidance
    print("=" * 80)
    print("TEST 1: Route WITHOUT Hazard Avoidance")
    print("=" * 80)
    print()
    
    print("Loading graph without hazard manager...")
    graph_no_hazards = RoadNetwork('data/uk_router.db', skip_component_detection=True)
    router_no_hazards = Router(graph_no_hazards, use_ch=False)
    
    print("Calculating route...")
    start_time = time.time()
    result_no_hazards = router_no_hazards.route(start_lat, start_lon, end_lat, end_lon)
    elapsed_no_hazards = time.time() - start_time
    
    if result_no_hazards:
        print(f"✅ Route found (no hazards)")
        print(f"   Distance: {result_no_hazards['distance_km']:.2f} km")
        print(f"   Duration: {result_no_hazards['duration_minutes']:.1f} min")
        print(f"   Time: {elapsed_no_hazards:.2f}s")
    else:
        print("❌ No route found")
    
    print()
    
    # Test 2: Route WITH hazard avoidance
    print("=" * 80)
    print("TEST 2: Route WITH Hazard Avoidance")
    print("=" * 80)
    print()
    
    print("Loading graph with hazard manager...")
    hazard_manager = HazardManager(db_file='data/voyagr.db')
    graph_with_hazards = RoadNetwork('data/uk_router.db', skip_component_detection=True, hazard_manager=hazard_manager)
    router_with_hazards = Router(graph_with_hazards, use_ch=False, hazard_manager=hazard_manager)
    
    print("Calculating route...")
    start_time = time.time()
    result_with_hazards = router_with_hazards.route(start_lat, start_lon, end_lat, end_lon)
    elapsed_with_hazards = time.time() - start_time
    
    if result_with_hazards:
        print(f"✅ Route found (with hazards)")
        print(f"   Distance: {result_with_hazards['distance_km']:.2f} km")
        print(f"   Duration: {result_with_hazards['duration_minutes']:.1f} min")
        print(f"   Time: {elapsed_with_hazards:.2f}s")
    else:
        print("❌ No route found")
    
    print()
    
    # Cleanup: Remove test camera
    conn = sqlite3.connect('data/voyagr.db')
    cursor = conn.cursor()
    cursor.execute("DELETE FROM cameras WHERE id = ?", (camera_id,))
    conn.commit()
    conn.close()
    print(f"🗑️  Removed test camera (ID: {camera_id})")
    
    print()
    print("=" * 80)
    print("TEST COMPLETE")
    print("=" * 80)


if __name__ == '__main__':
    test_hazard_avoidance()


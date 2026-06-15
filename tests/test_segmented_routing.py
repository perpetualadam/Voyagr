#!/usr/bin/env python3
"""
Test segmented routing with multiple waypoints to bypass the 50-location limit.
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
import math

def haversine_distance(lat1, lon1, lat2, lon2):
    """Calculate distance between two points in meters."""
    R = 6371000  # Earth radius in meters
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)
    
    a = math.sin(delta_phi/2)**2 + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda/2)**2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))
    
    return R * c

def calculate_midpoint(lat1, lon1, lat2, lon2):
    """Calculate midpoint between two coordinates."""
    return (lat1 + lat2) / 2, (lon1 + lon2) / 2

def test_direct_route(start_lat, start_lon, end_lat, end_lon):
    """Test direct route (current approach)."""
    print("\n" + "="*80)
    print("DIRECT ROUTE (Current Approach)")
    print("="*80)
    
    request = {
        "start": f"{start_lat},{start_lon}",
        "end": f"{end_lat},{end_lon}",
        "routing_mode": "auto",
        "vehicle_type": "petrol_diesel",
        "enable_hazard_avoidance": True
    }
    
    try:
        response = requests.post('http://localhost:5000/api/route', json=request, timeout=30)
        if response.status_code == 200:
            data = response.json()
            if data.get('success'):
                route = data['routes'][0]
                print(f"✅ Source: {data.get('source', 'Unknown')}")
                print(f"Distance: {route.get('distance_km', 0):.2f} km")
                print(f"Duration: {route.get('duration_minutes', 0):.0f} min")
                print(f"Hazards: {route.get('hazard_count', 0)}")
                return route.get('hazard_count', 0), route.get('distance_km', 0), route.get('duration_minutes', 0)
            else:
                print(f"❌ Failed: {data.get('error', 'Unknown error')}")
                return None, None, None
        else:
            print(f"❌ HTTP {response.status_code}")
            return None, None, None
    except Exception as e:
        print(f"❌ Error: {e}")
        return None, None, None

def test_segmented_route(start_lat, start_lon, end_lat, end_lon, num_segments=2):
    """Test segmented route with multiple waypoints."""
    print("\n" + "="*80)
    print(f"SEGMENTED ROUTE ({num_segments} segments)")
    print("="*80)
    
    # Calculate waypoints
    waypoints = []
    for i in range(num_segments + 1):
        t = i / num_segments
        lat = start_lat + t * (end_lat - start_lat)
        lon = start_lon + t * (end_lon - start_lon)
        waypoints.append({"lat": lat, "lon": lon})
    
    print(f"Waypoints: {len(waypoints)}")
    for i, wp in enumerate(waypoints):
        print(f"  {i}: ({wp['lat']:.4f}, {wp['lon']:.4f})")
    
    # Calculate each segment
    total_hazards = 0
    total_distance = 0
    total_duration = 0
    
    for i in range(len(waypoints) - 1):
        start = waypoints[i]
        end = waypoints[i + 1]
        
        print(f"\nSegment {i+1}/{num_segments}:")
        
        request = {
            "start": f"{start['lat']},{start['lon']}",
            "end": f"{end['lat']},{end['lon']}",
            "routing_mode": "auto",
            "vehicle_type": "petrol_diesel",
            "enable_hazard_avoidance": True
        }
        
        try:
            response = requests.post('http://localhost:5000/api/route', json=request, timeout=30)
            if response.status_code == 200:
                data = response.json()
                if data.get('success'):
                    route = data['routes'][0]
                    hazards = route.get('hazard_count', 0)
                    distance = route.get('distance_km', 0)
                    duration = route.get('duration_minutes', 0)
                    
                    print(f"  ✅ Hazards: {hazards}, Distance: {distance:.2f} km, Duration: {duration:.0f} min")
                    
                    total_hazards += hazards
                    total_distance += distance
                    total_duration += duration
                else:
                    print(f"  ❌ Failed: {data.get('error', 'Unknown error')}")
                    return None, None, None
            else:
                print(f"  ❌ HTTP {response.status_code}")
                return None, None, None
        except Exception as e:
            print(f"  ❌ Error: {e}")
            return None, None, None
    
    print(f"\n📊 Total:")
    print(f"  Hazards: {total_hazards}")
    print(f"  Distance: {total_distance:.2f} km")
    print(f"  Duration: {total_duration:.0f} min")
    
    return total_hazards, total_distance, total_duration

if __name__ == "__main__":
    # Test route: Manchester to Liverpool (345 cameras, high density)
    start_lat, start_lon = 53.4808, -2.2426  # Manchester
    end_lat, end_lon = 53.4084, -2.9916      # Liverpool
    
    print("="*80)
    print("TESTING SEGMENTED ROUTING TO BYPASS 50-LOCATION LIMIT")
    print("="*80)
    print(f"\nRoute: Manchester ({start_lat}, {start_lon}) → Liverpool ({end_lat}, {end_lon})")
    print(f"Expected cameras in bbox: ~345")
    
    # Test 1: Direct route (baseline)
    direct_hazards, direct_distance, direct_duration = test_direct_route(start_lat, start_lon, end_lat, end_lon)
    
    # Test 2: 2-segment route
    seg2_hazards, seg2_distance, seg2_duration = test_segmented_route(start_lat, start_lon, end_lat, end_lon, num_segments=2)
    
    # Test 3: 3-segment route
    seg3_hazards, seg3_distance, seg3_duration = test_segmented_route(start_lat, start_lon, end_lat, end_lon, num_segments=3)
    
    # Compare results
    print("\n" + "="*80)
    print("COMPARISON")
    print("="*80)
    
    if direct_hazards is not None and seg2_hazards is not None and seg3_hazards is not None:
        print(f"\n{'Approach':<20} {'Hazards':<10} {'Distance':<15} {'Duration':<15} {'Improvement'}")
        print("-" * 80)
        print(f"{'Direct (1 segment)':<20} {direct_hazards:<10} {direct_distance:<15.2f} {direct_duration:<15.0f} {'Baseline'}")
        
        if seg2_hazards is not None:
            improvement2 = ((direct_hazards - seg2_hazards) / direct_hazards * 100) if direct_hazards > 0 else 0
            print(f"{'Segmented (2 seg)':<20} {seg2_hazards:<10} {seg2_distance:<15.2f} {seg2_duration:<15.0f} {improvement2:+.1f}%")
        
        if seg3_hazards is not None:
            improvement3 = ((direct_hazards - seg3_hazards) / direct_hazards * 100) if direct_hazards > 0 else 0
            print(f"{'Segmented (3 seg)':<20} {seg3_hazards:<10} {seg3_distance:<15.2f} {seg3_duration:<15.0f} {improvement3:+.1f}%")
        
        print("\n" + "="*80)
        print("CONCLUSION")
        print("="*80)
        
        if seg2_hazards < direct_hazards or seg3_hazards < direct_hazards:
            print("✅ Segmented routing WORKS! Fewer hazards than direct route.")
            print("💡 Recommendation: Implement automatic segmentation for long routes.")
        else:
            print("❌ Segmented routing does NOT improve results.")
            print("💡 Valhalla may be applying exclusions globally, not per-segment.")


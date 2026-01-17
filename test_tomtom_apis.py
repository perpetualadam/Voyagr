#!/usr/bin/env python3
"""
Test script for TomTom Snap to Roads and Traffic Flow APIs
"""
import os
import sys
import sqlite3
from dotenv import load_dotenv
from speed_limit_detector import SpeedLimitDetector

# Load environment variables
load_dotenv()

def test_speed_limit_apis():
    """Test both TomTom APIs for speed limit detection."""
    
    # Check if TomTom API key is configured
    tomtom_key = os.getenv('TOMTOM_API_KEY')
    if not tomtom_key:
        print("❌ TOMTOM_API_KEY not found in .env file")
        print("   Please add your TomTom API key to test the APIs")
        return
    
    print("=" * 60)
    print("🧪 Testing TomTom Speed Limit APIs")
    print("=" * 60)
    print()
    
    # Initialize detector
    detector = SpeedLimitDetector()
    
    # Test locations
    test_locations = [
        {
            'name': 'London - Central (30 mph zone)',
            'lat': 51.5074,
            'lon': -0.1278,
            'road_type': 'residential',
            'expected': 30
        },
        {
            'name': 'M1 Motorway (70 mph)',
            'lat': 51.6639,
            'lon': -0.3961,
            'road_type': 'motorway',
            'expected': 70
        },
        {
            'name': 'Manchester - Urban (30 mph)',
            'lat': 53.4808,
            'lon': -2.2426,
            'road_type': 'primary',
            'expected': 30
        },
        {
            'name': 'A-Road (60 mph)',
            'lat': 51.7520,
            'lon': -1.2577,
            'road_type': 'primary',
            'expected': 60
        }
    ]
    
    results = []
    
    for location in test_locations:
        print(f"📍 Testing: {location['name']}")
        print(f"   Coordinates: ({location['lat']}, {location['lon']})")
        print(f"   Expected: {location['expected']} mph")
        
        # Get speed limit
        result = detector.get_speed_limit_for_location(
            location['lat'],
            location['lon'],
            location['road_type']
        )
        
        detected_limit = result.get('speed_limit_mph', 'N/A')
        source = result.get('source', 'Unknown')
        
        print(f"   Detected: {detected_limit} mph")
        print(f"   Source: {source}")
        
        # Check accuracy
        if detected_limit == location['expected']:
            print("   ✅ CORRECT")
            results.append(True)
        else:
            diff = abs(detected_limit - location['expected']) if isinstance(detected_limit, int) else 'N/A'
            print(f"   ⚠️  DIFFERENCE: {diff} mph")
            results.append(False)
        
        print()
    
    # Print metrics
    print("=" * 60)
    print("📊 API Metrics")
    print("=" * 60)
    metrics = detector.get_metrics()
    
    print(f"\n🔹 TomTom Snap to Roads API:")
    snap_metrics = metrics.get('tomtom_snap_to_roads', {})
    print(f"   Total Calls: {snap_metrics.get('total_calls', 0)}")
    print(f"   Successful: {snap_metrics.get('successful', 0)}")
    print(f"   Failures: {snap_metrics.get('failures', 0)}")
    print(f"   Success Rate: {snap_metrics.get('success_rate', 0)}%")
    
    print(f"\n🔹 TomTom Traffic Flow API:")
    flow_metrics = metrics.get('tomtom_traffic_flow', {})
    print(f"   Total Calls: {flow_metrics.get('total_calls', 0)}")
    print(f"   Successful: {flow_metrics.get('successful', 0)}")
    print(f"   Failures: {flow_metrics.get('failures', 0)}")
    print(f"   Success Rate: {flow_metrics.get('success_rate', 0)}%")
    
    print(f"\n🔹 Overpass API:")
    overpass_metrics = metrics.get('overpass', {})
    print(f"   Total Calls: {overpass_metrics.get('total_calls', 0)}")
    print(f"   Maxspeed Hits: {overpass_metrics.get('maxspeed_hits', 0)}")
    print(f"   Highway Inferred: {overpass_metrics.get('highway_inferred', 0)}")
    
    print(f"\n🔹 Data Sources:")
    sources = metrics.get('sources', {})
    print(f"   Snap to Roads: {sources.get('tomtom_snap_to_roads_percentage', 0)}%")
    print(f"   Traffic Flow: {sources.get('tomtom_traffic_flow_percentage', 0)}%")
    print(f"   OSM Maxspeed: {sources.get('overpass_maxspeed_percentage', 0)}%")
    print(f"   OSM Inferred: {sources.get('overpass_inferred_percentage', 0)}%")
    print(f"   Default: {sources.get('default_fallback_percentage', 0)}%")
    
    # Summary
    print("\n" + "=" * 60)
    print("📈 Test Summary")
    print("=" * 60)
    accuracy = (sum(results) / len(results) * 100) if results else 0
    print(f"Accuracy: {accuracy:.1f}% ({sum(results)}/{len(results)} correct)")
    print()
    
    if accuracy >= 75:
        print("✅ APIs are working well!")
    elif accuracy >= 50:
        print("⚠️  APIs are partially working - check configuration")
    else:
        print("❌ APIs need attention - check API keys and connectivity")

if __name__ == '__main__':
    test_speed_limit_apis()


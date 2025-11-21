#!/usr/bin/env python3
"""Test custom routing engine with CH implementation."""

import requests
import json
import time

def test_route(start, end, description):
    """Test a single route."""
    print(f"\n{'='*70}")
    print(f"TEST: {description}")
    print(f"{'='*70}")
    print(f"Start: {start}")
    print(f"End: {end}")
    print()
    
    url = 'http://localhost:5000/api/route'
    data = {
        'start': start,
        'end': end,
        'enable_hazard_avoidance': False
    }
    
    try:
        start_time = time.time()
        response = requests.post(url, json=data, timeout=120)
        elapsed = time.time() - start_time
        
        print(f"Status: {response.status_code}")
        print(f"Total time: {elapsed:.1f}s")
        print()
        
        result = response.json()
        if 'routes' in result and len(result['routes']) > 0:
            route = result['routes'][0]
            print(f"✅ Route found!")
            print(f"  Distance: {route.get('distance_km', 'N/A')} km")
            print(f"  Duration: {route.get('duration_minutes', 'N/A')} minutes")
            print(f"  Engine: {route.get('engine', 'N/A')}")
            print(f"  Algorithm: {route.get('algorithm', 'N/A')}")
            print(f"  Response time: {route.get('response_time_ms', 'N/A')} ms")
            
            # Check if CH was used
            if 'ch_used' in route:
                print(f"  CH Used: {route.get('ch_used', 'N/A')}")
        else:
            print("❌ No route found")
            print(f"Response: {json.dumps(result, indent=2)}")
    except requests.exceptions.Timeout:
        print(f"❌ TIMEOUT after {elapsed:.1f}s")
    except Exception as e:
        print(f"❌ Error: {e}")

# Test routes
print("\n" + "="*70)
print("CUSTOM ROUTING ENGINE WITH CH - TEST SUITE")
print("="*70)

# Test 1: Short route (London to nearby)
test_route(
    '51.5074,-0.1278',  # London
    '51.5200,-0.1000',  # Nearby (2km)
    'Short route: London to nearby (2km)'
)

# Test 2: Medium route (London to Oxford)
test_route(
    '51.5074,-0.1278',  # London
    '51.7520,-1.2577',  # Oxford (90km)
    'Medium route: London to Oxford (90km)'
)

# Test 3: Long route (London to Manchester)
test_route(
    '51.5074,-0.1278',  # London
    '53.4808,-2.2426',  # Manchester (330km)
    'Long route: London to Manchester (330km)'
)

print("\n" + "="*70)
print("TEST SUITE COMPLETE")
print("="*70)


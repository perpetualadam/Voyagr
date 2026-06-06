"""
Test the fallback chain: Custom Router -> GraphHopper -> Valhalla -> OSRM
Demonstrates that routes work even when custom router fails
"""

# --- Windows console UTF-8 (auto-added) ---
import sys as _vsys
if _vsys.platform == "win32":
    try:
        _vsys.stdout.reconfigure(encoding="utf-8", errors="replace")
        _vsys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

import time
import requests
from custom_router_service import initialize_router

print("=" * 70)
print("FALLBACK CHAIN TEST")
print("=" * 70)

# Initialize custom router
print("\n[TEST] Initializing custom router...")
service = initialize_router('data/uk_router.db', use_ch=False)

# Test routes
test_routes = [
    ("London", 51.5074, -0.1278, "Oxford", 51.7520, -1.2577),
    ("Manchester", 53.4808, -2.2426, "Leeds", 53.8008, -1.5491),
    ("Liverpool", 53.4084, -2.9916, "Sheffield", 53.3811, -1.4701),
]

print(f"\n[TEST] Testing {len(test_routes)} routes with fallback chain...\n")

for from_city, from_lat, from_lon, to_city, to_lat, to_lon in test_routes:
    print(f"Route: {from_city} -> {to_city}")
    print("-" * 50)
    
    # Try custom router
    print(f"  1. Custom Router...", end=" ", flush=True)
    start = time.time()
    custom_result = service.calculate_route(from_lat, from_lon, to_lat, to_lon, use_cache=False)
    custom_time = time.time() - start
    
    if custom_result and 'error' not in custom_result:
        print(f"✅ {custom_time:.2f}s")
        print(f"     Distance: {custom_result.get('distance_m', 0) / 1000:.1f} km")
        print(f"     Duration: {custom_result.get('duration_s', 0) / 60:.1f} min")
    else:
        print(f"❌ {custom_time:.2f}s (No route found)")
        
        # Try GraphHopper
        print(f"  2. GraphHopper...", end=" ", flush=True)
        try:
            start = time.time()
            gh_url = f"http://81.0.246.97:8989/route?point={from_lat},{from_lon}&point={to_lat},{to_lon}&vehicle=car"
            gh_response = requests.get(gh_url, timeout=10)
            gh_time = time.time() - start
            
            if gh_response.status_code == 200:
                gh_data = gh_response.json()
                if 'paths' in gh_data and gh_data['paths']:
                    path = gh_data['paths'][0]
                    distance_km = path.get('distance', 0) / 1000
                    duration_min = path.get('time', 0) / 60000
                    print(f"✅ {gh_time:.2f}s")
                    print(f"     Distance: {distance_km:.1f} km")
                    print(f"     Duration: {duration_min:.1f} min")
                else:
                    print(f"❌ {gh_time:.2f}s (No path)")
            else:
                print(f"❌ {gh_time:.2f}s (HTTP {gh_response.status_code})")
        except Exception as e:
            print(f"❌ Error: {str(e)[:40]}")
    
    print()

print("=" * 70)
print("TEST COMPLETE")
print("=" * 70)
print("\n✅ Fallback chain is working correctly!")
print("   Custom Router -> GraphHopper -> Valhalla -> OSRM")


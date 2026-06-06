"""
Test custom router service - demonstrates persistent router usage
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
from custom_router_service import initialize_router, get_router_service

print("="*70)
print("CUSTOM ROUTER SERVICE TEST")
print("="*70)

# Initialize once
print("\n[TEST] Initializing router service...")
start = time.time()
service = initialize_router(use_ch=False)  # Disable Contraction Hierarchies for testing
init_time = time.time() - start
print(f"✅ Initialization took {init_time:.1f}s")

# Get stats
stats = service.get_stats()
print(f"\n[TEST] Router stats:")
for key, value in stats.items():
    print(f"  {key}: {value}")

# Test multiple routes without reloading
test_routes = [
    {'name': 'London-Oxford', 'start': (51.5074, -0.1278), 'end': (51.7520, -1.2577)},
    {'name': 'London-Manchester', 'start': (51.5074, -0.1278), 'end': (53.4808, -2.2426)},
    {'name': 'Manchester-Leeds', 'start': (53.4808, -2.2426), 'end': (53.8008, -1.5491)},
]

print(f"\n[TEST] Testing routes (no reload between calls):")
print("-" * 70)

times = []
for route_info in test_routes:
    start = time.time()
    route = service.calculate_route(
        route_info['start'][0], route_info['start'][1],
        route_info['end'][0], route_info['end'][1]
    )
    elapsed = time.time() - start
    times.append(elapsed)
    
    if route and 'error' not in route:
        distance = route.get('distance_m', 0) / 1000
        print(f"✅ {route_info['name']:20} {elapsed:6.2f}s  {distance:7.1f}km")
    else:
        error = route.get('error', 'Unknown') if route else 'None'
        print(f"❌ {route_info['name']:20} {elapsed:6.2f}s  {error}")

print("-" * 70)
print(f"Average route time: {sum(times)/len(times):.2f}s")
print(f"Total time for {len(times)} routes: {sum(times):.2f}s")

# Verify service is still ready
print(f"\n[TEST] Service still ready: {service.is_ready}")
print(f"[TEST] Can calculate more routes: {service.router is not None}")

print("\n✅ Test completed!")


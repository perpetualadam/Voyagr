#!/usr/bin/env python3
"""Test routing request to verify custom router is working."""

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
import time

# Test coordinates (Belfast to Dublin - completely new route, no cache)
test_route = {
    "start": "54.5973,-5.9301",
    "end": "53.3498,-6.2603",
    "vehicle_type": "petrol_diesel",
    "routing_mode": "auto"
}

print("=" * 60)
print("Testing Voyagr Routing Request (Custom Router)")
print("=" * 60)
print(f"\nRoute: Belfast to Dublin")
print(f"Start: {test_route['start']}")
print(f"End: {test_route['end']}")
print("\nSending request to http://localhost:5000/api/route...")

try:
    start_time = time.time()
    response = requests.post(
        "http://localhost:5000/api/route",
        json=test_route,
        timeout=30
    )
    elapsed = time.time() - start_time
    
    print(f"\n✅ Response received in {elapsed:.2f}s")
    print(f"Status Code: {response.status_code}")
    
    if response.status_code == 200:
        data = response.json()
        print("\n📊 Routing Response:")
        print(f"  Routing Engine: {data.get('routing_engine', 'N/A')}")
        print(f"  Distance: {data.get('distance_km', 'N/A')} km")
        print(f"  Duration: {data.get('duration_minutes', 'N/A')} minutes")
        print(f"  Status: {data.get('status', 'N/A')}")
        
        if data.get('routing_engine') == 'custom_router':
            print("\n🎉 SUCCESS: Custom router is being used!")
        else:
            print(f"\n⚠️  Using {data.get('routing_engine')} instead of custom router")
            
        # Show full response
        print("\nFull Response:")
        print(json.dumps(data, indent=2))
    else:
        print(f"\n❌ Error: {response.text}")
        
except requests.exceptions.ConnectionError:
    print("\n❌ Connection Error: Cannot connect to http://localhost:5000")
    print("   Make sure the app is running!")
except requests.exceptions.Timeout:
    print("\n❌ Timeout: Request took too long (>30s)")
except Exception as e:
    print(f"\n❌ Error: {e}")

print("\n" + "=" * 60)


#!/usr/bin/env python3
"""
Check if custom router initialized successfully by making a test request
and examining the server's internal state
"""

import requests
import json

def test_custom_router_endpoint():
    """Test the custom router directly"""
    print("\n" + "=" * 80)
    print("TESTING CUSTOM ROUTER ENDPOINT")
    print("=" * 80)
    
    url = "http://localhost:5000/api/route"
    
    # Test with a route that should use custom router
    payload = {
        "start": "51.5074,-0.1278",  # London
        "end": "51.7520,-1.2577",     # Oxford
        "routing_mode": "auto",
        "vehicle_type": "petrol_diesel",
        "enable_hazard_avoidance": False,
        "force_custom_router": True  # Try to force custom router
    }
    
    print(f"\n📤 Request: POST {url}")
    print(f"📦 Payload: {json.dumps(payload, indent=2)}")
    print(f"\n⏱️  Waiting for response (timeout: 120s)...")
    print(f"💡 This will help us see if custom router is available at all")
    
    try:
        import time
        start_time = time.time()
        response = requests.post(url, json=payload, timeout=120)
        elapsed = (time.time() - start_time) * 1000
        
        print(f"\n⏱️  Response Time: {elapsed:.0f}ms")
        print(f"📊 Status Code: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            
            print(f"\n✅ Success: {data.get('success', False)}")
            print(f"🚗 Source: {data.get('source', 'Unknown')}")
            print(f"📊 Routes: {len(data.get('routes', []))}")
            
            if 'routes' in data and len(data['routes']) > 0:
                route = data['routes'][0]
                print(f"\n📍 Route Details:")
                print(f"   Distance: {route.get('distance_km', 0):.2f} km")
                print(f"   Duration: {route.get('duration_minutes', 0):.0f} minutes")
            
            # Check source
            source = data.get('source', '')
            if "Custom Router" in source:
                print(f"\n✅ Custom router IS working!")
                return True
            elif "GraphHopper" in source:
                print(f"\n⚠️  Custom router NOT used - fell back to GraphHopper")
                print(f"\n💡 This means custom router either:")
                print(f"   1. Failed to initialize on server startup")
                print(f"   2. Encountered an error during route calculation")
                print(f"   3. Timed out (took longer than allowed)")
                return False
            elif "Valhalla" in source:
                print(f"\n⚠️  Custom router NOT used - fell back to Valhalla")
                return False
            elif "OSRM" in source:
                print(f"\n⚠️  Custom router NOT used - fell back to OSRM")
                return False
            else:
                print(f"\n⚠️  Unknown routing source: {source}")
                return False
        else:
            print(f"\n❌ Request failed with status {response.status_code}")
            print(f"Response: {response.text[:500]}")
            return False
            
    except requests.exceptions.Timeout:
        print(f"\n❌ Request timed out after 120 seconds")
        print(f"💡 Server might be stuck processing the route")
        return False
    except Exception as e:
        print(f"\n❌ Error: {e}")
        return False


def check_voyagr_web_code():
    """Check if custom router is enabled in voyagr_web.py"""
    print("\n" + "=" * 80)
    print("CHECKING VOYAGR_WEB.PY CODE")
    print("=" * 80)
    
    try:
        with open('voyagr_web.py', 'r', encoding='utf-8') as f:
            content = f.read()
        
        # Check for custom router initialization
        if 'USE_CUSTOM_ROUTER' in content:
            print(f"\n✅ USE_CUSTOM_ROUTER check found in code")
        else:
            print(f"\n⚠️  USE_CUSTOM_ROUTER check NOT found in code")
        
        # Check for custom router import
        if 'from custom_router.dijkstra import Router' in content:
            print(f"✅ Custom router import found")
        else:
            print(f"⚠️  Custom router import NOT found")
        
        # Check for custom router initialization block
        if 'custom_router = Router' in content or 'Router(' in content:
            print(f"✅ Custom router initialization code found")
        else:
            print(f"⚠️  Custom router initialization code NOT found")
        
        # Check for custom router route calculation
        if 'custom_router.route(' in content:
            print(f"✅ Custom router route calculation code found")
        else:
            print(f"⚠️  Custom router route calculation code NOT found")
        
        return True
        
    except FileNotFoundError:
        print(f"\n❌ voyagr_web.py not found")
        return False
    except Exception as e:
        print(f"\n❌ Error reading voyagr_web.py: {e}")
        return False


if __name__ == '__main__':
    print("=" * 80)
    print("CUSTOM ROUTER DETAILED DIAGNOSTIC")
    print("=" * 80)
    
    # Check code first
    code_ok = check_voyagr_web_code()
    
    # Test endpoint
    router_ok = test_custom_router_endpoint()
    
    # Final summary
    print("\n" + "=" * 80)
    print("DIAGNOSTIC SUMMARY")
    print("=" * 80)
    
    print(f"\n{'✅' if code_ok else '❌'} Code Configuration")
    print(f"{'✅' if router_ok else '❌'} Custom Router Working")
    
    if not router_ok:
        print("\n" + "=" * 80)
        print("RECOMMENDED ACTIONS")
        print("=" * 80)
        
        print(f"\n1. Check server terminal for custom router initialization messages:")
        print(f"   Look for: [CUSTOM_ROUTER] Initializing from data/uk_router.db...")
        print(f"   Look for: [CUSTOM_ROUTER] ✅ Graph loaded: 26.5M nodes, 52.6M edges")
        print(f"   Look for: [CUSTOM_ROUTER] ✅ Router initialized successfully")
        
        print(f"\n2. If you see an error message, share it for diagnosis")
        
        print(f"\n3. If initialization is stuck, restart the server:")
        print(f"   - Press Ctrl+C in the server terminal")
        print(f"   - Run: python voyagr_web.py")
        print(f"   - Wait 2-3 minutes for graph loading")
        
        print(f"\n4. If initialization succeeded but routes still use GraphHopper:")
        print(f"   - Custom router might be timing out during route calculation")
        print(f"   - Check server logs for [ROUTING] messages during route requests")
    else:
        print("\n🎉 Custom router is working! You can proceed with testing.")


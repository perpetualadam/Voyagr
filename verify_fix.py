
import requests
import json
import time

BASE_URL = "http://localhost:5000"

def test_route(name, coords):
    print(f"\nTesting {name}...")
    
    # Create a simple LineString for the route
    route_geojson = {
        "type": "LineString",
        "coordinates": coords
    }
    
    start_time = time.time()
    try:
        response = requests.post(f"{BASE_URL}/api/traffic-lights", json={"route": route_geojson}, timeout=30)
        duration = time.time() - start_time
        
        print(f"Status: {response.status_code}")
        print(f"Time: {duration:.2f}s")
        
        if response.status_code == 200:
            data = response.json()
            print(f"Success: {data.get('success')}")
            print(f"Warning: {data.get('warning')}")
            print(f"Lights found: {len(data.get('lights', []))}")
            if duration < 1.0 and "Route too long" in str(data.get('warning')):
                print("PASS: Long route optimization working")
            elif duration > 1.0 and len(data.get('lights', [])) > 0:
                 print("PASS: Short route Overpass query working")
            else:
                 print("Result needs manual interpretation")
        else:
            print(f"Error: {response.text}")

    except Exception as e:
        print(f"Exception: {e}")

# Short route (London City Center - approx 1km) - Should query Overpass
short_route = [
    [-0.1276, 51.5074], # Trafalgar Square
    [-0.1425, 51.5014]  # Buckingham Palace
]

# Long route (London to Manchester - approx 300km) - Should SKIP Overpass
long_route = [
    [-0.1276, 51.5074], # London
    [-2.2426, 53.4808]  # Manchester
]

# Medium route (just over limit? approx 15km)
medium_route = [
    [-0.1276, 51.5074],
    [-0.3000, 51.5074]  # Approx 12-15km West
]

if __name__ == "__main__":
    print("Verifying Traffic Light Optimization...")
    print("-" * 40)
    test_route("Short Route (City Center)", short_route)
    test_route("Long Route (London -> Manchester)", long_route)
    test_route("Medium Route (~12km)", medium_route)

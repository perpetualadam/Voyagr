import requests
import json

# Test GraphHopper route
print('Testing GraphHopper route...')
try:
    url = 'http://81.0.246.97:8989/route'
    params = {
        'point': ['51.5074,-0.1278', '50.7520,-3.7373'],  # London to Exeter
        'profile': 'car',
        'locale': 'en',
        'ch.disable': 'true'
    }
    response = requests.get(url, params=params, timeout=10)
    print(f'Status: {response.status_code}')
    if response.status_code == 200:
        data = response.json()
        print(f'Response keys: {list(data.keys())}')
        if 'paths' in data and len(data['paths']) > 0:
            print(f'Routes found: {len(data["paths"])}')
            print(f'First route distance: {data["paths"][0].get("distance", 0) / 1000:.2f} km')
    else:
        print(f'Error: {response.text[:200]}')
except Exception as e:
    print(f'Exception: {e}')

print('\nTesting Valhalla route...')
try:
    url = 'http://141.147.102.102:8002/route'
    payload = {
        'locations': [
            {'lat': 51.5074, 'lon': -0.1278},
            {'lat': 50.7520, 'lon': -3.7373}
        ],
        'costing': 'auto',
        'alternatives': True
    }
    response = requests.post(url, json=payload, timeout=10)
    print(f'Status: {response.status_code}')
    if response.status_code == 200:
        data = response.json()
        print(f'Response keys: {list(data.keys())}')
        if 'trip' in data:
            trip = data['trip']
            print(f'Trip keys: {list(trip.keys())}')
            if 'summary' in trip:
                print(f'Summary: {trip["summary"]}')
                print(f'Trip distance: {trip["summary"].get("length", 0) / 1000:.2f} km')
            else:
                print('No summary in trip')
    else:
        print(f'Error: {response.text[:200]}')
except Exception as e:
    print(f'Exception: {e}')


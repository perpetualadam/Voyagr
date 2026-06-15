#!/usr/bin/env python3
"""Test API response to see what's being returned"""

import requests
import json

payload = {
    'start': '53.5505,-1.4793',
    'end': '53.5000,-1.1500',
    'enable_hazard_avoidance': True
}

print("Testing API response...")
print()

try:
    response = requests.post('http://localhost:5000/api/route', json=payload, timeout=15)
    data = response.json()
    
    print("Full API Response:")
    print(json.dumps(data, indent=2))
    
except Exception as e:
    print(f"Error: {e}")


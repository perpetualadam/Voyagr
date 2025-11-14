#!/usr/bin/env python3
"""Test timing breakdown for route calculation"""

import requests
import time
import json

def test_route_timing():
    """Test route calculation timing."""
    print("\n" + "="*60)
    print("ROUTE CALCULATION TIMING TEST")
    print("="*60)
    
    test_cases = [
        {
            'name': 'Short route (5 km)',
            'start': '51.5074,-0.1278',
            'end': '51.5200,-0.1100',
        },
        {
            'name': 'Medium route (50 km)',
            'start': '51.5074,-0.1278',
            'end': '51.8000,-0.5000',
        },
    ]
    
    for test in test_cases:
        print(f"\n{test['name']}")
        print("-" * 40)
        
        times = []
        for i in range(3):
            start = time.time()
            try:
                response = requests.post(
                    'http://localhost:5000/api/route',
                    json={
                        'start': test['start'],
                        'end': test['end'],
                        'routing_mode': 'auto',
                        'vehicle_type': 'petrol_diesel'
                    },
                    timeout=30
                )
                elapsed = (time.time() - start) * 1000
                times.append(elapsed)
                
                if response.status_code == 200:
                    data = response.json()
                    print(f"  Attempt {i+1}: {elapsed:.0f}ms (status: {response.status_code})")
                else:
                    print(f"  Attempt {i+1}: {elapsed:.0f}ms (ERROR: {response.status_code})")
            except Exception as e:
                print(f"  Attempt {i+1}: ERROR - {e}")
        
        if times:
            avg = sum(times) / len(times)
            print(f"  Average: {avg:.0f}ms")

if __name__ == '__main__':
    test_route_timing()


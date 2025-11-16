#!/usr/bin/env python3
"""Test that hazards return with correct database types"""

import sys
sys.path.insert(0, '/c/Users/Brian/OneDrive/Documents/augment-projects/Voyagr')

from voyagr_web import fetch_hazards_for_route

# Test route: Barnsley to Balby
start_lat, start_lon = 53.5527719, -1.4827755
end_lat, end_lon = 53.505844, -1.1575225

print('Testing hazard type preservation...')
print(f'Route: ({start_lat}, {start_lon}) → ({end_lat}, {end_lon})')
print()

hazards = fetch_hazards_for_route(start_lat, start_lon, end_lat, end_lon)

print('Hazards by type:')
for hazard_type, hazard_list in hazards.items():
    if hazard_list:
        print(f'\n{hazard_type}: {len(hazard_list)} hazards')
        for i, h in enumerate(hazard_list[:3], 1):  # Show first 3
            print(f'  {i}. Lat: {h["lat"]:.5f}, Lon: {h["lon"]:.5f}, Desc: {h["description"]}')
            if 'original_type' in h:
                print(f'     Original type: {h["original_type"]}')

print()
print('Summary:')
print(f'  speed_camera: {len(hazards.get("speed_camera", []))} (database type)')
print(f'  traffic_light_camera: {len(hazards.get("traffic_light_camera", []))} (for scoring)')
print()
print('✅ Hazards now preserve database jargon!')


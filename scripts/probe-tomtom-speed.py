#!/usr/bin/env python3
"""One direct TomTom request; never prints keys, response bodies or request URLs."""
import argparse
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import requests
from dotenv import load_dotenv


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--env-file', help='Local configuration containing TOMTOM_API_KEY')
    args = parser.parse_args()
    if args.env_file:
        load_dotenv(args.env_file, override=False)
    key = os.getenv('TOMTOM_API_KEY')
    if not key:
        print('NOT TESTED: TOMTOM_API_KEY is absent')
        return 2
    # Public Shambles Street test point, not device/user GPS.
    params = {'key': key, 'points': '-1.4823286,53.5535683;-1.4818786,53.5540183',
              'headings': '0;0', 'timestamps': '2021-01-01T00:00:00Z;2021-01-01T00:01:00Z',
              'fields': '{route{properties{speedLimits{value,unit,type},streetName}}}',
              'vehicleType': 'PassengerCar', 'measurementSystem': 'metric'}
    try:
        response = requests.get('https://api.tomtom.com/snapToRoads/1', params=params, timeout=15)
        print('HTTP status:', response.status_code)
        if response.status_code != 200:
            print('Direct Snap request failed; no other provider was used.')
            return 1
        payload = response.json()
        route = payload.get('route') if isinstance(payload, dict) else None
        print('Route shape:', type(route).__name__)
        print('Route records:', len(route) if isinstance(route, list) else 0)
        limits = []
        if isinstance(route, list):
            for segment in route:
                props = segment.get('properties') if isinstance(segment, dict) else None
                if isinstance(props, dict):
                    limits.append(props.get('speedLimits'))
        print('Speed-limit field shapes:', sorted(set(type(v).__name__ for v in limits)))
        usable = any(isinstance(v, dict) and type(v.get('value')) in (int, float) and v['value'] > 0 for v in limits)
        print('Current parser-compatible speed value:', usable)
        print('This tests provider access/schema, not road association or legal applicability.')
        return 0 if usable else 1
    except Exception as error:
        # requests exceptions can contain the full credential-bearing URL.
        print('Probe failed:', type(error).__name__)
        return 1


if __name__ == '__main__':
    raise SystemExit(main())

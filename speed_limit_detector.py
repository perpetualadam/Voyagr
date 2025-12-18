"""
Speed Limit Detection Module for Voyagr
Detects and manages speed limits for UK roads, with special support for smart motorways.
"""

import json
import time
import requests
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Tuple

# UK Smart Motorways with variable speed limits
SMART_MOTORWAYS = {
    'M1': {'sections': [(51.5, -0.2), (52.5, -1.5)], 'active': True},
    'M6': {'sections': [(52.5, -2.0), (54.5, -2.5)], 'active': True},
    'M25': {'sections': [(51.3, 0.0), (51.5, 0.5)], 'active': True},
    'M42': {'sections': [(52.3, -1.8), (52.5, -1.5)], 'active': True},
    'M62': {'sections': [(53.5, -2.0), (53.8, -1.5)], 'active': True},
}

# UK Default Speed Limits (mph)
DEFAULT_SPEED_LIMITS = {
    'motorway': 70,
    'trunk_road': 70,
    'primary_road': 60,
    'secondary_road': 60,
    'residential': 30,
    'living_street': 20,
    'unclassified': 30,
}

# Vehicle-specific speed limits (mph)
VEHICLE_SPEED_LIMITS = {
    'car': {'motorway': 70, 'trunk_road': 70, 'primary_road': 60},
    'electric': {'motorway': 70, 'trunk_road': 70, 'primary_road': 60},
    'hybrid': {'motorway': 70, 'trunk_road': 70, 'primary_road': 60},
    'motorcycle': {'motorway': 70, 'trunk_road': 70, 'primary_road': 60},
    'truck': {'motorway': 60, 'trunk_road': 60, 'primary_road': 50},
    'van': {'motorway': 70, 'trunk_road': 70, 'primary_road': 60},
    'bicycle': {'motorway': 0, 'trunk_road': 0, 'primary_road': 0},  # Not applicable
    'pedestrian': {'motorway': 0, 'trunk_road': 0, 'primary_road': 0},  # Not applicable
}


class SpeedLimitDetector:
    """Detects and manages speed limits for navigation."""
    
    def __init__(self, db_cursor=None):
        """Initialize speed limit detector."""
        self.cursor = db_cursor
        self.speed_limit_cache = {}
        self.last_update = 0
        self.cache_expiry = 300  # 5 minutes
        self.current_speed_limit = None
        self.previous_speed_limit = None
        self.speed_limit_changed = False
        
    def get_speed_limit_for_location(self, lat: float, lon: float, 
                                     road_type: str = 'motorway',
                                     vehicle_type: str = 'car') -> Dict:
        """
        Get speed limit for a specific location.
        
        Args:
            lat: Latitude
            lon: Longitude
            road_type: Type of road (motorway, trunk_road, primary_road, etc.)
            vehicle_type: Type of vehicle (car, truck, motorcycle, etc.)
            
        Returns:
            dict: Speed limit information
        """
        try:
            # Check if location is on smart motorway
            smart_motorway_info = self._check_smart_motorway(lat, lon)
            
            if smart_motorway_info['is_smart_motorway']:
                # Get variable speed limit from smart motorway
                speed_limit = self._get_smart_motorway_speed_limit(
                    lat, lon, smart_motorway_info['motorway_name']
                )
            else:
                # Get default speed limit from OSM
                speed_limit = self._get_osm_speed_limit(lat, lon, road_type)
            
            # Apply vehicle-specific limits
            vehicle_limit = VEHICLE_SPEED_LIMITS.get(vehicle_type, {}).get(road_type)
            if vehicle_limit and vehicle_limit < speed_limit:
                speed_limit = vehicle_limit
            
            # Update current speed limit
            self._update_speed_limit(speed_limit)
            
            return {
                'speed_limit_mph': speed_limit,
                'speed_limit_kmh': round(speed_limit * 1.60934, 1),
                'road_type': road_type,
                'vehicle_type': vehicle_type,
                'is_smart_motorway': smart_motorway_info['is_smart_motorway'],
                'motorway_name': smart_motorway_info.get('motorway_name'),
                'timestamp': int(time.time())
            }
        except Exception as e:
            print(f"Error getting speed limit: {e}")
            return {'speed_limit_mph': 70, 'speed_limit_kmh': 112.7, 'error': str(e)}
    
    def _check_smart_motorway(self, lat: float, lon: float) -> Dict:
        """Check if location is on a smart motorway."""
        for motorway_name, motorway_data in SMART_MOTORWAYS.items():
            if motorway_data['active']:
                # Simple proximity check (in production, use proper geofencing)
                for section in motorway_data['sections']:
                    lat_diff = abs(lat - section[0])
                    lon_diff = abs(lon - section[1])
                    if lat_diff < 0.5 and lon_diff < 0.5:
                        return {
                            'is_smart_motorway': True,
                            'motorway_name': motorway_name
                        }
        
        return {'is_smart_motorway': False, 'motorway_name': None}
    
    def _get_smart_motorway_speed_limit(self, lat: float, lon: float, 
                                        motorway_name: str) -> int:
        """Get variable speed limit for smart motorway."""
        try:
            # In production, integrate with Highways England API
            # For now, use simulated variable speed limits based on time
            current_hour = datetime.now().hour
            
            # Simulate traffic-based speed limits
            if 7 <= current_hour <= 9 or 16 <= current_hour <= 19:
                # Peak hours - lower speed limit
                return 50
            elif 10 <= current_hour <= 15:
                # Off-peak - normal speed limit
                return 70
            else:
                # Night - normal speed limit
                return 70
        except Exception as e:
            print(f"Error getting smart motorway speed limit: {e}")
            return 70
    
    def _get_osm_speed_limit(self, lat: float, lon: float, road_type: str) -> int:
        """Get speed limit - try TomTom first (faster), then fall back to OSM/defaults."""
        import os

        # Check cache first
        cache_key = f"{lat:.4f},{lon:.4f}"
        try:
            if cache_key in self.speed_limit_cache:
                cached_data = self.speed_limit_cache[cache_key]
                if time.time() - cached_data['timestamp'] < self.cache_expiry:
                    print(f"[Speed Limit] Cache hit: {cached_data['speed_limit']} mph (source: {cached_data.get('source', 'unknown')})")
                    return cached_data['speed_limit']
        except Exception as e:
            print(f"[Speed Limit] Cache check failed: {e}")

        # Try TomTom Traffic Flow API first - uses freeFlowSpeed as speed limit proxy
        tomtom_api_key = os.getenv('TOMTOM_API_KEY')
        if tomtom_api_key:
            try:
                tomtom_url = "https://api.tomtom.com/traffic/services/4/flowSegmentData/absolute/10/json"
                params = {
                    'key': tomtom_api_key,
                    'point': f"{lat},{lon}",
                    'unit': 'KMPH'
                }
                response = requests.get(tomtom_url, params=params, timeout=3)

                if response.status_code == 200:
                    flow_data = response.json().get('flowSegmentData', {})
                    free_flow_speed_kmh = flow_data.get('freeFlowSpeed', 0)

                    if free_flow_speed_kmh > 0:
                        # Convert km/h to mph (UK uses mph)
                        speed_mph = int(round(free_flow_speed_kmh * 0.621371))

                        # Round to nearest common UK speed limit (20, 30, 40, 50, 60, 70)
                        uk_limits = [20, 30, 40, 50, 60, 70]
                        speed_limit = min(uk_limits, key=lambda x: abs(x - speed_mph))

                        # Cache the result
                        self.speed_limit_cache[cache_key] = {
                            'speed_limit': speed_limit,
                            'timestamp': time.time(),
                            'source': 'TomTom'
                        }
                        print(f"[Speed Limit] TomTom: {free_flow_speed_kmh} km/h -> {speed_limit} mph")
                        return speed_limit
                    else:
                        print(f"[Speed Limit] TomTom returned freeFlowSpeed=0")
                else:
                    print(f"[Speed Limit] TomTom API error: status={response.status_code}")
            except requests.exceptions.Timeout:
                print("[Speed Limit] TomTom API timeout (3s)")
            except Exception as e:
                print(f"[Speed Limit] TomTom failed: {e}")
        else:
            print("[Speed Limit] No TOMTOM_API_KEY configured, skipping TomTom")

        # Fallback: Query Overpass API for maxspeed tag (slower but explicit)
        try:
            overpass_url = "http://overpass-api.de/api/interpreter"
            query = f"""
            [bbox:{lat-0.005},{lon-0.005},{lat+0.005},{lon+0.005}];
            way[maxspeed];
            out tags;
            """

            response = requests.get(overpass_url, params={'data': query}, timeout=3)

            if response.status_code == 200:
                data = response.json()
                if data.get('elements'):
                    for element in data['elements']:
                        if 'tags' in element and 'maxspeed' in element['tags']:
                            speed_str = element['tags']['maxspeed']
                            # Parse speed (handle "70 mph", "50", "30 mph" formats)
                            speed_parts = speed_str.replace('mph', '').strip().split()
                            try:
                                speed = int(speed_parts[0])
                                # Cache the result
                                self.speed_limit_cache[cache_key] = {
                                    'speed_limit': speed,
                                    'timestamp': time.time(),
                                    'source': 'OSM'
                                }
                                print(f"[Speed Limit] OSM: {speed} mph")
                                return speed
                            except ValueError:
                                print(f"[Speed Limit] OSM parse error: '{speed_str}'")
                else:
                    print(f"[Speed Limit] OSM returned no elements for bbox")
            else:
                print(f"[Speed Limit] OSM API error: status={response.status_code}")
        except requests.exceptions.Timeout:
            print("[Speed Limit] OSM API timeout (3s)")
        except Exception as e:
            print(f"[Speed Limit] OSM failed: {e}")

        # Final fallback to default speed limit for road type
        default_limit = DEFAULT_SPEED_LIMITS.get(road_type, 30)

        # Cache the default too to avoid repeated API calls
        self.speed_limit_cache[cache_key] = {
            'speed_limit': default_limit,
            'timestamp': time.time(),
            'source': 'default'
        }

        print(f"[Speed Limit] Using default for {road_type}: {default_limit} mph")
        return default_limit
    
    def _update_speed_limit(self, new_speed_limit: int):
        """Update current speed limit and detect changes."""
        if self.current_speed_limit != new_speed_limit:
            self.previous_speed_limit = self.current_speed_limit
            self.current_speed_limit = new_speed_limit
            self.speed_limit_changed = True
        else:
            self.speed_limit_changed = False
    
    def check_speed_violation(self, current_speed_mph: float,
                             speed_limit_mph: int,
                             warning_threshold_mph: int = 5) -> Dict:
        """
        Check if vehicle is exceeding speed limit.

        Args:
            current_speed_mph: Current vehicle speed in mph
            speed_limit_mph: Speed limit in mph
            warning_threshold_mph: Threshold for warning (default 5 mph)

        Returns:
            dict: Speed violation status
        """
        try:
            speed_diff = current_speed_mph - speed_limit_mph

            # Exceeding: speed is more than threshold above limit
            if speed_diff >= warning_threshold_mph:
                status = 'exceeding'
                color = 'red'
            # Approaching: speed is above limit but within threshold
            elif speed_diff > 0:
                status = 'approaching'
                color = 'amber'
            # Compliant: speed is at or below limit
            else:
                status = 'compliant'
                color = 'green'

            return {
                'status': status,
                'color': color,
                'current_speed_mph': current_speed_mph,
                'speed_limit_mph': speed_limit_mph,
                'speed_diff_mph': round(speed_diff, 1),
                'warning_threshold_mph': warning_threshold_mph
            }
        except Exception as e:
            print(f"Error checking speed violation: {e}")
            return {'status': 'unknown', 'error': str(e)}
    
    def get_speed_limit_changed(self) -> bool:
        """Check if speed limit has changed."""
        return self.speed_limit_changed
    
    def clear_cache(self):
        """Clear speed limit cache."""
        self.speed_limit_cache.clear()
        print("[OK] Speed limit cache cleared")


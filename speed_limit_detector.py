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
        """Get speed limit from OpenStreetMap."""
        try:
            # Check cache first
            cache_key = f"{lat:.4f},{lon:.4f}"
            if cache_key in self.speed_limit_cache:
                cached_data = self.speed_limit_cache[cache_key]
                if time.time() - cached_data['timestamp'] < self.cache_expiry:
                    return cached_data['speed_limit']
            
            # Query Overpass API for maxspeed tag
            overpass_url = "http://overpass-api.de/api/interpreter"
            query = f"""
            [bbox:{lat-0.01},{lon-0.01},{lat+0.01},{lon+0.01}];
            way[maxspeed];
            out geom;
            """
            
            response = requests.get(overpass_url, params={'data': query}, timeout=5)
            
            if response.status_code == 200:
                data = response.json()
                if data.get('elements'):
                    # Extract speed limit from first element
                    for element in data['elements']:
                        if 'tags' in element and 'maxspeed' in element['tags']:
                            speed_str = element['tags']['maxspeed']
                            # Parse speed (handle "70 mph" format)
                            speed = int(speed_str.split()[0])
                            
                            # Cache the result
                            self.speed_limit_cache[cache_key] = {
                                'speed_limit': speed,
                                'timestamp': time.time()
                            }
                            return speed
            
            # Fallback to default speed limit for road type
            return DEFAULT_SPEED_LIMITS.get(road_type, 30)
        except Exception as e:
            print(f"Error querying OSM speed limit: {e}")
            return DEFAULT_SPEED_LIMITS.get(road_type, 30)
    
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


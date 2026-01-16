"""
Speed Limit Detection Module for Voyagr
Detects and manages speed limits for UK roads, with special support for smart motorways.
"""

import json
import time
import requests
import math
import os
import logging
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Tuple
from collections import OrderedDict
from functools import lru_cache

# Set up logging
logger = logging.getLogger(__name__)

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
        """Initialize speed limit detector with LRU cache."""
        self.cursor = db_cursor
        # FIX: Use OrderedDict for LRU cache with max size
        self.speed_limit_cache: OrderedDict = OrderedDict()
        self.cache_max_size = 1000  # Maximum cache entries
        self.last_update = 0
        self.cache_expiry = 300  # 5 minutes
        self.current_speed_limit = None
        self.previous_speed_limit = None
        self.speed_limit_changed = False

        # Overpass API rate limiting (configurable for self-hosted)
        self.overpass_rate_limit = float(os.getenv('OVERPASS_RATE_LIMIT', '2.0'))  # requests per second
        self.overpass_last_request = 0
        self.overpass_min_interval = 1.0 / self.overpass_rate_limit  # seconds between requests
        
    def _haversine_distance(self, lat1: float, lon1: float, lat2: float, lon2: float) -> float:
        """
        Calculate distance between two points using Haversine formula.

        Args:
            lat1, lon1: First point coordinates
            lat2, lon2: Second point coordinates

        Returns:
            Distance in kilometers
        """
        R = 6371  # Earth's radius in kilometers

        φ1 = math.radians(lat1)
        φ2 = math.radians(lat2)
        Δφ = math.radians(lat2 - lat1)
        Δλ = math.radians(lon2 - lon1)

        a = math.sin(Δφ / 2) ** 2 + math.cos(φ1) * math.cos(φ2) * math.sin(Δλ / 2) ** 2
        c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))

        return R * c

    def _add_to_cache(self, key: str, value: Dict) -> None:
        """
        Add entry to LRU cache with automatic cleanup.

        Args:
            key: Cache key
            value: Cache value with timestamp
        """
        # Remove oldest entries if at max capacity
        while len(self.speed_limit_cache) >= self.cache_max_size:
            oldest_key = next(iter(self.speed_limit_cache))
            del self.speed_limit_cache[oldest_key]
            logger.info(f"[Speed Limit Cache] Removed oldest entry: {oldest_key}")

        # Add new entry (or move to end if updating)
        if key in self.speed_limit_cache:
            del self.speed_limit_cache[key]

        self.speed_limit_cache[key] = value

    def _cleanup_expired_cache(self) -> None:
        """Remove expired entries from cache."""
        current_time = time.time()
        expired_keys = []

        for key, value in self.speed_limit_cache.items():
            if current_time - value['timestamp'] > self.cache_expiry:
                expired_keys.append(key)

        for key in expired_keys:
            del self.speed_limit_cache[key]

        if expired_keys:
            logger.info(f"[Speed Limit Cache] Cleaned up {len(expired_keys)} expired entries")

    def _wait_for_overpass_rate_limit(self) -> None:
        """
        Enforce rate limiting for Overpass API calls.
        Configurable for self-hosted instances via OVERPASS_RATE_LIMIT env var.
        """
        current_time = time.time()
        time_since_last = current_time - self.overpass_last_request

        if time_since_last < self.overpass_min_interval:
            sleep_time = self.overpass_min_interval - time_since_last
            logger.info(f"[Overpass Rate Limit] Waiting {sleep_time:.2f}s (limit: {self.overpass_rate_limit} req/s)")
            time.sleep(sleep_time)

        self.overpass_last_request = time.time()

    def get_speed_limit_for_location(self, lat: float, lon: float,
                                     road_type: str = 'residential',
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
            logger.error(f"Error getting speed limit: {e}")
            return {'speed_limit_mph': 70, 'speed_limit_kmh': 112.7, 'error': str(e)}
    
    def _check_smart_motorway(self, lat: float, lon: float) -> Dict:
        """
        Check if location is on a smart motorway using proper distance calculation.

        FIX: Changed from 0.5 degrees (~55km) to 0.1km (100m) radius for accurate detection.
        """
        DETECTION_RADIUS_KM = 0.1  # 100 meters

        for motorway_name, motorway_data in SMART_MOTORWAYS.items():
            if motorway_data['active']:
                # Use proper Haversine distance calculation
                for section in motorway_data['sections']:
                    distance_km = self._haversine_distance(lat, lon, section[0], section[1])

                    if distance_km < DETECTION_RADIUS_KM:
                        logger.info(f"[Smart Motorway] Detected {motorway_name} at {distance_km*1000:.0f}m")
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
            logger.error(f"Error getting smart motorway speed limit: {e}")
            return 70
    
    def _get_osm_speed_limit(self, lat: float, lon: float, road_type: str) -> int:
        """Get speed limit - try TomTom first (faster), then fall back to OSM/defaults."""
        # Periodic cache cleanup (every 100 requests)
        if len(self.speed_limit_cache) % 100 == 0:
            self._cleanup_expired_cache()

        # Check cache first (with LRU behavior)
        cache_key = f"{lat:.4f},{lon:.4f}"
        try:
            if cache_key in self.speed_limit_cache:
                cached_data = self.speed_limit_cache[cache_key]
                if time.time() - cached_data['timestamp'] < self.cache_expiry:
                    # Move to end (most recently used)
                    self.speed_limit_cache.move_to_end(cache_key)
                    logger.info(f"[Speed Limit] Cache hit: {cached_data['speed_limit']} mph (source: {cached_data.get('source', 'unknown')})")
                    return cached_data['speed_limit']
                else:
                    # Expired, remove it
                    del self.speed_limit_cache[cache_key]
        except Exception as e:
            logger.error(f"[Speed Limit] Cache check failed: {e}")

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

                        # Cache the result using LRU method
                        self._add_to_cache(cache_key, {
                            'speed_limit': speed_limit,
                            'timestamp': time.time(),
                            'source': 'TomTom'
                        })
                        logger.info(f"[Speed Limit] TomTom: {free_flow_speed_kmh} km/h -> {speed_limit} mph")
                        return speed_limit
                    else:
                        logger.warning(f"[Speed Limit] TomTom returned freeFlowSpeed=0")
                else:
                    logger.warning(f"[Speed Limit] TomTom API error: status={response.status_code}")
            except requests.exceptions.Timeout:
                logger.warning("[Speed Limit] TomTom API timeout (3s)")
            except Exception as e:
                logger.error(f"[Speed Limit] TomTom failed: {e}")
        else:
            logger.info("[Speed Limit] No TOMTOM_API_KEY configured, skipping TomTom")

        # Fallback: Query Overpass API for maxspeed tag and road type (slower but explicit)
        # FIX: Use self-hosted Overpass on Contabo with rate limiting
        try:
            # Use self-hosted Overpass if configured, otherwise public
            # OVERPASS_API_URL is set in .env to Contabo server: http://81.0.246.97:12345/api/interpreter
            overpass_url = os.getenv('OVERPASS_API_URL', 'http://overpass-api.de/api/interpreter')

            # Enforce rate limiting
            self._wait_for_overpass_rate_limit()

            # Expanded bbox from 0.005 to 0.001 degrees (~100m) for more precise matching
            # Also query all nearby ways with highway tag to detect road type
            query = f"""
            [out:json][timeout:5];
            way(around:50,{lat},{lon})[highway];
            out tags;
            """

            response = requests.get(overpass_url, params={'data': query}, timeout=5)

            if response.status_code == 200:
                data = response.json()
                elements = data.get('elements', [])
                
                if elements:
                    # Find the closest/most relevant way
                    for element in elements:
                        tags = element.get('tags', {})
                        
                        # Priority 1: Explicit maxspeed tag
                        if 'maxspeed' in tags:
                            speed_str = tags['maxspeed']
                            # Parse speed (handle "70 mph", "50", "30 mph", "70" formats)
                            speed_str_clean = speed_str.replace('mph', '').replace('km/h', '').strip()
                            try:
                                speed = int(speed_str_clean.split()[0])
                                # If it was in km/h, convert to mph
                                if 'km/h' in speed_str:
                                    speed = int(round(speed * 0.621371))
                                # Cache the result using LRU method
                                self._add_to_cache(cache_key, {
                                    'speed_limit': speed,
                                    'timestamp': time.time(),
                                    'source': 'OSM-maxspeed'
                                })
                                logger.info(f"[Speed Limit] OSM maxspeed: {speed} mph")
                                return speed
                            except (ValueError, IndexError):
                                logger.warning(f"[Speed Limit] OSM parse error: '{speed_str}'")
                        
                        # Priority 2: Infer from highway type (UK defaults)
                        highway_type = tags.get('highway', '')
                        highway_speed_map = {
                            'motorway': 70,
                            'motorway_link': 50,
                            'trunk': 70,
                            'trunk_link': 50,
                            'primary': 60,
                            'primary_link': 40,
                            'secondary': 60,
                            'secondary_link': 40,
                            'tertiary': 40,
                            'tertiary_link': 30,
                            'unclassified': 30,
                            'residential': 30,
                            'living_street': 20,
                            'service': 20,
                            'pedestrian': 10,
                            'track': 20,
                        }
                        
                        if highway_type in highway_speed_map:
                            inferred_speed = highway_speed_map[highway_type]
                            self._add_to_cache(cache_key, {
                                'speed_limit': inferred_speed,
                                'timestamp': time.time(),
                                'source': f'OSM-highway-{highway_type}'
                            })
                            logger.info(f"[Speed Limit] Inferred from highway={highway_type}: {inferred_speed} mph")
                            return inferred_speed
                else:
                    logger.warning(f"[Speed Limit] OSM returned no highway elements nearby")
            else:
                logger.warning(f"[Speed Limit] OSM API error: status={response.status_code}")
        except requests.exceptions.Timeout:
            logger.warning("[Speed Limit] OSM API timeout (5s)")
        except Exception as e:
            logger.error(f"[Speed Limit] OSM failed: {e}")

        # FIX: Use road_type parameter (now defaults to 'residential' from API)
        # Fallback to residential (30mph) as safer default
        default_limit = DEFAULT_SPEED_LIMITS.get(road_type, 30)
        logger.info(f"[Speed Limit] Using default for {road_type}: {default_limit} mph")

        # Cache the default too to avoid repeated API calls
        self._add_to_cache(cache_key, {
            'speed_limit': default_limit,
            'timestamp': time.time(),
            'source': 'default'
        })

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
            logger.error(f"Error checking speed violation: {e}")
            return {'status': 'unknown', 'error': str(e)}

    def get_speed_limit_changed(self) -> bool:
        """Check if speed limit has changed."""
        return self.speed_limit_changed

    def clear_cache(self):
        """Clear speed limit cache."""
        self.speed_limit_cache.clear()
        logger.info("[OK] Speed limit cache cleared")


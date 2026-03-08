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
        self.cache_expiry = 600  # 10 minutes (increased from 5)
        self.current_speed_limit = None
        self.previous_speed_limit = None
        self.speed_limit_changed = False

        # Overpass API rate limiting - disable for local instances
        overpass_url = os.getenv('OVERPASS_API_URL', 'http://overpass-api.de/api/interpreter')
        is_local_overpass = 'localhost' in overpass_url or '127.0.0.1' in overpass_url or '81.0.246.97' in overpass_url

        if is_local_overpass:
            self.overpass_rate_limit = 0.0  # No rate limiting for local instance
            self.overpass_min_interval = 0.0
            logger.info("[Speed Limit] Local Overpass detected - rate limiting disabled")
        else:
            self.overpass_rate_limit = float(os.getenv('OVERPASS_RATE_LIMIT', '2.0'))  # requests per second
            self.overpass_min_interval = 1.0 / self.overpass_rate_limit
            logger.info(f"[Speed Limit] Public Overpass - rate limit: {self.overpass_rate_limit} req/s")

        self.overpass_last_request = 0

        # Speed limit change detection
        self.last_location = None  # (lat, lon) tuple for change detection

        # API Usage Metrics
        self.metrics = {
            'tomtom_snap_to_roads_calls': 0,
            'tomtom_snap_to_roads_success': 0,
            'tomtom_snap_to_roads_failures': 0,
            'tomtom_traffic_flow_calls': 0,
            'tomtom_traffic_flow_success': 0,
            'tomtom_traffic_flow_failures': 0,
            'overpass_calls': 0,
            'overpass_maxspeed_hits': 0,
            'overpass_highway_inferred': 0,
            'overpass_failures': 0,
            'cache_hits': 0,
            'cache_misses': 0,
            'default_fallbacks': 0,
            'speed_limit_changes': 0,
            'total_requests': 0
        }

        # TomTom API quota tracking (most plans have monthly limits)
        self.tomtom_quota = {
            'daily_calls': 0,
            'monthly_calls': 0,
            'last_reset_day': datetime.now().day,
            'last_reset_month': datetime.now().month,
            'estimated_cost': 0.0  # Track estimated API costs
        }
        
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

    def _reset_tomtom_quota_if_needed(self) -> None:
        """Reset TomTom quota counters daily/monthly."""
        now = datetime.now()

        # Reset daily counter
        if now.day != self.tomtom_quota['last_reset_day']:
            logger.info(f"[TomTom Quota] Daily reset - Previous: {self.tomtom_quota['daily_calls']} calls")
            self.tomtom_quota['daily_calls'] = 0
            self.tomtom_quota['last_reset_day'] = now.day

        # Reset monthly counter
        if now.month != self.tomtom_quota['last_reset_month']:
            logger.info(f"[TomTom Quota] Monthly reset - Previous: {self.tomtom_quota['monthly_calls']} calls, Cost: ${self.tomtom_quota['estimated_cost']:.2f}")
            self.tomtom_quota['monthly_calls'] = 0
            self.tomtom_quota['estimated_cost'] = 0.0
            self.tomtom_quota['last_reset_month'] = now.month

    def _track_tomtom_call(self, success: bool = True) -> None:
        """
        Track TomTom API usage and estimated costs.
        Note: Individual API success/failure metrics are tracked separately
        in tomtom_snap_to_roads_* and tomtom_traffic_flow_* metrics.
        This method only tracks combined quota usage.
        """
        self._reset_tomtom_quota_if_needed()

        self.tomtom_quota['daily_calls'] += 1
        self.tomtom_quota['monthly_calls'] += 1

        # Estimate cost (typical pricing: $0.50 per 1000 calls for Traffic Flow API)
        # Adjust this based on your actual TomTom plan
        cost_per_call = 0.0005  # $0.50 / 1000 calls
        self.tomtom_quota['estimated_cost'] += cost_per_call

        # Log warning if approaching typical free tier limits (2500 calls/day)
        if self.tomtom_quota['daily_calls'] % 500 == 0:
            logger.info(f"[TomTom Quota] Daily: {self.tomtom_quota['daily_calls']} calls, Monthly: {self.tomtom_quota['monthly_calls']}, Est. Cost: ${self.tomtom_quota['estimated_cost']:.2f}")

    def _wait_for_overpass_rate_limit(self) -> None:
        """
        Enforce rate limiting for Overpass API calls.
        Skipped for local instances (rate_limit = 0).
        """
        # Skip rate limiting for local Overpass instances
        if self.overpass_rate_limit == 0.0:
            return

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
            dict: Speed limit information with change detection
        """
        try:
            # Track total requests
            self.metrics['total_requests'] += 1

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

            # Detect speed limit changes
            speed_limit_changed = False
            if self.current_speed_limit is not None and self.current_speed_limit != speed_limit:
                speed_limit_changed = True
                self.metrics['speed_limit_changes'] += 1
                logger.warning(f"[Speed Limit Change] {self.current_speed_limit} mph → {speed_limit} mph at ({lat:.4f}, {lon:.4f})")

            # Update current speed limit
            self._update_speed_limit(speed_limit)
            self.last_location = (lat, lon)

            return {
                'speed_limit_mph': speed_limit,
                'speed_limit_kmh': round(speed_limit * 1.60934, 1),
                'road_type': road_type,
                'vehicle_type': vehicle_type,
                'is_smart_motorway': smart_motorway_info['is_smart_motorway'],
                'motorway_name': smart_motorway_info.get('motorway_name'),
                'speed_limit_changed': speed_limit_changed,
                'previous_speed_limit_mph': self.previous_speed_limit,
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
                    self.metrics['cache_hits'] += 1
                    logger.info(f"[Speed Limit] Cache hit: {cached_data['speed_limit']} mph (source: {cached_data.get('source', 'unknown')})")
                    return cached_data['speed_limit']
                else:
                    # Expired, remove it
                    del self.speed_limit_cache[cache_key]
        except Exception as e:
            logger.error(f"[Speed Limit] Cache check failed: {e}")

        # Cache miss
        self.metrics['cache_misses'] += 1

        # Try TomTom Snap to Roads API first - provides actual speed limits
        tomtom_api_key = os.getenv('TOMTOM_API_KEY')
        if tomtom_api_key:
            try:
                self.metrics['tomtom_snap_to_roads_calls'] += 1

                # Snap to Roads API requires at least 2 points
                # Create a small route around the point (~50m radius)
                offset = 0.0005  # ~50 meters

                # Format: lon,lat;lon,lat (semicolon-separated)
                points_str = f"{lon},{lat};{lon+offset},{lat+offset}"

                # Correct endpoint format from TomTom documentation
                snap_url = "https://api.tomtom.com/snapToRoads/1"
                params = {
                    'key': tomtom_api_key,
                    'points': points_str,
                    'headings': '0;0',  # Required parameter
                    'timestamps': '2021-01-01T00:00:00Z;2021-01-01T00:01:00Z',  # Required parameter
                    'fields': '{route{properties{speedLimits{value,unit,type}}}}',
                    'vehicleType': 'PassengerCar',
                    'measurementSystem': 'metric'
                }

                response = requests.get(snap_url, params=params, timeout=3)

                if response.status_code == 200:
                    snap_data = response.json()

                    # Parse response: route -> properties -> speedLimits
                    # Response structure: {"route": [{"properties": {"speedLimits": {"value": 70, "unit": "kmph"}}}]}
                    if 'route' in snap_data:
                        route_features = snap_data['route']
                        if isinstance(route_features, list) and len(route_features) > 0:
                            # Get first route segment
                            segment = route_features[0]
                            if 'properties' in segment and 'speedLimits' in segment['properties']:
                                # speedLimits is an object, not an array
                                speed_limit_data = segment['properties']['speedLimits']
                                if isinstance(speed_limit_data, dict):
                                    speed_limit_kmh = speed_limit_data.get('value', 0)

                                    if speed_limit_kmh > 0:
                                        # Convert km/h to mph (UK uses mph)
                                        speed_limit_mph = int(round(speed_limit_kmh * 0.621371))

                                        # Round to nearest common UK speed limit
                                        uk_limits = [20, 30, 40, 50, 60, 70]
                                        speed_limit = min(uk_limits, key=lambda x: abs(x - speed_limit_mph))

                                        # Track successful call
                                        self.metrics['tomtom_snap_to_roads_success'] += 1
                                        self._track_tomtom_call(success=True)

                                        # Cache the result
                                        self._add_to_cache(cache_key, {
                                            'speed_limit': speed_limit,
                                            'timestamp': time.time(),
                                            'source': 'TomTom-SnapToRoads'
                                        })
                                        logger.info(f"[Speed Limit] TomTom Snap to Roads: {speed_limit_kmh} km/h -> {speed_limit} mph")
                                        return speed_limit

                    # If we got here, no speed limit data was returned
                    self.metrics['tomtom_snap_to_roads_failures'] += 1
                    logger.warning("[Speed Limit] TomTom Snap to Roads returned no speed limit data")
                else:
                    self.metrics['tomtom_snap_to_roads_failures'] += 1
                    logger.warning(f"[Speed Limit] TomTom Snap to Roads API error: status={response.status_code}")
            except requests.exceptions.Timeout:
                self.metrics['tomtom_snap_to_roads_failures'] += 1
                logger.warning("[Speed Limit] TomTom Snap to Roads API timeout (3s)")
            except Exception as e:
                self.metrics['tomtom_snap_to_roads_failures'] += 1
                logger.error(f"[Speed Limit] TomTom Snap to Roads failed: {e}")

        # Fallback: Try TomTom Traffic Flow API - uses freeFlowSpeed as speed limit proxy
        if tomtom_api_key:
            try:
                self.metrics['tomtom_traffic_flow_calls'] += 1
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
                        # FIX: freeFlowSpeed is NOT the speed limit - it's the average traffic speed
                        # People typically drive 5-15 mph faster than the speed limit
                        # We need to estimate the actual speed limit by reducing freeFlowSpeed

                        # Convert km/h to mph (UK uses mph)
                        free_flow_mph = free_flow_speed_kmh * 0.621371

                        # Estimate actual speed limit by reducing free flow speed
                        # Typical relationship: freeFlowSpeed ≈ speedLimit + 10-15 mph
                        # Use a conservative 12 mph reduction
                        estimated_speed_mph = free_flow_mph - 12

                        # Round to nearest common UK speed limit (20, 30, 40, 50, 60, 70)
                        uk_limits = [20, 30, 40, 50, 60, 70]
                        speed_limit = min(uk_limits, key=lambda x: abs(x - estimated_speed_mph))

                        # Additional validation: if free flow is very high (>80 mph), it's likely a motorway
                        if free_flow_mph > 80:
                            speed_limit = 70  # UK motorway limit
                        # If free flow is very low (<30 mph), it's likely a 20 or 30 zone
                        elif free_flow_mph < 30:
                            speed_limit = min(uk_limits, key=lambda x: abs(x - free_flow_mph))

                        # Track successful TomTom Traffic Flow call
                        self.metrics['tomtom_traffic_flow_success'] += 1
                        self._track_tomtom_call(success=True)

                        # Cache the result using LRU method
                        self._add_to_cache(cache_key, {
                            'speed_limit': speed_limit,
                            'timestamp': time.time(),
                            'source': 'TomTom-TrafficFlow-estimated'
                        })
                        logger.info(f"[Speed Limit] TomTom Traffic Flow: {free_flow_speed_kmh} km/h ({free_flow_mph:.0f} mph free flow) -> estimated {speed_limit} mph limit")
                        return speed_limit
                    else:
                        self.metrics['tomtom_traffic_flow_failures'] += 1
                        self._track_tomtom_call(success=False)
                        logger.warning(f"[Speed Limit] TomTom Traffic Flow returned freeFlowSpeed=0")
                else:
                    self.metrics['tomtom_traffic_flow_failures'] += 1
                    self._track_tomtom_call(success=False)
                    logger.warning(f"[Speed Limit] TomTom Traffic Flow API error: status={response.status_code}")
            except requests.exceptions.Timeout:
                self.metrics['tomtom_traffic_flow_failures'] += 1
                self._track_tomtom_call(success=False)
                logger.warning("[Speed Limit] TomTom Traffic Flow API timeout (3s)")
            except Exception as e:
                self.metrics['tomtom_traffic_flow_failures'] += 1
                self._track_tomtom_call(success=False)
                logger.error(f"[Speed Limit] TomTom Traffic Flow failed: {e}")
        else:
            logger.info("[Speed Limit] No TOMTOM_API_KEY configured, skipping TomTom")

        # Fallback: Query Overpass API for maxspeed tag and road type (slower but explicit)
        # FIX: Use self-hosted Overpass on Contabo with rate limiting
        try:
            self.metrics['overpass_calls'] += 1

            # Use self-hosted Overpass if configured, otherwise public
            # OVERPASS_API_URL is set in .env to Contabo server: http://81.0.246.97:12345/api/interpreter
            overpass_url = os.getenv('OVERPASS_API_URL', 'http://overpass-api.de/api/interpreter')

            # Enforce rate limiting (skipped for local instances)
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
                    HIGHWAY_RANK = {
                        'motorway': 10, 'motorway_link': 9,
                        'trunk': 8, 'trunk_link': 7,
                        'primary': 6, 'primary_link': 5,
                        'secondary': 4, 'secondary_link': 3,
                        'tertiary': 2, 'tertiary_link': 1,
                    }
                    highway_speed_map = {
                        'motorway': 70, 'motorway_link': 50,
                        'trunk': 70, 'trunk_link': 50,
                        'primary': 60, 'primary_link': 40,
                        'secondary': 60, 'secondary_link': 40,
                        'tertiary': 40, 'tertiary_link': 30,
                        'unclassified': 30, 'residential': 30,
                        'living_street': 20, 'service': 20,
                        'pedestrian': 10, 'track': 20,
                    }

                    best_explicit = None
                    best_explicit_rank = -1
                    best_inferred = None
                    best_inferred_rank = -1
                    best_inferred_hw = 'unknown'

                    for element in elements:
                        tags = element.get('tags', {})
                        hw = tags.get('highway', '')
                        rank = HIGHWAY_RANK.get(hw, 0)
                        is_dual = tags.get('dual_carriageway') == 'yes' or tags.get('carriageway') == 'dual'

                        if 'maxspeed' in tags and rank >= best_explicit_rank:
                            speed_str = tags['maxspeed']
                            speed_str_clean = speed_str.replace('mph', '').replace('km/h', '').strip()
                            try:
                                speed = int(speed_str_clean.split()[0])
                                if 'km/h' in speed_str:
                                    speed = int(round(speed * 0.621371))
                                best_explicit = speed
                                best_explicit_rank = rank
                            except (ValueError, IndexError):
                                logger.warning(f"[Speed Limit] OSM parse error: '{speed_str}'")

                        if hw in highway_speed_map and rank >= best_inferred_rank:
                            inferred = highway_speed_map[hw]
                            if is_dual and hw in ('primary', 'secondary', 'tertiary'):
                                inferred = min(inferred + 10, 70)
                            best_inferred = inferred
                            best_inferred_rank = rank
                            best_inferred_hw = hw

                    if best_explicit is not None:
                        self.metrics['overpass_maxspeed_hits'] += 1
                        self._add_to_cache(cache_key, {
                            'speed_limit': best_explicit,
                            'timestamp': time.time(),
                            'source': 'OSM-maxspeed'
                        })
                        logger.info(f"[Speed Limit] OSM maxspeed (best road): {best_explicit} mph")
                        return best_explicit

                    if best_inferred is not None:
                        self.metrics['overpass_highway_inferred'] += 1
                        self._add_to_cache(cache_key, {
                            'speed_limit': best_inferred,
                            'timestamp': time.time(),
                            'source': f'OSM-highway-{best_inferred_hw}'
                        })
                        logger.info(f"[Speed Limit] Inferred from highway={best_inferred_hw}: {best_inferred} mph")
                        return best_inferred
                else:
                    self.metrics['overpass_failures'] += 1
                    logger.warning(f"[Speed Limit] OSM returned no highway elements nearby")
            else:
                self.metrics['overpass_failures'] += 1
                logger.warning(f"[Speed Limit] OSM API error: status={response.status_code}")
        except requests.exceptions.Timeout:
            self.metrics['overpass_failures'] += 1
            logger.warning("[Speed Limit] OSM API timeout (5s)")
        except Exception as e:
            self.metrics['overpass_failures'] += 1
            logger.error(f"[Speed Limit] OSM failed: {e}")

        # FIX: Use road_type parameter (now defaults to 'residential' from API)
        # Fallback to residential (30mph) as safer default
        self.metrics['default_fallbacks'] += 1
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

    def get_metrics(self) -> Dict:
        """
        Get API usage metrics and statistics.

        Returns:
            dict: Comprehensive metrics including source usage, cache performance, and costs
        """
        total = self.metrics['total_requests']
        cache_total = self.metrics['cache_hits'] + self.metrics['cache_misses']

        return {
            'total_requests': total,
            'cache': {
                'hits': self.metrics['cache_hits'],
                'misses': self.metrics['cache_misses'],
                'hit_rate': round(self.metrics['cache_hits'] / cache_total * 100, 1) if cache_total > 0 else 0,
                'size': len(self.speed_limit_cache),
                'max_size': self.cache_max_size,
                'ttl_seconds': self.cache_expiry
            },
            'tomtom_snap_to_roads': {
                'total_calls': self.metrics['tomtom_snap_to_roads_calls'],
                'successful': self.metrics['tomtom_snap_to_roads_success'],
                'failures': self.metrics['tomtom_snap_to_roads_failures'],
                'success_rate': round(self.metrics['tomtom_snap_to_roads_success'] / self.metrics['tomtom_snap_to_roads_calls'] * 100, 1) if self.metrics['tomtom_snap_to_roads_calls'] > 0 else 0
            },
            'tomtom_traffic_flow': {
                'total_calls': self.metrics['tomtom_traffic_flow_calls'],
                'successful': self.metrics['tomtom_traffic_flow_success'],
                'failures': self.metrics['tomtom_traffic_flow_failures'],
                'success_rate': round(self.metrics['tomtom_traffic_flow_success'] / self.metrics['tomtom_traffic_flow_calls'] * 100, 1) if self.metrics['tomtom_traffic_flow_calls'] > 0 else 0
            },
            'tomtom_combined': {
                'daily_calls': self.tomtom_quota['daily_calls'],
                'monthly_calls': self.tomtom_quota['monthly_calls'],
                'estimated_cost_usd': round(self.tomtom_quota['estimated_cost'], 2)
            },
            'overpass': {
                'total_calls': self.metrics['overpass_calls'],
                'maxspeed_hits': self.metrics['overpass_maxspeed_hits'],
                'highway_inferred': self.metrics['overpass_highway_inferred'],
                'failures': self.metrics['overpass_failures'],
                'success_rate': round((self.metrics['overpass_maxspeed_hits'] + self.metrics['overpass_highway_inferred']) / self.metrics['overpass_calls'] * 100, 1) if self.metrics['overpass_calls'] > 0 else 0,
                'rate_limit': self.overpass_rate_limit,
                'is_local': self.overpass_rate_limit == 0.0
            },
            'sources': {
                'tomtom_snap_to_roads_percentage': round(self.metrics['tomtom_snap_to_roads_success'] / total * 100, 1) if total > 0 else 0,
                'tomtom_traffic_flow_percentage': round(self.metrics['tomtom_traffic_flow_success'] / total * 100, 1) if total > 0 else 0,
                'overpass_maxspeed_percentage': round(self.metrics['overpass_maxspeed_hits'] / total * 100, 1) if total > 0 else 0,
                'overpass_inferred_percentage': round(self.metrics['overpass_highway_inferred'] / total * 100, 1) if total > 0 else 0,
                'default_fallback_percentage': round(self.metrics['default_fallbacks'] / total * 100, 1) if total > 0 else 0
            },
            'speed_limit_changes': self.metrics['speed_limit_changes']
        }

    def get_tomtom_quota(self) -> Dict:
        """
        Get TomTom API quota and cost information.

        Returns:
            dict: TomTom quota details
        """
        self._reset_tomtom_quota_if_needed()
        return {
            'daily_calls': self.tomtom_quota['daily_calls'],
            'monthly_calls': self.tomtom_quota['monthly_calls'],
            'estimated_monthly_cost_usd': round(self.tomtom_quota['estimated_cost'], 2),
            'last_reset_day': self.tomtom_quota['last_reset_day'],
            'last_reset_month': self.tomtom_quota['last_reset_month']
        }

    def reset_metrics(self):
        """Reset all metrics counters (useful for testing or periodic resets)."""
        self.metrics = {
            'tomtom_snap_to_roads_calls': 0,
            'tomtom_snap_to_roads_success': 0,
            'tomtom_snap_to_roads_failures': 0,
            'tomtom_traffic_flow_calls': 0,
            'tomtom_traffic_flow_success': 0,
            'tomtom_traffic_flow_failures': 0,
            'overpass_calls': 0,
            'overpass_maxspeed_hits': 0,
            'overpass_highway_inferred': 0,
            'overpass_failures': 0,
            'cache_hits': 0,
            'cache_misses': 0,
            'default_fallbacks': 0,
            'speed_limit_changes': 0,
            'total_requests': 0
        }
        logger.info("[Metrics] All metrics reset to zero")


"""
Speed Limit Detection Module for Voyagr
Posted limits only: OSM maxspeed (Overpass) first, then TomTom Snap to Roads.
No regional defaults, highway-type inference, traffic-flow guesses,
smart-motorway simulation, or vehicle-type caps.
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

# UK Default Speed Limits (mph) — last resort when no API/OSM data; many A/B roads are now 50 where NSL was once assumed 60
DEFAULT_SPEED_LIMITS_UK = {
    'motorway': 70,
    'trunk_road': 70,
    'primary_road': 50,
    'secondary_road': 50,
    'residential': 30,
    'living_street': 20,
    'unclassified': 30,
}

# US typical defaults when OSM has no maxspeed (mph)
DEFAULT_SPEED_LIMITS_US = {
    'motorway': 70,
    'trunk_road': 55,
    'primary_road': 55,
    'secondary_road': 55,
    'residential': 25,
    'living_street': 15,
    'unclassified': 35,
}

# EU / rest-of-world defaults as mph equivalents of common signed limits
DEFAULT_SPEED_LIMITS_METRIC = {
    'motorway': 81,       # ~130 km/h
    'trunk_road': 62,     # ~100 km/h
    'primary_road': 56,   # ~90 km/h
    'secondary_road': 50, # ~80 km/h
    'residential': 31,    # ~50 km/h
    'living_street': 19,  # ~30 km/h
    'unclassified': 31,
}

DEFAULT_SPEED_BY_REGION = {
    'uk': DEFAULT_SPEED_LIMITS_UK,
    'us': DEFAULT_SPEED_LIMITS_US,
    'metric': DEFAULT_SPEED_LIMITS_METRIC,
}

# Valhalla / OSM-style aliases → keys used in VEHICLE_SPEED_LIMITS and defaults
ROAD_TYPE_ALIASES = {
    'primary': 'primary_road',
    'secondary': 'secondary_road',
    'trunk': 'trunk_road',
    'motorway_link': 'motorway',
    'trunk_link': 'trunk_road',
    'primary_link': 'primary_road',
    'secondary_link': 'secondary_road',
    'tertiary': 'secondary_road',
    'tertiary_link': 'secondary_road',
    'unclassified': 'residential',
    'service': 'residential',
}

# Inferred limits (mph) when a way has highway=* but no maxspeed=*
HIGHWAY_INFERRED_MPH = {
    'uk': {
        'motorway': 70, 'motorway_link': 50,
        'trunk': 70, 'trunk_link': 50,
        'primary': 50, 'primary_link': 40,
        'secondary': 50, 'secondary_link': 40,
        'tertiary': 40, 'tertiary_link': 30,
        'unclassified': 30, 'residential': 30,
        'living_street': 20, 'service': 20,
        'pedestrian': 10, 'track': 20,
    },
    'us': {
        'motorway': 70, 'motorway_link': 55,
        'trunk': 55, 'trunk_link': 45,
        'primary': 55, 'primary_link': 45,
        'secondary': 55, 'secondary_link': 45,
        'tertiary': 35, 'tertiary_link': 35,
        'unclassified': 35, 'residential': 25,
        'living_street': 15, 'service': 25,
        'pedestrian': 10, 'track': 20,
    },
    'metric': {
        'motorway': 81, 'motorway_link': 50,
        'trunk': 62, 'trunk_link': 44,
        'primary': 56, 'primary_link': 50,
        'secondary': 50, 'secondary_link': 44,
        'tertiary': 31, 'tertiary_link': 28,
        'unclassified': 31, 'residential': 31,
        'living_street': 19, 'service': 19,
        'pedestrian': 6, 'track': 12,
    },
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


def _normalize_road_type(road_type: str) -> str:
    if not road_type:
        return 'residential'
    return ROAD_TYPE_ALIASES.get(road_type, road_type)


def _region_from_lat_lon(lat: float, lon: float) -> str:
    """
    Choose default-limit family: uk, us, or metric (EU / rest of world).
    Set SPEED_LIMIT_REGION=uk|us|metric to override (e.g. Ireland uses metric signs).
    """
    override = os.getenv('SPEED_LIMIT_REGION', '').strip().lower()
    if override in ('uk', 'us', 'metric'):
        return override
    # Continental US (approximate)
    if 24.5 <= lat <= 50.0 and -125.0 <= lon <= -66.0:
        return 'us'
    # United Kingdom + nearby (mph signage); Ireland also uses this box — use env for ROI if needed
    if 49.5 <= lat <= 60.9 and -8.0 <= lon <= 2.0:
        return 'uk'
    return 'metric'


def _parse_osm_maxspeed_to_mph(speed_str: str, region: str) -> Optional[int]:
    """Parse OSM maxspeed tag to mph. Handles mph, km/h, and bare numbers (region-dependent)."""
    if not speed_str:
        return None
    raw = speed_str.strip()
    low = raw.lower()
    if low in ('none', 'signals', 'walk', 'implicit', 'variable'):
        return None
    # Country-specific presets like DE:urban — skip numeric parse
    if ':' in low.split()[0] and not any(ch.isdigit() for ch in low.split()[0]):
        return None

    has_mph = 'mph' in low
    has_kmh = 'km/h' in low or 'kmh' in low

    cleaned = low.replace('km/h', ' ').replace('kmh', ' ').replace('mph', ' ').strip()
    try:
        val = float(cleaned.split()[0])
    except (ValueError, IndexError):
        return None

    if has_mph:
        return int(round(val))
    if has_kmh:
        return int(round(val * 0.621371))
    # Bare number: UK/US mappers often mean mph; elsewhere OSM default is km/h
    if region in ('uk', 'us'):
        return int(round(val))
    return int(round(val * 0.621371))


def _snap_tomtom_kmh_to_mph(speed_kmh: float, region: str) -> int:
    """Round TomTom km/h limit to a plausible signed speed in mph for the region."""
    speed_mph = speed_kmh * 0.621371
    if region == 'uk':
        uk_limits = [20, 30, 40, 50, 60, 70]
        return min(uk_limits, key=lambda x: abs(x - speed_mph))
    if region == 'us':
        us_limits = [15, 25, 30, 35, 45, 55, 65, 70, 75, 80]
        return min(us_limits, key=lambda x: abs(x - speed_mph))
    common_kmh = [20, 30, 50, 70, 90, 100, 110, 120, 130]
    best_kmh = min(common_kmh, key=lambda x: abs(x - speed_kmh))
    return int(round(best_kmh * 0.621371))


def _freeflow_kmh_to_limit_mph(free_flow_kmh: float, region: str) -> int:
    """Infer posted limit from TomTom free-flow speed (heuristic; not ground truth)."""
    free_flow_mph = free_flow_kmh * 0.621371
    estimated_mph = free_flow_mph - 12
    if region == 'uk':
        uk_limits = [20, 30, 40, 50, 60, 70]
        speed_limit = min(uk_limits, key=lambda x: abs(x - estimated_mph))
        if free_flow_mph > 80:
            speed_limit = 70
        elif free_flow_mph < 30:
            speed_limit = min(uk_limits, key=lambda x: abs(x - free_flow_mph))
        return speed_limit
    if region == 'us':
        us_limits = [15, 25, 30, 35, 45, 55, 65, 70, 75]
        speed_limit = min(us_limits, key=lambda x: abs(x - estimated_mph))
        if free_flow_mph > 75:
            speed_limit = 70
        return speed_limit
    est_kmh = max(10.0, free_flow_kmh - 15)
    common_kmh = [30, 50, 70, 90, 100, 120, 130]
    best = min(common_kmh, key=lambda x: abs(x - est_kmh))
    return int(round(best * 0.621371))


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
            dict: Speed limit information with change detection.
            speed_limit_mph may be None when no posted limit is available.
        """
        try:
            # Track total requests
            self.metrics['total_requests'] += 1

            region = _region_from_lat_lon(lat, lon)

            # Informational only (not used to set limit)
            smart_motorway_info = (
                self._check_smart_motorway(lat, lon)
                if region == 'uk'
                else {'is_smart_motorway': False, 'motorway_name': None}
            )

            speed_limit = self._get_tomtom_or_osm_posted_limit(lat, lon, region)

            # Detect speed limit changes (skip first-ever / unknown→unknown)
            speed_limit_changed = False
            if self.current_speed_limit is not None and self.current_speed_limit != speed_limit:
                speed_limit_changed = True
                self.metrics['speed_limit_changes'] += 1
                logger.warning(
                    f"[Speed Limit Change] {self.current_speed_limit} mph → {speed_limit} mph "
                    f"at ({lat:.4f}, {lon:.4f})"
                )

            # Update current speed limit
            self._update_speed_limit(speed_limit)
            self.last_location = (lat, lon)

            speed_limit_kmh = (
                round(speed_limit * 1.60934, 1) if speed_limit is not None else None
            )

            return {
                'speed_limit_mph': speed_limit,
                'speed_limit_kmh': speed_limit_kmh,
                'road_type': road_type,
                'vehicle_type': vehicle_type,
                'speed_limit_region': region,
                'is_smart_motorway': smart_motorway_info['is_smart_motorway'],
                'motorway_name': smart_motorway_info.get('motorway_name'),
                'speed_limit_changed': speed_limit_changed,
                'previous_speed_limit_mph': self.previous_speed_limit,
                'timestamp': int(time.time())
            }
        except Exception as e:
            logger.error(f"Error getting speed limit: {e}")
            return {
                'speed_limit_mph': None,
                'speed_limit_kmh': None,
                'road_type': road_type,
                'vehicle_type': vehicle_type,
                'error': str(e),
                'timestamp': int(time.time())
            }
    
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
    
    def _get_tomtom_or_osm_posted_limit(self, lat: float, lon: float, region: str) -> Optional[int]:
        """OSM maxspeed (Overpass) first, then TomTom Snap to Roads. Returns None if unknown."""
        # Periodic cache cleanup (every 100 requests)
        if len(self.speed_limit_cache) % 100 == 0:
            self._cleanup_expired_cache()

        cache_key = f"{lat:.4f},{lon:.4f}"
        try:
            if cache_key in self.speed_limit_cache:
                cached_data = self.speed_limit_cache[cache_key]
                if time.time() - cached_data['timestamp'] < self.cache_expiry:
                    self.speed_limit_cache.move_to_end(cache_key)
                    self.metrics['cache_hits'] += 1
                    lim = cached_data.get('speed_limit')
                    disp = 'unknown' if lim is None else f'{lim} mph'
                    logger.info(
                        f"[Speed Limit] Cache hit: {disp} (source: {cached_data.get('source', 'unknown')})"
                    )
                    return lim
                del self.speed_limit_cache[cache_key]
        except Exception as e:
            logger.error(f"[Speed Limit] Cache check failed: {e}")

        self.metrics['cache_misses'] += 1

        try:
            self.metrics['overpass_calls'] += 1

            overpass_url = os.getenv('OVERPASS_API_URL', 'http://overpass-api.de/api/interpreter')

            self._wait_for_overpass_rate_limit()

            # Use way centers so we pick the road the vehicle is actually on, not a
            # parallel motorway/trunk with a higher highway=* rank but farther away.
            query = f"""
            [out:json][timeout:8];
            way(around:45,{lat},{lon})[highway];
            out center tags;
            """

            response = requests.get(overpass_url, params={'data': query}, timeout=8)

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
                    # Ignore pedestrian/cycle infrastructure that often sits beside drivable roads
                    # and carries low maxspeed tags (e.g. 10 km/h), which produced bogus ~7 mph flashes.
                    excluded_hw = frozenset({
                        'footway', 'path', 'pedestrian', 'cycleway', 'steps',
                        'bridleway', 'track', 'corridor', 'elevator',
                    })

                    best_explicit = None
                    best_dist_km = float('inf')
                    best_rank = -1  # highway class tie-break when distances are equal

                    for element in elements:
                        tags = element.get('tags', {})
                        hw = tags.get('highway', '')
                        if hw in excluded_hw:
                            continue
                        if 'maxspeed' not in tags:
                            continue
                        center = element.get('center') or {}
                        c_lat = center.get('lat')
                        c_lon = center.get('lon')
                        if c_lat is None or c_lon is None:
                            continue
                        dist_km = self._haversine_distance(lat, lon, float(c_lat), float(c_lon))
                        rank = HIGHWAY_RANK.get(hw, 0)
                        speed_str = tags['maxspeed']
                        parsed = _parse_osm_maxspeed_to_mph(speed_str, region)
                        if parsed is None:
                            logger.debug(f"[Speed Limit] OSM maxspeed not parsed: '{speed_str}'")
                            continue
                        # Prefer closest drivable way with maxspeed; break ties by higher road class.
                        if dist_km < best_dist_km - 1e-6 or (
                            abs(dist_km - best_dist_km) < 1e-6 and rank > best_rank
                        ):
                            best_explicit = parsed
                            best_dist_km = dist_km
                            best_rank = rank

                    if best_explicit is not None:
                        self.metrics['overpass_maxspeed_hits'] += 1
                        self._add_to_cache(cache_key, {
                            'speed_limit': best_explicit,
                            'timestamp': time.time(),
                            'source': 'OSM-maxspeed'
                        })
                        logger.info(
                            f"[Speed Limit] OSM maxspeed (closest way ~{best_dist_km * 1000:.0f}m): "
                            f"{best_explicit} mph"
                        )
                        return best_explicit
                else:
                    self.metrics['overpass_failures'] += 1
                    logger.warning("[Speed Limit] OSM returned no highway elements nearby")
            else:
                self.metrics['overpass_failures'] += 1
                logger.warning(f"[Speed Limit] OSM API error: status={response.status_code}")
        except requests.exceptions.Timeout:
            self.metrics['overpass_failures'] += 1
            logger.warning("[Speed Limit] OSM API timeout (5s)")
        except Exception as e:
            self.metrics['overpass_failures'] += 1
            logger.error(f"[Speed Limit] OSM failed: {e}")

        tomtom_api_key = os.getenv('TOMTOM_API_KEY')
        if tomtom_api_key:
            try:
                self.metrics['tomtom_snap_to_roads_calls'] += 1

                offset = 0.0005  # ~50 meters
                points_str = f"{lon},{lat};{lon+offset},{lat+offset}"

                snap_url = "https://api.tomtom.com/snapToRoads/1"
                params = {
                    'key': tomtom_api_key,
                    'points': points_str,
                    'headings': '0;0',
                    'timestamps': '2021-01-01T00:00:00Z;2021-01-01T00:01:00Z',
                    'fields': '{route{properties{speedLimits{value,unit,type}}}}',
                    'vehicleType': 'PassengerCar',
                    'measurementSystem': 'metric'
                }

                response = requests.get(snap_url, params=params, timeout=3)

                if response.status_code == 200:
                    snap_data = response.json()

                    if 'route' in snap_data:
                        route_features = snap_data['route']
                        if isinstance(route_features, list) and len(route_features) > 0:
                            segment = route_features[0]
                            if 'properties' in segment and 'speedLimits' in segment['properties']:
                                speed_limit_data = segment['properties']['speedLimits']
                                if isinstance(speed_limit_data, dict):
                                    speed_limit_kmh = speed_limit_data.get('value', 0)

                                    if speed_limit_kmh > 0:
                                        speed_limit = _snap_tomtom_kmh_to_mph(float(speed_limit_kmh), region)

                                        self.metrics['tomtom_snap_to_roads_success'] += 1
                                        self._track_tomtom_call(success=True)

                                        self._add_to_cache(cache_key, {
                                            'speed_limit': speed_limit,
                                            'timestamp': time.time(),
                                            'source': 'TomTom-SnapToRoads'
                                        })
                                        logger.info(
                                            f"[Speed Limit] TomTom Snap to Roads: {speed_limit_kmh} km/h -> {speed_limit} mph"
                                        )
                                        return speed_limit

                    self.metrics['tomtom_snap_to_roads_failures'] += 1
                    logger.warning("[Speed Limit] TomTom Snap to Roads returned no speed limit data")
                else:
                    self.metrics['tomtom_snap_to_roads_failures'] += 1
                    logger.warning(
                        f"[Speed Limit] TomTom Snap to Roads API error: status={response.status_code}"
                    )
            except requests.exceptions.Timeout:
                self.metrics['tomtom_snap_to_roads_failures'] += 1
                logger.warning("[Speed Limit] TomTom Snap to Roads API timeout (3s)")
            except Exception as e:
                self.metrics['tomtom_snap_to_roads_failures'] += 1
                logger.error(f"[Speed Limit] TomTom Snap to Roads failed: {e}")
        else:
            logger.info("[Speed Limit] No TOMTOM_API_KEY configured, skipping TomTom")

        self.metrics['default_fallbacks'] += 1
        logger.info("[Speed Limit] No posted limit from OSM maxspeed or TomTom Snap to Roads")

        self._add_to_cache(cache_key, {
            'speed_limit': None,
            'timestamp': time.time(),
            'source': 'none'
        })

        return None

    def _update_speed_limit(self, new_speed_limit: Optional[int]):
        """Update current speed limit and detect changes."""
        if self.current_speed_limit != new_speed_limit:
            self.previous_speed_limit = self.current_speed_limit
            self.current_speed_limit = new_speed_limit
            self.speed_limit_changed = True
        else:
            self.speed_limit_changed = False
    
    def check_speed_violation(self, current_speed_mph: float,
                             speed_limit_mph: Optional[int],
                             warning_threshold_mph: int = 5) -> Dict:
        """
        Check if vehicle is exceeding speed limit.

        Args:
            current_speed_mph: Current vehicle speed in mph
            speed_limit_mph: Speed limit in mph (None if unknown)
            warning_threshold_mph: Threshold for warning (default 5 mph)

        Returns:
            dict: Speed violation status
        """
        try:
            if speed_limit_mph is None or speed_limit_mph <= 0:
                return {
                    'status': 'unknown',
                    'color': 'gray',
                    'current_speed_mph': current_speed_mph,
                    'speed_limit_mph': speed_limit_mph,
                    'speed_diff_mph': 0.0,
                    'warning_threshold_mph': warning_threshold_mph
                }

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
                'success_rate': round(self.metrics['overpass_maxspeed_hits'] / self.metrics['overpass_calls'] * 100, 1) if self.metrics['overpass_calls'] > 0 else 0,
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


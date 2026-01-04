"""
Overpass API Helper Module

Provides a robust wrapper for OpenStreetMap Overpass API queries with:
- TTL-based caching to reduce API calls
- Multiple fallback endpoints
- Retry logic with exponential backoff
- Rate limit handling

Usage:
    from overpass_helper import OverpassClient
    
    client = OverpassClient()
    result = client.query(query_string, cache_key="my_query", cache_ttl=300)
"""

import os
import hashlib
import json
import logging
import time
from typing import Any, Dict, List, Optional, Tuple
import requests
from functools import lru_cache

logger = logging.getLogger(__name__)

# ============================================================================
# OVERPASS API ENDPOINTS (with fallbacks)
# ============================================================================

# Allow overriding/prepending a custom endpoint via environment variable
CUSTOM_OVERPASS_URL = os.getenv('OVERPASS_API_URL')

OVERPASS_ENDPOINTS = [
    "https://overpass-api.de/api/interpreter",
    "https://lz4.overpass-api.de/api/interpreter",
    "https://z.overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
]

if CUSTOM_OVERPASS_URL:
    # Prepend the custom URL so it's tried first
    if CUSTOM_OVERPASS_URL not in OVERPASS_ENDPOINTS:
        OVERPASS_ENDPOINTS.insert(0, CUSTOM_OVERPASS_URL)

# ============================================================================
# IN-MEMORY CACHE
# ============================================================================

class OverpassCache:
    """Simple TTL-based in-memory cache for Overpass API responses."""
    
    def __init__(self, default_ttl: int = 300):
        """
        Initialize the cache.
        
        Args:
            default_ttl: Default time-to-live in seconds (default: 5 minutes)
        """
        self._cache: Dict[str, Dict[str, Any]] = {}
        self.default_ttl = default_ttl
        self._hits = 0
        self._misses = 0
    
    def _generate_key(self, query: str, extra_key: str = "") -> str:
        """Generate a cache key from query string."""
        content = query + extra_key
        return hashlib.md5(content.encode()).hexdigest()
    
    def get(self, key: str) -> Optional[Any]:
        """
        Get a cached value if it exists and hasn't expired.
        
        Args:
            key: Cache key
            
        Returns:
            Cached value or None if not found/expired
        """
        if key not in self._cache:
            self._misses += 1
            return None
        
        entry = self._cache[key]
        if time.time() > entry['expires']:
            # Entry has expired
            del self._cache[key]
            self._misses += 1
            return None
        
        self._hits += 1
        return entry['data']
    
    def set(self, key: str, data: Any, ttl: Optional[int] = None) -> None:
        """
        Store a value in the cache.
        
        Args:
            key: Cache key
            data: Data to cache
            ttl: Time-to-live in seconds (uses default if not specified)
        """
        ttl = ttl or self.default_ttl
        self._cache[key] = {
            'data': data,
            'expires': time.time() + ttl,
            'created': time.time()
        }
    
    def invalidate(self, key: str) -> bool:
        """Remove a specific key from cache."""
        if key in self._cache:
            del self._cache[key]
            return True
        return False
    
    def clear(self) -> int:
        """Clear all cached entries. Returns number of entries cleared."""
        count = len(self._cache)
        self._cache.clear()
        return count
    
    def cleanup_expired(self) -> int:
        """Remove all expired entries. Returns number of entries removed."""
        now = time.time()
        expired_keys = [k for k, v in self._cache.items() if now > v['expires']]
        for key in expired_keys:
            del self._cache[key]
        return len(expired_keys)
    
    @property
    def stats(self) -> Dict[str, Any]:
        """Get cache statistics."""
        return {
            'size': len(self._cache),
            'hits': self._hits,
            'misses': self._misses,
            'hit_rate': self._hits / max(1, self._hits + self._misses)
        }


# Global cache instance
_overpass_cache = OverpassCache(default_ttl=300)  # 5 minutes default


# ============================================================================
# OVERPASS CLIENT WITH RETRY LOGIC
# ============================================================================

class OverpassClient:
    """
    Robust Overpass API client with caching, retry logic, and fallback endpoints.
    """
    
    def __init__(
        self,
        endpoints: Optional[List[str]] = None,
        timeout: int = 20,
        max_retries: int = 3,
        base_delay: float = 1.0,
        max_delay: float = 30.0,
        cache: Optional[OverpassCache] = None
    ):
        """
        Initialize the Overpass client.
        
        Args:
            endpoints: List of Overpass API endpoints (uses defaults if not specified)
            timeout: Request timeout in seconds
            max_retries: Maximum number of retry attempts per endpoint
            base_delay: Base delay for exponential backoff in seconds
            max_delay: Maximum delay between retries in seconds
            cache: Cache instance to use (uses global cache if not specified)
        """
        self.endpoints = endpoints or OVERPASS_ENDPOINTS
        self.timeout = timeout
        self.max_retries = max_retries
        self.base_delay = base_delay
        self.max_delay = max_delay
        self.cache = cache or _overpass_cache
        self._current_endpoint_index = 0
        self._endpoint_failures = {ep: 0 for ep in self.endpoints}
    
    def _get_next_endpoint(self) -> str:
        """Get the next available endpoint, preferring those with fewer failures."""
        # Sort endpoints by failure count
        sorted_endpoints = sorted(
            self.endpoints,
            key=lambda ep: self._endpoint_failures.get(ep, 0)
        )
        return sorted_endpoints[0]
    
    def _calculate_delay(self, attempt: int) -> float:
        """Calculate exponential backoff delay."""
        delay = self.base_delay * (2 ** attempt)
        return min(delay, self.max_delay)
    
    def query(
        self,
        query: str,
        cache_key: Optional[str] = None,
        cache_ttl: Optional[int] = None,
        skip_cache: bool = False
    ) -> Dict[str, Any]:
        """
        Execute an Overpass API query with caching and retry logic.
        
        Args:
            query: Overpass QL query string
            cache_key: Optional custom cache key (auto-generated from query if not provided)
            cache_ttl: Cache TTL in seconds (uses default if not provided)
            skip_cache: If True, skip cache lookup (but still cache result)
            
        Returns:
            Dict with 'success' boolean and either 'elements' list or 'error' string
        """
        # Generate cache key
        key = cache_key or self.cache._generate_key(query)
        
        # Check cache first (unless skipped)
        if not skip_cache:
            cached = self.cache.get(key)
            if cached is not None:
                logger.debug(f"[Overpass] Cache hit for key: {key[:8]}...")
                return {'success': True, 'elements': cached, 'cached': True}
        
        # Try each endpoint with retries
        last_error = None
        
        for endpoint_attempt in range(len(self.endpoints)):
            endpoint = self._get_next_endpoint()
            
            for retry in range(self.max_retries):
                try:
                    logger.debug(f"[Overpass] Querying {endpoint} (attempt {retry + 1}/{self.max_retries})")
                    
                    response = requests.post(
                        endpoint,
                        data={'data': query},
                        timeout=self.timeout,
                        headers={'User-Agent': 'Voyagr-PWA/1.0'}
                    )
                    
                    # Handle rate limiting
                    if response.status_code == 429:
                        delay = self._calculate_delay(retry)
                        logger.warning(f"[Overpass] Rate limited, waiting {delay:.1f}s...")
                        time.sleep(delay)
                        continue
                    
                    # Handle server errors (retry)
                    if response.status_code >= 500:
                        self._endpoint_failures[endpoint] = self._endpoint_failures.get(endpoint, 0) + 1
                        delay = self._calculate_delay(retry)
                        logger.warning(f"[Overpass] Server error {response.status_code}, retrying in {delay:.1f}s...")
                        time.sleep(delay)
                        continue
                    
                    # Handle client errors (don't retry)
                    if response.status_code >= 400:
                        error_msg = f"Client error: {response.status_code}"
                        logger.error(f"[Overpass] {error_msg}")
                        return {'success': False, 'error': error_msg}
                    
                    # Success!
                    data = response.json()
                    elements = data.get('elements', [])
                    
                    # Cache the result
                    self.cache.set(key, elements, cache_ttl)
                    
                    # Reset failure count for successful endpoint
                    self._endpoint_failures[endpoint] = 0
                    
                    logger.info(f"[Overpass] Query successful, got {len(elements)} elements")
                    return {'success': True, 'elements': elements, 'cached': False}
                    
                except requests.exceptions.Timeout:
                    self._endpoint_failures[endpoint] = self._endpoint_failures.get(endpoint, 0) + 1
                    last_error = "Request timed out"
                    delay = self._calculate_delay(retry)
                    logger.warning(f"[Overpass] Timeout on {endpoint}, retrying in {delay:.1f}s...")
                    time.sleep(delay)
                    
                except requests.exceptions.ConnectionError:
                    self._endpoint_failures[endpoint] = self._endpoint_failures.get(endpoint, 0) + 1
                    last_error = "Connection failed"
                    logger.warning(f"[Overpass] Connection error on {endpoint}")
                    break  # Try next endpoint immediately
                    
                except json.JSONDecodeError:
                    last_error = "Invalid JSON response"
                    logger.error(f"[Overpass] Invalid JSON from {endpoint}")
                    break  # Try next endpoint
                    
                except Exception as e:
                    last_error = str(e)
                    logger.error(f"[Overpass] Unexpected error: {e}")
                    break
            
            # Mark this endpoint as failed, try next
            self._endpoint_failures[endpoint] = self._endpoint_failures.get(endpoint, 0) + 10
        
        # All endpoints failed
        logger.error(f"[Overpass] All endpoints failed. Last error: {last_error}")
        return {'success': False, 'error': last_error or 'All Overpass endpoints unavailable'}
    
    def get_cache_stats(self) -> Dict[str, Any]:
        """Get cache statistics."""
        return self.cache.stats
    
    def clear_cache(self) -> int:
        """Clear the cache. Returns number of entries cleared."""
        return self.cache.clear()


# ============================================================================
# CONVENIENCE FUNCTIONS
# ============================================================================

# Global client instance
_default_client: Optional[OverpassClient] = None

def get_client() -> OverpassClient:
    """Get or create the default Overpass client."""
    global _default_client
    if _default_client is None:
        _default_client = OverpassClient()
    return _default_client

def query_overpass(
    query: str,
    cache_key: Optional[str] = None,
    cache_ttl: Optional[int] = None,
    skip_cache: bool = False
) -> Dict[str, Any]:
    """
    Convenience function to query Overpass API using the default client.
    
    Args:
        query: Overpass QL query string
        cache_key: Optional custom cache key
        cache_ttl: Cache TTL in seconds
        skip_cache: If True, skip cache lookup
        
    Returns:
        Dict with 'success' boolean and either 'elements' list or 'error' string
    """
    return get_client().query(query, cache_key, cache_ttl, skip_cache)

def get_overpass_cache_stats() -> Dict[str, Any]:
    """Get cache statistics for the default client."""
    return get_client().get_cache_stats()

def clear_overpass_cache() -> int:
    """Clear the Overpass cache. Returns number of entries cleared."""
    return get_client().clear_cache()


# ============================================================================
# PRESET QUERY BUILDERS
# ============================================================================

def build_traffic_signals_query(
    min_lat: float,
    min_lng: float,
    max_lat: float,
    max_lng: float
) -> str:
    """Build a query for traffic signals in a bounding box."""
    return f'''
    [out:json][timeout:15];
    (
        node["highway"="traffic_signals"]({min_lat},{min_lng},{max_lat},{max_lng});
        node["crossing"="traffic_signals"]({min_lat},{min_lng},{max_lat},{max_lng});
    );
    out body;
    '''

def build_corridor_traffic_signals_query(
    points: List[Tuple[float, float]],
    radius: int = 100
) -> str:
    """
    Build a query for traffic signals along a corridor (polyline).
    Uses the 'around' filter to find nodes within radius of the path.
    
    Args:
        points: List of (lat, lon) tuples defining the path
        radius: Search radius in meters around the path points
    """
    # Format points for the query: "lat1,lon1,lat2,lon2..."
    # Limit precision to 5 decimal places to save space
    flat_points = []
    for point in points:
        # Handle both [lon, lat] (GeoJSON) and (lat, lon) formats
        if isinstance(point, (list, tuple)) and len(point) >= 2:
            # Assume input is [lon, lat] from GeoJSON by default, but check context
            # The calling function passes [c[1], c[0]] which is [lat, lon]
            lat, lon = point[0], point[1]
            flat_points.append(f"{lat:.5f},{lon:.5f}")
    
    poly_str = ",".join(flat_points)
    
    return f'''
    [out:json][timeout:30];
    (
        node["highway"="traffic_signals"](around:{radius},{poly_str});
        node["crossing"="traffic_signals"](around:{radius},{poly_str});
    );
    out body;
    '''

def build_poi_query(
    lat: float,
    lon: float,
    radius: int,
    amenities: List[str]
) -> str:
    """Build a query for POIs around a point."""
    amenity_queries = ''.join([
        f'node["amenity"="{a}"](around:{radius},{lat},{lon});' for a in amenities
    ])
    return f'''
    [out:json][timeout:10];
    (
        {amenity_queries}
    );
    out body;
    '''

def build_speed_cameras_query(
    min_lat: float,
    min_lng: float,
    max_lat: float,
    max_lng: float
) -> str:
    """Build a query for speed cameras in a bounding box."""
    return f'''
    [out:json][timeout:10];
    (
        node["highway"="speed_camera"]({min_lat},{min_lng},{max_lat},{max_lng});
        node["man_made"="surveillance"]["surveillance:type"="camera"]({min_lat},{min_lng},{max_lat},{max_lng});
    );
    out body;
    '''

def build_toll_roads_query(
    min_lat: float,
    min_lng: float,
    max_lat: float,
    max_lng: float
) -> str:
    """Build a query for toll roads in a bounding box."""
    return f'''
    [out:json][timeout:10];
    (
        node["barrier"="toll_booth"]({min_lat},{min_lng},{max_lat},{max_lng});
        way["toll"="yes"]({min_lat},{min_lng},{max_lat},{max_lng});
    );
    out body;
    >;
    out skel qt;
    '''

def build_lanes_query(lat: float, lon: float, radius: int = 50) -> str:
    """Build a query for lane information near a point."""
    return f'''
    [out:json][timeout:5];
    way(around:{radius},{lat},{lon})["lanes"];
    out body;
    '''

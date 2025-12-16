"""
Edge cache for frequently accessed edges
Uses LRU cache to avoid repeated database queries
"""
from functools import lru_cache
from typing import List, Tuple

class EdgeCache:
    """LRU cache for edge lookups."""
    
    def __init__(self, max_size: int = 10000):
        """Initialize edge cache.
        
        Args:
            max_size: Maximum number of cached edges (default 10k)
        """
        self.max_size = max_size
        self.cache = {}
        self.hits = 0
        self.misses = 0
    
    def get(self, node_id: int) -> List[Tuple]:
        """Get cached edges for a node."""
        if node_id in self.cache:
            self.hits += 1
            return self.cache[node_id]
        self.misses += 1
        return None
    
    def set(self, node_id: int, edges: List[Tuple]):
        """Cache edges for a node."""
        if len(self.cache) >= self.max_size:
            # Remove oldest entry (simple FIFO, not true LRU)
            oldest_key = next(iter(self.cache))
            del self.cache[oldest_key]
        
        self.cache[node_id] = edges
    
    def clear(self):
        """Clear cache."""
        self.cache.clear()
        self.hits = 0
        self.misses = 0
    
    def get_stats(self) -> dict:
        """Get cache statistics."""
        total = self.hits + self.misses
        hit_rate = (self.hits / total * 100) if total > 0 else 0
        return {
            'size': len(self.cache),
            'max_size': self.max_size,
            'hits': self.hits,
            'misses': self.misses,
            'hit_rate': hit_rate
        }

class RouteCache:
    """Cache for complete routes to avoid recalculation."""
    
    def __init__(self, max_size: int = 1000):
        """Initialize route cache.
        
        Args:
            max_size: Maximum number of cached routes (default 1000)
        """
        self.max_size = max_size
        self.cache = {}
        self.hits = 0
        self.misses = 0
    
    def get_key(self, start_lat: float, start_lon: float,
                end_lat: float, end_lon: float) -> str:
        """Generate cache key for route."""
        # Round to 4 decimal places (~11m precision)
        return f"{start_lat:.4f},{start_lon:.4f},{end_lat:.4f},{end_lon:.4f}"
    
    def get(self, start_lat: float, start_lon: float,
            end_lat: float, end_lon: float) -> dict:
        """Get cached route."""
        key = self.get_key(start_lat, start_lon, end_lat, end_lon)
        if key in self.cache:
            self.hits += 1
            return self.cache[key]
        self.misses += 1
        return None
    
    def set(self, start_lat: float, start_lon: float,
            end_lat: float, end_lon: float, route: dict):
        """Cache a route."""
        if len(self.cache) >= self.max_size:
            # Remove oldest entry
            oldest_key = next(iter(self.cache))
            del self.cache[oldest_key]
        
        key = self.get_key(start_lat, start_lon, end_lat, end_lon)
        self.cache[key] = route
    
    def clear(self):
        """Clear cache."""
        self.cache.clear()
        self.hits = 0
        self.misses = 0
    
    def get_stats(self) -> dict:
        """Get cache statistics."""
        total = self.hits + self.misses
        hit_rate = (self.hits / total * 100) if total > 0 else 0
        return {
            'size': len(self.cache),
            'max_size': self.max_size,
            'hits': self.hits,
            'misses': self.misses,
            'hit_rate': hit_rate
        }


"""
Route caching for performance optimization
"""

from typing import Dict, Optional, Tuple
from collections import OrderedDict
import time

class RouteCache:
    """Cache for frequently requested routes."""
    
    def __init__(self, max_size: int = 10000, ttl_seconds: int = 3600):
        """Initialize route cache."""
        self.cache = OrderedDict()
        self.max_size = max_size
        self.ttl_seconds = ttl_seconds
    
    def get_key(self, start: Tuple[float, float], end: Tuple[float, float]) -> str:
        """Generate cache key from coordinates."""
        return f"{start[0]:.4f},{start[1]:.4f}_{end[0]:.4f},{end[1]:.4f}"
    
    def get(self, start: Tuple[float, float], end: Tuple[float, float]) -> Optional[Dict]:
        """Get cached route."""
        key = self.get_key(start, end)
        
        if key not in self.cache:
            return None
        
        route, timestamp = self.cache[key]
        
        # Check if expired
        if time.time() - timestamp > self.ttl_seconds:
            del self.cache[key]
            return None
        
        # Move to end (LRU)
        self.cache.move_to_end(key)
        return route
    
    def set(self, start: Tuple[float, float], end: Tuple[float, float], route: Dict):
        """Cache route."""
        key = self.get_key(start, end)
        
        # Remove oldest if at capacity
        if len(self.cache) >= self.max_size:
            self.cache.popitem(last=False)
        
        self.cache[key] = (route, time.time())
    
    def clear(self):
        """Clear cache."""
        self.cache.clear()
    
    def get_stats(self) -> Dict:
        """Get cache statistics."""
        return {
            'size': len(self.cache),
            'max_size': self.max_size,
            'ttl_seconds': self.ttl_seconds
        }


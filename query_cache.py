#!/usr/bin/env python3
"""
Query Cache Module - Backend query result caching
Caches database query results to reduce database load
"""

import hashlib
import json
import time
from functools import wraps
from typing import Any, Callable, Dict, Optional


class QueryCache:
    """Query result caching for database queries"""

    def __init__(self, ttl: int = 300, max_size: int = 1000):
        """
        Initialize QueryCache
        
        Args:
            ttl: Time to live in seconds (default: 300 = 5 minutes)
            max_size: Maximum cache entries (default: 1000)
        """
        self.ttl = ttl
        self.max_size = max_size
        self.cache: Dict[str, Dict[str, Any]] = {}
        self.stats = {
            'hits': 0,
            'misses': 0,
            'evictions': 0
        }

    def _generate_key(self, query: str, params: tuple = None) -> str:
        """Generate cache key from query and parameters"""
        key_data = f"{query}:{json.dumps(params or [])}"
        return hashlib.md5(key_data.encode()).hexdigest()

    def get(self, query: str, params: tuple = None) -> Optional[Any]:
        """
        Get cached query result
        
        Args:
            query: SQL query
            params: Query parameters
            
        Returns:
            Cached result or None
        """
        key = self._generate_key(query, params)
        
        if key not in self.cache:
            self.stats['misses'] += 1
            return None

        entry = self.cache[key]
        
        # Check TTL
        if time.time() - entry['timestamp'] > self.ttl:
            del self.cache[key]
            self.stats['misses'] += 1
            return None

        self.stats['hits'] += 1
        return entry['result']

    def set(self, query: str, result: Any, params: tuple = None) -> None:
        """
        Cache query result
        
        Args:
            query: SQL query
            result: Query result
            params: Query parameters
        """
        key = self._generate_key(query, params)
        
        # Evict oldest entry if cache is full
        if len(self.cache) >= self.max_size:
            oldest_key = min(
                self.cache.keys(),
                key=lambda k: self.cache[k]['timestamp']
            )
            del self.cache[oldest_key]
            self.stats['evictions'] += 1

        self.cache[key] = {
            'result': result,
            'timestamp': time.time()
        }

    def invalidate(self, pattern: str = None) -> None:
        """
        Invalidate cache entries
        
        Args:
            pattern: Query pattern to invalidate (optional)
        """
        if pattern is None:
            self.cache.clear()
            return

        keys_to_delete = [
            key for key in self.cache.keys()
            if pattern in key
        ]
        
        for key in keys_to_delete:
            del self.cache[key]

    def get_stats(self) -> Dict[str, Any]:
        """Get cache statistics"""
        total = self.stats['hits'] + self.stats['misses']
        hit_rate = (self.stats['hits'] / total * 100) if total > 0 else 0

        return {
            'hits': self.stats['hits'],
            'misses': self.stats['misses'],
            'evictions': self.stats['evictions'],
            'hit_rate': f"{hit_rate:.1f}%",
            'size': len(self.cache),
            'max_size': self.max_size
        }

    def clear(self) -> None:
        """Clear all cache"""
        self.cache.clear()
        self.stats = {'hits': 0, 'misses': 0, 'evictions': 0}


# Global query cache instance
_query_cache = QueryCache()


def cached_query(ttl: int = 300):
    """
    Decorator for caching query results
    
    Usage:
        @cached_query(ttl=600)
        def get_user(user_id):
            return db.query(User).filter_by(id=user_id).first()
    """
    def decorator(func: Callable) -> Callable:
        @wraps(func)
        def wrapper(*args, **kwargs):
            # Generate cache key from function name and arguments
            key_data = f"{func.__name__}:{json.dumps([args, kwargs])}"
            key = hashlib.md5(key_data.encode()).hexdigest()
            
            # Check cache
            if key in _query_cache.cache:
                entry = _query_cache.cache[key]
                if time.time() - entry['timestamp'] <= ttl:
                    _query_cache.stats['hits'] += 1
                    return entry['result']
            
            # Execute function
            result = func(*args, **kwargs)
            
            # Cache result
            _query_cache.cache[key] = {
                'result': result,
                'timestamp': time.time()
            }
            _query_cache.stats['misses'] += 1
            
            return result
        
        return wrapper
    
    return decorator


def get_query_cache() -> QueryCache:
    """Get global query cache instance"""
    return _query_cache


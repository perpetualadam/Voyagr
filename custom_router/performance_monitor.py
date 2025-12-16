"""
Performance monitoring for custom router
Tracks metrics for production monitoring
"""
import time
from typing import Dict, List
from collections import deque

class PerformanceMonitor:
    """Monitor router performance metrics."""
    
    def __init__(self, window_size: int = 100):
        """Initialize performance monitor.
        
        Args:
            window_size: Number of recent requests to track (default 100)
        """
        self.window_size = window_size
        self.request_times = deque(maxlen=window_size)
        self.cache_hits = 0
        self.cache_misses = 0
        self.errors = 0
        self.total_requests = 0
        self.start_time = time.time()
    
    def record_request(self, duration_ms: float, cached: bool = False, error: bool = False):
        """Record a route request.
        
        Args:
            duration_ms: Request duration in milliseconds
            cached: Whether result was from cache
            error: Whether request resulted in error
        """
        self.request_times.append(duration_ms)
        self.total_requests += 1
        
        if cached:
            self.cache_hits += 1
        else:
            self.cache_misses += 1
        
        if error:
            self.errors += 1
    
    def get_stats(self) -> Dict:
        """Get performance statistics."""
        if not self.request_times:
            return {
                'total_requests': 0,
                'avg_time_ms': 0,
                'min_time_ms': 0,
                'max_time_ms': 0,
                'cache_hit_rate': 0,
                'error_rate': 0,
                'uptime_s': time.time() - self.start_time
            }
        
        times = list(self.request_times)
        total_cache = self.cache_hits + self.cache_misses
        cache_hit_rate = (self.cache_hits / total_cache * 100) if total_cache > 0 else 0
        error_rate = (self.errors / self.total_requests * 100) if self.total_requests > 0 else 0
        
        return {
            'total_requests': self.total_requests,
            'recent_requests': len(times),
            'avg_time_ms': sum(times) / len(times),
            'min_time_ms': min(times),
            'max_time_ms': max(times),
            'p95_time_ms': sorted(times)[int(len(times) * 0.95)] if len(times) > 1 else times[0],
            'p99_time_ms': sorted(times)[int(len(times) * 0.99)] if len(times) > 1 else times[0],
            'cache_hits': self.cache_hits,
            'cache_misses': self.cache_misses,
            'cache_hit_rate': cache_hit_rate,
            'errors': self.errors,
            'error_rate': error_rate,
            'uptime_s': time.time() - self.start_time
        }
    
    def reset(self):
        """Reset statistics."""
        self.request_times.clear()
        self.cache_hits = 0
        self.cache_misses = 0
        self.errors = 0
        self.total_requests = 0
        self.start_time = time.time()

# Global monitor instance
_monitor = None

def get_performance_monitor() -> PerformanceMonitor:
    """Get or create performance monitor."""
    global _monitor
    if _monitor is None:
        _monitor = PerformanceMonitor()
    return _monitor


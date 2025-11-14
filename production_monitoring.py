#!/usr/bin/env python3
"""
Production Monitoring Module for Voyagr PWA
Comprehensive logging, metrics tracking, and performance monitoring
"""

import logging
import time
import threading
from datetime import datetime, timedelta
from collections import defaultdict, deque
import json
import os

class ProductionMonitor:
    """Comprehensive production monitoring for Voyagr PWA."""
    
    def __init__(self, log_file='voyagr_production.log'):
        self.log_file = log_file
        self.setup_logging()
        
        # Metrics storage
        self.request_count = 0
        self.error_count = 0
        self.cache_hits = 0
        self.cache_misses = 0
        self.start_time = datetime.now()
        
        # Response time tracking (last 1000 requests)
        self.response_times = deque(maxlen=1000)
        
        # Engine performance tracking
        self.engine_stats = {
            'graphhopper': {'success': 0, 'failure': 0, 'total_time': 0, 'response_times': deque(maxlen=100)},
            'valhalla': {'success': 0, 'failure': 0, 'total_time': 0, 'response_times': deque(maxlen=100)},
            'osrm': {'success': 0, 'failure': 0, 'total_time': 0, 'response_times': deque(maxlen=100)}
        }
        
        # Database query performance
        self.db_queries = deque(maxlen=500)
        
        # Error tracking
        self.errors_by_type = defaultdict(int)
        self.recent_errors = deque(maxlen=100)
        
        # Lock for thread safety
        self.lock = threading.Lock()
    
    def setup_logging(self):
        """Configure logging to file and console."""
        self.logger = logging.getLogger('voyagr_production')
        self.logger.setLevel(logging.DEBUG)
        
        # File handler
        fh = logging.FileHandler(self.log_file)
        fh.setLevel(logging.DEBUG)
        
        # Console handler
        ch = logging.StreamHandler()
        ch.setLevel(logging.INFO)
        
        # Formatter
        formatter = logging.Formatter(
            '%(asctime)s - %(name)s - %(levelname)s - %(message)s',
            datefmt='%Y-%m-%d %H:%M:%S'
        )
        fh.setFormatter(formatter)
        ch.setFormatter(formatter)
        
        self.logger.addHandler(fh)
        self.logger.addHandler(ch)
    
    def log_request(self, endpoint, method, status_code, response_time):
        """Log API request."""
        with self.lock:
            self.request_count += 1
            self.response_times.append(response_time)
            
            if status_code >= 400:
                self.error_count += 1
            
            self.logger.info(
                f"API Request: {method} {endpoint} - Status: {status_code} - Time: {response_time:.2f}ms"
            )
    
    def log_cache_hit(self):
        """Log cache hit."""
        with self.lock:
            self.cache_hits += 1
    
    def log_cache_miss(self):
        """Log cache miss."""
        with self.lock:
            self.cache_misses += 1
    
    def log_engine_request(self, engine, success, response_time):
        """Log routing engine request."""
        with self.lock:
            if engine in self.engine_stats:
                stats = self.engine_stats[engine]
                if success:
                    stats['success'] += 1
                else:
                    stats['failure'] += 1
                stats['total_time'] += response_time
                stats['response_times'].append(response_time)
                
                self.logger.info(
                    f"Engine: {engine} - Success: {success} - Time: {response_time:.2f}ms"
                )
    
    def log_db_query(self, query, execution_time):
        """Log database query performance."""
        with self.lock:
            self.db_queries.append({
                'query': query[:100],  # First 100 chars
                'time': execution_time,
                'timestamp': datetime.now().isoformat()
            })
            
            if execution_time > 1000:  # Log slow queries (>1s)
                self.logger.warning(
                    f"Slow DB Query: {query[:50]}... - Time: {execution_time:.2f}ms"
                )
    
    def log_error(self, error_type, error_message):
        """Log error."""
        with self.lock:
            self.errors_by_type[error_type] += 1
            self.recent_errors.append({
                'type': error_type,
                'message': error_message,
                'timestamp': datetime.now().isoformat()
            })
            
            self.logger.error(f"Error [{error_type}]: {error_message}")
    
    def get_metrics(self):
        """Get current metrics."""
        with self.lock:
            uptime = datetime.now() - self.start_time
            uptime_seconds = uptime.total_seconds()
            
            avg_response_time = (
                sum(self.response_times) / len(self.response_times)
                if self.response_times else 0
            )
            
            cache_hit_rate = (
                (self.cache_hits / (self.cache_hits + self.cache_misses) * 100)
                if (self.cache_hits + self.cache_misses) > 0 else 0
            )
            
            error_rate = (
                (self.error_count / self.request_count * 100)
                if self.request_count > 0 else 0
            )
            
            # Engine stats
            engine_stats = {}
            for engine, stats in self.engine_stats.items():
                total_requests = stats['success'] + stats['failure']
                success_rate = (
                    (stats['success'] / total_requests * 100)
                    if total_requests > 0 else 0
                )
                avg_time = (
                    stats['total_time'] / total_requests
                    if total_requests > 0 else 0
                )
                
                engine_stats[engine] = {
                    'total_requests': total_requests,
                    'success': stats['success'],
                    'failure': stats['failure'],
                    'success_rate': round(success_rate, 2),
                    'avg_response_time': round(avg_time, 2),
                    'recent_times': list(stats['response_times'])[-10:]
                }
            
            return {
                'timestamp': datetime.now().isoformat(),
                'uptime_seconds': uptime_seconds,
                'uptime_formatted': str(uptime).split('.')[0],
                'total_requests': self.request_count,
                'total_errors': self.error_count,
                'error_rate': round(error_rate, 2),
                'avg_response_time': round(avg_response_time, 2),
                'cache_hits': self.cache_hits,
                'cache_misses': self.cache_misses,
                'cache_hit_rate': round(cache_hit_rate, 2),
                'engine_stats': engine_stats,
                'errors_by_type': dict(self.errors_by_type),
                'recent_errors': list(self.recent_errors)[-10:]
            }
    
    def get_health_status(self):
        """Get health status for monitoring services."""
        metrics = self.get_metrics()
        
        # Determine health status
        status = 'healthy'
        issues = []
        
        if metrics['error_rate'] > 5:
            status = 'degraded'
            issues.append(f"High error rate: {metrics['error_rate']}%")
        
        if metrics['avg_response_time'] > 5000:
            status = 'degraded'
            issues.append(f"High response time: {metrics['avg_response_time']}ms")
        
        if metrics['cache_hit_rate'] < 50:
            issues.append(f"Low cache hit rate: {metrics['cache_hit_rate']}%")
        
        # Check engine health
        for engine, stats in metrics['engine_stats'].items():
            if stats['success_rate'] < 50:
                status = 'unhealthy'
                issues.append(f"{engine} success rate: {stats['success_rate']}%")
        
        return {
            'status': status,
            'timestamp': datetime.now().isoformat(),
            'issues': issues,
            'metrics': metrics
        }

# Global monitor instance
_monitor = None

def get_production_monitor():
    """Get or create global monitor instance."""
    global _monitor
    if _monitor is None:
        _monitor = ProductionMonitor()
    return _monitor


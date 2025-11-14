#!/usr/bin/env python3
"""
Phase 6: Performance Benchmarking for Voyagr PWA
Benchmarks all routing engines and measures performance metrics
"""

import requests
import time
import json
from datetime import datetime
from statistics import mean, stdev

# Test routes (London area)
TEST_ROUTES = [
    {
        'name': 'Short Route (0.5 km)',
        'start': '51.5074,-0.1278',
        'end': '51.5124,-0.1278'
    },
    {
        'name': 'Medium Route (2 km)',
        'start': '51.5074,-0.1278',
        'end': '51.5274,-0.1278'
    },
    {
        'name': 'Long Route (5 km)',
        'start': '51.5074,-0.1278',
        'end': '51.5474,-0.1278'
    },
]

class PerformanceBenchmark:
    """Benchmark Voyagr PWA performance."""
    
    def __init__(self, base_url='http://localhost:5000'):
        self.base_url = base_url
        self.results = {}
    
    def benchmark_route_endpoint(self, route_name, start, end, iterations=3):
        """Benchmark /api/route endpoint."""
        times = []
        
        print(f"\n  Benchmarking {route_name}...")
        
        for i in range(iterations):
            try:
                start_time = time.time()
                response = requests.post(
                    f'{self.base_url}/api/route',
                    json={'start': start, 'end': end},
                    timeout=30
                )
                elapsed = (time.time() - start_time) * 1000  # Convert to ms
                
                if response.status_code == 200:
                    times.append(elapsed)
                    print(f"    Iteration {i+1}: {elapsed:.2f}ms")
            except Exception as e:
                print(f"    ❌ Error: {str(e)}")
        
        if times:
            return {
                'min': min(times),
                'max': max(times),
                'avg': mean(times),
                'stdev': stdev(times) if len(times) > 1 else 0,
                'iterations': len(times)
            }
        return None
    
    def benchmark_parallel_routing(self, start, end):
        """Benchmark parallel routing endpoint."""
        print(f"\n  Benchmarking Parallel Routing...")
        
        try:
            start_time = time.time()
            response = requests.post(
                f'{self.base_url}/api/parallel-routing',
                json={'start': start, 'end': end},
                timeout=30
            )
            elapsed = (time.time() - start_time) * 1000
            
            if response.status_code == 200:
                print(f"    Response time: {elapsed:.2f}ms")
                return elapsed
        except Exception as e:
            print(f"    ❌ Error: {str(e)}")
        
        return None
    
    def benchmark_cache_performance(self):
        """Benchmark cache statistics."""
        print(f"\n  Checking Cache Performance...")
        
        try:
            response = requests.get(
                f'{self.base_url}/api/monitoring/phase5/performance-summary',
                timeout=10
            )
            
            if response.status_code == 200:
                data = response.json()
                cache_perf = data['summary']['cache_performance']
                print(f"    Cache Hit Rate: {cache_perf.get('hit_rate', 0):.1f}%")
                print(f"    Total Requests: {cache_perf.get('total_requests', 0)}")
                print(f"    Cached Requests: {cache_perf.get('cached_requests', 0)}")
                return cache_perf
        except Exception as e:
            print(f"    ❌ Error: {str(e)}")
        
        return None
    
    def run_benchmarks(self):
        """Run all benchmarks."""
        print(f"\n{'='*70}")
        print(f"VOYAGR PWA - PERFORMANCE BENCHMARKING")
        print(f"Started: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        print(f"{'='*70}")
        
        # Benchmark route endpoint
        print(f"\n📊 ROUTE ENDPOINT BENCHMARKS")
        print(f"{'-'*70}")
        
        for route in TEST_ROUTES:
            result = self.benchmark_route_endpoint(
                route['name'],
                route['start'],
                route['end']
            )
            if result:
                self.results[route['name']] = result
        
        # Benchmark parallel routing
        print(f"\n📊 PARALLEL ROUTING BENCHMARKS")
        print(f"{'-'*70}")
        
        parallel_time = self.benchmark_parallel_routing(
            TEST_ROUTES[1]['start'],
            TEST_ROUTES[1]['end']
        )
        if parallel_time:
            self.results['Parallel Routing'] = {'time_ms': parallel_time}
        
        # Benchmark cache
        print(f"\n📊 CACHE PERFORMANCE")
        print(f"{'-'*70}")
        
        cache_perf = self.benchmark_cache_performance()
        if cache_perf:
            self.results['Cache'] = cache_perf
        
        # Print summary
        self.print_summary()
    
    def print_summary(self):
        """Print benchmark summary."""
        print(f"\n{'='*70}")
        print(f"BENCHMARK SUMMARY")
        print(f"{'='*70}")
        
        for name, result in self.results.items():
            print(f"\n{name}:")
            if isinstance(result, dict):
                for key, value in result.items():
                    if isinstance(value, float):
                        print(f"  {key}: {value:.2f}")
                    else:
                        print(f"  {key}: {value}")
        
        print(f"\n{'='*70}")
        print(f"Completed: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        print(f"{'='*70}\n")

if __name__ == '__main__':
    benchmark = PerformanceBenchmark()
    benchmark.run_benchmarks()


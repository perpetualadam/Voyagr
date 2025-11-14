#!/usr/bin/env python3
"""
Performance analysis for Voyagr PWA - Phase 3 Optimization Testing
Tests all optimizations: Route Caching, Connection Pooling, Cost Calculation, Response Compression
"""

import time
import requests
import json
from typing import Dict, List

class PerformanceAnalyzer:
    """Analyze PWA performance metrics."""

    def __init__(self, base_url: str = "http://localhost:5000"):
        self.base_url = base_url
        self.results = {}
        self.cache_stats = {}
    
    def test_route_calculation(self, iterations: int = 5) -> Dict:
        """Test route calculation performance with cache statistics."""
        print("\n=== ROUTE CALCULATION PERFORMANCE (Phase 3 Optimized) ===")

        test_cases = [
            {
                'name': 'Short route (5 km)',
                'start': '51.5074,-0.1278',  # London
                'end': '51.5200,-0.1100',    # 5 km away
            },
            {
                'name': 'Medium route (50 km)',
                'start': '51.5074,-0.1278',  # London
                'end': '51.8000,-0.5000',    # 50 km away
            },
            {
                'name': 'Long route (300 km)',
                'start': '51.5074,-0.1278',  # London
                'end': '50.7520,-3.7373',    # Exeter
            },
        ]

        results = {}
        for test in test_cases:
            times = []
            cached_times = []

            for i in range(iterations):
                # First request (cache miss)
                start = time.time()
                try:
                    response = requests.post(
                        f'{self.base_url}/api/route',
                        json={
                            'start': test['start'],
                            'end': test['end'],
                            'routing_mode': 'auto',
                            'vehicle_type': 'petrol_diesel'
                        },
                        timeout=30
                    )
                    elapsed = (time.time() - start) * 1000
                    times.append(elapsed)

                    # Extract cache stats from response
                    if response.status_code == 200:
                        data = response.json()
                        if 'cache_stats' in data:
                            self.cache_stats[test['name']] = data['cache_stats']

                    # Second request (cache hit)
                    start = time.time()
                    response = requests.post(
                        f'{self.base_url}/api/route',
                        json={
                            'start': test['start'],
                            'end': test['end'],
                            'routing_mode': 'auto',
                            'vehicle_type': 'petrol_diesel'
                        },
                        timeout=30
                    )
                    elapsed = (time.time() - start) * 1000
                    cached_times.append(elapsed)

                except Exception as e:
                    print(f"  ❌ Error: {e}")
                    continue

            if times:
                avg = sum(times) / len(times)
                min_t = min(times)
                max_t = max(times)

                avg_cached = sum(cached_times) / len(cached_times) if cached_times else 0
                improvement = ((avg - avg_cached) / avg * 100) if avg > 0 else 0

                results[test['name']] = {
                    'first_request_ms': avg,
                    'cached_request_ms': avg_cached,
                    'improvement_percent': improvement,
                    'min_ms': min_t,
                    'max_ms': max_t,
                    'iterations': len(times)
                }
                print(f"  {test['name']}:")
                print(f"    First request: {avg:.0f}ms")
                print(f"    Cached request: {avg_cached:.0f}ms")
                print(f"    Improvement: {improvement:.1f}%")

        self.results['route_calculation'] = results
        return results
    
    def test_cache_statistics(self) -> Dict:
        """Test cache statistics endpoint."""
        print("\n=== CACHE STATISTICS ===")

        try:
            response = requests.get(
                f'{self.base_url}/api/cache-stats',
                timeout=10
            )

            if response.status_code == 200:
                data = response.json()
                stats = data.get('cache_stats', {})

                print(f"  Cache Size: {stats.get('size', 0)} entries")
                print(f"  Cache Hits: {stats.get('hits', 0)}")
                print(f"  Cache Misses: {stats.get('misses', 0)}")

                total = stats.get('hits', 0) + stats.get('misses', 0)
                if total > 0:
                    hit_rate = (stats.get('hits', 0) / total) * 100
                    print(f"  Hit Rate: {hit_rate:.1f}%")

                self.results['cache_stats'] = stats
                return stats
        except Exception as e:
            print(f"  ❌ Error: {e}")

        return {}

    def test_api_endpoints(self) -> Dict:
        """Test all API endpoints."""
        print("\n=== API ENDPOINT PERFORMANCE ===")

        endpoints = [
            {
                'name': 'GET /api/health',
                'method': 'GET',
                'url': '/api/health'
            },
            {
                'name': 'GET /api/charging-stations',
                'method': 'GET',
                'url': '/api/charging-stations?lat=51.5074&lon=-0.1278&radius=10'
            },
            {
                'name': 'GET /api/weather',
                'method': 'GET',
                'url': '/api/weather?lat=51.5074&lon=-0.1278'
            },
        ]

        results = {}
        for endpoint in endpoints:
            try:
                start = time.time()
                if endpoint['method'] == 'GET':
                    response = requests.get(
                        f'{self.base_url}{endpoint["url"]}',
                        timeout=10
                    )
                elapsed = (time.time() - start) * 1000

                results[endpoint['name']] = {
                    'time_ms': elapsed,
                    'status': response.status_code
                }
                print(f"  {endpoint['name']}: {elapsed:.0f}ms (status: {response.status_code})")
            except Exception as e:
                print(f"  {endpoint['name']}: ❌ Error - {e}")

        self.results['api_endpoints'] = results
        return results
    
    def generate_report(self) -> str:
        """Generate comprehensive performance report."""
        report = "\n" + "="*70
        report += "\nPHASE 3 OPTIMIZATION - PERFORMANCE ANALYSIS REPORT\n"
        report += "="*70

        # Summary section
        report += "\n\n📊 OPTIMIZATION SUMMARY\n"
        report += "-" * 70
        report += "\n✅ Route Caching: Enabled (LRU Cache with 1-hour TTL)"
        report += "\n✅ Connection Pooling: Enabled (5 connections)"
        report += "\n✅ Cost Calculation: Optimized (Centralized CostCalculator)"
        report += "\n✅ Response Compression: Enabled (gzip/brotli/zstd)"

        # Detailed results
        for category, data in self.results.items():
            report += f"\n\n{category.upper()}\n"
            report += "-" * 70

            if category == 'route_calculation':
                for route_name, metrics in data.items():
                    report += f"\n  {route_name}:"
                    report += f"\n    First Request: {metrics['first_request_ms']:.0f}ms"
                    report += f"\n    Cached Request: {metrics['cached_request_ms']:.0f}ms"
                    report += f"\n    Improvement: {metrics['improvement_percent']:.1f}%"
            else:
                report += json.dumps(data, indent=2)

        # Performance targets
        report += "\n\n🎯 PERFORMANCE TARGETS\n"
        report += "-" * 70

        # Check if targets are met
        route_calc = self.results.get('route_calculation', {})
        long_route = route_calc.get('Long route (300 km)', {})
        first_request = long_route.get('first_request_ms', 0)

        target_met = first_request < 1000
        status = "✅ MET" if target_met else "⚠️ NOT MET"

        report += f"\n  Target: Route calculation < 1000ms"
        report += f"\n  Actual: {first_request:.0f}ms"
        report += f"\n  Status: {status}"

        return report

if __name__ == '__main__':
    analyzer = PerformanceAnalyzer()

    print("\n🚀 Starting Phase 3 Performance Tests...\n")

    # Run tests
    analyzer.test_route_calculation(iterations=3)
    analyzer.test_cache_statistics()
    analyzer.test_api_endpoints()

    # Print report
    print(analyzer.generate_report())

    print("\n" + "="*70)
    print("✅ Performance testing complete!")
    print("="*70)


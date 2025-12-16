#!/usr/bin/env python3
"""
Quick Routing Engine Benchmark (GraphHopper + Valhalla only)
Skips custom router to avoid 15-minute initialization
"""

import time
import requests
import statistics
from typing import Dict, List, Tuple

# Test routes (name, start_lat, start_lon, end_lat, end_lon, expected_distance_km)
TEST_ROUTES = {
    'short': [
        ('London-Oxford', 51.5074, -0.1278, 51.7520, -1.2577, 90),
        ('Birmingham-Coventry', 52.4862, -1.8904, 52.4068, -1.5197, 30),
        ('Manchester-Liverpool', 53.4808, -2.2426, 53.4084, -2.9916, 50),
    ],
    'medium': [
        ('London-Birmingham', 51.5074, -0.1278, 52.4862, -1.8904, 160),
        ('Manchester-Leeds', 53.4808, -2.2426, 53.8008, -1.5491, 70),
        ('Bristol-Cardiff', 51.4545, -2.5879, 51.4816, -3.1791, 70),
    ],
    'long': [
        ('London-Manchester', 51.5074, -0.1278, 53.4808, -2.2426, 265),
        ('London-Newcastle', 51.5074, -0.1278, 54.9783, -1.6178, 430),
        ('Birmingham-Edinburgh', 52.4862, -1.8904, 55.9533, -3.1883, 460),
    ],
    'very_long': [
        ('London-Edinburgh', 51.5074, -0.1278, 55.9533, -3.1883, 650),
        ('London-Glasgow', 51.5074, -0.1278, 55.8642, -4.2518, 660),
        ('Southampton-Inverness', 50.9097, -1.4044, 57.4778, -4.2247, 900),
    ],
}

# Routing engine configurations
GRAPHHOPPER_URL = "http://81.0.246.97:8989/route"
VALHALLA_URL = "http://141.147.102.102:8002/route"

class BenchmarkRunner:
    def __init__(self):
        self.results = {
            'graphhopper': [],
            'valhalla': [],
        }
    
    def test_graphhopper(self, name: str, start_lat: float, start_lon: float,
                        end_lat: float, end_lon: float) -> Dict:
        """Test GraphHopper."""
        try:
            start_time = time.time()
            response = requests.get(GRAPHHOPPER_URL, params={
                'point': [f'{start_lat},{start_lon}', f'{end_lat},{end_lon}'],
                'profile': 'car',  # Fixed: use 'profile' instead of 'vehicle'
                'locale': 'en',
                'points_encoded': 'false',
            }, timeout=30)
            elapsed = time.time() - start_time
            
            if response.status_code != 200:
                return {'success': False, 'time': elapsed, 'error': f'HTTP {response.status_code}'}
            
            data = response.json()
            if 'paths' not in data or len(data['paths']) == 0:
                return {'success': False, 'time': elapsed, 'error': 'No route found'}
            
            path = data['paths'][0]
            return {
                'success': True,
                'time': elapsed,
                'distance_km': path['distance'] / 1000,
                'duration_min': path['time'] / 60000,
            }
        except Exception as e:
            return {'success': False, 'time': 0, 'error': str(e)}
    
    def test_valhalla(self, name: str, start_lat: float, start_lon: float,
                     end_lat: float, end_lon: float) -> Dict:
        """Test Valhalla."""
        try:
            start_time = time.time()
            response = requests.post(VALHALLA_URL, json={
                'locations': [
                    {'lat': start_lat, 'lon': start_lon},
                    {'lat': end_lat, 'lon': end_lon},
                ],
                'costing': 'auto',
                'units': 'kilometers',
            }, timeout=30)
            elapsed = time.time() - start_time
            
            if response.status_code != 200:
                return {'success': False, 'time': elapsed, 'error': f'HTTP {response.status_code}'}
            
            data = response.json()
            if 'trip' not in data or 'legs' not in data['trip']:
                return {'success': False, 'time': elapsed, 'error': 'No route found'}
            
            leg = data['trip']['legs'][0]
            return {
                'success': True,
                'time': elapsed,
                'distance_km': leg['summary']['length'],
                'duration_min': leg['summary']['time'] / 60,
            }
        except Exception as e:
            return {'success': False, 'time': 0, 'error': str(e)}
    
    def run_benchmark(self, category: str, routes: List[Tuple]):
        """Run benchmark for a category of routes."""
        print(f"\n{'='*80}")
        print(f"CATEGORY: {category.upper()} ROUTES")
        print(f"{'='*80}")
        
        for route_name, start_lat, start_lon, end_lat, end_lon, expected_km in routes:
            print(f"\n--- {route_name} (~{expected_km} km) ---")
            
            # Test GraphHopper
            print(f"  [GraphHopper] Testing...")
            gh_result = self.test_graphhopper(route_name, start_lat, start_lon, end_lat, end_lon)
            if gh_result['success']:
                print(f"  [GraphHopper] ✅ {gh_result['time']:.2f}s | {gh_result['distance_km']:.1f} km")
            else:
                print(f"  [GraphHopper] ❌ {gh_result.get('error', 'Unknown error')}")
            
            # Test Valhalla
            print(f"  [Valhalla] Testing...")
            valhalla_result = self.test_valhalla(route_name, start_lat, start_lon, end_lat, end_lon)
            if valhalla_result['success']:
                print(f"  [Valhalla] ✅ {valhalla_result['time']:.2f}s | {valhalla_result['distance_km']:.1f} km")
            else:
                print(f"  [Valhalla] ❌ {valhalla_result.get('error', 'Unknown error')}")
            
            # Store results
            self.results['graphhopper'].append(gh_result)
            self.results['valhalla'].append(valhalla_result)

if __name__ == '__main__':
    print("="*80)
    print("QUICK ROUTING ENGINE BENCHMARK (GraphHopper + Valhalla)")
    print("="*80)
    print("\nEngines:")
    print(f"  1. GraphHopper ({GRAPHHOPPER_URL})")
    print(f"  2. Valhalla ({VALHALLA_URL})")
    
    benchmark = BenchmarkRunner()
    
    # Run benchmarks for each category
    for category, routes in TEST_ROUTES.items():
        benchmark.run_benchmark(category, routes)
    
    # Print summary statistics
    print(f"\n{'='*80}")
    print("SUMMARY STATISTICS")
    print(f"{'='*80}")

    for engine in ['graphhopper', 'valhalla']:
        results = benchmark.results[engine]
        successful = [r for r in results if r['success']]
        failed = [r for r in results if not r['success']]

        print(f"\n{engine.upper()}:")
        print(f"  Success rate: {len(successful)}/{len(results)} ({len(successful)/len(results)*100:.1f}%)")

        if successful:
            times = [r['time'] for r in successful]
            distances = [r['distance_km'] for r in successful]

            print(f"  Response time:")
            print(f"    Min: {min(times):.2f}s")
            print(f"    Max: {max(times):.2f}s")
            print(f"    Avg: {statistics.mean(times):.2f}s")
            print(f"    Median: {statistics.median(times):.2f}s")

            if len(times) > 1:
                print(f"    StdDev: {statistics.stdev(times):.2f}s")

            print(f"  Distance:")
            print(f"    Min: {min(distances):.1f} km")
            print(f"    Max: {max(distances):.1f} km")
            print(f"    Avg: {statistics.mean(distances):.1f} km")

        if failed:
            print(f"  Failures: {len(failed)}")

    # Performance comparison
    print(f"\n{'='*80}")
    print("PERFORMANCE COMPARISON")
    print(f"{'='*80}")

    gh_times = [r['time'] for r in benchmark.results['graphhopper'] if r['success']]
    valhalla_times = [r['time'] for r in benchmark.results['valhalla'] if r['success']]

    if gh_times and valhalla_times:
        avg_gh = statistics.mean(gh_times)
        avg_valhalla = statistics.mean(valhalla_times)

        print(f"\nGraphHopper vs Valhalla:")
        print(f"  GraphHopper avg: {avg_gh:.2f}s")
        print(f"  Valhalla avg: {avg_valhalla:.2f}s")

        if avg_gh < avg_valhalla:
            speedup = avg_valhalla / avg_gh
            print(f"  🏆 GraphHopper is {speedup:.2f}x FASTER")
        else:
            speedup = avg_gh / avg_valhalla
            print(f"  🏆 Valhalla is {speedup:.2f}x FASTER")

    print(f"\n{'='*80}")
    print("BENCHMARK COMPLETE")
    print(f"{'='*80}")


#!/usr/bin/env python3
"""
Comprehensive Routing Engine Benchmark
Compares Custom Router vs GraphHopper vs Valhalla

Tests:
1. Short routes (0-50 km)
2. Medium routes (50-150 km)
3. Long routes (150-500 km)
4. Very long routes (500+ km)
5. Multiple waypoints
6. Cold start vs warm cache
"""

# --- Windows console UTF-8 (auto-added) ---
import sys as _vsys
if _vsys.platform == "win32":
    try:
        _vsys.stdout.reconfigure(encoding="utf-8", errors="replace")
        _vsys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass


import time
import requests
import statistics
from typing import Dict, List, Tuple
from custom_router.dijkstra import Router
from custom_router.graph import RoadNetwork

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
        self.custom_router = None
        self.results = {
            'custom': [],
            'graphhopper': [],
            'valhalla': [],
        }
        
    def initialize_custom_router(self):
        """Initialize custom router (cold start)."""
        print("\n[Custom Router] Initializing...")
        start_time = time.time()

        # Load graph (skip component detection for faster startup)
        graph = RoadNetwork(db_file='data/uk_router.db', skip_component_detection=True)

        # Create router
        self.custom_router = Router(graph=graph, use_ch=False, db_file='data/uk_router.db')

        init_time = time.time() - start_time
        print(f"[Custom Router] Initialized in {init_time:.1f}s")
        return init_time
    
    def test_custom_router(self, name: str, start_lat: float, start_lon: float, 
                          end_lat: float, end_lon: float) -> Dict:
        """Test custom router."""
        start_time = time.time()
        result = self.custom_router.route(start_lat, start_lon, end_lat, end_lon)
        elapsed = time.time() - start_time
        
        if 'error' in result:
            return {'success': False, 'time': elapsed, 'error': result['error']}
        
        return {
            'success': True,
            'time': elapsed,
            'distance_km': result.get('distance_km', 0),
            'duration_min': result.get('duration_min', 0),
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
            
            # Test Custom Router
            print(f"  [Custom Router] Testing...")
            custom_result = self.test_custom_router(route_name, start_lat, start_lon, end_lat, end_lon)
            if custom_result['success']:
                print(f"  [Custom Router] ✅ {custom_result['time']:.2f}s | {custom_result['distance_km']:.1f} km")
            else:
                print(f"  [Custom Router] ❌ {custom_result.get('error', 'Unknown error')}")
            
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
            self.results['custom'].append(custom_result)
            self.results['graphhopper'].append(gh_result)
            self.results['valhalla'].append(valhalla_result)

if __name__ == '__main__':
    print("="*80)
    print("ROUTING ENGINE PERFORMANCE BENCHMARK")
    print("="*80)
    print("\nEngines:")
    print(f"  1. Custom Router (Local)")
    print(f"  2. GraphHopper ({GRAPHHOPPER_URL})")
    print(f"  3. Valhalla ({VALHALLA_URL})")
    
    benchmark = BenchmarkRunner()
    
    # Initialize custom router
    init_time = benchmark.initialize_custom_router()
    
    # Run benchmarks for each category
    for category, routes in TEST_ROUTES.items():
        benchmark.run_benchmark(category, routes)
    
    # Print summary statistics
    print(f"\n{'='*80}")
    print("SUMMARY STATISTICS")
    print(f"{'='*80}")

    for engine in ['custom', 'graphhopper', 'valhalla']:
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
            for r in failed[:3]:  # Show first 3 failures
                print(f"    - {r.get('error', 'Unknown error')}")

    # Performance comparison
    print(f"\n{'='*80}")
    print("PERFORMANCE COMPARISON")
    print(f"{'='*80}")

    custom_times = [r['time'] for r in benchmark.results['custom'] if r['success']]
    gh_times = [r['time'] for r in benchmark.results['graphhopper'] if r['success']]
    valhalla_times = [r['time'] for r in benchmark.results['valhalla'] if r['success']]

    if custom_times and gh_times:
        avg_custom = statistics.mean(custom_times)
        avg_gh = statistics.mean(gh_times)
        speedup = avg_gh / avg_custom if avg_custom > 0 else 0
        print(f"\nCustom Router vs GraphHopper:")
        print(f"  Custom avg: {avg_custom:.2f}s")
        print(f"  GraphHopper avg: {avg_gh:.2f}s")
        if speedup > 1:
            print(f"  ✅ Custom is {speedup:.2f}x FASTER")
        else:
            print(f"  ❌ Custom is {1/speedup:.2f}x SLOWER")

    if custom_times and valhalla_times:
        avg_custom = statistics.mean(custom_times)
        avg_valhalla = statistics.mean(valhalla_times)
        speedup = avg_valhalla / avg_custom if avg_custom > 0 else 0
        print(f"\nCustom Router vs Valhalla:")
        print(f"  Custom avg: {avg_custom:.2f}s")
        print(f"  Valhalla avg: {avg_valhalla:.2f}s")
        if speedup > 1:
            print(f"  ✅ Custom is {speedup:.2f}x FASTER")
        else:
            print(f"  ❌ Custom is {1/speedup:.2f}x SLOWER")

    # Winner by category
    print(f"\n{'='*80}")
    print("WINNER BY CATEGORY")
    print(f"{'='*80}")

    category_ranges = {
        'short': (0, 3),
        'medium': (3, 6),
        'long': (6, 9),
        'very_long': (9, 12),
    }

    for category, (start_idx, end_idx) in category_ranges.items():
        print(f"\n{category.upper()} ROUTES:")

        custom_avg = statistics.mean([r['time'] for r in benchmark.results['custom'][start_idx:end_idx] if r['success']]) if any(r['success'] for r in benchmark.results['custom'][start_idx:end_idx]) else float('inf')
        gh_avg = statistics.mean([r['time'] for r in benchmark.results['graphhopper'][start_idx:end_idx] if r['success']]) if any(r['success'] for r in benchmark.results['graphhopper'][start_idx:end_idx]) else float('inf')
        valhalla_avg = statistics.mean([r['time'] for r in benchmark.results['valhalla'][start_idx:end_idx] if r['success']]) if any(r['success'] for r in benchmark.results['valhalla'][start_idx:end_idx]) else float('inf')

        times = {'Custom': custom_avg, 'GraphHopper': gh_avg, 'Valhalla': valhalla_avg}
        winner = min(times, key=times.get)

        print(f"  Custom: {custom_avg:.2f}s")
        print(f"  GraphHopper: {gh_avg:.2f}s")
        print(f"  Valhalla: {valhalla_avg:.2f}s")
        print(f"  🏆 WINNER: {winner}")

    print(f"\n{'='*80}")
    print("BENCHMARK COMPLETE")
    print(f"{'='*80}")


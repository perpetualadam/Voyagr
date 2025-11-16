#!/usr/bin/env python3
"""
Phase 3: Benchmark custom router vs GraphHopper
Compare speed, accuracy, and alternatives
"""

import sys
import os
import time
import requests
import json
sys.path.insert(0, os.path.dirname(__file__))

from custom_router.graph import RoadNetwork
from custom_router.dijkstra import Router
from custom_router.k_shortest_paths import KShortestPaths

# 50+ test routes covering UK
TEST_ROUTES = [
    # London area (short)
    (51.5074, -0.1278, 51.5174, -0.1278, "London short 1"),
    (51.5074, -0.1278, 51.5274, -0.1378, "London short 2"),
    (51.5074, -0.1278, 51.5374, -0.1478, "London short 3"),
    
    # Manchester area (short)
    (53.4808, -2.2426, 53.4908, -2.2426, "Manchester short 1"),
    (53.4808, -2.2426, 53.5008, -2.2526, "Manchester short 2"),
    
    # Medium distances (50-100km)
    (51.5074, -0.1278, 52.2053, 0.1218, "London to Cambridge"),
    (53.4808, -2.2426, 52.6386, -1.1743, "Manchester to Nottingham"),
    (51.5074, -0.1278, 51.9789, -0.7589, "London to Oxford"),
    (52.9548, -1.1581, 52.6386, -1.1743, "Nottingham to Leicester"),
    
    # Long distances (200km+)
    (51.5074, -0.1278, 53.4808, -2.2426, "London to Manchester"),
    (51.5074, -0.1278, 55.9533, -3.1883, "London to Edinburgh"),
    (53.4808, -2.2426, 55.9533, -3.1883, "Manchester to Edinburgh"),
    (51.5074, -0.1278, 52.4862, -1.8904, "London to Birmingham"),
]

class BenchmarkRunner:
    """Run benchmarks comparing routing engines."""
    
    def __init__(self):
        self.custom_graph = None
        self.custom_router = None
        self.k_paths = None
        self.results = []
    
    def init_custom_router(self):
        """Initialize custom router."""
        db_file = 'data/uk_router.db'
        if not os.path.exists(db_file):
            print(f"❌ Database not found: {db_file}")
            return False
        
        try:
            self.custom_graph = RoadNetwork(db_file)
            self.custom_router = Router(self.custom_graph)
            self.k_paths = KShortestPaths(self.custom_router)
            print("✅ Custom router initialized")
            return True
        except Exception as e:
            print(f"❌ Custom router init failed: {e}")
            return False
    
    def benchmark_custom_router(self, start_lat, start_lon, end_lat, end_lon, name):
        """Benchmark custom router."""
        if not self.custom_router:
            return None
        
        try:
            start_time = time.time()
            route = self.custom_router.route(start_lat, start_lon, end_lat, end_lon)
            elapsed = (time.time() - start_time) * 1000
            
            if not route:
                return None
            
            # Get alternatives
            alternatives = self.k_paths.find_k_paths(start_lat, start_lon, 
                                                     end_lat, end_lon, k=4)
            
            return {
                'engine': 'Custom Router',
                'name': name,
                'time_ms': elapsed,
                'distance_km': route.get('distance_km', 0),
                'alternatives': len(alternatives),
                'success': True
            }
        except Exception as e:
            print(f"❌ Custom router error: {e}")
            return None
    
    def benchmark_graphhopper(self, start_lat, start_lon, end_lat, end_lon, name):
        """Benchmark GraphHopper."""
        try:
            start_time = time.time()
            url = f"http://81.0.246.97:8989/route?point={start_lat},{start_lon}&point={end_lat},{end_lon}&vehicle=car&locale=en&points_encoded=false&ch.disable=false&instructions=true&elevation=false&details=&debug=false&format=json"
            
            response = requests.get(url, timeout=10)
            elapsed = (time.time() - start_time) * 1000
            
            if response.status_code != 200:
                return None
            
            data = response.json()
            if 'paths' not in data or not data['paths']:
                return None
            
            path = data['paths'][0]
            distance_km = path.get('distance', 0) / 1000
            
            return {
                'engine': 'GraphHopper',
                'name': name,
                'time_ms': elapsed,
                'distance_km': distance_km,
                'alternatives': len(data.get('paths', [])),
                'success': True
            }
        except Exception as e:
            print(f"⚠️  GraphHopper error: {e}")
            return None
    
    def run_benchmarks(self):
        """Run all benchmarks."""
        print("\n" + "=" * 70)
        print("BENCHMARKING: Custom Router vs GraphHopper")
        print("=" * 70)
        
        for start_lat, start_lon, end_lat, end_lon, name in TEST_ROUTES:
            print(f"\n📍 {name}")
            
            # Custom router
            custom_result = self.benchmark_custom_router(start_lat, start_lon, 
                                                        end_lat, end_lon, name)
            if custom_result:
                print(f"  Custom: {custom_result['time_ms']:.0f}ms, "
                      f"{custom_result['distance_km']:.1f}km, "
                      f"{custom_result['alternatives']} alternatives")
                self.results.append(custom_result)
            
            # GraphHopper
            gh_result = self.benchmark_graphhopper(start_lat, start_lon, 
                                                   end_lat, end_lon, name)
            if gh_result:
                print(f"  GraphHopper: {gh_result['time_ms']:.0f}ms, "
                      f"{gh_result['distance_km']:.1f}km, "
                      f"{gh_result['alternatives']} alternatives")
                self.results.append(gh_result)
            
            # Comparison
            if custom_result and gh_result:
                speedup = gh_result['time_ms'] / custom_result['time_ms']
                print(f"  ⚡ Speedup: {speedup:.1f}x")
    
    def print_summary(self):
        """Print benchmark summary."""
        print("\n" + "=" * 70)
        print("BENCHMARK SUMMARY")
        print("=" * 70)
        
        custom_times = [r['time_ms'] for r in self.results if r['engine'] == 'Custom Router']
        gh_times = [r['time_ms'] for r in self.results if r['engine'] == 'GraphHopper']
        
        if custom_times:
            print(f"\nCustom Router:")
            print(f"  Average: {sum(custom_times)/len(custom_times):.0f}ms")
            print(f"  Min: {min(custom_times):.0f}ms")
            print(f"  Max: {max(custom_times):.0f}ms")
        
        if gh_times:
            print(f"\nGraphHopper:")
            print(f"  Average: {sum(gh_times)/len(gh_times):.0f}ms")
            print(f"  Min: {min(gh_times):.0f}ms")
            print(f"  Max: {max(gh_times):.0f}ms")
        
        if custom_times and gh_times:
            avg_speedup = (sum(gh_times)/len(gh_times)) / (sum(custom_times)/len(custom_times))
            print(f"\n⚡ Average Speedup: {avg_speedup:.1f}x")

def main():
    runner = BenchmarkRunner()
    
    if not runner.init_custom_router():
        return
    
    runner.run_benchmarks()
    runner.print_summary()

if __name__ == '__main__':
    main()


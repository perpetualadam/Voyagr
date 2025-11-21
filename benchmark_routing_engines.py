#!/usr/bin/env python3
"""Benchmark CH vs external routing engines (GraphHopper, Valhalla, OSRM)."""

import time
import requests
import json
from custom_router.dijkstra import Router
from custom_router.graph import RoadNetwork

# Test routes (real UK coordinates)
TEST_ROUTES = [
    {"name": "London to Oxford (50km)", "start": (51.5074, -0.1278), "end": (51.7520, -1.2577)},
    {"name": "Manchester to Liverpool (35km)", "start": (53.4808, -2.2426), "end": (53.4084, -2.9916)},
    {"name": "Birmingham to Coventry (30km)", "start": (52.5086, -1.8853), "end": (52.4062, -1.5197)},
]

# Engine URLs
ENGINES = {
    'graphhopper': 'http://81.0.246.97:8989',
    'valhalla': 'http://141.147.102.102:8002',
    'osrm': 'http://router.project-osrm.org'
}

def benchmark_ch(graph, router_ch, router_dijkstra, start_lat, start_lon, end_lat, end_lon):
    """Benchmark CH routing."""
    times = {'ch': [], 'dijkstra': []}
    
    for _ in range(3):  # 3 runs
        # CH
        start = time.time()
        result = router_ch.route(start_lat, start_lon, end_lat, end_lon)
        times['ch'].append((time.time() - start) * 1000)
        
        # Dijkstra
        start = time.time()
        result = router_dijkstra.route(start_lat, start_lon, end_lat, end_lon)
        times['dijkstra'].append((time.time() - start) * 1000)
    
    return {
        'ch_avg': sum(times['ch']) / len(times['ch']),
        'dijkstra_avg': sum(times['dijkstra']) / len(times['dijkstra']),
        'speedup': (sum(times['dijkstra']) / len(times['dijkstra'])) / (sum(times['ch']) / len(times['ch']))
    }

def benchmark_external(engine, url, start_lat, start_lon, end_lat, end_lon):
    """Benchmark external routing engine."""
    times = []
    
    for _ in range(3):
        try:
            start = time.time()
            if engine == 'graphhopper':
                response = requests.post(f"{url}/route", json={
                    "points": [[start_lon, start_lat], [end_lon, end_lat]],
                    "profile": "car"
                }, timeout=30)
            elif engine == 'valhalla':
                response = requests.post(f"{url}/route", json={
                    "locations": [{"lat": start_lat, "lon": start_lon}, {"lat": end_lat, "lon": end_lon}],
                    "costing": "auto"
                }, timeout=30)
            elif engine == 'osrm':
                response = requests.get(f"{url}/route/v1/driving/{start_lon},{start_lat};{end_lon},{end_lat}", timeout=30)
            
            if response.status_code == 200:
                times.append((time.time() - start) * 1000)
        except:
            pass
    
    return sum(times) / len(times) if times else None

def main():
    print("="*80)
    print("ROUTING ENGINE BENCHMARK")
    print("="*80 + "\n")
    
    # Load graph and routers
    print("[SETUP] Loading graph...")
    graph = RoadNetwork('data/uk_router.db')
    
    print("[SETUP] Creating routers...")
    router_ch = Router(graph, use_ch=True, db_file='data/uk_router.db')
    router_dijkstra = Router(graph, use_ch=False, db_file='data/uk_router.db')
    
    results = {}
    
    for route in TEST_ROUTES:
        print(f"\nRoute: {route['name']}")
        print("-" * 80)
        
        start_lat, start_lon = route['start']
        end_lat, end_lon = route['end']
        
        # Benchmark CH
        print("  Benchmarking CH...")
        ch_result = benchmark_ch(graph, router_ch, router_dijkstra, start_lat, start_lon, end_lat, end_lon)
        print(f"    CH: {ch_result['ch_avg']:.2f}ms")
        print(f"    Dijkstra: {ch_result['dijkstra_avg']:.2f}ms")
        print(f"    Speedup: {ch_result['speedup']:.1f}x")
        
        # Benchmark external engines
        for engine, url in ENGINES.items():
            print(f"  Benchmarking {engine.upper()}...")
            time_ms = benchmark_external(engine, url, start_lat, start_lon, end_lat, end_lon)
            if time_ms:
                print(f"    {engine.upper()}: {time_ms:.2f}ms")
            else:
                print(f"    {engine.upper()}: FAILED")
        
        results[route['name']] = ch_result
    
    # Summary
    print("\n" + "="*80)
    print("SUMMARY")
    print("="*80)
    print(f"Average CH speedup: {sum(r['speedup'] for r in results.values()) / len(results):.1f}x")
    print(f"CH is {sum(r['speedup'] for r in results.values()) / len(results):.0f}x faster than Dijkstra")

if __name__ == "__main__":
    main()


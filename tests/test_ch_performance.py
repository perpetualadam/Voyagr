#!/usr/bin/env python3
"""
Test Contraction Hierarchies performance.
Compares CH-based routing vs standard Dijkstra+A*.
"""

import time
from custom_router.graph import RoadNetwork
from custom_router.dijkstra import Router

# Test routes (London, Oxford, Manchester, Birmingham)
TEST_ROUTES = [
    # Short route (London to nearby)
    {
        'name': 'Short (London-Guildford)',
        'start': (51.5074, -0.1278),  # London
        'end': (51.2383, -0.5762),    # Guildford
    },
    # Medium route (London to Oxford)
    {
        'name': 'Medium (London-Oxford)',
        'start': (51.5074, -0.1278),  # London
        'end': (51.7520, -1.2577),    # Oxford
    },
    # Long route (London to Manchester)
    {
        'name': 'Long (London-Manchester)',
        'start': (51.5074, -0.1278),  # London
        'end': (53.4808, -2.2426),    # Manchester
    },
]

def test_routing(use_ch: bool):
    """Test routing with or without CH."""
    print(f"\n{'='*70}")
    print(f"Testing with CH: {use_ch}")
    print(f"{'='*70}\n")
    
    graph = RoadNetwork('data/uk_router.db')
    router = Router(graph, use_ch=use_ch)
    
    print(f"CH Available: {router.ch_available}")
    print(f"CH Nodes: {len(router.ch_levels)}\n")
    
    times = []
    
    for route in TEST_ROUTES:
        print(f"Testing: {route['name']}")
        start_lat, start_lon = route['start']
        end_lat, end_lon = route['end']
        
        start = time.time()
        result = router.route(start_lat, start_lon, end_lat, end_lon)
        elapsed = time.time() - start
        
        if result and 'error' not in result:
            print(f"  Distance: {result['distance_km']:.1f} km")
            print(f"  Duration: {result['time_minutes']:.0f} minutes")
            print(f"  Algorithm: {result.get('algorithm', 'Unknown')}")
            print(f"  Time: {result['response_time_ms']:.1f}ms")
            times.append(result['response_time_ms'])
        else:
            print(f"  Error: {result}")
        print()
    
    if times:
        print(f"Average time: {sum(times)/len(times):.1f}ms")
        print(f"Min time: {min(times):.1f}ms")
        print(f"Max time: {max(times):.1f}ms")
    
    return times

if __name__ == '__main__':
    print("\n" + "="*70)
    print("CONTRACTION HIERARCHIES PERFORMANCE TEST")
    print("="*70)
    
    # Test with CH
    ch_times = test_routing(use_ch=True)
    
    # Test without CH
    dijkstra_times = test_routing(use_ch=False)
    
    # Compare
    if ch_times and dijkstra_times:
        print(f"\n{'='*70}")
        print("PERFORMANCE COMPARISON")
        print(f"{'='*70}\n")
        
        ch_avg = sum(ch_times) / len(ch_times)
        dijkstra_avg = sum(dijkstra_times) / len(dijkstra_times)
        speedup = dijkstra_avg / ch_avg
        
        print(f"CH Average: {ch_avg:.1f}ms")
        print(f"Dijkstra Average: {dijkstra_avg:.1f}ms")
        print(f"Speedup: {speedup:.1f}x faster")
        print()


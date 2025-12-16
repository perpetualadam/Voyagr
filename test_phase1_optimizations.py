#!/usr/bin/env python3
"""
Test Phase 1 optimizations (heuristic caching + pre-calculated edge costs).

This script tests the custom router with Phase 1 optimizations to verify:
1. Heuristic caching is working
2. Pre-calculated edge costs are being used
3. Performance improvement vs baseline

Expected improvement: 2-3x speedup (5.41s → 2.0s average)
"""

import time
from custom_router.graph import RoadNetwork
from custom_router.dijkstra import Router


def test_route(router, name, start_lat, start_lon, end_lat, end_lon):
    """Test a single route and return timing + stats."""
    print(f"\n{'='*60}")
    print(f"Testing: {name}")
    print(f"{'='*60}")
    
    start_time = time.time()
    result = router.route(start_lat, start_lon, end_lat, end_lon)
    elapsed = time.time() - start_time
    
    if result and 'path' in result:
        print(f"✅ Route found in {elapsed:.2f}s")
        print(f"   Distance: {result['distance_km']:.1f} km")
        print(f"   Duration: {result['duration_minutes']:.1f} min")
        print(f"   Nodes explored: {router.stats.get('nodes_explored', 0):,}")
        print(f"   Heuristic calls: {router.stats.get('heuristic_calls', 0):,}")
        print(f"   Heuristic cache hits: {router.stats.get('heuristic_cache_hits', 0):,}")
        
        # Calculate cache hit rate
        total_heuristic_ops = router.stats.get('heuristic_calls', 0) + router.stats.get('heuristic_cache_hits', 0)
        if total_heuristic_ops > 0:
            cache_hit_rate = router.stats.get('heuristic_cache_hits', 0) / total_heuristic_ops * 100
            print(f"   Cache hit rate: {cache_hit_rate:.1f}%")
        
        return {'success': True, 'time': elapsed, 'distance': result['distance_km']}
    else:
        print(f"❌ No route found ({elapsed:.2f}s)")
        return {'success': False, 'time': elapsed}


def main():
    print("=" * 80)
    print("PHASE 1 OPTIMIZATION TEST")
    print("=" * 80)
    print()
    print("Testing custom router with:")
    print("  1. Heuristic caching (100k entry limit)")
    print("  2. Pre-calculated edge costs")
    print()
    print("Expected: 2-3x speedup vs baseline (5.41s → 2.0s average)")
    print()

    # Load graph
    print("[1/2] Loading road network...")
    start_time = time.time()
    graph = RoadNetwork(db_file='data/uk_router.db', skip_component_detection=True)
    elapsed = time.time() - start_time
    print(f"✅ Graph loaded in {elapsed:.1f}s")
    print()

    # Initialize router (no CH)
    print("[2/2] Initializing router...")
    router = Router(graph=graph, use_ch=False, db_file='data/uk_router.db')
    print(f"✅ Router initialized")
    print()

    # Test routes
    routes = [
        ("London → Oxford (short)", 51.5074, -0.1278, 51.7520, -1.2577),
        ("London → Manchester (medium)", 51.5074, -0.1278, 53.4808, -2.2426),
        ("London → Edinburgh (long)", 51.5074, -0.1278, 55.9533, -3.1883),
    ]

    results = []
    for name, start_lat, start_lon, end_lat, end_lon in routes:
        result = test_route(router, name, start_lat, start_lon, end_lat, end_lon)
        results.append((name, result))

    # Summary
    print("\n" + "=" * 80)
    print("SUMMARY")
    print("=" * 80)
    
    successful = [r for _, r in results if r['success']]
    if successful:
        avg_time = sum(r['time'] for r in successful) / len(successful)
        print(f"\nSuccessful routes: {len(successful)}/{len(results)}")
        print(f"Average time: {avg_time:.2f}s")
        print()
        print("Baseline (before Phase 1): 5.41s average")
        print(f"Phase 1 (after optimizations): {avg_time:.2f}s average")
        
        if avg_time < 5.41:
            speedup = 5.41 / avg_time
            print(f"Speedup: {speedup:.2f}x faster ✅")
            
            if speedup >= 2.0:
                print("\n🎉 Phase 1 target achieved! (2-3x speedup)")
            else:
                print(f"\n⚠️ Phase 1 target not met (expected 2-3x, got {speedup:.2f}x)")
        else:
            print(f"⚠️ Performance regression detected!")
    else:
        print("\n❌ No successful routes")
    
    print()


if __name__ == '__main__':
    main()


"""
Performance testing for custom router
Tests route calculation speed and memory usage
"""
import time
import psutil
import os
from custom_router.graph import RoadNetwork
from custom_router.dijkstra import Router

# Real UK test routes
TEST_ROUTES = [
    {'name': 'London-Manchester', 'start': (51.5074, -0.1278), 'end': (53.4808, -2.2426)},
    {'name': 'London-Oxford', 'start': (51.5074, -0.1278), 'end': (51.7520, -1.2577)},
    {'name': 'London-Birmingham', 'start': (51.5074, -0.1278), 'end': (52.5086, -1.8755)},
    {'name': 'Manchester-Leeds', 'start': (53.4808, -2.2426), 'end': (53.8008, -1.5491)},
    {'name': 'Edinburgh-Glasgow', 'start': (55.9533, -3.1883), 'end': (55.8642, -4.2518)},
]

def get_memory_usage():
    """Get current memory usage in MB."""
    process = psutil.Process(os.getpid())
    return process.memory_info().rss / 1024 / 1024

def test_performance():
    """Test router performance."""
    print("\n" + "="*70)
    print("CUSTOM ROUTER PERFORMANCE TEST")
    print("="*70)
    
    # Load graph
    print("\n[PERF] Loading graph...")
    mem_before = get_memory_usage()
    start = time.time()
    graph = RoadNetwork('data/uk_router.db')
    load_time = time.time() - start
    mem_after = get_memory_usage()
    
    print(f"✅ Graph loaded in {load_time:.1f}s")
    print(f"   Memory: {mem_before:.1f}MB → {mem_after:.1f}MB (+{mem_after-mem_before:.1f}MB)")
    print(f"   Nodes: {len(graph.nodes):,}")
    print(f"   Edges: {sum(len(e) for e in graph.edges.values()):,}")
    
    # Initialize router
    print("\n[PERF] Initializing router...")
    router = Router(graph, use_ch=False)
    print("✅ Router initialized")
    
    # Test routes
    print("\n[PERF] Testing route calculations...")
    print("-" * 70)
    
    times = []
    for route in TEST_ROUTES:
        start = time.time()
        result = router.route(
            route['start'][0], route['start'][1],
            route['end'][0], route['end'][1]
        )
        elapsed = time.time() - start
        times.append(elapsed)

        if result and 'error' not in result:
            distance = result.get('distance_m', 0) / 1000
            print(f"✅ {route['name']:20} {elapsed:6.2f}s  {distance:7.1f}km")
        else:
            error_msg = result.get('error', 'Unknown') if result else 'No result'
            reason = result.get('reason', '') if result else ''
            print(f"❌ {route['name']:20} {elapsed:6.2f}s  {error_msg} {reason}")
    
    # Summary
    print("-" * 70)
    print(f"Average time: {sum(times)/len(times):.2f}s")
    print(f"Min time: {min(times):.2f}s")
    print(f"Max time: {max(times):.2f}s")
    print(f"Total time: {sum(times):.2f}s")
    
    print(f"\nFinal memory: {get_memory_usage():.1f}MB")

if __name__ == '__main__':
    test_performance()


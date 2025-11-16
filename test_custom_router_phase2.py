#!/usr/bin/env python3
"""
Phase 2 Testing: Performance profiling and optimization
"""

import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

from custom_router.graph import RoadNetwork
from custom_router.dijkstra import Router
from custom_router.profiler import RouterProfiler

# Test routes (lat, lon pairs)
TEST_ROUTES = [
    # Short routes (1-10km)
    (51.5074, -0.1278, 51.5174, -0.1278),  # London short
    (53.4808, -2.2426, 53.4908, -2.2426),  # Manchester short
    
    # Medium routes (50-100km)
    (51.5074, -0.1278, 52.2053, 0.1218),   # London to Cambridge
    (53.4808, -2.2426, 52.6386, -1.1743),  # Manchester to Nottingham
    
    # Long routes (200km+)
    (51.5074, -0.1278, 53.4808, -2.2426),  # London to Manchester
    (51.5074, -0.1278, 55.9533, -3.1883),  # London to Edinburgh
]

def main():
    print("=" * 60)
    print("Phase 2: Custom Router Performance Profiling")
    print("=" * 60)
    
    # Check if database exists
    db_file = 'data/uk_router.db'
    if not os.path.exists(db_file):
        print(f"\n❌ Database not found: {db_file}")
        print("Run: python setup_custom_router.py")
        return
    
    print(f"\n[Setup] Loading graph from {db_file}...")
    graph = RoadNetwork(db_file)
    
    print(f"\n[Graph] Nodes: {len(graph.nodes):,}")
    print(f"[Graph] Edges: {sum(len(e) for e in graph.edges.values()):,}")
    
    # Profile routes
    profiler = RouterProfiler(graph)
    summary = profiler.profile_batch(TEST_ROUTES)
    
    print("\n" + "=" * 60)
    print("PROFILING RESULTS")
    print("=" * 60)
    print(f"Average time: {summary['avg_time_ms']:.0f}ms")
    print(f"Min time: {summary['min_time_ms']:.0f}ms")
    print(f"Max time: {summary['max_time_ms']:.0f}ms")
    print(f"Routes tested: {summary['total_routes']}")
    
    # Performance assessment
    avg = summary['avg_time_ms']
    if avg < 50:
        print("\n✅ EXCELLENT: <50ms average")
    elif avg < 100:
        print("\n⚠️  GOOD: <100ms average")
    elif avg < 200:
        print("\n⚠️  ACCEPTABLE: <200ms average")
    else:
        print("\n❌ NEEDS OPTIMIZATION: >200ms average")
    
    print("\n" + "=" * 60)
    print("NEXT STEPS FOR PHASE 2")
    print("=" * 60)
    print("1. Implement A* heuristic (20-30% improvement)")
    print("2. Add Contraction Hierarchies (5-10x speedup)")
    print("3. Implement K-shortest paths")
    print("4. Benchmark vs GraphHopper")
    print("5. Integrate into voyagr_web.py")

if __name__ == '__main__':
    main()


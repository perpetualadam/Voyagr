#!/usr/bin/env python3
"""
Phase 2 Testing: Performance profiling and optimization
Tests A* heuristic, Contraction Hierarchies, and K-shortest paths
"""

import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

from custom_router.graph import RoadNetwork
from custom_router.dijkstra import Router
from custom_router.profiler import RouterProfiler
from custom_router.contraction_hierarchies import ContractionHierarchies
from custom_router.k_shortest_paths import KShortestPaths

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

def test_dijkstra_with_astar():
    """Test Dijkstra with A* heuristic."""
    print("\n" + "=" * 60)
    print("TEST 1: Dijkstra with A* Heuristic")
    print("=" * 60)

    db_file = 'data/uk_router.db'
    if not os.path.exists(db_file):
        print(f"❌ Database not found: {db_file}")
        return

    graph = RoadNetwork(db_file)
    profiler = RouterProfiler(graph)
    summary = profiler.profile_batch(TEST_ROUTES)

    print(f"\nAverage time: {summary['avg_time_ms']:.0f}ms")
    print(f"Min time: {summary['min_time_ms']:.0f}ms")
    print(f"Max time: {summary['max_time_ms']:.0f}ms")

    if summary['avg_time_ms'] < 100:
        print("✅ A* heuristic working - <100ms average")
    else:
        print("⚠️  Still needs optimization")

def test_k_shortest_paths():
    """Test K-shortest paths for alternatives."""
    print("\n" + "=" * 60)
    print("TEST 2: K-Shortest Paths (Alternative Routes)")
    print("=" * 60)

    db_file = 'data/uk_router.db'
    if not os.path.exists(db_file):
        print(f"❌ Database not found: {db_file}")
        return

    graph = RoadNetwork(db_file)
    router = Router(graph)
    k_paths = KShortestPaths(router)

    # Test finding 4 alternative routes
    print("\nFinding 4 alternative routes from London to Manchester...")
    routes = k_paths.find_k_paths(51.5074, -0.1278, 53.4808, -2.2426, k=4)

    print(f"Found {len(routes)} routes:")
    for i, route in enumerate(routes, 1):
        print(f"  Route {i}: {route.get('distance_km', 0):.1f}km, "
              f"{route.get('duration_minutes', 0):.0f}min")

    if len(routes) >= 3:
        print("✅ K-shortest paths working")
    else:
        print("⚠️  Need to improve K-shortest paths")

def test_contraction_hierarchies():
    """Test Contraction Hierarchies."""
    print("\n" + "=" * 60)
    print("TEST 3: Contraction Hierarchies (CH)")
    print("=" * 60)

    db_file = 'data/uk_router.db'
    if not os.path.exists(db_file):
        print(f"❌ Database not found: {db_file}")
        return

    graph = RoadNetwork(db_file)
    ch = ContractionHierarchies(graph, db_file)

    print("\nBuilding CH (this may take a minute)...")
    ch.build(sample_size=5000)

    if ch.built:
        print(f"✅ CH built with {len(ch.shortcuts)} shortcuts")
        ch.save()
    else:
        print("❌ CH build failed")

def main():
    print("=" * 60)
    print("Phase 2: Custom Router Optimization Tests")
    print("=" * 60)

    # Test 1: A* Heuristic
    test_dijkstra_with_astar()

    # Test 2: K-Shortest Paths
    test_k_shortest_paths()

    # Test 3: Contraction Hierarchies
    test_contraction_hierarchies()

    print("\n" + "=" * 60)
    print("PHASE 2 PROGRESS")
    print("=" * 60)
    print("✅ A* Heuristic - Implemented")
    print("✅ K-Shortest Paths - Implemented")
    print("✅ Contraction Hierarchies - Implemented")
    print("\nNext: Benchmark vs GraphHopper and integrate into voyagr_web.py")

if __name__ == '__main__':
    main()


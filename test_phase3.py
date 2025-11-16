#!/usr/bin/env python3
"""
Phase 3 Testing Script
Tests custom router integration into voyagr_web.py
"""

import sys
import os
import json
import time

# Add project to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

print("\n" + "="*70)
print("🧪 PHASE 3 TESTING - Custom Router Integration")
print("="*70 + "\n")

# Test 1: Check imports
print("[TEST 1] Checking imports...")
try:
    from custom_router import RoadNetwork, Router, KShortestPaths
    print("✅ Custom router modules imported successfully")
except ImportError as e:
    print(f"❌ Failed to import custom router: {e}")
    sys.exit(1)

# Test 2: Check database exists
print("\n[TEST 2] Checking database...")
db_file = 'data/uk_router.db'
if os.path.exists(db_file):
    size_mb = os.path.getsize(db_file) / (1024 * 1024)
    print(f"✅ Database found: {db_file} ({size_mb:.1f} MB)")
else:
    print(f"❌ Database not found: {db_file}")
    print("   Run: python setup_custom_router.py")
    sys.exit(1)

# Test 3: Initialize custom router
print("\n[TEST 3] Initializing custom router...")
try:
    start_time = time.time()
    graph = RoadNetwork(db_file)
    elapsed = time.time() - start_time
    
    print(f"✅ Graph loaded in {elapsed:.2f}s")
    print(f"   Nodes: {len(graph.nodes):,}")
    print(f"   Edges: {sum(len(e) for e in graph.edges.values()):,}")
    print(f"   Ways: {len(graph.ways):,}")
except Exception as e:
    print(f"❌ Failed to initialize graph: {e}")
    sys.exit(1)

# Test 4: Initialize router
print("\n[TEST 4] Initializing router...")
try:
    router = Router(graph)
    print("✅ Router initialized successfully")
except Exception as e:
    print(f"❌ Failed to initialize router: {e}")
    sys.exit(1)

# Test 5: Initialize K-paths
print("\n[TEST 5] Initializing K-shortest paths...")
try:
    k_paths = KShortestPaths(router)
    print("✅ K-shortest paths initialized successfully")
except Exception as e:
    print(f"❌ Failed to initialize K-paths: {e}")
    sys.exit(1)

# Test 6: Test short route
print("\n[TEST 6] Testing short route (London area)...")
try:
    start_time = time.time()
    # London coordinates
    route = router.route(51.5074, -0.1278, 51.5200, -0.1000)
    elapsed = time.time() - start_time
    
    if route:
        print(f"✅ Route found in {elapsed*1000:.1f}ms")
        print(f"   Distance: {route.get('distance_km', 0):.2f} km")
        print(f"   Duration: {route.get('duration_minutes', 0):.1f} minutes")
    else:
        print(f"⚠️  No route found (may be outside coverage)")
except Exception as e:
    print(f"❌ Route calculation failed: {e}")

# Test 7: Test medium route
print("\n[TEST 7] Testing medium route (London to Oxford)...")
try:
    start_time = time.time()
    # London to Oxford
    route = router.route(51.5074, -0.1278, 51.7520, -1.2577)
    elapsed = time.time() - start_time
    
    if route:
        print(f"✅ Route found in {elapsed*1000:.1f}ms")
        print(f"   Distance: {route.get('distance_km', 0):.2f} km")
        print(f"   Duration: {route.get('duration_minutes', 0):.1f} minutes")
    else:
        print(f"⚠️  No route found (may be outside coverage)")
except Exception as e:
    print(f"❌ Route calculation failed: {e}")

# Test 8: Test long route
print("\n[TEST 8] Testing long route (London to Manchester)...")
try:
    start_time = time.time()
    # London to Manchester
    route = router.route(51.5074, -0.1278, 53.4808, -2.2426)
    elapsed = time.time() - start_time
    
    if route:
        print(f"✅ Route found in {elapsed*1000:.1f}ms")
        print(f"   Distance: {route.get('distance_km', 0):.2f} km")
        print(f"   Duration: {route.get('duration_minutes', 0):.1f} minutes")
    else:
        print(f"⚠️  No route found (may be outside coverage)")
except Exception as e:
    print(f"❌ Route calculation failed: {e}")

# Test 9: Test alternatives
print("\n[TEST 9] Testing K-shortest paths (alternatives)...")
try:
    start_time = time.time()
    alternatives = k_paths.find_k_paths(51.5074, -0.1278, 53.4808, -2.2426, k=4)
    elapsed = time.time() - start_time
    
    print(f"✅ Found {len(alternatives)} alternatives in {elapsed*1000:.1f}ms")
    for i, alt in enumerate(alternatives, 1):
        print(f"   Route {i}: {alt.get('distance_km', 0):.2f} km, {alt.get('duration_minutes', 0):.1f} min")
except Exception as e:
    print(f"❌ K-paths calculation failed: {e}")

# Test 10: Check voyagr_web.py integration
print("\n[TEST 10] Checking voyagr_web.py integration...")
try:
    # Check if custom router variables are defined
    import voyagr_web
    
    # Check configuration
    if hasattr(voyagr_web, 'USE_CUSTOM_ROUTER'):
        print(f"✅ USE_CUSTOM_ROUTER = {voyagr_web.USE_CUSTOM_ROUTER}")
    else:
        print("❌ USE_CUSTOM_ROUTER not defined")
    
    if hasattr(voyagr_web, 'CUSTOM_ROUTER_DB'):
        print(f"✅ CUSTOM_ROUTER_DB = {voyagr_web.CUSTOM_ROUTER_DB}")
    else:
        print("❌ CUSTOM_ROUTER_DB not defined")
    
    if hasattr(voyagr_web, 'init_custom_router'):
        print("✅ init_custom_router() function defined")
    else:
        print("❌ init_custom_router() function not defined")
    
    if hasattr(voyagr_web, 'calculate_route_custom'):
        print("✅ calculate_route_custom() endpoint defined")
    else:
        print("❌ calculate_route_custom() endpoint not defined")
        
except Exception as e:
    print(f"❌ voyagr_web.py check failed: {e}")

print("\n" + "="*70)
print("✅ PHASE 3 TESTING COMPLETE")
print("="*70 + "\n")
print("Next steps:")
print("1. Start the app: python voyagr_web.py")
print("2. Test endpoints:")
print("   - POST http://localhost:5000/api/route/custom")
print("   - POST http://localhost:5000/api/route")
print("3. Open browser: http://localhost:5000")
print("4. Calculate routes and verify custom router is used\n")


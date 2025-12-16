#!/usr/bin/env python3
"""Test Voyagr Web API with Valhalla routing engine."""

import requests
import json
import time

BASE_URL = "http://localhost:5000"

def test_route_simple():
    """Test 1: Simple route without hazard avoidance (Barnsley to Doncaster)."""
    print("\n" + "="*80)
    print("TEST 1: Simple Route (Barnsley → Doncaster, No Hazard Avoidance)")
    print("="*80)
    
    payload = {
        "start": "53.5526,-1.4797",  # Barnsley
        "end": "53.5231,-1.1285",    # Doncaster
        "routing_mode": "auto",
        "enable_hazard_avoidance": False
    }
    
    start_time = time.time()
    response = requests.post(f"{BASE_URL}/api/route", json=payload, timeout=30)
    elapsed = (time.time() - start_time) * 1000
    
    print(f"\n⏱️  Response Time: {elapsed:.0f}ms")
    print(f"📊 Status Code: {response.status_code}")
    
    if response.status_code == 200:
        data = response.json()
        if data.get('success'):
            routes = data.get('routes', [])
            print(f"✅ SUCCESS: {len(routes)} route(s) found")
            print(f"🚗 Source: {data.get('source', 'Unknown')}")
            
            for i, route in enumerate(routes, 1):
                print(f"\n  Route {i}:")
                print(f"    Distance: {route.get('distance_km', 0):.2f} km")
                print(f"    Duration: {route.get('duration_minutes', 0):.1f} minutes")
                print(f"    Hazards: {route.get('hazard_count', 0)}")
                if route.get('hazard_penalty_seconds'):
                    print(f"    Hazard Penalty: {route.get('hazard_penalty_seconds', 0):.0f}s")
        else:
            print(f"❌ FAILED: {data.get('error', 'Unknown error')}")
    else:
        print(f"❌ HTTP ERROR: {response.text}")

def test_route_with_hazard_avoidance():
    """Test 2: Route with hazard avoidance enabled."""
    print("\n" + "="*80)
    print("TEST 2: Route with Hazard Avoidance (Barnsley → Doncaster)")
    print("="*80)
    
    payload = {
        "start": "53.5526,-1.4797",  # Barnsley
        "end": "53.5231,-1.1285",    # Doncaster
        "routing_mode": "auto",
        "enable_hazard_avoidance": True
    }
    
    start_time = time.time()
    response = requests.post(f"{BASE_URL}/api/route", json=payload, timeout=30)
    elapsed = (time.time() - start_time) * 1000
    
    print(f"\n⏱️  Response Time: {elapsed:.0f}ms")
    print(f"📊 Status Code: {response.status_code}")
    
    if response.status_code == 200:
        data = response.json()
        if data.get('success'):
            routes = data.get('routes', [])
            print(f"✅ SUCCESS: {len(routes)} route(s) found")
            print(f"🚗 Source: {data.get('source', 'Unknown')}")
            
            for i, route in enumerate(routes, 1):
                print(f"\n  Route {i}:")
                print(f"    Distance: {route.get('distance_km', 0):.2f} km")
                print(f"    Duration: {route.get('duration_minutes', 0):.1f} minutes")
                print(f"    Hazards: {route.get('hazard_count', 0)}")
                if route.get('hazard_penalty_seconds'):
                    print(f"    Hazard Penalty: {route.get('hazard_penalty_seconds', 0):.0f}s")
                if route.get('segmented'):
                    print(f"    Segmented: {route.get('segments', 0)} segments")
        else:
            print(f"❌ FAILED: {data.get('error', 'Unknown error')}")
    else:
        print(f"❌ HTTP ERROR: {response.text}")

def test_high_density_route():
    """Test 3: High-density route (should trigger segmented routing)."""
    print("\n" + "="*80)
    print("TEST 3: High-Density Route (Leeds → York, >75 cameras)")
    print("="*80)
    
    payload = {
        "start": "53.8008,-1.5491",  # Leeds
        "end": "53.9600,-1.0873",    # York
        "routing_mode": "auto",
        "enable_hazard_avoidance": True
    }
    
    start_time = time.time()
    response = requests.post(f"{BASE_URL}/api/route", json=payload, timeout=60)
    elapsed = (time.time() - start_time) * 1000
    
    print(f"\n⏱️  Response Time: {elapsed:.0f}ms")
    print(f"📊 Status Code: {response.status_code}")
    
    if response.status_code == 200:
        data = response.json()
        if data.get('success'):
            routes = data.get('routes', [])
            print(f"✅ SUCCESS: {len(routes)} route(s) found")
            print(f"🚗 Source: {data.get('source', 'Unknown')}")
            
            for i, route in enumerate(routes, 1):
                print(f"\n  Route {i}:")
                print(f"    Distance: {route.get('distance_km', 0):.2f} km")
                print(f"    Duration: {route.get('duration_minutes', 0):.1f} minutes")
                print(f"    Hazards: {route.get('hazard_count', 0)}")
                if route.get('hazard_penalty_seconds'):
                    print(f"    Hazard Penalty: {route.get('hazard_penalty_seconds', 0):.0f}s")
                if route.get('segmented'):
                    print(f"    ⚡ SEGMENTED: {route.get('segments', 0)} segments")
        else:
            print(f"❌ FAILED: {data.get('error', 'Unknown error')}")
    else:
        print(f"❌ HTTP ERROR: {response.text}")

def test_fallback_chain():
    """Test 4: Check fallback chain health."""
    print("\n" + "="*80)
    print("TEST 4: Fallback Chain Health")
    print("="*80)
    
    response = requests.get(f"{BASE_URL}/api/fallback-chain-health", timeout=10)
    
    if response.status_code == 200:
        data = response.json()
        print(f"\n✅ Recommended Engine: {data.get('recommended_engine', 'Unknown')}")
        print(f"\n📊 Engine Health:")
        
        health = data.get('health', {})
        for engine, stats in health.items():
            print(f"\n  {engine.upper()}:")
            print(f"    Successes: {stats.get('successes', 0)}")
            print(f"    Failures: {stats.get('failures', 0)}")
            print(f"    Success Rate: {stats.get('success_rate', 0):.1f}%")
            print(f"    Avg Response Time: {stats.get('avg_response_time_ms', 0):.0f}ms")
    else:
        print(f"❌ HTTP ERROR: {response.text}")

if __name__ == "__main__":
    print("\n🚀 VOYAGR WEB API - VALHALLA ROUTING TESTS")
    print("="*80)
    
    try:
        test_route_simple()
        test_route_with_hazard_avoidance()
        test_high_density_route()
        test_fallback_chain()
        
        print("\n" + "="*80)
        print("✅ ALL TESTS COMPLETED")
        print("="*80 + "\n")
        
    except Exception as e:
        print(f"\n❌ TEST FAILED: {e}\n")


#!/usr/bin/env python3
"""
Quick test to verify hazard avoidance integration in voyagr_web.py
Tests the code structure without starting the full server.
"""

import re

def test_hazard_avoidance_integration():
    """Test that hazard avoidance is properly integrated in voyagr_web.py"""
    
    print("=" * 80)
    print("TESTING CUSTOM ROUTER HAZARD AVOIDANCE INTEGRATION")
    print("=" * 80)
    
    # Read voyagr_web.py
    with open('voyagr_web.py', 'r', encoding='utf-8') as f:
        content = f.read()
    
    tests_passed = 0
    tests_failed = 0
    
    # Test 1: Check for hazard scoring loop
    print("\n[TEST 1] Checking for hazard scoring loop...")
    if 'HAZARD AVOIDANCE: Score routes by hazard penalty if enabled' in content:
        print("✅ PASS: Hazard scoring section found")
        tests_passed += 1
    else:
        print("❌ FAIL: Hazard scoring section not found")
        tests_failed += 1
    
    # Test 2: Check for score_route_by_hazards call
    print("\n[TEST 2] Checking for score_route_by_hazards() call...")
    if re.search(r'hazard_penalty,\s*hazard_count\s*=\s*score_route_by_hazards\(route_geometry,\s*hazards\)', content):
        print("✅ PASS: score_route_by_hazards() is called")
        tests_passed += 1
    else:
        print("❌ FAIL: score_route_by_hazards() call not found")
        tests_failed += 1
    
    # Test 3: Check for get_hazards_on_route call
    print("\n[TEST 3] Checking for get_hazards_on_route() call...")
    if re.search(r'hazards_list\s*=\s*get_hazards_on_route\(route_geometry,\s*hazards\)', content):
        print("✅ PASS: get_hazards_on_route() is called")
        tests_passed += 1
    else:
        print("❌ FAIL: get_hazards_on_route() call not found")
        tests_failed += 1
    
    # Test 4: Check for route reordering
    print("\n[TEST 4] Checking for route reordering logic...")
    if 'HAZARD AVOIDANCE: Reorder routes by hazard penalty if enabled' in content:
        print("✅ PASS: Route reordering section found")
        tests_passed += 1
    else:
        print("❌ FAIL: Route reordering section not found")
        tests_failed += 1
    
    # Test 5: Check for hazard fields assignment
    print("\n[TEST 5] Checking for hazard fields assignment...")
    hazard_fields = [
        "route_item['hazard_penalty_seconds']",
        "route_item['hazard_count']",
        "route_item['hazards']"
    ]
    all_fields_found = all(field in content for field in hazard_fields)
    if all_fields_found:
        print("✅ PASS: All hazard fields are assigned (hazard_penalty_seconds, hazard_count, hazards)")
        tests_passed += 1
    else:
        print("❌ FAIL: Not all hazard fields are assigned")
        tests_failed += 1
    
    # Test 6: Check for decode_route_geometry call
    print("\n[TEST 6] Checking for decode_route_geometry() call...")
    if re.search(r'route_geometry\s*=\s*decode_route_geometry\(route_item\.get\([\'"]polyline[\'"]\s*,\s*[\'"][\'"]\)\)', content):
        print("✅ PASS: decode_route_geometry() is called")
        tests_passed += 1
    else:
        print("❌ FAIL: decode_route_geometry() call not found")
        tests_failed += 1
    
    # Test 7: Check for sorted() call with hazard_penalty_seconds
    print("\n[TEST 7] Checking for route sorting by hazard penalty...")
    if re.search(r'sorted\(routes,\s*key=lambda\s+r:\s*\(r\.get\([\'"]hazard_penalty_seconds[\'"]\s*,\s*0\)', content):
        print("✅ PASS: Routes are sorted by hazard_penalty_seconds")
        tests_passed += 1
    else:
        print("❌ FAIL: Route sorting by hazard penalty not found")
        tests_failed += 1
    
    # Test 8: Check that hazard scoring is in custom router block
    print("\n[TEST 8] Checking that hazard scoring is in custom router success block...")
    # Find the custom router success block
    custom_router_pattern = r'Custom router succeeded.*?return jsonify\(response_data\)'
    custom_router_match = re.search(custom_router_pattern, content, re.DOTALL)
    if custom_router_match:
        custom_router_block = custom_router_match.group(0)
        if 'score_route_by_hazards' in custom_router_block:
            print("✅ PASS: Hazard scoring is in custom router success block")
            tests_passed += 1
        else:
            print("❌ FAIL: Hazard scoring not found in custom router success block")
            tests_failed += 1
    else:
        print("⚠️  WARNING: Could not find custom router success block")
        tests_failed += 1
    
    # Test 9: Check for debug logging
    print("\n[TEST 9] Checking for debug logging...")
    if '[HAZARDS] Custom router route:' in content:
        print("✅ PASS: Debug logging found for hazard scoring")
        tests_passed += 1
    else:
        print("❌ FAIL: Debug logging not found")
        tests_failed += 1
    
    # Test 10: Check for info logging of reordering
    print("\n[TEST 10] Checking for info logging of route reordering...")
    if '[HAZARDS] Custom router routes reordered by hazard penalty:' in content:
        print("✅ PASS: Info logging found for route reordering")
        tests_passed += 1
    else:
        print("❌ FAIL: Info logging for reordering not found")
        tests_failed += 1
    
    # Summary
    print("\n" + "=" * 80)
    print("TEST SUMMARY")
    print("=" * 80)
    print(f"✅ Tests Passed: {tests_passed}/10")
    print(f"❌ Tests Failed: {tests_failed}/10")
    
    if tests_failed == 0:
        print("\n🎉 ALL TESTS PASSED! Hazard avoidance integration is complete.")
        return True
    else:
        print(f"\n⚠️  {tests_failed} test(s) failed. Please review the integration.")
        return False

if __name__ == '__main__':
    success = test_hazard_avoidance_integration()
    exit(0 if success else 1)


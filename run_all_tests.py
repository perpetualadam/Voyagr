#!/usr/bin/env python3
"""
Comprehensive Test Runner for Voyagr PWA
Runs all test suites and generates a summary report
"""

import subprocess
import sys
import os
from datetime import datetime

# List of all test files (prioritized by importance)
TEST_FILES = [
    'test_phase5_integration.py',
    'test_pwa_phase3_features.py',
    'test_cost_analysis.py',
    'test_hazard_avoidance.py',
    'test_persistent_settings.py',
    'test_pwa_voice_features.py',
    'test_ml_features.py',
    'test_monitoring_system.py',
    'test_routing_engines.py',
]

def run_test_file(test_file):
    """Run a single test file and return results."""
    if not os.path.exists(test_file):
        return None
    
    print(f"\n{'='*70}")
    print(f"Running: {test_file}")
    print(f"{'='*70}")
    
    try:
        result = subprocess.run(
            [sys.executable, test_file],
            capture_output=True,
            text=True,
            timeout=120
        )
        
        # Parse output for test results
        output = result.stdout + result.stderr
        
        # Extract test count
        if 'passed' in output:
            # Find the summary line
            for line in output.split('\n'):
                if 'passed' in line and '==' in line:
                    print(line)
                    return True
        
        return False
    except subprocess.TimeoutExpired:
        print(f"❌ TIMEOUT: {test_file}")
        return False
    except Exception as e:
        print(f"❌ ERROR: {test_file} - {str(e)}")
        return False

def main():
    """Run all tests and generate report."""
    print(f"\n{'='*70}")
    print(f"VOYAGR PWA - COMPREHENSIVE TEST SUITE")
    print(f"Started: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"{'='*70}")
    
    results = {}
    total_passed = 0
    total_failed = 0
    
    for test_file in TEST_FILES:
        result = run_test_file(test_file)
        results[test_file] = result
        
        if result is True:
            total_passed += 1
        elif result is False:
            total_failed += 1
    
    # Print summary
    print(f"\n{'='*70}")
    print(f"TEST SUMMARY")
    print(f"{'='*70}")
    
    for test_file, result in results.items():
        if result is None:
            status = "⏭️  SKIPPED (file not found)"
        elif result is True:
            status = "✅ PASSED"
        else:
            status = "❌ FAILED"
        
        print(f"{test_file:40} {status}")
    
    print(f"\n{'='*70}")
    print(f"RESULTS: {total_passed} passed, {total_failed} failed")
    print(f"Completed: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"{'='*70}\n")
    
    return 0 if total_failed == 0 else 1

if __name__ == '__main__':
    sys.exit(main())


#!/bin/bash
# CH External Testing Script for Linux/Mac
# Run all CH tests without interrupting the app

set -e

TEST="${1:-all}"
PARALLEL="${2:-false}"
VERBOSE="${3:-false}"

print_header() {
    echo ""
    echo "================================================================================"
    echo "$1"
    echo "================================================================================"
}

run_test() {
    local name=$1
    local script=$2
    local description=$3
    
    print_header "$name - $description"
    
    if [ "$VERBOSE" = "true" ]; then
        echo "Running: python $script"
        echo ""
    fi
    
    local start=$(date +%s)
    python "$script"
    local end=$(date +%s)
    local elapsed=$((end - start))
    
    echo ""
    echo "Completed in ${elapsed}s"
    echo ""
}

# Main execution
print_header "CH EXTERNAL TESTING SUITE"

if [ "$TEST" = "all" ] || [ "$TEST" = "verify" ]; then
    run_test "TEST 1" "test_ch_routing_v2.py" "Verify CH Index"
fi

if [ "$TEST" = "all" ] || [ "$TEST" = "routes" ]; then
    run_test "TEST 2" "test_ch_external.py" "Test Real Routes"
fi

if [ "$TEST" = "all" ] || [ "$TEST" = "benchmark" ]; then
    run_test "TEST 3" "test_ch_performance.py" "Benchmark Performance"
fi

if [ "$TEST" = "all" ] || [ "$TEST" = "diagnostics" ]; then
    run_test "TEST 4" "test_ch_diagnostics.py" "Full Diagnostics"
fi

print_header "ALL TESTS COMPLETE"
echo "Summary:"
echo "  - CH Index verified"
echo "  - Real routes tested"
echo "  - Performance benchmarked"
echo "  - System diagnostics checked"
echo ""


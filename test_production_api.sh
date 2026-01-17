#!/bin/bash
# Test Snap to Roads API with multiple UK locations

echo "======================================================================="
echo "TESTING SNAP TO ROADS API - MULTIPLE UK LOCATIONS"
echo "======================================================================="

# Test locations across the UK
declare -a locations=(
    "51.5074:-0.1278:London (Central)"
    "53.4808:-2.2426:Manchester"
    "52.4862:-1.8904:Birmingham"
    "55.9533:-3.1883:Edinburgh"
    "51.4545:-2.5879:Bristol"
    "53.8008:-1.5491:Leeds"
    "51.3811:-2.3590:Bath"
)

success_count=0
failure_count=0

for location in "${locations[@]}"; do
    IFS=':' read -r lat lon name <<< "$location"
    
    echo ""
    echo "-----------------------------------------------------------------------"
    echo "Testing: $name (Lat: $lat, Lon: $lon)"
    echo "-----------------------------------------------------------------------"
    
    # Make API request
    response=$(curl -s "http://localhost:5000/api/speed-limit?lat=$lat&lon=$lon&road_type=residential")
    
    # Check if successful
    success=$(echo "$response" | jq -r '.success')
    
    if [ "$success" = "true" ]; then
        speed_mph=$(echo "$response" | jq -r '.data.speed_limit_mph')
        speed_kmh=$(echo "$response" | jq -r '.data.speed_limit_kmh')
        echo "✅ SUCCESS: $speed_mph mph ($speed_kmh km/h)"
        ((success_count++))
    else
        echo "❌ FAILED"
        echo "$response" | jq '.'
        ((failure_count++))
    fi
done

echo ""
echo "======================================================================="
echo "TEST SUMMARY"
echo "======================================================================="
echo "Total locations tested: ${#locations[@]}"
echo "Successful: $success_count"
echo "Failed: $failure_count"
echo ""

# Get metrics
echo "-----------------------------------------------------------------------"
echo "API METRICS"
echo "-----------------------------------------------------------------------"
curl -s "http://localhost:5000/api/speed-limit/metrics" | jq '.data | {
    snap_to_roads: .tomtom_snap_to_roads,
    traffic_flow: .tomtom_traffic_flow,
    cache: .cache
}'

echo ""
echo "======================================================================="
if [ $failure_count -eq 0 ]; then
    echo "✅ ALL TESTS PASSED!"
else
    echo "⚠️  SOME TESTS FAILED"
fi
echo "======================================================================="


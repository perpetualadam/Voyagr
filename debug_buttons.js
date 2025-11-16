/**
 * Debug script to test Route Preview buttons
 * Run this in browser console after calculating a route
 */

console.log('=== ROUTE PREVIEW BUTTONS DEBUG ===\n');

// Test 1: Check if functions exist
console.log('1. FUNCTION EXISTENCE:');
console.log('  findParkingNearDestination:', typeof findParkingNearDestination);
console.log('  showRouteComparison:', typeof showRouteComparison);
console.log('  switchTab:', typeof switchTab);
console.log('  startNavigationFromPreview:', typeof startNavigationFromPreview);
console.log('  overviewRoute:', typeof overviewRoute);

// Test 2: Check if HTML elements exist
console.log('\n2. HTML ELEMENTS:');
console.log('  routePreviewTab:', !!document.getElementById('routePreviewTab'));
console.log('  routeComparisonTab:', !!document.getElementById('routeComparisonTab'));
console.log('  navigationTab:', !!document.getElementById('navigationTab'));

// Test 3: Check route data
console.log('\n3. ROUTE DATA:');
console.log('  routeOptions:', routeOptions);
console.log('  routeOptions.length:', routeOptions ? routeOptions.length : 'undefined');
console.log('  lastCalculatedRoute:', window.lastCalculatedRoute);

// Test 4: Check parking elements
console.log('\n4. PARKING ELEMENTS:');
console.log('  parkingMaxWalkingDistance:', !!document.getElementById('parkingMaxWalkingDistance'));
console.log('  parkingPreferredType:', !!document.getElementById('parkingPreferredType'));
console.log('  parkingSection:', !!document.getElementById('parkingSection'));

// Test 5: Manually test each button
console.log('\n5. MANUAL BUTTON TESTS:');

console.log('\n  Testing switchTab("routeComparison"):');
try {
    switchTab('routeComparison');
    console.log('    ✅ switchTab executed');
    console.log('    routeComparisonTab display:', document.getElementById('routeComparisonTab').style.display);
} catch (e) {
    console.log('    ❌ Error:', e.message);
}

console.log('\n  Testing switchTab("navigation"):');
try {
    switchTab('navigation');
    console.log('    ✅ switchTab executed');
    console.log('    navigationTab display:', document.getElementById('navigationTab').style.display);
} catch (e) {
    console.log('    ❌ Error:', e.message);
}

console.log('\n  Testing showRouteComparison():');
try {
    if (routeOptions && routeOptions.length >= 2) {
        showRouteComparison();
        console.log('    ✅ showRouteComparison executed');
    } else {
        console.log('    ⚠️  Not enough routes to compare:', routeOptions ? routeOptions.length : 0);
    }
} catch (e) {
    console.log('    ❌ Error:', e.message);
}

console.log('\n  Testing findParkingNearDestination():');
try {
    if (window.lastCalculatedRoute) {
        findParkingNearDestination();
        console.log('    ✅ findParkingNearDestination executed');
    } else {
        console.log('    ⚠️  No route calculated');
    }
} catch (e) {
    console.log('    ❌ Error:', e.message);
}

console.log('\n=== END DEBUG ===');


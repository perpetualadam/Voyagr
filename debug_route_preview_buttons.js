/**
 * Debug script for Route Preview buttons
 * Run this in browser console (F12) after calculating a route
 */

console.log('=== ROUTE PREVIEW BUTTONS DIAGNOSTIC ===\n');

// Check if functions exist
console.log('1. FUNCTION EXISTENCE:');
console.log('  ✓ overviewRoute:', typeof overviewRoute === 'function' ? '✅ EXISTS' : '❌ MISSING');
console.log('  ✓ startNavigationFromPreview:', typeof startNavigationFromPreview === 'function' ? '✅ EXISTS' : '❌ MISSING');
console.log('  ✓ findParkingNearDestination:', typeof findParkingNearDestination === 'function' ? '✅ EXISTS' : '❌ MISSING');
console.log('  ✓ showRouteComparison:', typeof showRouteComparison === 'function' ? '✅ EXISTS' : '❌ MISSING');
console.log('  ✓ switchTab:', typeof switchTab === 'function' ? '✅ EXISTS' : '❌ MISSING');

// Check required data
console.log('\n2. REQUIRED DATA:');
console.log('  ✓ window.lastCalculatedRoute:', window.lastCalculatedRoute ? '✅ EXISTS' : '❌ MISSING');
console.log('  ✓ routeOptions:', routeOptions ? `✅ EXISTS (${routeOptions.length} routes)` : '❌ MISSING');
console.log('  ✓ routePath:', routePath ? `✅ EXISTS (${routePath.length} points)` : '❌ MISSING');

// Check button elements
console.log('\n3. BUTTON ELEMENTS:');
const buttons = [
    { selector: 'button[onclick="overviewRoute()"]', name: 'Overview Route' },
    { selector: 'button[onclick="startNavigationFromPreview()"]', name: 'Start Navigation' },
    { selector: 'button[onclick="findParkingNearDestination()"]', name: 'Find Parking' },
    { selector: 'button[onclick="showRouteComparison()"]', name: 'Compare Routes' },
    { selector: 'button[onclick*="switchTab(\'routeComparison\')"]', name: 'View Options' },
    { selector: 'button[onclick*="switchTab(\'navigation\')"]', name: 'Modify Route' }
];

buttons.forEach(btn => {
    const element = document.querySelector(btn.selector);
    console.log(`  ✓ ${btn.name}:`, element ? '✅ FOUND' : '❌ NOT FOUND');
    if (element) {
        console.log(`    - Visible:`, element.offsetParent !== null ? '✅ YES' : '❌ HIDDEN');
        console.log(`    - Disabled:`, element.disabled ? '❌ YES' : '✅ NO');
    }
});

// Test each function
console.log('\n4. FUNCTION TESTS:');

console.log('  Testing overviewRoute():');
if (typeof overviewRoute === 'function') {
    if (routePath && routePath.length > 0) {
        console.log('    ✅ Can be called (routePath exists)');
    } else {
        console.log('    ⚠️  Will fail - routePath is empty');
    }
} else {
    console.log('    ❌ Function does not exist');
}

console.log('  Testing startNavigationFromPreview():');
if (typeof startNavigationFromPreview === 'function') {
    if (window.lastCalculatedRoute) {
        console.log('    ✅ Can be called (route exists)');
    } else {
        console.log('    ⚠️  Will fail - no route calculated');
    }
} else {
    console.log('    ❌ Function does not exist');
}

console.log('  Testing findParkingNearDestination():');
if (typeof findParkingNearDestination === 'function') {
    if (window.lastCalculatedRoute) {
        const endInput = document.getElementById('end')?.value;
        if (endInput) {
            console.log('    ✅ Can be called (route + destination exist)');
        } else {
            console.log('    ⚠️  Will fail - no destination entered');
        }
    } else {
        console.log('    ⚠️  Will fail - no route calculated');
    }
} else {
    console.log('    ❌ Function does not exist');
}

console.log('  Testing showRouteComparison():');
if (typeof showRouteComparison === 'function') {
    if (routeOptions && routeOptions.length > 0) {
        console.log(`    ✅ Can be called (${routeOptions.length} routes available)`);
    } else {
        console.log('    ⚠️  Will fail - no routes in routeOptions');
    }
} else {
    console.log('    ❌ Function does not exist');
}

// Check route preview tab visibility
console.log('\n5. ROUTE PREVIEW TAB:');
const previewTab = document.getElementById('routePreview');
if (previewTab) {
    console.log('  ✓ Tab element:', '✅ EXISTS');
    console.log('  ✓ Visible:', previewTab.style.display !== 'none' ? '✅ YES' : '❌ HIDDEN');
} else {
    console.log('  ✓ Tab element:', '❌ NOT FOUND');
}

console.log('\n=== DIAGNOSTIC COMPLETE ===');
console.log('\nRECOMMENDATIONS:');
if (!window.lastCalculatedRoute) {
    console.log('⚠️  Calculate a route first to enable all buttons');
}
if (!routeOptions || routeOptions.length === 0) {
    console.log('⚠️  routeOptions is empty - Compare Routes button will not work');
}
if (!routePath || routePath.length === 0) {
    console.log('⚠️  routePath is empty - Overview Route button will not work');
}


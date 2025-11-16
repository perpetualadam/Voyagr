/**
 * Comprehensive UI Element Testing Script for Voyagr PWA
 * Run this in browser console to test all interactive elements
 */

console.log('=== VOYAGR UI ELEMENT TEST SUITE ===\n');

// Test 1: Route Preview Screen Buttons
console.log('TEST 1: Route Preview Screen Buttons');
const routePreviewButtons = [
    { id: 'startNavBtn', name: 'Start Navigation (FAB)' },
    { id: 'startNavBtnSheet', name: 'Go Now - Start Navigation (Sheet)' }
];

routePreviewButtons.forEach(btn => {
    const element = document.getElementById(btn.id);
    console.log(`  ${btn.name}: ${element ? '✅ EXISTS' : '❌ MISSING'}`);
    if (element) {
        console.log(`    - onclick handler: ${element.onclick ? '✅ YES' : '❌ NO'}`);
        console.log(`    - visible: ${element.style.display !== 'none' ? '✅ YES' : '❌ NO (hidden)'}`);
    }
});

// Test 2: Settings Tab Hazard Toggles
console.log('\nTEST 2: Settings Tab Hazard Avoidance Toggles');
const hazardToggles = [
    { id: 'avoidTolls', pref: 'tolls' },
    { id: 'avoidCAZ', pref: 'caz' },
    { id: 'avoidSpeedCameras', pref: 'speedCameras' },
    { id: 'avoidTrafficCameras', pref: 'trafficCameras' },
    { id: 'variableSpeedAlerts', pref: 'variableSpeedAlerts' }
];

hazardToggles.forEach(toggle => {
    const element = document.getElementById(toggle.id);
    const stored = localStorage.getItem('pref_' + toggle.pref);
    console.log(`  ${toggle.id}:`);
    console.log(`    - exists: ${element ? '✅ YES' : '❌ NO'}`);
    if (element) {
        console.log(`    - onclick: ${element.onclick ? '✅ YES' : '❌ NO'}`);
        console.log(`    - data-pref: ${element.dataset.pref ? '✅ YES' : '❌ NO'}`);
        console.log(`    - localStorage: ${stored ? `✅ ${stored}` : '❌ NOT SET'}`);
    }
});

// Test 3: Unit Preference Selectors
console.log('\nTEST 3: Unit Preference Selectors');
const unitSelectors = [
    { id: 'distanceUnit', name: 'Distance Unit' },
    { id: 'speedUnit', name: 'Speed Unit' },
    { id: 'temperatureUnit', name: 'Temperature Unit' },
    { id: 'currencyUnit', name: 'Currency Unit' }
];

unitSelectors.forEach(selector => {
    const element = document.getElementById(selector.id);
    console.log(`  ${selector.name}:`);
    console.log(`    - exists: ${element ? '✅ YES' : '❌ NO'}`);
    if (element) {
        console.log(`    - onchange: ${element.onchange ? '✅ YES' : '❌ NO'}`);
        console.log(`    - value: ${element.value}`);
    }
});

// Test 4: Route Preference Checkboxes
console.log('\nTEST 4: Route Preference Checkboxes');
const routeCheckboxes = [
    { id: 'avoidHighways', name: 'Avoid Highways' },
    { id: 'preferScenic', name: 'Prefer Scenic' },
    { id: 'preferQuiet', name: 'Prefer Quiet' },
    { id: 'avoidUnpaved', name: 'Avoid Unpaved' }
];

routeCheckboxes.forEach(checkbox => {
    const element = document.getElementById(checkbox.id);
    console.log(`  ${checkbox.name}:`);
    console.log(`    - exists: ${element ? '✅ YES' : '❌ NO'}`);
    if (element) {
        console.log(`    - onchange: ${element.onchange ? '✅ YES' : '❌ NO'}`);
        console.log(`    - checked: ${element.checked ? '✅ YES' : '❌ NO'}`);
    }
});

// Test 5: Route Preview Action Buttons
console.log('\nTEST 5: Route Preview Action Buttons');
const actionButtons = [
    { selector: 'button[onclick="overviewRoute()"]', name: 'Overview Route' },
    { selector: 'button[onclick="startNavigationFromPreview()"]', name: 'Start Navigation' },
    { selector: 'button[onclick="findParkingNearDestination()"]', name: 'Find Parking' },
    { selector: 'button[onclick="showRouteComparison()"]', name: 'Compare Routes' },
    { selector: 'button[onclick="switchTab(\'routeComparison\')"]', name: 'View Options' },
    { selector: 'button[onclick="switchTab(\'navigation\')"]', name: 'Modify Route' }
];

actionButtons.forEach(btn => {
    const element = document.querySelector(btn.selector);
    console.log(`  ${btn.name}: ${element ? '✅ EXISTS' : '❌ MISSING'}`);
});

console.log('\n=== TEST COMPLETE ===');


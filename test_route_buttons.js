/**
 * Quick test for route preview buttons
 * Paste this in browser console after calculating a route
 */

console.log('=== TESTING ROUTE PREVIEW BUTTONS ===\n');

// Find all buttons in route preview
const previewTab = document.getElementById('routePreviewTab');
if (!previewTab) {
    console.error('❌ Route preview tab not found!');
} else {
    console.log('✅ Route preview tab found');
    
    // Get all buttons
    const buttons = previewTab.querySelectorAll('button');
    console.log(`\nFound ${buttons.length} buttons in route preview:\n`);
    
    buttons.forEach((btn, index) => {
        const text = btn.textContent.trim();
        const onclick = btn.getAttribute('onclick');
        const visible = btn.offsetParent !== null;
        const disabled = btn.disabled;
        
        console.log(`${index + 1}. "${text}"`);
        console.log(`   onclick: ${onclick || 'NONE'}`);
        console.log(`   visible: ${visible ? '✅ YES' : '❌ NO'}`);
        console.log(`   disabled: ${disabled ? '❌ YES' : '✅ NO'}`);
        console.log('');
    });
}

// Test clicking each button
console.log('\n=== CLICK TEST ===');
console.log('Try clicking each button manually and watch for:');
console.log('1. Console logs starting with the function name');
console.log('2. Any error messages');
console.log('3. Expected behavior (tab switch, map zoom, etc.)');
console.log('\nIf nothing happens when you click, there may be:');
console.log('- A JavaScript error preventing execution');
console.log('- An overlay blocking the button');
console.log('- The button is disabled');

// Check for overlays
const overlays = document.querySelectorAll('[style*="z-index"]');
console.log(`\n${overlays.length} elements with z-index found`);

// Check bottom sheet state
const bottomSheet = document.querySelector('.bottom-sheet');
if (bottomSheet) {
    console.log('\nBottom sheet classes:', bottomSheet.className);
    console.log('Bottom sheet display:', window.getComputedStyle(bottomSheet).display);
}


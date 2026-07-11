/**
 * Tests for modules/map/map-controls.js
 */
const MC = require('../modules/map/map-controls.js');

describe('map-controls module', () => {
    test('exposes zoom follow and journey overview icons', () => {
        expect(MC.ZOOM_FOLLOW_ENABLED_ICON).toBe('📍');
        expect(MC.ZOOM_FOLLOW_DISABLED_ICON).toBe('🔓');
        expect(MC.JOURNEY_OVERVIEW_ICON).toBe('🗺️');
        expect(MC.JOURNEY_RETURN_ICON).toBe('📍');
    });
});

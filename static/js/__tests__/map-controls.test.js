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
        expect(MC.AR_ACTIVE_LABEL).toContain('Exit AR');
        expect(MC.AR_INACTIVE_LABEL).toContain('AR View');
    });

    test('exposes journey overview button background colours', () => {
        expect(MC.JOURNEY_OVERVIEW_ACTIVE_BACKGROUND).toBe('#4CAF50');
        expect(MC.JOURNEY_OVERVIEW_INACTIVE_BACKGROUND).toBe('#9C27B0');
    });

    test('getZoomFollowButtonDisplay and getJourneyOverviewButtonDisplay', () => {
        const on = MC.getZoomFollowButtonDisplay(true);
        expect(on.background).toBe('#FF9800');
        expect(on.innerHtml).toBe(MC.ZOOM_FOLLOW_ENABLED_ICON);
        const off = MC.getZoomFollowButtonDisplay(false);
        expect(off.background).toBe('#9E9E9E');
        const overview = MC.getJourneyOverviewButtonDisplay(true);
        expect(overview.innerHtml).toBe(MC.JOURNEY_RETURN_ICON);
        expect(overview.title).toContain('Return');
    });
});

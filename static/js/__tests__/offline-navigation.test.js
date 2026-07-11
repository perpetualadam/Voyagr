/**
 * Tests for modules/navigation/offline-navigation.js
 */
const OFF = require('../modules/navigation/offline-navigation.js');

describe('offline-navigation module', () => {
    test('exposes banner ids and style builders', () => {
        expect(OFF.OFFLINE_BANNER_ID).toBe('offlineBanner');
        expect(OFF.RESUME_NAV_BANNER_ID).toBe('resumeNavBanner');
        expect(OFF.getOfflineBannerStyleCssText()).toContain('position:fixed');
        expect(OFF.getResumeNavigationBannerStyleCssText()).toContain('bottom:80px');
    });

    test('buildOfflineBannerInnerHtml includes offline message', () => {
        const html = OFF.buildOfflineBannerInnerHtml();
        expect(html).toContain('offline');
        expect(html).toContain('📡');
    });

    test('buildResumeNavigationBannerHtml includes step count and buttons', () => {
        const html = OFF.buildResumeNavigationBannerHtml(12);
        expect(html).toContain('Resume navigation?');
        expect(html).toContain('12 steps');
        expect(html).toContain('resumeNavYes');
        expect(html).toContain('resumeNavNo');
    });
});

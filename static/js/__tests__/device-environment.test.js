/**
 * Tests for modules/ui/device-environment.js
 */
const DE = require('../modules/ui/device-environment.js');

describe('device-environment module', () => {
    test('exposes environment hint messages and throttle constant', () => {
        expect(DE.ENV_HINT_MIN_MS).toBe(45000);
        expect(DE.ENV_HINT_MESSAGES.offline.title).toBe('No internet connection');
        expect(DE.ENV_HINT_MESSAGES.online.type).toBe('success');
        expect(DE.ENV_HINT_MESSAGES.gps.message).toContain('location access');
    });

    test('buildInAppNotificationHtml includes title, message, and dismiss button', () => {
        const html = DE.buildInAppNotificationHtml('Offline', 'No connection');
        expect(html).toContain('Offline');
        expect(html).toContain('No connection');
        expect(html).toContain('parentElement.parentElement.remove');
    });

    test('buildVolumeHintBannerHtml includes dismiss and OK controls', () => {
        const html = DE.buildVolumeHintBannerHtml(DE.VOLUME_HINT.line, DE.VOLUME_HINT.detail);
        expect(html).toContain('volumeHintDismiss');
        expect(html).toContain('volumeHintOk');
        expect(html).toContain('Check volume');
        expect(html).toContain(DE.VOLUME_HINT.line);
    });

    test('getVolumeHintBannerStyleCssText positions banner above bottom sheet', () => {
        expect(DE.getVolumeHintBannerStyleCssText()).toContain('position:fixed');
        expect(DE.getVolumeHintBannerStyleCssText()).toContain('safe-area-inset-bottom');
    });
});

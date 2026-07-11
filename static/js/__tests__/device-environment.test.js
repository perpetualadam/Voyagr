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

    test('buildShowVolumeHintExecutePlan includes spoken line when voice is enabled', () => {
        const on = DE.buildShowVolumeHintExecutePlan({ voiceAnnouncementsEnabled: true });
        expect(on.speakIfVoiceEnabled).toBe(true);
        expect(on.bannerHtml).toContain('Check volume');
        expect(on.autoDismissMs).toBe(DE.VOLUME_HINT.autoDismissMs);

        const off = DE.buildShowVolumeHintExecutePlan({ voiceAnnouncementsEnabled: false });
        expect(off.speakIfVoiceEnabled).toBe(false);
    });

    test('buildNavStartVolumeHintSchedulePlan defaults nav-start delay', () => {
        const schedule = DE.buildNavStartVolumeHintSchedulePlan({ delayMs: 2600 });
        expect(schedule.shouldSchedule).toBe(true);
        expect(schedule.delayMs).toBe(2600);
        expect(schedule.action).toBe('showVolumeHintForNavigation');
    });

    test('buildOpenVolumeHintSchedulePlan runs once per tab session', () => {
        const first = DE.buildOpenVolumeHintSchedulePlan({ alreadyShown: false });
        expect(first.shouldSchedule).toBe(true);
        expect(first.sessionStorageKey).toBe(DE.OPEN_VOLUME_HINT_SESSION_KEY);
        expect(first.delayMs).toBe(1800);

        const again = DE.buildOpenVolumeHintSchedulePlan({ alreadyShown: true });
        expect(again.shouldSchedule).toBe(false);
    });
});

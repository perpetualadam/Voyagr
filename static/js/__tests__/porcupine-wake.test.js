/**
 * Tests for modules/navigation/porcupine-wake.js
 */
const PW = require('../modules/navigation/porcupine-wake.js');

describe('porcupine-wake module', () => {
    test('isPicovoiceClientConfigured requires all client assets', () => {
        expect(PW.isPicovoiceClientConfigured({
            assetsOk: true,
            accessKey: ' key ',
            hasPorcupineWeb: true,
            hasWebVoiceProcessor: true,
        })).toBe(true);
        expect(PW.isPicovoiceClientConfigured({
            assetsOk: false,
            accessKey: 'key',
            hasPorcupineWeb: true,
            hasWebVoiceProcessor: true,
        })).toBe(false);
        expect(PW.isPicovoiceClientConfigured({
            assetsOk: true,
            accessKey: '   ',
            hasPorcupineWeb: true,
            hasWebVoiceProcessor: true,
        })).toBe(false);
    });

    test('buildLoadPorcupineWakeUiExecutePlan hides UI when not configured', () => {
        const hidden = PW.buildLoadPorcupineWakeUiExecutePlan({ configured: false });
        expect(hidden.hideRow).toBe(true);
        expect(hidden.hideHelp).toBe(true);

        const shown = PW.buildLoadPorcupineWakeUiExecutePlan({ configured: true, enabled: true });
        expect(shown.showRow).toBe(true);
        expect(shown.toggle.enabled).toBe(true);
    });

    test('buildTogglePorcupineWakeWord plans flip enabled state and side effects', () => {
        const collected = PW.buildTogglePorcupineWakeWordCollectPlan({ currentEnabled: false });
        expect(collected.enabled).toBe(true);
        expect(collected.storageValue).toBe('true');

        const execute = PW.buildTogglePorcupineWakeWordExecutePlan({ enabled: true });
        expect(execute.startPipeline).toBe(true);
        expect(execute.stopPipeline).toBe(false);
        expect(execute.storageKey).toBe(PW.VOYAGR_PORCUPINE_WAKE_STORAGE_KEY);

        const disable = PW.buildTogglePorcupineWakeWordExecutePlan({ enabled: false });
        expect(disable.stopPipeline).toBe(true);
        expect(disable.clearResumeAfterVoice).toBe(true);
    });
});

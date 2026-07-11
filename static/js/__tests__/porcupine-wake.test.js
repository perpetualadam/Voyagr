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

    test('buildPorcupinePipelinePreflightPlan blocks non-HTTPS origins', () => {
        const blocked = PW.buildPorcupinePipelinePreflightPlan({
            configured: true,
            storageEnabled: true,
            pipelineRunning: false,
            starting: false,
            protocol: 'http:',
            hostname: 'example.com',
        });
        expect(blocked.shouldStart).toBe(false);
        expect(blocked.reason).toBe('needs_https');

        const allowed = PW.buildPorcupinePipelinePreflightPlan({
            configured: true,
            storageEnabled: true,
            pipelineRunning: false,
            starting: false,
            protocol: 'https:',
            hostname: 'example.com',
        });
        expect(allowed.shouldStart).toBe(true);
    });

    test('buildWarmPicovoiceStaticCachePlan requires service worker controller', () => {
        expect(PW.buildWarmPicovoiceStaticCachePlan({
            hasServiceWorker: true,
            online: true,
            controllerPresent: false,
        }).shouldWarm).toBe(false);
        const warm = PW.buildWarmPicovoiceStaticCachePlan({
            hasServiceWorker: true,
            online: true,
            controllerPresent: true,
        });
        expect(warm.shouldWarm).toBe(true);
        expect(warm.warmUrls.length).toBeGreaterThan(2);
    });

    test('buildStopPorcupineWakePipelineExecutePlan describes teardown steps', () => {
        const execute = PW.buildStopPorcupineWakePipelineExecutePlan({
            hasBridgeEngine: true,
            hasWorker: true,
        });
        expect(execute.shouldStop).toBe(true);
        expect(execute.unsubscribeBridge).toBe(true);
        expect(execute.terminateWorker).toBe(true);
    });
});

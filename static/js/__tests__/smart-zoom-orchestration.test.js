/**
 * @file Tests for smart-zoom orchestration turn-distance cache helpers.
 */

describe('smart-zoom-orchestration turn distance cache', () => {
    let SmartZoom;

    beforeEach(() => {
        jest.resetModules();
        localStorage.clear();
        global.VoyagrSmartZoom = {
            resolveSmartZoomEnabledFromStorage: (v) => v === null || v === undefined || v === '1' || v === 'true',
        };
        SmartZoom = require('../app/smart-zoom-orchestration.js');
    });

    test('clearLastDistanceToNextTurn drops detect-tick cache and turn-zoom flag', () => {
        SmartZoom.setLastDistanceToNextTurn(120);
        SmartZoom.setLastTurnZoomApplied(true);

        expect(SmartZoom.getLastDistanceToNextTurn()).toBe(120);
        expect(SmartZoom.getLastTurnZoomApplied()).toBe(true);

        SmartZoom.clearLastDistanceToNextTurn();

        expect(SmartZoom.getLastDistanceToNextTurn()).toBeNull();
        expect(SmartZoom.getLastTurnZoomApplied()).toBe(false);
    });

    test('setLastDistanceToNextTurn rejects non-finite values', () => {
        SmartZoom.setLastDistanceToNextTurn(80);
        SmartZoom.setLastDistanceToNextTurn(NaN);
        expect(SmartZoom.getLastDistanceToNextTurn()).toBeNull();

        SmartZoom.setLastDistanceToNextTurn(40);
        SmartZoom.setLastDistanceToNextTurn(null);
        expect(SmartZoom.getLastDistanceToNextTurn()).toBeNull();
    });
});

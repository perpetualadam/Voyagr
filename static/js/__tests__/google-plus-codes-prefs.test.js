/**
 * Tests for modules/navigation/google-plus-codes-prefs.js
 */
const GPC = require('../modules/navigation/google-plus-codes-prefs.js');

describe('google-plus-codes-prefs module', () => {
    test('resolveGooglePlusCodesEnabledFromStorage defaults off', () => {
        expect(GPC.resolveGooglePlusCodesEnabledFromStorage(null)).toBe(false);
        expect(GPC.resolveGooglePlusCodesEnabledFromStorage('false')).toBe(false);
    });

    test('resolveGooglePlusCodesEnabledFromStorage accepts on values', () => {
        expect(GPC.resolveGooglePlusCodesEnabledFromStorage('true')).toBe(true);
        expect(GPC.resolveGooglePlusCodesEnabledFromStorage('1')).toBe(true);
    });

    test('buildToggleGooglePlusCodesExecutePlan persists and styles toggle', () => {
        const execute = GPC.buildToggleGooglePlusCodesExecutePlan({ enabled: true });
        expect(execute.toggleId).toBe(GPC.GOOGLE_PLUS_CODES_TOGGLE_ID);
        expect(execute.storageValue).toBe('true');
        expect(execute.toggleInactiveStyles.inactiveBackground).toBe('#ccc');
        expect(execute.saveAllSettings).toBe(true);
    });
});

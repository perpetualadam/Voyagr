/**
 * Tests for modules/navigation/battery-saving.js
 */
const BS = require('../modules/navigation/battery-saving.js');

describe('battery-saving module', () => {
    test('buildBatteryAutoEnablePlan triggers below threshold when disabled', () => {
        expect(BS.buildBatteryAutoEnablePlan({
            levelPercent: 10,
            currentlyEnabled: false,
        }).shouldEnable).toBe(true);
        expect(BS.buildBatteryAutoEnablePlan({
            levelPercent: 20,
            currentlyEnabled: false,
        }).shouldEnable).toBe(false);
        expect(BS.buildBatteryAutoEnablePlan({
            levelPercent: 10,
            currentlyEnabled: true,
        }).shouldEnable).toBe(false);
    });

    test('buildToggleBatterySavingCollectPlan flips mode', () => {
        expect(BS.buildToggleBatterySavingCollectPlan(false)).toEqual({
            enabled: true,
            enable: true,
            disable: false,
        });
        expect(BS.buildToggleBatterySavingCollectPlan(true)).toEqual({
            enabled: false,
            enable: false,
            disable: true,
        });
    });

    test('enable and disable execute plans persist storage and API body', () => {
        const enable = BS.buildEnableBatterySavingExecutePlan();
        expect(enable.batterySavingMode).toBe(true);
        expect(enable.storageKey).toBe(BS.BATTERY_SAVING_STORAGE_KEY);
        expect(enable.persistApiBody).toEqual({ battery_saving_mode: 1 });
        expect(enable.disableBodyAnimation).toBe(true);

        const disable = BS.buildDisableBatterySavingExecutePlan();
        expect(disable.batterySavingMode).toBe(false);
        expect(disable.persistApiBody).toEqual({ battery_saving_mode: 0 });
        expect(disable.restoreBodyAnimation).toBe(true);
    });
});

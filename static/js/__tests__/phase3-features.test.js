/**
 * Tests for modules/navigation/phase3-features.js
 */
const P3 = require('../modules/navigation/phase3-features.js');

describe('phase3-features module', () => {
    test('buildInitPhase3FeaturesOrchestrationPlan wires all init steps once', () => {
        const plan = P3.buildInitPhase3FeaturesOrchestrationPlan();
        expect(plan.shouldInit).toBe(true);
        expect(plan.initFlagProperty).toBe(P3.INIT_FLAG_PROPERTY);
        expect(plan.loadGestureFromApi).toBe(false);
        expect(plan.initBatteryMonitoring).toBe(true);
        expect(plan.loadMlPredictions).toBe(true);
        expect(plan.loadArSetting).toBe(true);
    });

    test('buildInitBatteryMonitoringPlan only inits when getBattery exists', () => {
        expect(P3.buildInitBatteryMonitoringPlan({ hasGetBattery: true })).toEqual({
            shouldInit: true,
            listeners: ['levelchange', 'chargingchange'],
        });
        expect(P3.buildInitBatteryMonitoringPlan({ hasGetBattery: false })).toEqual({
            shouldInit: false,
            listeners: ['levelchange', 'chargingchange'],
        });
    });

    test('buildLoadArSettingExecutePlan targets AR toggle with switch opts', () => {
        const plan = P3.buildLoadArSettingExecutePlan();
        expect(plan.shouldApply).toBe(true);
        expect(plan.toggleId).toBe('arToggleBtn');
        expect(plan.readFromStorage).toBe(true);
        expect(plan.useToggleSwitchOpts).toBe(true);
    });
});

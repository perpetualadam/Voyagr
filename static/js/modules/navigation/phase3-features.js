/**
 * @file Pure Phase 3 feature init orchestration plans (no DOM, no network).
 * @module modules/navigation/phase3-features
 */
(function (root) {
    'use strict';

    var INIT_FLAG_PROPERTY = '__voyagrPhase3Initialized';

    /**
     * @returns {Object}
     */
    function buildInitPhase3FeaturesOrchestrationPlan() {
        return {
            shouldInit: true,
            initFlagProperty: INIT_FLAG_PROPERTY,
            loadGestureFromApi: false,
            initBatteryMonitoring: true,
            loadMlPredictions: true,
            loadArSetting: true,
        };
    }

    /**
     * @param {Object} [input]
     * @param {boolean} [input.hasGetBattery]
     * @returns {Object}
     */
    function buildInitBatteryMonitoringPlan(input) {
        input = input || {};
        return {
            shouldInit: !!input.hasGetBattery,
            listeners: ['levelchange', 'chargingchange'],
        };
    }

    /**
     * @param {Object} [input]
     * @returns {Object}
     */
    function buildLoadArSettingExecutePlan(input) {
        input = input || {};
        return {
            shouldApply: true,
            toggleId: 'arToggleBtn',
            readFromStorage: true,
            useToggleSwitchOpts: true,
        };
    }

    var api = {
        INIT_FLAG_PROPERTY: INIT_FLAG_PROPERTY,
        buildInitPhase3FeaturesOrchestrationPlan: buildInitPhase3FeaturesOrchestrationPlan,
        buildInitBatteryMonitoringPlan: buildInitBatteryMonitoringPlan,
        buildLoadArSettingExecutePlan: buildLoadArSettingExecutePlan,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    root.VoyagrPhase3Features = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

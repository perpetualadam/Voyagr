/**
 * @file Pure ML prediction list HTML builders (no DOM, no network).
 * @module modules/navigation/ml-predictions
 */
(function (root) {
    'use strict';

    var ML_PREDICTION_ITEM_CLASS = 'ml-prediction-item';
    var ML_PREDICTIONS_STORAGE_KEY = 'mlPredictionsEnabled';
    var ML_PREDICTIONS_SECTION_SHOW_CLASS = 'show';

    /**
     * @param {Object} pred
     * @returns {string}
     */
    function buildMlPredictionItemHtml(pred) {
        pred = pred || {};
        return (
            '<span class="ml-prediction-label">' + (pred.label || '') + '</span>' +
            '<span class="ml-prediction-details">' + (pred.details || '') + '</span>'
        );
    }

    /**
     * @param {Object} data
     * @returns {boolean}
     */
    function hasMlPredictionsToShow(data) {
        data = data || {};
        return !!(data.success && data.predictions && data.predictions.length > 0);
    }

    /**
     * @param {Object} pred
     * @returns {{ start: string, end: string }}
     */
    function getMlPredictionRouteInputs(pred) {
        pred = pred || {};
        return {
            start: pred.start_address || '',
            end: pred.end_address || '',
        };
    }

    /**
     * @param {boolean} enabled
     * @returns {string}
     */
    function getMlPredictionsEnabledStatusMessage(enabled) {
        return enabled ? '🤖 Smart predictions enabled' : '🤖 Smart predictions disabled';
    }

    /**
     * @returns {Object}
     */
    function buildLoadMlPredictionsFetchPlan() {
        return {
            shouldFetch: true,
            url: '/api/ml-predictions',
            sectionId: 'mlPredictionsSection',
            listId: 'mlPredictionsList',
            startInputId: 'start',
            endInputId: 'end',
            errorLogPrefix: 'Error loading ML predictions:',
        };
    }

    /**
     * @param {Object} data
     * @returns {Object}
     */
    function buildLoadMlPredictionsDomRenderPlan(data) {
        data = data || {};
        if (!hasMlPredictionsToShow(data)) {
            return { shouldRender: false };
        }
        return {
            shouldRender: true,
            sectionShowClass: ML_PREDICTIONS_SECTION_SHOW_CLASS,
            items: (data.predictions || []).map(function (pred) {
                return {
                    className: ML_PREDICTION_ITEM_CLASS,
                    html: buildMlPredictionItemHtml(pred),
                    routeInputs: getMlPredictionRouteInputs(pred),
                };
            }),
        };
    }

    /**
     * @param {Object} [input]
     * @param {boolean} [input.currentEnabled]
     * @returns {Object}
     */
    function buildToggleMlPredictionsCollectPlan(input) {
        input = input || {};
        var enabled = !input.currentEnabled;
        return {
            enabled: enabled,
            storageValue: enabled ? 'true' : 'false',
        };
    }

    /**
     * @param {Object} [input]
     * @param {boolean} [input.enabled]
     * @returns {Object}
     */
    function buildToggleMlPredictionsExecutePlan(input) {
        input = input || {};
        var enabled = !!input.enabled;
        return {
            shouldApply: true,
            enabled: enabled,
            toggle: {
                id: 'mlPredictionsEnabled',
                enabled: enabled,
            },
            storageKey: ML_PREDICTIONS_STORAGE_KEY,
            storageValue: enabled ? 'true' : 'false',
            persistApiBody: { ml_predictions_enabled: enabled ? 1 : 0 },
            loadPredictions: enabled,
            hideSection: !enabled,
            sectionId: 'mlPredictionsSection',
            sectionShowClass: ML_PREDICTIONS_SECTION_SHOW_CLASS,
            saveAllSettings: true,
            statusMessage: getMlPredictionsEnabledStatusMessage(enabled),
            statusType: enabled ? 'success' : 'info',
        };
    }

    var api = {
        ML_PREDICTION_ITEM_CLASS: ML_PREDICTION_ITEM_CLASS,
        ML_PREDICTIONS_STORAGE_KEY: ML_PREDICTIONS_STORAGE_KEY,
        ML_PREDICTIONS_SECTION_SHOW_CLASS: ML_PREDICTIONS_SECTION_SHOW_CLASS,
        buildMlPredictionItemHtml: buildMlPredictionItemHtml,
        hasMlPredictionsToShow: hasMlPredictionsToShow,
        getMlPredictionRouteInputs: getMlPredictionRouteInputs,
        getMlPredictionsEnabledStatusMessage: getMlPredictionsEnabledStatusMessage,
        buildLoadMlPredictionsFetchPlan: buildLoadMlPredictionsFetchPlan,
        buildLoadMlPredictionsDomRenderPlan: buildLoadMlPredictionsDomRenderPlan,
        buildToggleMlPredictionsCollectPlan: buildToggleMlPredictionsCollectPlan,
        buildToggleMlPredictionsExecutePlan: buildToggleMlPredictionsExecutePlan,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    root.VoyagrMlPredictions = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

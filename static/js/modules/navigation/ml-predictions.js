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

    var api = {
        ML_PREDICTION_ITEM_CLASS: ML_PREDICTION_ITEM_CLASS,
        ML_PREDICTIONS_STORAGE_KEY: ML_PREDICTIONS_STORAGE_KEY,
        ML_PREDICTIONS_SECTION_SHOW_CLASS: ML_PREDICTIONS_SECTION_SHOW_CLASS,
        buildMlPredictionItemHtml: buildMlPredictionItemHtml,
        hasMlPredictionsToShow: hasMlPredictionsToShow,
        getMlPredictionRouteInputs: getMlPredictionRouteInputs,
        getMlPredictionsEnabledStatusMessage: getMlPredictionsEnabledStatusMessage,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    root.VoyagrMlPredictions = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

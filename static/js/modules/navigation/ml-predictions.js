/**
 * @file Pure ML prediction list HTML builders (no DOM, no network).
 * @module modules/navigation/ml-predictions
 */
(function (root) {
    'use strict';

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

    var api = {
        buildMlPredictionItemHtml: buildMlPredictionItemHtml,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    root.VoyagrMlPredictions = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

/**
 * @file Pure road hazard report modal and submit plans (no DOM, no network).
 * @module modules/navigation/road-report
 */
(function (root) {
    'use strict';

    var ROAD_REPORT_MODAL_ID = 'roadReportModal';
    var ROAD_REPORT_NOTES_ID = 'roadReportNotes';
    var ROAD_REPORT_TYPE_ID = 'roadReportType';
    var ROAD_REPORT_API_PATH = '/api/hazards/report';

    var GPS_REQUIRED_STATUS = 'Turn on GPS or wait for a position fix before reporting.';
    var SUCCESS_STATUS = 'Thanks — report received.';

    /**
     * @returns {Object}
     */
    function buildOpenRoadReportModalExecutePlan() {
        return {
            shouldOpen: true,
            modalId: ROAD_REPORT_MODAL_ID,
            notesId: ROAD_REPORT_NOTES_ID,
            clearNotes: true,
            modalDisplay: 'block',
        };
    }

    /**
     * @returns {Object}
     */
    function buildCloseRoadReportModalExecutePlan() {
        return {
            shouldClose: true,
            modalId: ROAD_REPORT_MODAL_ID,
            modalDisplay: 'none',
        };
    }

    /**
     * @param {Object} [input]
     * @param {number|null|undefined} [input.lat]
     * @param {number|null|undefined} [input.lon]
     * @returns {Object}
     */
    function buildSubmitRoadReportCollectPlan(input) {
        input = input || {};
        var lat = input.lat;
        var lon = input.lon;
        var hasFix = lat != null && lon != null
            && Number.isFinite(lat) && Number.isFinite(lon);
        return {
            hasGpsFix: hasFix,
            lat: hasFix ? lat : null,
            lon: hasFix ? lon : null,
        };
    }

    /**
     * @param {Object} [input]
     * @param {number} [input.lat]
     * @param {number} [input.lon]
     * @param {string} [input.hazardType]
     * @param {string} [input.description]
     * @returns {Object}
     */
    function buildSubmitRoadReportFetchPlan(input) {
        input = input || {};
        var hazardType = input.hazardType || 'other';
        return {
            shouldFetch: true,
            url: ROAD_REPORT_API_PATH,
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: {
                hazard_type: hazardType,
                lat: input.lat,
                lon: input.lon,
                description: input.description || '',
                severity: hazardType === 'accident' ? 'high' : 'medium',
            },
            successStatusMessage: SUCCESS_STATUS,
            successStatusType: 'success',
            closeModalOnSuccess: true,
            gpsRequiredStatusMessage: GPS_REQUIRED_STATUS,
            gpsRequiredStatusType: 'warning',
            errorStatusPrefix: 'Report failed',
        };
    }

    var api = {
        ROAD_REPORT_MODAL_ID: ROAD_REPORT_MODAL_ID,
        ROAD_REPORT_NOTES_ID: ROAD_REPORT_NOTES_ID,
        ROAD_REPORT_TYPE_ID: ROAD_REPORT_TYPE_ID,
        ROAD_REPORT_API_PATH: ROAD_REPORT_API_PATH,
        buildOpenRoadReportModalExecutePlan: buildOpenRoadReportModalExecutePlan,
        buildCloseRoadReportModalExecutePlan: buildCloseRoadReportModalExecutePlan,
        buildSubmitRoadReportCollectPlan: buildSubmitRoadReportCollectPlan,
        buildSubmitRoadReportFetchPlan: buildSubmitRoadReportFetchPlan,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    root.VoyagrRoadReport = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

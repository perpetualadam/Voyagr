/**
 * @file Pure navigation map control button icon constants (no DOM).
 * @module modules/map/map-controls
 */
(function (root) {
    'use strict';

    var ZOOM_FOLLOW_ENABLED_ICON = '📍';
    var ZOOM_FOLLOW_DISABLED_ICON = '🔓';
    var JOURNEY_OVERVIEW_ICON = '🗺️';
    var JOURNEY_RETURN_ICON = '📍';

    var api = {
        ZOOM_FOLLOW_ENABLED_ICON: ZOOM_FOLLOW_ENABLED_ICON,
        ZOOM_FOLLOW_DISABLED_ICON: ZOOM_FOLLOW_DISABLED_ICON,
        JOURNEY_OVERVIEW_ICON: JOURNEY_OVERVIEW_ICON,
        JOURNEY_RETURN_ICON: JOURNEY_RETURN_ICON,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    root.VoyagrMapControls = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

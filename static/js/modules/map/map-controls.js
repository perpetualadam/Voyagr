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
    var AR_ACTIVE_LABEL = '🎯 Exit AR';
    var AR_INACTIVE_LABEL = '📷 AR View';
    var JOURNEY_OVERVIEW_ACTIVE_BACKGROUND = '#4CAF50';
    var JOURNEY_OVERVIEW_INACTIVE_BACKGROUND = '#9C27B0';
    var ZOOM_FOLLOW_ACTIVE_BACKGROUND = '#FF9800';
    var ZOOM_FOLLOW_INACTIVE_BACKGROUND = '#9E9E9E';

    /**
     * Display values for the zoom-and-follow map FAB.
     * @param {boolean} enabled
     * @returns {{ active: boolean, background: string, innerHtml: string }}
     */
    function getZoomFollowButtonDisplay(enabled) {
        return {
            active: !!enabled,
            background: enabled ? ZOOM_FOLLOW_ACTIVE_BACKGROUND : ZOOM_FOLLOW_INACTIVE_BACKGROUND,
            innerHtml: enabled ? ZOOM_FOLLOW_ENABLED_ICON : ZOOM_FOLLOW_DISABLED_ICON,
        };
    }

    /**
     * Display values for the journey overview map FAB.
     * @param {boolean} overviewActive
     * @returns {{ background: string, innerHtml: string, title: string }}
     */
    function getJourneyOverviewButtonDisplay(overviewActive) {
        return overviewActive
            ? {
                background: JOURNEY_OVERVIEW_ACTIVE_BACKGROUND,
                innerHtml: JOURNEY_RETURN_ICON,
                title: 'Return to Navigation View',
            }
            : {
                background: JOURNEY_OVERVIEW_INACTIVE_BACKGROUND,
                innerHtml: JOURNEY_OVERVIEW_ICON,
                title: 'Journey Overview',
            };
    }

    var api = {
        ZOOM_FOLLOW_ENABLED_ICON: ZOOM_FOLLOW_ENABLED_ICON,
        ZOOM_FOLLOW_DISABLED_ICON: ZOOM_FOLLOW_DISABLED_ICON,
        JOURNEY_OVERVIEW_ICON: JOURNEY_OVERVIEW_ICON,
        JOURNEY_RETURN_ICON: JOURNEY_RETURN_ICON,
        AR_ACTIVE_LABEL: AR_ACTIVE_LABEL,
        AR_INACTIVE_LABEL: AR_INACTIVE_LABEL,
        JOURNEY_OVERVIEW_ACTIVE_BACKGROUND: JOURNEY_OVERVIEW_ACTIVE_BACKGROUND,
        JOURNEY_OVERVIEW_INACTIVE_BACKGROUND: JOURNEY_OVERVIEW_INACTIVE_BACKGROUND,
        ZOOM_FOLLOW_ACTIVE_BACKGROUND: ZOOM_FOLLOW_ACTIVE_BACKGROUND,
        ZOOM_FOLLOW_INACTIVE_BACKGROUND: ZOOM_FOLLOW_INACTIVE_BACKGROUND,
        getZoomFollowButtonDisplay: getZoomFollowButtonDisplay,
        getJourneyOverviewButtonDisplay: getJourneyOverviewButtonDisplay,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    root.VoyagrMapControls = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

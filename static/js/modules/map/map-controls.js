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
    var AR_PREF_STORAGE_KEY = 'voyagr_ar_enabled';

    var MAP_CONTROLS_HINT_SECTIONS = [
        { title: 'Map (round buttons)', selector: '.fab-container .fab, #navControlButtons .fab' },
        { title: 'Bottom sheet toolbar', selector: '.sheet-toolbar .sheet-icon-btn' },
    ];

    var MAP_CONTROLS_HINT_EXTRAS = [
        '\u2014 After you calculate a route, \u201cStart navigation\u201d can appear on the map.',
        '\u2014 During turn-by-turn, Zoom & follow, Recenter, and Journey overview may appear as round buttons.',
        '\u2014 Long-press any round map icon ~\u00bds for this same text as a bottom banner.',
    ];

    var MAP_CONTROLS_HINT_SKIP_IDS = ['mapControlsHintFab'];
    var MAP_CONTROLS_HINT_HIDDEN_SECTION_TITLE = 'Often hidden until you need them';

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

    /**
     * @param {string} id
     * @returns {boolean}
     */
    function shouldSkipMapControlsHintElement(id) {
        return MAP_CONTROLS_HINT_SKIP_IDS.indexOf(id) >= 0;
    }

    /**
     * @param {string} display
     * @param {string} visibility
     * @returns {boolean}
     */
    function isMapControlsHintElementVisible(display, visibility) {
        return display !== 'none' && visibility !== 'hidden';
    }

    /**
     * Trim button label text for the hint list icon prefix.
     * @param {string} textContent
     * @returns {string}
     */
    function normalizeMapHintIconText(textContent) {
        return String(textContent || '').trim().replace(/\s+/g, ' ').slice(0, 6);
    }

    /**
     * @param {string} iconText
     * @param {string} hint
     * @returns {string}
     */
    function formatMapControlsHintItemLabel(iconText, hint) {
        var icon = normalizeMapHintIconText(iconText);
        return (icon ? icon + ' \u2014 ' : '') + hint;
    }

    /**
     * Display values for the AR mode map/settings button.
     * @param {string} status
     * @returns {{ active: boolean, innerHtml: string }}
     */
    function getARModeButtonDisplay(status) {
        var active = status === 'active' || status === 'active-fallback';
        return {
            active: active,
            innerHtml: active ? AR_ACTIVE_LABEL : AR_INACTIVE_LABEL,
        };
    }

    /**
     * @param {Storage} storage
     * @returns {boolean}
     */
    function isAREnabledInStorage(storage) {
        return storage.getItem(AR_PREF_STORAGE_KEY) === 'true';
    }

    /**
     * @param {Storage} storage
     * @param {boolean} enabled
     */
    function writeAREnabledToStorage(storage, enabled) {
        storage.setItem(AR_PREF_STORAGE_KEY, enabled ? 'true' : 'false');
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
        AR_PREF_STORAGE_KEY: AR_PREF_STORAGE_KEY,
        MAP_CONTROLS_HINT_SECTIONS: MAP_CONTROLS_HINT_SECTIONS,
        MAP_CONTROLS_HINT_EXTRAS: MAP_CONTROLS_HINT_EXTRAS,
        MAP_CONTROLS_HINT_SKIP_IDS: MAP_CONTROLS_HINT_SKIP_IDS,
        MAP_CONTROLS_HINT_HIDDEN_SECTION_TITLE: MAP_CONTROLS_HINT_HIDDEN_SECTION_TITLE,
        getZoomFollowButtonDisplay: getZoomFollowButtonDisplay,
        getJourneyOverviewButtonDisplay: getJourneyOverviewButtonDisplay,
        shouldSkipMapControlsHintElement: shouldSkipMapControlsHintElement,
        isMapControlsHintElementVisible: isMapControlsHintElementVisible,
        normalizeMapHintIconText: normalizeMapHintIconText,
        formatMapControlsHintItemLabel: formatMapControlsHintItemLabel,
        getARModeButtonDisplay: getARModeButtonDisplay,
        isAREnabledInStorage: isAREnabledInStorage,
        writeAREnabledToStorage: writeAREnabledToStorage,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    root.VoyagrMapControls = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

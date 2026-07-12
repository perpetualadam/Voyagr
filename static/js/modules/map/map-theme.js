/**
 * @file Pure map theme resolution and style-switch plans (no DOM, no network).
 * @module modules/map/map-theme
 */
(function (root) {
    'use strict';

    var MAP_THEME_STORAGE_KEY = 'mapTheme';
    var MAP_THEME_SELECTOR_ID = 'mapThemeSelector';
    var DEFAULT_MAP_THEME = 'standard';

    var MAP_THEME_STYLE_PATHS = {
        standard: '/map/styles/liberty/style.json',
        satellite: '/static/map/styles/satellite/style.json',
        dark: '/static/map/styles/dark/style.json',
    };

    /**
     * @param {string|Object} themeOrEvent
     * @returns {string}
     */
    function resolveMapThemeName(themeOrEvent) {
        if (typeof themeOrEvent === 'string') {
            return themeOrEvent || DEFAULT_MAP_THEME;
        }
        return themeOrEvent && themeOrEvent.target && themeOrEvent.target.dataset
            ? (themeOrEvent.target.dataset.theme || DEFAULT_MAP_THEME)
            : DEFAULT_MAP_THEME;
    }

    /**
     * @param {Object} [input]
     * @returns {Object}
     */
    function buildMapThemeStyleUrlsPlan(input) {
        input = input || {};
        var theme = input.theme || DEFAULT_MAP_THEME;
        var toAbs = input.toAbs || function (url) { return url; };
        var satelliteRasterUrl = toAbs(MAP_THEME_STYLE_PATHS.satellite);
        var styleUrls = {
            standard: MAP_THEME_STYLE_PATHS.standard,
            satellite: satelliteRasterUrl,
            dark: MAP_THEME_STYLE_PATHS.dark,
        };

        if (input.preferredFallbackStyleUrl) {
            styleUrls.standard = input.preferredFallbackStyleUrl;
            styleUrls.dark = input.preferredFallbackStyleUrl;
            styleUrls.satellite = satelliteRasterUrl;
        }

        var chosenPath = styleUrls[theme] || styleUrls.standard;
        return {
            theme: theme,
            styleUrls: styleUrls,
            chosenPath: chosenPath,
            chosenUrl: toAbs(chosenPath),
            satelliteRasterUrl: satelliteRasterUrl,
        };
    }

    /**
     * @param {Object} [input]
     * @returns {Object}
     */
    function buildSetMapThemeExecutePlan(input) {
        input = input || {};
        var theme = resolveMapThemeName(input.themeOrEvent);
        var currentMapTheme = input.currentMapTheme || DEFAULT_MAP_THEME;
        var hasMap = !!input.hasMap;
        var stylePlan = buildMapThemeStyleUrlsPlan({
            theme: theme,
            toAbs: input.toAbs,
            preferredFallbackStyleUrl: input.preferredFallbackStyleUrl,
        });

        return {
            shouldApply: true,
            theme: theme,
            storageKey: MAP_THEME_STORAGE_KEY,
            storageValue: theme,
            selectorId: MAP_THEME_SELECTOR_ID,
            activeButtonSelector: '[data-theme="' + theme + '"]',
            hasMap: hasMap,
            skipStyleReload: hasMap && theme === currentMapTheme,
            updateCurrentMapTheme: true,
            stylePlan: stylePlan,
            syncFetchStyle: hasMap && theme !== currentMapTheme,
            postStyleLoad: {
                add3DBuildings: !!input.buildings3DEnabled,
                reinitRoadLabels: true,
            },
            statusMessage: '🗺️ Map theme changed to ' + theme,
            statusType: 'success',
            saveAllSettings: true,
            persistApiBody: { map_theme: theme },
            mapNotReadyLog: '[setMapTheme] Map not initialized yet, skipping style change',
            alreadyActiveLog: '[setMapTheme] Theme already active, skipping redundant style reload',
            syncFetchErrorLogPrefix: '[setMapTheme] Sync style fetch failed, using URL with transformRequest:',
        };
    }

    var api = {
        MAP_THEME_STORAGE_KEY: MAP_THEME_STORAGE_KEY,
        MAP_THEME_SELECTOR_ID: MAP_THEME_SELECTOR_ID,
        DEFAULT_MAP_THEME: DEFAULT_MAP_THEME,
        MAP_THEME_STYLE_PATHS: MAP_THEME_STYLE_PATHS,
        resolveMapThemeName: resolveMapThemeName,
        buildMapThemeStyleUrlsPlan: buildMapThemeStyleUrlsPlan,
        buildSetMapThemeExecutePlan: buildSetMapThemeExecutePlan,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    root.VoyagrMapTheme = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

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

    /** Brighter route colours for dark basemaps (Waze-like contrast). */
    var DARK_MAP_ROUTE_COLORS = [
        '#5B9EFF',
        '#C4A8FF',
        '#FF8FC7',
        '#3DDDF5',
        '#B8A0FF',
    ];

    var DARK_MAP_NAV_ROUTE_COLOR = '#5B9EFF';

    var MAP_BOOTSTRAP_BACKGROUND_COLORS = {
        standard: '#d4dbe8',
        satellite: '#0d1114',
        dark: '#0c0c0c',
    };

    /**
     * Read persisted map theme from storage (defaults to standard).
     * @param {Object} [opts]
     * @param {string} [opts.theme] - explicit override (tests / callers)
     * @param {{ getItem: function(string): (string|null|undefined) }} [opts.storage]
     * @returns {string}
     */
    function readStoredMapTheme(opts) {
        opts = opts || {};
        if (opts.theme != null) {
            return resolveMapThemeName(opts.theme);
        }
        var storage = opts.storage;
        if (!storage && typeof localStorage !== 'undefined') {
            storage = localStorage;
        }
        if (storage && typeof storage.getItem === 'function') {
            return resolveMapThemeName(storage.getItem(MAP_THEME_STORAGE_KEY));
        }
        return DEFAULT_MAP_THEME;
    }

    /**
     * Marker / overlay context shared by camera and hazard map layers.
     * @param {string} [mapTheme]
     * @returns {{ mapTheme: string, darkBasemap: boolean }}
     */
    function buildBasemapMarkerContext(mapTheme) {
        mapTheme = resolveMapThemeName(mapTheme != null ? mapTheme : readStoredMapTheme());
        return {
            mapTheme: mapTheme,
            darkBasemap: isDarkMapTheme(mapTheme),
        };
    }

    /**
     * Bootstrap style plan for voyagr-core map init (splash background + vector style path).
     * @param {string} [mapTheme]
     * @returns {{ mapTheme: string, backgroundColor: string, stylePath: string }}
     */
    function buildMapBootstrapPlan(mapTheme) {
        mapTheme = resolveMapThemeName(mapTheme != null ? mapTheme : readStoredMapTheme());
        var stylePlan = buildMapThemeStyleUrlsPlan({ theme: mapTheme });
        return {
            mapTheme: mapTheme,
            backgroundColor: MAP_BOOTSTRAP_BACKGROUND_COLORS[mapTheme]
                || MAP_BOOTSTRAP_BACKGROUND_COLORS.standard,
            stylePath: stylePlan.chosenPath,
        };
    }

    /**
     * Route comparison colours for the active basemap theme.
     * @param {string} mapTheme
     * @param {Array<string>} fallbackRouteColors
     * @returns {Array<string>}
     */
    function resolveRouteColorsForTheme(mapTheme, fallbackRouteColors) {
        var contrast = buildRouteDisplayContrastPlan(mapTheme);
        if (contrast.darkBasemap && contrast.routeColors) {
            return contrast.routeColors;
        }
        return fallbackRouteColors;
    }

    /**
     * Active navigation route colour for the active basemap theme.
     * @param {string} mapTheme
     * @param {string} fallbackNavColor
     * @returns {string}
     */
    function resolveNavRouteColorForTheme(mapTheme, fallbackNavColor) {
        var contrast = buildRouteDisplayContrastPlan(mapTheme);
        if (contrast.darkBasemap && contrast.navRouteColor) {
            return contrast.navRouteColor;
        }
        return fallbackNavColor;
    }

    /**
     * @param {string} [theme]
     * @returns {boolean}
     */
    function isDarkMapTheme(theme) {
        return resolveMapThemeName(theme) === 'dark';
    }

    /**
     * Road label paint for the active basemap theme.
     * @param {string} [mapTheme]
     * @returns {{ textColor: string, textHaloColor: string, textHaloWidth: number, textSize: number }}
     */
    function buildRoadLabelPaintPlan(mapTheme) {
        if (isDarkMapTheme(mapTheme)) {
            return {
                textColor: '#dde4f0',
                textHaloColor: '#10141c',
                textHaloWidth: 2,
                textSize: 12,
            };
        }
        return {
            textColor: '#1a1a1a',
            textHaloColor: '#ffffff',
            textHaloWidth: 1.5,
            textSize: 12,
        };
    }

    /**
     * Route / nav polyline contrast tuning for dark basemaps.
     * @param {string} [mapTheme]
     * @returns {Object}
     */
    function buildRouteDisplayContrastPlan(mapTheme) {
        if (!isDarkMapTheme(mapTheme)) {
            return { darkBasemap: false };
        }
        return {
            darkBasemap: true,
            routeColors: DARK_MAP_ROUTE_COLORS,
            navRouteColor: DARK_MAP_NAV_ROUTE_COLOR,
            routeWeightBoost: 2,
            routeOpacity: 1.0,
            navPolyline: {
                weight: 9,
                outlineColor: '#0c1220',
                outlineWeight: 13,
                outlineOpacity: 0.95,
            },
            hazardMarkerGlow: '0 0 0 2px rgba(255,255,255,0.45), 0 2px 10px rgba(0,0,0,0.75)',
        };
    }

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
        DARK_MAP_ROUTE_COLORS: DARK_MAP_ROUTE_COLORS,
        DARK_MAP_NAV_ROUTE_COLOR: DARK_MAP_NAV_ROUTE_COLOR,
        MAP_BOOTSTRAP_BACKGROUND_COLORS: MAP_BOOTSTRAP_BACKGROUND_COLORS,
        isDarkMapTheme: isDarkMapTheme,
        readStoredMapTheme: readStoredMapTheme,
        buildBasemapMarkerContext: buildBasemapMarkerContext,
        buildMapBootstrapPlan: buildMapBootstrapPlan,
        resolveRouteColorsForTheme: resolveRouteColorsForTheme,
        resolveNavRouteColorForTheme: resolveNavRouteColorForTheme,
        buildRoadLabelPaintPlan: buildRoadLabelPaintPlan,
        buildRouteDisplayContrastPlan: buildRouteDisplayContrastPlan,
        resolveMapThemeName: resolveMapThemeName,
        buildMapThemeStyleUrlsPlan: buildMapThemeStyleUrlsPlan,
        buildSetMapThemeExecutePlan: buildSetMapThemeExecutePlan,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    root.VoyagrMapTheme = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

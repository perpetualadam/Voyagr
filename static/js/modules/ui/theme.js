/**
 * @file Pure theme resolution helpers (no DOM, no localStorage).
 * @module modules/ui/theme
 */
(function (root) {
    'use strict';

    /**
     * Whether the dark-mode CSS class should be applied.
     * @param {'light'|'dark'|'auto'|string} theme
     * @param {boolean} prefersDark - system prefers-color-scheme: dark
     * @returns {boolean}
     */
    function shouldUseDarkMode(theme, prefersDark) {
        if (theme === 'dark') return true;
        if (theme === 'light') return false;
        if (theme === 'auto') return !!prefersDark;
        return false;
    }

    /**
     * Simple light/dark toggle (used by toggleDarkMode).
     * @param {string} currentTheme
     * @returns {'light'|'dark'}
     */
    function toggleBetweenLightAndDark(currentTheme) {
        return currentTheme === 'dark' ? 'light' : 'dark';
    }

    /**
     * DOM id of the active theme picker button.
     * @param {string} currentTheme
     * @returns {'themeLight'|'themeDark'|'themeAuto'|null}
     */
    function activeThemeButtonId(currentTheme) {
        if (currentTheme === 'light') return 'themeLight';
        if (currentTheme === 'dark') return 'themeDark';
        if (currentTheme === 'auto') return 'themeAuto';
        return null;
    }

    /**
     * Plan for applying dark-mode class before deferred app scripts run.
     * @param {string} [storedTheme]
     * @param {boolean} [prefersDark]
     * @returns {{ themeName: string, useDark: boolean, className: string }}
     */
    function buildEarlyUiThemeBootPlan(storedTheme, prefersDark) {
        var themeName = storedTheme || 'light';
        return {
            themeName: themeName,
            useDark: shouldUseDarkMode(themeName, !!prefersDark),
            className: 'dark-mode',
        };
    }

    var UI_MAP_THEME_LINK_STORAGE_KEY = 'linkUiMapTheme';

    /**
     * Whether UI theme changes should drive the basemap theme (default on).
     * @param {{ getItem: function(string): (string|null|undefined) }} [storage]
     * @returns {boolean}
     */
    function isUiMapThemeLinkEnabled(storage) {
        if (!storage && typeof localStorage !== 'undefined') {
            storage = localStorage;
        }
        if (!storage || typeof storage.getItem !== 'function') return true;
        return storage.getItem(UI_MAP_THEME_LINK_STORAGE_KEY) !== 'false';
    }

    /**
     * Basemap theme that pairs with a UI theme choice.
     * @param {string} uiTheme
     * @param {boolean} prefersDark
     * @returns {'standard'|'dark'}
     */
    function linkedMapThemeForUiTheme(uiTheme, prefersDark) {
        if (uiTheme === 'dark') return 'dark';
        if (uiTheme === 'light') return 'standard';
        if (uiTheme === 'auto') return prefersDark ? 'dark' : 'standard';
        return 'standard';
    }

    /**
     * UI theme that pairs with a basemap theme, or null when unlinked (satellite).
     * @param {string} mapTheme
     * @returns {'light'|'dark'|null}
     */
    function linkedUiThemeForMapTheme(mapTheme) {
        if (mapTheme === 'dark') return 'dark';
        if (mapTheme === 'standard') return 'light';
        return null;
    }

    /**
     * Early-boot plan for syncing linked basemap theme before deferred scripts run.
     * @param {string} [storedUiTheme]
     * @param {boolean} [prefersDark]
     * @param {{ getItem: function(string): (string|null|undefined) }} [storage]
     * @returns {{ shouldSet: boolean, mapTheme: string }}
     */
    function buildEarlyLinkedMapThemeBootPlan(storedUiTheme, prefersDark, storage) {
        if (!isUiMapThemeLinkEnabled(storage)) {
            return { shouldSet: false, mapTheme: 'standard' };
        }
        var uiTheme = storedUiTheme || 'light';
        return {
            shouldSet: true,
            mapTheme: linkedMapThemeForUiTheme(uiTheme, !!prefersDark),
        };
    }

    var api = {
        shouldUseDarkMode: shouldUseDarkMode,
        toggleBetweenLightAndDark: toggleBetweenLightAndDark,
        activeThemeButtonId: activeThemeButtonId,
        buildEarlyUiThemeBootPlan: buildEarlyUiThemeBootPlan,
        UI_MAP_THEME_LINK_STORAGE_KEY: UI_MAP_THEME_LINK_STORAGE_KEY,
        isUiMapThemeLinkEnabled: isUiMapThemeLinkEnabled,
        linkedMapThemeForUiTheme: linkedMapThemeForUiTheme,
        linkedUiThemeForMapTheme: linkedUiThemeForMapTheme,
        buildEarlyLinkedMapThemeBootPlan: buildEarlyLinkedMapThemeBootPlan,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    root.VoyagrTheme = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

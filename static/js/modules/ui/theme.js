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

    var api = {
        shouldUseDarkMode: shouldUseDarkMode,
        toggleBetweenLightAndDark: toggleBetweenLightAndDark,
        activeThemeButtonId: activeThemeButtonId,
        buildEarlyUiThemeBootPlan: buildEarlyUiThemeBootPlan,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    root.VoyagrTheme = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

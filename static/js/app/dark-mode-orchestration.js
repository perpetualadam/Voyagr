/**
 * @file UI dark mode orchestration (theme apply, buttons, system preference listener).
 * Extracted from voyagr-app.js to shrink the monolith; receives live deps via bind().
 */
(function (root) {
    'use strict';

    var runtime = null;
    var systemThemeListenerBound = false;
    var currentTheme =
        typeof localStorage !== 'undefined' ? localStorage.getItem('ui_theme') || 'light' : 'light';

    function rt() {
        if (!runtime) {
            throw new Error('[DarkMode] Orchestration runtime not bound');
        }
        return runtime;
    }

    function theme() { return rt().theme(); }

    function applyTheme(themeName) {
        const body = document.body;
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        const useDark = theme().shouldUseDarkMode(themeName, prefersDark);

        if (useDark) {
            body.classList.add('dark-mode');
            console.log('[Dark Mode] Applied', themeName === 'auto' ? 'auto theme (system prefers dark)' : 'dark theme');
        } else {
            body.classList.remove('dark-mode');
            console.log('[Dark Mode] Applied', themeName === 'auto' ? 'auto theme (system prefers light)' : 'light theme');
        }

        currentTheme = themeName;
        localStorage.setItem('ui_theme', themeName);
    }

    function initializeDarkMode() {
        const savedTheme = localStorage.getItem('ui_theme') || 'light';
        currentTheme = savedTheme;
        applyTheme(savedTheme);
        console.log('[Dark Mode] Initialized with theme:', savedTheme);
    }

    function toggleDarkMode() {
        const newTheme = theme().toggleBetweenLightAndDark(currentTheme);
        applyTheme(newTheme);
        rt().call.showStatus('🌙 Theme changed to ' + newTheme + ' mode', 'success');
    }

    function setTheme(themeName) {
        applyTheme(themeName);
        updateThemeButtons();
        rt().call.saveAllSettings();
        rt().call.showStatus('🎨 Theme changed to ' + themeName + ' mode', 'success');
    }

    function updateThemeButtons() {
        const lightBtn = document.getElementById('themeLight');
        const darkBtn = document.getElementById('themeDark');
        const autoBtn = document.getElementById('themeAuto');

        if (lightBtn) lightBtn.classList.remove('active');
        if (darkBtn) darkBtn.classList.remove('active');
        if (autoBtn) autoBtn.classList.remove('active');

        const activeId = theme().activeThemeButtonId(currentTheme);
        const activeBtn = activeId ? document.getElementById(activeId) : null;
        if (activeBtn) activeBtn.classList.add('active');

        console.log('[Dark Mode] Theme buttons updated for theme:', currentTheme);
    }

    function bindSystemThemeListener() {
        if (systemThemeListenerBound || !window.matchMedia) return;
        systemThemeListenerBound = true;
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
            if (currentTheme === 'auto') {
                applyTheme('auto');
                console.log('[Dark Mode] System theme changed, reapplying auto theme');
            }
        });
    }

    function bind(nextRuntime) {
        runtime = nextRuntime;
        bindSystemThemeListener();
    }

    var api = {
        bind: bind,
        initializeDarkMode: initializeDarkMode,
        applyTheme: applyTheme,
        toggleDarkMode: toggleDarkMode,
        setTheme: setTheme,
        updateThemeButtons: updateThemeButtons,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    root.VoyagrDarkModeOrchestration = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

/**
 * @file Pure UI-glue helpers for the app's many on/off toggles.
 * @module modules/ui/toggle-ui
 *
 * The monolithic app script (voyagr-app.js) has ~40 toggle handlers that all repeat the
 * same glue: flip a boolean, persist 'true'/'false' to localStorage, and restyle a small
 * pill button (green when on, grey when off). That logic is extracted here so it can be
 * unit tested for real and shared by the (classic, non-module) app script via a global,
 * with an inline fallback in the app so nothing breaks if this script fails to load.
 */
(function (root) {
    'use strict';

    const ACTIVE_BACKGROUND = '#4CAF50';
    const ACTIVE_BORDER = '#4CAF50';
    const INACTIVE_BACKGROUND = '#ddd';
    const INACTIVE_BORDER = '#999';

    /**
     * Compute the pill-button style for a given enabled state.
     * @param {boolean} enabled
     * @param {object} [opts] - Optional colour overrides.
     * @returns {{ active: boolean, background: string, borderColor: string }}
     */
    function toggleButtonStyle(enabled, opts = {}) {
        const on = !!enabled;
        return {
            active: on,
            background: on
                ? (opts.activeBackground || ACTIVE_BACKGROUND)
                : (opts.inactiveBackground || INACTIVE_BACKGROUND),
            borderColor: on
                ? (opts.activeBorder || ACTIVE_BORDER)
                : (opts.inactiveBorder || INACTIVE_BORDER),
        };
    }

    /**
     * Apply the computed toggle style to a DOM element. No-op for a falsy element.
     * @param {HTMLElement|null} el
     * @param {boolean} enabled
     * @param {object} [opts] - Optional colour overrides.
     * @returns {{ active: boolean, background: string, borderColor: string }} The style applied.
     */
    function applyToggleButton(el, enabled, opts = {}) {
        const style = toggleButtonStyle(enabled, opts);
        if (el) {
            if (el.classList && typeof el.classList.toggle === 'function') {
                el.classList.toggle('active', style.active);
            }
            if (el.style) {
                el.style.background = style.background;
                el.style.borderColor = style.borderColor;
            }
        }
        return style;
    }

    /**
     * Read a boolean preference stored as 'true'/'false'.
     * @param {string} key
     * @param {boolean} [defaultValue=false] - Returned when the key is absent/unrecognised.
     * @param {Storage} [storage] - Defaults to the ambient localStorage.
     * @returns {boolean}
     */
    function readBoolPref(key, defaultValue = false, storage) {
        const store = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
        if (!store) return defaultValue;
        const raw = store.getItem(key);
        if (raw === 'true') return true;
        if (raw === 'false') return false;
        return defaultValue;
    }

    /**
     * Persist a boolean preference as 'true'/'false'.
     * @param {string} key
     * @param {boolean} enabled
     * @param {Storage} [storage] - Defaults to the ambient localStorage.
     */
    function writeBoolPref(key, enabled, storage) {
        const store = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
        if (store) store.setItem(key, enabled ? 'true' : 'false');
    }

    /**
     * Flip a boolean toggle state.
     * @param {boolean} current
     * @returns {boolean}
     */
    function nextToggleState(current) {
        return !current;
    }

    const api = {
        ACTIVE_BACKGROUND,
        ACTIVE_BORDER,
        INACTIVE_BACKGROUND,
        INACTIVE_BORDER,
        toggleButtonStyle,
        applyToggleButton,
        readBoolPref,
        writeBoolPref,
        nextToggleState,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    root.VoyagrToggleUI = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

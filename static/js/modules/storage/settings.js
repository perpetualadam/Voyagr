/**
 * @file Settings Storage Module - Handles user settings persistence
 * @module modules/storage/settings
 */

/**
 * SettingsStorage class - Manages user settings
 * @class SettingsStorage
 */
export class SettingsStorage {
    constructor(config = {}) {
        this.prefix = config.prefix || 'voyagr_settings_';
        this.defaults = config.defaults || {};
        this.settings = {};
        this.listeners = new Map();
    }

    /**
     * Initialize settings
     */
    initialize() {
        // Load from localStorage
        this.settings = { ...this.defaults };
        
        Object.keys(this.defaults).forEach(key => {
            const stored = localStorage.getItem(this.prefix + key);
            if (stored !== null) {
                try {
                    this.settings[key] = JSON.parse(stored);
                } catch (e) {
                    this.settings[key] = stored;
                }
            }
        });
    }

    /**
     * Get setting value
     * @param {string} key - Setting key
     * @param {*} defaultValue - Default value
     * @returns {*} Setting value
     */
    getSetting(key, defaultValue = null) {
        return this.settings[key] !== undefined ? this.settings[key] : defaultValue;
    }

    /**
     * Set setting value
     * @param {string} key - Setting key
     * @param {*} value - Setting value
     */
    setSetting(key, value) {
        const oldValue = this.settings[key];
        this.settings[key] = value;

        // Persist to localStorage
        try {
            localStorage.setItem(this.prefix + key, JSON.stringify(value));
        } catch (error) {
            console.error('Settings storage error:', error);
        }

        // Emit change event
        this.emit('settingChanged', { key, value, oldValue });
    }

    /**
     * Get all settings
     * @returns {Object} All settings
     */
    getAllSettings() {
        return { ...this.settings };
    }

    /**
     * Set multiple settings
     * @param {Object} settings - Settings object
     */
    setMultiple(settings) {
        Object.entries(settings).forEach(([key, value]) => {
            this.setSetting(key, value);
        });
    }

    /**
     * Reset to defaults
     */
    resetToDefaults() {
        this.settings = { ...this.defaults };
        
        Object.keys(this.defaults).forEach(key => {
            localStorage.removeItem(this.prefix + key);
        });

        this.emit('settingsReset');
    }

    /**
     * Export settings
     * @returns {string} JSON string of settings
     */
    export() {
        return JSON.stringify(this.settings, null, 2);
    }

    /**
     * Import settings
     * @param {string} jsonString - JSON string of settings
     * @returns {boolean} Success
     */
    import(jsonString) {
        try {
            const imported = JSON.parse(jsonString);
            this.setMultiple(imported);
            return true;
        } catch (error) {
            console.error('Settings import error:', error);
            return false;
        }
    }

    /**
     * Remove setting
     * @param {string} key - Setting key
     */
    removeSetting(key) {
        delete this.settings[key];
        localStorage.removeItem(this.prefix + key);
        this.emit('settingRemoved', { key });
    }

    /**
     * Add event listener
     * @param {string} event - Event name
     * @param {Function} callback - Callback function
     */
    on(event, callback) {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, []);
        }
        this.listeners.get(event).push(callback);
    }

    /**
     * Emit event
     * @param {string} event - Event name
     * @param {Object} data - Event data
     */
    emit(event, data) {
        if (this.listeners.has(event)) {
            this.listeners.get(event).forEach(callback => callback(data));
        }
    }
}


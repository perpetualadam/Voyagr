/**
 * @file Controls UI Module - Handles UI controls and buttons
 * @module modules/ui/controls
 */

/**
 * ControlsManager class - Manages UI controls and interactions
 * @class ControlsManager
 */
export class ControlsManager {
    constructor(config = {}) {
        this.controls = new Map();
        this.listeners = new Map();
    }

    /**
     * Register a control element
     * @param {string} id - Control ID
     * @param {HTMLElement} element - DOM element
     * @param {Object} options - Control options
     */
    registerControl(id, element, options = {}) {
        if (!element) {
            console.warn(`Control element not found: ${id}`);
            return;
        }

        this.controls.set(id, {
            element,
            type: options.type || 'button',
            enabled: options.enabled !== false,
            visible: options.visible !== false
        });

        if (options.onClick) {
            element.addEventListener('click', options.onClick);
        }
    }

    /**
     * Enable control
     * @param {string} id - Control ID
     */
    enableControl(id) {
        const control = this.controls.get(id);
        if (control) {
            control.enabled = true;
            control.element.disabled = false;
            control.element.classList.remove('disabled');
        }
    }

    /**
     * Disable control
     * @param {string} id - Control ID
     */
    disableControl(id) {
        const control = this.controls.get(id);
        if (control) {
            control.enabled = false;
            control.element.disabled = true;
            control.element.classList.add('disabled');
        }
    }

    /**
     * Show control
     * @param {string} id - Control ID
     */
    showControl(id) {
        const control = this.controls.get(id);
        if (control) {
            control.visible = true;
            control.element.style.display = '';
        }
    }

    /**
     * Hide control
     * @param {string} id - Control ID
     */
    hideControl(id) {
        const control = this.controls.get(id);
        if (control) {
            control.visible = false;
            control.element.style.display = 'none';
        }
    }

    /**
     * Update control text
     * @param {string} id - Control ID
     * @param {string} text - New text
     */
    updateControlText(id, text) {
        const control = this.controls.get(id);
        if (control) {
            control.element.textContent = text;
        }
    }

    /**
     * Add event listener
     * @param {string} id - Control ID
     * @param {string} event - Event type
     * @param {Function} callback - Callback function
     */
    addEventListener(id, event, callback) {
        const control = this.controls.get(id);
        if (control) {
            control.element.addEventListener(event, callback);
        }
    }

    /**
     * Get control element
     * @param {string} id - Control ID
     * @returns {HTMLElement} Control element
     */
    getControl(id) {
        const control = this.controls.get(id);
        return control ? control.element : null;
    }

    /**
     * Get all controls
     * @returns {Map} All controls
     */
    getAllControls() {
        return new Map(this.controls);
    }

    /**
     * Clear all controls
     */
    clearControls() {
        this.controls.clear();
        this.listeners.clear();
    }
}


/**
 * @file Panels UI Module - Handles UI panels and modals
 * @module modules/ui/panels
 */

/**
 * PanelsManager class - Manages UI panels and modals
 * @class PanelsManager
 */
export class PanelsManager {
    constructor(config = {}) {
        this.panels = new Map();
        this.activePanels = new Set();
        this.animationDuration = config.animationDuration || 300;
    }

    /**
     * Register a panel
     * @param {string} id - Panel ID
     * @param {HTMLElement} element - Panel element
     * @param {Object} options - Panel options
     */
    registerPanel(id, element, options = {}) {
        if (!element) {
            console.warn(`Panel element not found: ${id}`);
            return;
        }

        this.panels.set(id, {
            element,
            type: options.type || 'panel',
            visible: false,
            closable: options.closable !== false
        });
    }

    /**
     * Show panel
     * @param {string} id - Panel ID
     * @param {Object} options - Show options
     */
    showPanel(id, options = {}) {
        const panel = this.panels.get(id);
        if (!panel) return;

        panel.element.style.display = 'block';
        panel.visible = true;
        this.activePanels.add(id);

        if (options.animate) {
            panel.element.classList.add('slide-in');
        }
    }

    /**
     * Hide panel
     * @param {string} id - Panel ID
     * @param {Object} options - Hide options
     */
    hidePanel(id, options = {}) {
        const panel = this.panels.get(id);
        if (!panel) return;

        if (options.animate) {
            panel.element.classList.add('slide-out');
            setTimeout(() => {
                panel.element.style.display = 'none';
                panel.element.classList.remove('slide-out');
            }, this.animationDuration);
        } else {
            panel.element.style.display = 'none';
        }

        panel.visible = false;
        this.activePanels.delete(id);
    }

    /**
     * Toggle panel visibility
     * @param {string} id - Panel ID
     */
    togglePanel(id) {
        const panel = this.panels.get(id);
        if (!panel) return;

        if (panel.visible) {
            this.hidePanel(id);
        } else {
            this.showPanel(id);
        }
    }

    /**
     * Update panel content
     * @param {string} id - Panel ID
     * @param {string} content - HTML content
     */
    updatePanelContent(id, content) {
        const panel = this.panels.get(id);
        if (panel) {
            panel.element.innerHTML = content;
        }
    }

    /**
     * Get panel element
     * @param {string} id - Panel ID
     * @returns {HTMLElement} Panel element
     */
    getPanel(id) {
        const panel = this.panels.get(id);
        return panel ? panel.element : null;
    }

    /**
     * Get active panels
     * @returns {Array} Active panel IDs
     */
    getActivePanels() {
        return Array.from(this.activePanels);
    }

    /**
     * Close all panels
     */
    closeAllPanels() {
        this.activePanels.forEach(id => {
            this.hidePanel(id);
        });
    }

    /**
     * Clear all panels
     */
    clearPanels() {
        this.panels.clear();
        this.activePanels.clear();
    }
}


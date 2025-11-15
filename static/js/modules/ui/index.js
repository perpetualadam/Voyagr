/**
 * @file UI Module Index - Exports all UI modules
 * @module modules/ui
 */

export { MapManager } from './map.js';
export { ControlsManager } from './controls.js';
export { PanelsManager } from './panels.js';

/**
 * Create UI system with all components
 * @param {Object} options - Configuration options
 * @returns {Object} UI system object
 */
export function createUISystem(options = {}) {
    const { MapManager } = require('./map.js');
    const { ControlsManager } = require('./controls.js');
    const { PanelsManager } = require('./panels.js');

    return {
        map: new MapManager(options.map || {}),
        controls: new ControlsManager(options.controls || {}),
        panels: new PanelsManager(options.panels || {}),

        /**
         * Initialize UI system
         * @param {number} lat - Initial latitude
         * @param {number} lon - Initial longitude
         */
        initialize(lat, lon) {
            this.map.initializeMap(lat, lon);
        },

        /**
         * Get UI statistics
         * @returns {Object} Statistics
         */
        getStats() {
            return {
                map: {
                    zoom: this.map.getZoom(),
                    center: this.map.getCenter()
                },
                controls: {
                    count: this.controls.getAllControls().size
                },
                panels: {
                    active: this.panels.getActivePanels(),
                    count: this.panels.panels.size
                }
            };
        }
    };
}


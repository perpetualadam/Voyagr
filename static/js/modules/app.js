/**
 * @file Main Application Module - Integrates all modules
 * @module modules/app
 */

import { createRoutingSystem } from './routing/index.js';
import { createUISystem } from './ui/index.js';
import { createNavigationSystem } from './navigation/index.js';
import { createFeaturesSystem } from './features/index.js';
import { createStorageSystem } from './storage/index.js';
import { createServicesSystem } from './services/index.js';
import { createAPIClient } from './api/index.js';

/**
 * VoyagrApp class - Main application class
 * @class VoyagrApp
 */
export class VoyagrApp {
    constructor(config = {}) {
        this.config = config;
        this.routing = null;
        this.ui = null;
        this.navigation = null;
        this.features = null;
        this.storage = null;
        this.services = null;
        this.api = null;
        this.isInitialized = false;
    }

    /**
     * Initialize application
     * @async
     * @param {number} lat - Initial latitude
     * @param {number} lon - Initial longitude
     */
    async initialize(lat, lon) {
        try {
            // Initialize storage first
            this.storage = createStorageSystem(this.config.storage || {});
            await this.storage.initialize();

            // Initialize other systems
            this.routing = createRoutingSystem(this.config.routing || {});
            this.ui = createUISystem(this.config.ui || {});
            this.navigation = createNavigationSystem(this.config.navigation || {});
            this.features = createFeaturesSystem(this.config.features || {});
            this.services = createServicesSystem(this.config.services || {});
            this.api = createAPIClient(this.config.api || {});

            // Initialize UI
            this.ui.initialize(lat, lon);

            // Initialize features
            await this.features.initialize(lat, lon);

            this.isInitialized = true;
            console.log('Voyagr App initialized successfully');
        } catch (error) {
            console.error('App initialization error:', error);
            throw error;
        }
    }

    /**
     * Calculate route
     * @async
     * @param {string} start - Start location
     * @param {string} end - End location
     * @param {Object} options - Route options
     * @returns {Promise<Object>} Route data
     */
    async calculateRoute(start, end, options = {}) {
        if (!this.isInitialized) {
            throw new Error('App not initialized');
        }

        try {
            const route = await this.routing.engine.calculateRoute(start, end, options);
            this.routing.calculator.addRoutes([route]);
            return route;
        } catch (error) {
            this.services.notifications.error('Route calculation failed');
            throw error;
        }
    }

    /**
     * Start navigation
     * @param {Object} route - Route object
     */
    startNavigation(route) {
        if (!this.isInitialized) {
            throw new Error('App not initialized');
        }

        this.navigation.startNavigation(route);
        this.services.analytics.trackEvent('navigationStarted', { route });
    }

    /**
     * Stop navigation
     */
    stopNavigation() {
        this.navigation.stopNavigation();
        this.services.analytics.trackEvent('navigationStopped');
    }

    /**
     * Get application statistics
     * @returns {Object} Statistics
     */
    getStats() {
        return {
            initialized: this.isInitialized,
            routing: this.routing?.getStats(),
            ui: this.ui?.getStats(),
            navigation: this.navigation?.getStats(),
            features: this.features?.getStats(),
            storage: this.storage?.getStats(),
            services: this.services?.getStats()
        };
    }

    /**
     * Shutdown application
     * @async
     */
    async shutdown() {
        try {
            await this.services.analytics.flush();
            this.storage.database.close();
            this.isInitialized = false;
            console.log('Voyagr App shutdown complete');
        } catch (error) {
            console.error('App shutdown error:', error);
        }
    }
}

/**
 * Create Voyagr application instance
 * @param {Object} config - Configuration
 * @returns {VoyagrApp} Application instance
 */
export function createVoyagrApp(config = {}) {
    return new VoyagrApp(config);
}


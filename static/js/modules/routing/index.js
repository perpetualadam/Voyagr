/**
 * @file Routing Module Index - Exports all routing modules
 * @module modules/routing
 */

export { RoutingEngine } from './engine.js';
export { RouteCalculator } from './calculator.js';
export { RouteOptimizer } from './optimizer.js';

/**
 * Create routing system with all components
 * @param {Object} options - Configuration options
 * @returns {Object} Routing system object
 */
export function createRoutingSystem(options = {}) {
    const { RoutingEngine } = require('./engine.js');
    const { RouteCalculator } = require('./calculator.js');
    const { RouteOptimizer } = require('./optimizer.js');

    return {
        engine: new RoutingEngine(options.engine || {}),
        calculator: new RouteCalculator(options.calculator || {}),
        optimizer: new RouteOptimizer(options.optimizer || {}),

        /**
         * Calculate and optimize route
         * @async
         * @param {string} start - Start location
         * @param {string} end - End location
         * @param {Object} opts - Options
         * @returns {Promise<Object>} Optimized route
         */
        async calculateOptimizedRoute(start, end, opts = {}) {
            const route = await this.engine.calculateRoute(start, end, opts);
            const best = this.optimizer.getBestRoute([route]);
            return best || route;
        },

        /**
         * Get routing statistics
         * @returns {Object} Statistics
         */
        getStats() {
            return {
                engine: this.engine.getStats(),
                calculator: {
                    routeCount: this.calculator.getRouteCount(),
                    selectedRoute: this.calculator.getSelectedRoute()
                },
                optimizer: {
                    preferences: this.optimizer.getPreferences()
                }
            };
        }
    };
}


/**
 * @file Route Optimizer Module - Handles route optimization and preferences
 * @module modules/routing/optimizer
 */

/**
 * RouteOptimizer class - Optimizes routes based on preferences
 * @class RouteOptimizer
 */
export class RouteOptimizer {
    constructor(config = {}) {
        this.preferences = {
            avoidHighways: config.avoidHighways || false,
            preferScenic: config.preferScenic || false,
            avoidTolls: config.avoidTolls || false,
            avoidCAZ: config.avoidCAZ || false,
            preferQuiet: config.preferQuiet || false,
            avoidUnpaved: config.avoidUnpaved || false,
            routeOptimization: config.routeOptimization || 'fastest',
            maxDetour: config.maxDetour || 20
        };
    }

    /**
     * Update preferences
     * @param {Object} newPreferences - New preference values
     */
    updatePreferences(newPreferences) {
        this.preferences = { ...this.preferences, ...newPreferences };
    }

    /**
     * Get current preferences
     * @returns {Object} Current preferences
     */
    getPreferences() {
        return { ...this.preferences };
    }

    /**
     * Filter routes based on preferences
     * @param {Array} routes - Array of routes
     * @returns {Array} Filtered routes
     */
    filterRoutes(routes) {
        return routes.filter(route => {
            // Check toll preference
            if (this.preferences.avoidTolls && route.toll_cost > 0) {
                return false;
            }

            // Check CAZ preference
            if (this.preferences.avoidCAZ && route.caz_cost > 0) {
                return false;
            }

            // Check detour limit
            if (this.preferences.maxDetour > 0) {
                const detourPercent = ((route.distance_km - 1) / 1) * 100; // Simplified
                if (detourPercent > this.preferences.maxDetour) {
                    return false;
                }
            }

            return true;
        });
    }

    /**
     * Score a route based on preferences
     * @param {Object} route - Route to score
     * @returns {number} Score (higher is better)
     */
    scoreRoute(route) {
        let score = 0;

        // Base scoring
        const duration = route.duration_minutes || 1;
        const distance = route.distance_km || 1;
        const cost = (route.fuel_cost || 0) + (route.toll_cost || 0) + (route.caz_cost || 0);

        switch(this.preferences.routeOptimization) {
            case 'fastest':
                score = 1000 / duration;
                break;
            case 'shortest':
                score = 1000 / distance;
                break;
            case 'cheapest':
                score = 1000 / (cost || 1);
                break;
            case 'eco':
                score = 1000 / (route.fuel_cost || 1);
                break;
            default:
                score = 500;
        }

        // Apply preference modifiers
        if (this.preferences.preferScenic) {
            score *= 1.1; // Scenic routes get 10% boost
        }

        if (this.preferences.preferQuiet) {
            score *= 1.05; // Quiet routes get 5% boost
        }

        return score;
    }

    /**
     * Rank routes by score
     * @param {Array} routes - Array of routes
     * @returns {Array} Ranked routes
     */
    rankRoutes(routes) {
        return routes
            .map(route => ({
                ...route,
                score: this.scoreRoute(route)
            }))
            .sort((a, b) => b.score - a.score);
    }

    /**
     * Get best route based on preferences
     * @param {Array} routes - Array of routes
     * @returns {Object} Best route
     */
    getBestRoute(routes) {
        const filtered = this.filterRoutes(routes);
        if (filtered.length === 0) return null;

        const ranked = this.rankRoutes(filtered);
        return ranked[0];
    }

    /**
     * Reset preferences to defaults
     */
    resetPreferences() {
        this.preferences = {
            avoidHighways: false,
            preferScenic: false,
            avoidTolls: false,
            avoidCAZ: false,
            preferQuiet: false,
            avoidUnpaved: false,
            routeOptimization: 'fastest',
            maxDetour: 20
        };
    }
}


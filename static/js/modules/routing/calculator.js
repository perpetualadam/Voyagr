/**
 * @file Route Calculator Module - Handles route calculations and sorting
 * @module modules/routing/calculator
 */

/**
 * RouteCalculator class - Calculates and sorts routes
 * @class RouteCalculator
 */
export class RouteCalculator {
    constructor(config = {}) {
        this.routes = [];
        this.selectedRoute = null;
        this.preference = config.preference || 'fastest';
    }

    /**
     * Add routes to calculator
     * @param {Array} routes - Array of route objects
     */
    addRoutes(routes) {
        this.routes = routes || [];
    }

    /**
     * Sort routes by preference
     * @param {string} preference - Sort preference (fastest/shortest/cheapest/eco)
     * @returns {Array} Sorted routes
     */
    sortRoutes(preference = this.preference) {
        this.preference = preference;
        
        const sorted = [...this.routes].sort((a, b) => {
            switch(preference) {
                case 'fastest':
                    return (a.duration_minutes || 0) - (b.duration_minutes || 0);
                case 'shortest':
                    return (a.distance_km || 0) - (b.distance_km || 0);
                case 'cheapest':
                    const costA = (a.fuel_cost || 0) + (a.toll_cost || 0) + (a.caz_cost || 0);
                    const costB = (b.fuel_cost || 0) + (b.toll_cost || 0) + (b.caz_cost || 0);
                    return costA - costB;
                case 'eco':
                    return (a.fuel_cost || 0) - (b.fuel_cost || 0);
                default:
                    return 0;
            }
        });

        return sorted;
    }

    /**
     * Calculate total cost for a route
     * @param {Object} route - Route object
     * @returns {number} Total cost
     */
    calculateTotalCost(route) {
        return (route.fuel_cost || 0) + (route.toll_cost || 0) + (route.caz_cost || 0);
    }

    /**
     * Calculate cost per kilometer
     * @param {Object} route - Route object
     * @returns {number} Cost per km
     */
    calculateCostPerKm(route) {
        const distance = route.distance_km || 1;
        return this.calculateTotalCost(route) / distance;
    }

    /**
     * Calculate cost per minute
     * @param {Object} route - Route object
     * @returns {number} Cost per minute
     */
    calculateCostPerMinute(route) {
        const duration = route.duration_minutes || 1;
        return this.calculateTotalCost(route) / duration;
    }

    /**
     * Select a route
     * @param {number} index - Route index
     * @returns {Object} Selected route
     */
    selectRoute(index) {
        if (index >= 0 && index < this.routes.length) {
            this.selectedRoute = this.routes[index];
            return this.selectedRoute;
        }
        return null;
    }

    /**
     * Get selected route
     * @returns {Object} Selected route
     */
    getSelectedRoute() {
        return this.selectedRoute;
    }

    /**
     * Get all routes
     * @returns {Array} All routes
     */
    getRoutes() {
        return [...this.routes];
    }

    /**
     * Get route count
     * @returns {number} Number of routes
     */
    getRouteCount() {
        return this.routes.length;
    }

    /**
     * Clear routes
     */
    clearRoutes() {
        this.routes = [];
        this.selectedRoute = null;
    }
}


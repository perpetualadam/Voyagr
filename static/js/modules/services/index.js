/**
 * @file Services Module Index - Exports all service modules
 * @module modules/services
 */

export { LocationService } from './location.js';
export { NotificationsService } from './notifications.js';
export { AnalyticsService } from './analytics.js';

/**
 * Create services system with all components
 * @param {Object} options - Configuration options
 * @returns {Object} Services system object
 */
export function createServicesSystem(options = {}) {
    const { LocationService } = require('./location.js');
    const { NotificationsService } = require('./notifications.js');
    const { AnalyticsService } = require('./analytics.js');

    return {
        location: new LocationService(options.location || {}),
        notifications: new NotificationsService(options.notifications || {}),
        analytics: new AnalyticsService(options.analytics || {}),

        /**
         * Get services statistics
         * @returns {Object} Statistics
         */
        getStats() {
            return {
                location: this.location.getCacheStats(),
                notifications: {
                    count: this.notifications.getAll().length,
                    enabled: this.notifications.enabled
                },
                analytics: {
                    sessionId: this.analytics.sessionId,
                    pendingEvents: this.analytics.getPendingEvents().length,
                    enabled: this.analytics.enabled
                }
            };
        },

        /**
         * Flush all pending data
         * @async
         */
        async flushAll() {
            await this.analytics.flush();
        }
    };
}


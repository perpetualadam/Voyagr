/**
 * @file Analytics Service Module - Handles analytics tracking
 * @module modules/services/analytics
 */

/**
 * AnalyticsService class - Manages analytics tracking
 * @class AnalyticsService
 */
export class AnalyticsService {
    constructor(config = {}) {
        this.enabled = config.enabled !== false;
        this.endpoint = config.endpoint || '/api/analytics';
        this.events = [];
        this.sessionId = this.generateSessionId();
        this.batchSize = config.batchSize || 10;
        this.batchTimeout = config.batchTimeout || 30000; // 30 seconds
        this.batchTimer = null;
    }

    /**
     * Generate session ID
     * @returns {string} Session ID
     */
    generateSessionId() {
        return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Track event
     * @param {string} eventName - Event name
     * @param {Object} data - Event data
     */
    trackEvent(eventName, data = {}) {
        if (!this.enabled) return;

        const event = {
            name: eventName,
            data,
            timestamp: Date.now(),
            sessionId: this.sessionId
        };

        this.events.push(event);

        // Send batch if size reached
        if (this.events.length >= this.batchSize) {
            this.sendBatch();
        } else if (!this.batchTimer) {
            // Set timeout for batch send
            this.batchTimer = setTimeout(() => this.sendBatch(), this.batchTimeout);
        }
    }

    /**
     * Track page view
     * @param {string} page - Page name
     * @param {Object} data - Additional data
     */
    trackPageView(page, data = {}) {
        this.trackEvent('pageView', { page, ...data });
    }

    /**
     * Track user action
     * @param {string} action - Action name
     * @param {Object} data - Action data
     */
    trackAction(action, data = {}) {
        this.trackEvent('userAction', { action, ...data });
    }

    /**
     * Track error
     * @param {string} message - Error message
     * @param {Object} data - Error data
     */
    trackError(message, data = {}) {
        this.trackEvent('error', { message, ...data });
    }

    /**
     * Track performance metric
     * @param {string} metric - Metric name
     * @param {number} value - Metric value
     * @param {Object} data - Additional data
     */
    trackMetric(metric, value, data = {}) {
        this.trackEvent('metric', { metric, value, ...data });
    }

    /**
     * Send batch of events
     * @async
     */
    async sendBatch() {
        if (this.events.length === 0) return;

        const batch = this.events.splice(0, this.batchSize);

        try {
            const response = await fetch(this.endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ events: batch })
            });

            if (!response.ok) {
                console.error(`Analytics error: HTTP ${response.status}`);
                // Re-add events to queue on failure
                this.events.unshift(...batch);
            }
        } catch (error) {
            console.error('Analytics send error:', error);
            // Re-add events to queue on failure
            this.events.unshift(...batch);
        }

        // Clear timer
        if (this.batchTimer) {
            clearTimeout(this.batchTimer);
            this.batchTimer = null;
        }

        // Schedule next batch if events remain
        if (this.events.length > 0) {
            this.batchTimer = setTimeout(() => this.sendBatch(), this.batchTimeout);
        }
    }

    /**
     * Get pending events
     * @returns {Array} Pending events
     */
    getPendingEvents() {
        return [...this.events];
    }

    /**
     * Clear pending events
     */
    clearPendingEvents() {
        this.events = [];
    }

    /**
     * Enable analytics
     */
    enable() {
        this.enabled = true;
    }

    /**
     * Disable analytics
     */
    disable() {
        this.enabled = false;
    }

    /**
     * Flush all events
     * @async
     */
    async flush() {
        while (this.events.length > 0) {
            await this.sendBatch();
        }
    }
}


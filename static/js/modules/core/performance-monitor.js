/**
 * @file Performance Monitoring Module - Track performance metrics
 * @module core/performance-monitor
 */

/**
 * PerformanceMonitor class - Monitors application performance
 * @class PerformanceMonitor
 */
export class PerformanceMonitor {
    /**
     * Initialize PerformanceMonitor
     * @constructor
     * @param {Object} config - Configuration
     */
    constructor(config = {}) {
        this.config = config;
        this.metrics = {
            pageLoad: [],
            apiCalls: [],
            memory: [],
            rendering: []
        };
        this.maxEntries = config.maxEntries || 1000;
    }

    /**
     * Measure page load time
     * @function measurePageLoad
     */
    measurePageLoad() {
        if (window.performance && window.performance.timing) {
            const timing = window.performance.timing;
            const loadTime = timing.loadEventEnd - timing.navigationStart;
            
            this.metrics.pageLoad.push({
                timestamp: Date.now(),
                duration: loadTime
            });

            this.trimMetrics('pageLoad');
            console.log(`[PerformanceMonitor] Page Load: ${loadTime}ms`);
        }
    }

    /**
     * Measure API call time
     * @function measureAPICall
     * @param {string} endpoint - API endpoint
     * @param {number} duration - Call duration in ms
     */
    measureAPICall(endpoint, duration) {
        this.metrics.apiCalls.push({
            timestamp: Date.now(),
            endpoint,
            duration
        });

        this.trimMetrics('apiCalls');
    }

    /**
     * Measure memory usage
     * @function measureMemory
     */
    measureMemory() {
        if (performance.memory) {
            const memory = {
                timestamp: Date.now(),
                usedJSHeapSize: performance.memory.usedJSHeapSize,
                totalJSHeapSize: performance.memory.totalJSHeapSize,
                jsHeapSizeLimit: performance.memory.jsHeapSizeLimit
            };

            this.metrics.memory.push(memory);
            this.trimMetrics('memory');
        }
    }

    /**
     * Measure rendering time
     * @function measureRendering
     * @param {string} component - Component name
     * @param {number} duration - Render duration in ms
     */
    measureRendering(component, duration) {
        this.metrics.rendering.push({
            timestamp: Date.now(),
            component,
            duration
        });

        this.trimMetrics('rendering');
    }

    /**
     * Trim metrics to max entries
     * @function trimMetrics
     * @param {string} metricType - Metric type
     */
    trimMetrics(metricType) {
        if (this.metrics[metricType].length > this.maxEntries) {
            this.metrics[metricType] = this.metrics[metricType].slice(-this.maxEntries);
        }
    }

    /**
     * Get average metric
     * @function getAverage
     * @param {string} metricType - Metric type
     * @param {string} field - Field name (default: 'duration')
     * @returns {number} Average value
     */
    getAverage(metricType, field = 'duration') {
        const metrics = this.metrics[metricType];
        if (metrics.length === 0) return 0;

        const sum = metrics.reduce((acc, m) => acc + (m[field] || 0), 0);
        return sum / metrics.length;
    }

    /**
     * Get percentile
     * @function getPercentile
     * @param {string} metricType - Metric type
     * @param {number} percentile - Percentile (0-100)
     * @param {string} field - Field name (default: 'duration')
     * @returns {number} Percentile value
     */
    getPercentile(metricType, percentile, field = 'duration') {
        const metrics = this.metrics[metricType];
        if (metrics.length === 0) return 0;

        const values = metrics
            .map(m => m[field] || 0)
            .sort((a, b) => a - b);

        const index = Math.ceil((percentile / 100) * values.length) - 1;
        return values[Math.max(0, index)];
    }

    /**
     * Get performance report
     * @function getReport
     * @returns {Object} Performance report
     */
    getReport() {
        return {
            pageLoad: {
                average: this.getAverage('pageLoad'),
                p95: this.getPercentile('pageLoad', 95),
                p99: this.getPercentile('pageLoad', 99),
                count: this.metrics.pageLoad.length
            },
            apiCalls: {
                average: this.getAverage('apiCalls'),
                p95: this.getPercentile('apiCalls', 95),
                p99: this.getPercentile('apiCalls', 99),
                count: this.metrics.apiCalls.length
            },
            memory: {
                average: this.getAverage('memory', 'usedJSHeapSize'),
                current: this.metrics.memory.length > 0
                    ? this.metrics.memory[this.metrics.memory.length - 1].usedJSHeapSize
                    : 0,
                count: this.metrics.memory.length
            },
            rendering: {
                average: this.getAverage('rendering'),
                p95: this.getPercentile('rendering', 95),
                p99: this.getPercentile('rendering', 99),
                count: this.metrics.rendering.length
            }
        };
    }

    /**
     * Clear metrics
     * @function clear
     */
    clear() {
        this.metrics = {
            pageLoad: [],
            apiCalls: [],
            memory: [],
            rendering: []
        };
    }

    /**
     * Export metrics as JSON
     * @function export
     * @returns {string} JSON string
     */
    export() {
        return JSON.stringify({
            timestamp: Date.now(),
            report: this.getReport(),
            metrics: this.metrics
        }, null, 2);
    }
}

export default PerformanceMonitor;


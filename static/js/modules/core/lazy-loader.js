/**
 * @file Lazy Loading Module - Load data on demand
 * @module core/lazy-loader
 */

/**
 * LazyLoader class - Manages lazy loading of data
 * @class LazyLoader
 */
export class LazyLoader {
    /**
     * Initialize LazyLoader
     * @constructor
     * @param {Object} config - Configuration
     * @param {number} config.intersectionThreshold - Intersection observer threshold (default: 0.1)
     * @param {number} config.debounceDelay - Debounce delay in ms (default: 300)
     */
    constructor(config = {}) {
        this.config = {
            intersectionThreshold: config.intersectionThreshold || 0.1,
            debounceDelay: config.debounceDelay || 300,
            ...config
        };
        
        this.loaders = new Map();
        this.loadedData = new Map();
        this.pendingLoads = new Map();
        this.observer = null;
        this.debounceTimers = new Map();
    }

    /**
     * Initialize intersection observer
     * @function initialize
     */
    initialize() {
        this.observer = new IntersectionObserver(
            (entries) => this.handleIntersection(entries),
            { threshold: this.config.intersectionThreshold }
        );
    }

    /**
     * Register lazy loader for element
     * @function register
     * @param {string} elementId - Element ID
     * @param {Function} loadFn - Load function
     * @param {Object} options - Options
     */
    register(elementId, loadFn, options = {}) {
        const element = document.getElementById(elementId);
        if (!element) {
            console.warn(`Element not found: ${elementId}`);
            return;
        }

        this.loaders.set(elementId, {
            element,
            loadFn,
            options,
            loaded: false
        });

        // Observe element
        if (this.observer) {
            this.observer.observe(element);
        }
    }

    /**
     * Handle intersection observer events
     * @function handleIntersection
     * @param {Array} entries - Intersection entries
     */
    handleIntersection(entries) {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const elementId = entry.target.id;
                this.debounceLoad(elementId);
            }
        });
    }

    /**
     * Debounce load to prevent multiple calls
     * @function debounceLoad
     * @param {string} elementId - Element ID
     */
    debounceLoad(elementId) {
        // Clear existing timer
        if (this.debounceTimers.has(elementId)) {
            clearTimeout(this.debounceTimers.get(elementId));
        }

        // Set new timer
        const timer = setTimeout(() => {
            this.load(elementId);
            this.debounceTimers.delete(elementId);
        }, this.config.debounceDelay);

        this.debounceTimers.set(elementId, timer);
    }

    /**
     * Load data for element
     * @async
     * @function load
     * @param {string} elementId - Element ID
     */
    async load(elementId) {
        const loader = this.loaders.get(elementId);
        if (!loader || loader.loaded) return;

        try {
            // Check if already loading
            if (this.pendingLoads.has(elementId)) {
                return this.pendingLoads.get(elementId);
            }

            // Load data
            const loadPromise = loader.loadFn();
            this.pendingLoads.set(elementId, loadPromise);

            const data = await loadPromise;
            this.loadedData.set(elementId, data);

            // Mark as loaded
            loader.loaded = true;
            loader.element.classList.add('lazy-loaded');

            // Clean up
            this.pendingLoads.delete(elementId);
            if (this.observer) {
                this.observer.unobserve(loader.element);
            }

            return data;
        } catch (error) {
            console.error(`Lazy load error for ${elementId}:`, error);
            this.pendingLoads.delete(elementId);
            throw error;
        }
    }

    /**
     * Get loaded data
     * @function getData
     * @param {string} elementId - Element ID
     * @returns {any} Loaded data
     */
    getData(elementId) {
        return this.loadedData.get(elementId);
    }

    /**
     * Cleanup
     * @function destroy
     */
    destroy() {
        if (this.observer) {
            this.observer.disconnect();
        }
        this.debounceTimers.forEach(timer => clearTimeout(timer));
        this.loaders.clear();
        this.loadedData.clear();
        this.pendingLoads.clear();
        this.debounceTimers.clear();
    }
}

export default LazyLoader;


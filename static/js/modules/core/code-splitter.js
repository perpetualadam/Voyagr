/**
 * @file Code Splitting Module - Load modules on demand
 * @module core/code-splitter
 */

/**
 * CodeSplitter class - Manages dynamic module loading
 * @class CodeSplitter
 */
export class CodeSplitter {
    /**
     * Initialize CodeSplitter
     * @constructor
     * @param {Object} config - Configuration
     */
    constructor(config = {}) {
        this.config = config;
        this.loadedModules = new Map();
        this.pendingLoads = new Map();
        this.moduleMap = {
            'routing': './routing/index.js',
            'navigation': './navigation/index.js',
            'features': './features/index.js',
            'ui': './ui/index.js',
            'storage': './storage/index.js',
            'services': './services/index.js',
            'api': './api/index.js'
        };
    }

    /**
     * Load module dynamically
     * @async
     * @function loadModule
     * @param {string} moduleName - Module name
     * @returns {Promise<any>} Loaded module
     */
    async loadModule(moduleName) {
        // Return cached module
        if (this.loadedModules.has(moduleName)) {
            return this.loadedModules.get(moduleName);
        }

        // Return pending load
        if (this.pendingLoads.has(moduleName)) {
            return this.pendingLoads.get(moduleName);
        }

        try {
            // Get module path
            const modulePath = this.moduleMap[moduleName];
            if (!modulePath) {
                throw new Error(`Unknown module: ${moduleName}`);
            }

            // Load module
            const loadPromise = import(modulePath);
            this.pendingLoads.set(moduleName, loadPromise);

            const module = await loadPromise;
            this.loadedModules.set(moduleName, module);
            this.pendingLoads.delete(moduleName);

            console.log(`[CodeSplitter] Loaded module: ${moduleName}`);
            return module;
        } catch (error) {
            console.error(`[CodeSplitter] Failed to load module ${moduleName}:`, error);
            this.pendingLoads.delete(moduleName);
            throw error;
        }
    }

    /**
     * Load multiple modules
     * @async
     * @function loadModules
     * @param {Array} moduleNames - Module names
     * @returns {Promise<Object>} Loaded modules
     */
    async loadModules(moduleNames) {
        const modules = {};
        const promises = moduleNames.map(async (name) => {
            modules[name] = await this.loadModule(name);
        });

        await Promise.all(promises);
        return modules;
    }

    /**
     * Preload modules
     * @async
     * @function preload
     * @param {Array} moduleNames - Module names to preload
     */
    async preload(moduleNames) {
        try {
            await this.loadModules(moduleNames);
            console.log(`[CodeSplitter] Preloaded modules: ${moduleNames.join(', ')}`);
        } catch (error) {
            console.error('[CodeSplitter] Preload error:', error);
        }
    }

    /**
     * Get loaded module
     * @function getModule
     * @param {string} moduleName - Module name
     * @returns {any} Loaded module or null
     */
    getModule(moduleName) {
        return this.loadedModules.get(moduleName) || null;
    }

    /**
     * Check if module is loaded
     * @function isLoaded
     * @param {string} moduleName - Module name
     * @returns {boolean} True if loaded
     */
    isLoaded(moduleName) {
        return this.loadedModules.has(moduleName);
    }

    /**
     * Unload module
     * @function unload
     * @param {string} moduleName - Module name
     */
    unload(moduleName) {
        this.loadedModules.delete(moduleName);
        console.log(`[CodeSplitter] Unloaded module: ${moduleName}`);
    }

    /**
     * Get statistics
     * @function getStats
     * @returns {Object} Statistics
     */
    getStats() {
        return {
            loaded: this.loadedModules.size,
            pending: this.pendingLoads.size,
            modules: Array.from(this.loadedModules.keys())
        };
    }

    /**
     * Clear all modules
     * @function clear
     */
    clear() {
        this.loadedModules.clear();
        this.pendingLoads.clear();
        console.log('[CodeSplitter] Cleared all modules');
    }
}

export default CodeSplitter;


/**
 * @file Storage Module Index - Exports all storage modules
 * @module modules/storage
 */

export { DatabaseManager } from './database.js';
export { CacheStorage } from './cache.js';
export { SettingsStorage } from './settings.js';

/**
 * Create storage system with all components
 * @param {Object} options - Configuration options
 * @returns {Object} Storage system object
 */
export function createStorageSystem(options = {}) {
    const { DatabaseManager } = require('./database.js');
    const { CacheStorage } = require('./cache.js');
    const { SettingsStorage } = require('./settings.js');

    return {
        database: new DatabaseManager(options.database || {}),
        cache: new CacheStorage(options.cache || {}),
        settings: new SettingsStorage(options.settings || {}),

        /**
         * Initialize storage system
         * @async
         */
        async initialize() {
            await this.database.initialize();
            this.settings.initialize();
            this.cache.cleanExpired();
        },

        /**
         * Get storage statistics
         * @returns {Object} Statistics
         */
        getStats() {
            return {
                database: {
                    name: this.database.dbName,
                    stores: this.database.stores
                },
                cache: this.cache.getStats(),
                settings: {
                    count: Object.keys(this.settings.getAllSettings()).length
                }
            };
        },

        /**
         * Clear all storage
         * @async
         */
        async clearAll() {
            this.cache.clearAll();
            this.settings.resetToDefaults();
            
            for (const store of this.database.stores) {
                await this.database.clearStore(store);
            }
        }
    };
}


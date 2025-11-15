/**
 * @file IndexedDB Cache Module - Persistent browser storage
 * @module storage/indexed-db-cache
 */

/**
 * IndexedDBCache class - Persistent caching using IndexedDB
 * @class IndexedDBCache
 */
export class IndexedDBCache {
    /**
     * Initialize IndexedDBCache
     * @constructor
     * @param {Object} config - Configuration
     * @param {string} config.dbName - Database name (default: 'voyagr-cache')
     * @param {string} config.storeName - Object store name (default: 'cache')
     * @param {number} config.version - Database version (default: 1)
     */
    constructor(config = {}) {
        this.dbName = config.dbName || 'voyagr-cache';
        this.storeName = config.storeName || 'cache';
        this.version = config.version || 1;
        this.db = null;
        this.initialized = false;
    }

    /**
     * Initialize database
     * @async
     * @function initialize
     */
    async initialize() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.version);

            request.onerror = () => {
                console.error('IndexedDB open error:', request.error);
                reject(request.error);
            };

            request.onsuccess = () => {
                this.db = request.result;
                this.initialized = true;
                console.log('[IndexedDBCache] Initialized');
                resolve();
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains(this.storeName)) {
                    db.createObjectStore(this.storeName, { keyPath: 'key' });
                    console.log('[IndexedDBCache] Created object store');
                }
            };
        });
    }

    /**
     * Set value in cache
     * @async
     * @function set
     * @param {string} key - Cache key
     * @param {any} value - Value to cache
     * @param {number} ttl - Time to live in ms (optional)
     */
    async set(key, value, ttl = null) {
        if (!this.initialized) await this.initialize();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);

            const data = {
                key,
                value,
                timestamp: Date.now(),
                ttl
            };

            const request = store.put(data);

            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve();
        });
    }

    /**
     * Get value from cache
     * @async
     * @function get
     * @param {string} key - Cache key
     * @returns {Promise<any>} Cached value or null
     */
    async get(key) {
        if (!this.initialized) await this.initialize();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readonly');
            const store = transaction.objectStore(this.storeName);
            const request = store.get(key);

            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                const data = request.result;
                if (!data) {
                    resolve(null);
                    return;
                }

                // Check TTL
                if (data.ttl) {
                    const age = Date.now() - data.timestamp;
                    if (age > data.ttl) {
                        this.delete(key);
                        resolve(null);
                        return;
                    }
                }

                resolve(data.value);
            };
        });
    }

    /**
     * Delete value from cache
     * @async
     * @function delete
     * @param {string} key - Cache key
     */
    async delete(key) {
        if (!this.initialized) await this.initialize();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);
            const request = store.delete(key);

            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve();
        });
    }

    /**
     * Clear all cache
     * @async
     * @function clear
     */
    async clear() {
        if (!this.initialized) await this.initialize();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);
            const request = store.clear();

            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                console.log('[IndexedDBCache] Cleared');
                resolve();
            };
        });
    }

    /**
     * Get cache size
     * @async
     * @function getSize
     * @returns {Promise<number>} Number of items in cache
     */
    async getSize() {
        if (!this.initialized) await this.initialize();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readonly');
            const store = transaction.objectStore(this.storeName);
            const request = store.count();

            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve(request.result);
        });
    }

    /**
     * Close database
     * @function close
     */
    close() {
        if (this.db) {
            this.db.close();
            this.initialized = false;
            console.log('[IndexedDBCache] Closed');
        }
    }
}

export default IndexedDBCache;


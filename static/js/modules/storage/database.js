/**
 * @file Database Storage Module - Handles IndexedDB operations
 * @module modules/storage/database
 */

/**
 * DatabaseManager class - Manages IndexedDB storage
 * @class DatabaseManager
 */
export class DatabaseManager {
    constructor(config = {}) {
        this.dbName = config.dbName || 'VoyagrDB';
        this.version = config.version || 1;
        this.db = null;
        this.stores = config.stores || ['routes', 'trips', 'locations', 'settings'];
    }

    /**
     * Initialize database
     * @async
     * @returns {Promise<Object>} Database instance
     */
    async initialize() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.version);

            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                this.db = request.result;
                resolve(this.db);
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                this.stores.forEach(store => {
                    if (!db.objectStoreNames.contains(store)) {
                        db.createObjectStore(store, { keyPath: 'id', autoIncrement: true });
                    }
                });
            };
        });
    }

    /**
     * Add item to store
     * @async
     * @param {string} storeName - Store name
     * @param {Object} item - Item to add
     * @returns {Promise<number>} Item ID
     */
    async addItem(storeName, item) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.add(item);

            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve(request.result);
        });
    }

    /**
     * Get item from store
     * @async
     * @param {string} storeName - Store name
     * @param {number} id - Item ID
     * @returns {Promise<Object>} Item
     */
    async getItem(storeName, id) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readonly');
            const store = transaction.objectStore(storeName);
            const request = store.get(id);

            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve(request.result);
        });
    }

    /**
     * Get all items from store
     * @async
     * @param {string} storeName - Store name
     * @returns {Promise<Array>} All items
     */
    async getAllItems(storeName) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readonly');
            const store = transaction.objectStore(storeName);
            const request = store.getAll();

            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve(request.result);
        });
    }

    /**
     * Update item in store
     * @async
     * @param {string} storeName - Store name
     * @param {Object} item - Item to update
     * @returns {Promise<void>}
     */
    async updateItem(storeName, item) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.put(item);

            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve();
        });
    }

    /**
     * Delete item from store
     * @async
     * @param {string} storeName - Store name
     * @param {number} id - Item ID
     * @returns {Promise<void>}
     */
    async deleteItem(storeName, id) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.delete(id);

            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve();
        });
    }

    /**
     * Clear store
     * @async
     * @param {string} storeName - Store name
     * @returns {Promise<void>}
     */
    async clearStore(storeName) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.clear();

            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve();
        });
    }

    /**
     * Close database
     */
    close() {
        if (this.db) {
            this.db.close();
        }
    }
}


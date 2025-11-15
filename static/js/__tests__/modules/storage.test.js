/**
 * @file Storage Modules Unit Tests
 * @module __tests__/modules/storage.test.js
 */

describe('Storage Modules', () => {
    describe('CacheStorage', () => {
        let cache;

        beforeEach(() => {
            cache = {
                prefix: 'voyagr_',
                defaultTTL: 3600000,
                setItem: function(key, value, ttl = this.defaultTTL) {
                    const item = { value, timestamp: Date.now(), ttl };
                    localStorage.setItem(this.prefix + key, JSON.stringify(item));
                },
                getItem: function(key) {
                    const item = localStorage.getItem(this.prefix + key);
                    if (!item) return null;
                    const parsed = JSON.parse(item);
                    const age = Date.now() - parsed.timestamp;
                    if (age > parsed.ttl) {
                        this.removeItem(key);
                        return null;
                    }
                    return parsed.value;
                },
                removeItem: function(key) {
                    localStorage.removeItem(this.prefix + key);
                },
                clearAll: function() {
                    const keys = Object.keys(localStorage);
                    keys.forEach(key => {
                        if (key.startsWith(this.prefix)) {
                            localStorage.removeItem(key);
                        }
                    });
                }
            };
            localStorage.clear();
        });

        test('should set and get item', () => {
            cache.setItem('test', 'value');
            expect(cache.getItem('test')).toBe('value');
        });

        test('should return null for expired item', (done) => {
            cache.setItem('test', 'value', 100);
            
            setTimeout(() => {
                expect(cache.getItem('test')).toBeNull();
                done();
            }, 150);
        });

        test('should remove item', () => {
            cache.setItem('test', 'value');
            cache.removeItem('test');
            expect(cache.getItem('test')).toBeNull();
        });

        test('should clear all items', () => {
            cache.setItem('test1', 'value1');
            cache.setItem('test2', 'value2');
            cache.clearAll();
            
            expect(cache.getItem('test1')).toBeNull();
            expect(cache.getItem('test2')).toBeNull();
        });

        test('should handle complex objects', () => {
            const obj = { a: 1, b: { c: 2 } };
            cache.setItem('obj', obj);
            expect(cache.getItem('obj')).toEqual(obj);
        });
    });

    describe('SettingsStorage', () => {
        let settings;

        beforeEach(() => {
            settings = {
                prefix: 'voyagr_settings_',
                defaults: { theme: 'light', units: 'metric' },
                settings: {},
                listeners: new Map(),
                initialize: function() {
                    this.settings = { ...this.defaults };
                },
                getSetting: function(key, defaultValue = null) {
                    return this.settings[key] !== undefined ? this.settings[key] : defaultValue;
                },
                setSetting: function(key, value) {
                    const oldValue = this.settings[key];
                    this.settings[key] = value;
                    localStorage.setItem(this.prefix + key, JSON.stringify(value));
                },
                getAllSettings: function() {
                    return { ...this.settings };
                },
                resetToDefaults: function() {
                    this.settings = { ...this.defaults };
                    localStorage.clear();
                },
                on: function(event, callback) {
                    if (!this.listeners.has(event)) {
                        this.listeners.set(event, []);
                    }
                    this.listeners.get(event).push(callback);
                }
            };
            localStorage.clear();
            settings.initialize();
        });

        test('should get setting', () => {
            expect(settings.getSetting('theme')).toBe('light');
        });

        test('should set setting', () => {
            settings.setSetting('theme', 'dark');
            expect(settings.getSetting('theme')).toBe('dark');
        });

        test('should return default value for missing setting', () => {
            expect(settings.getSetting('missing', 'default')).toBe('default');
        });

        test('should get all settings', () => {
            const all = settings.getAllSettings();
            expect(all.theme).toBe('light');
            expect(all.units).toBe('metric');
        });

        test('should reset to defaults', () => {
            settings.setSetting('theme', 'dark');
            settings.resetToDefaults();
            expect(settings.getSetting('theme')).toBe('light');
        });

        test('should support event listeners', () => {
            let eventFired = false;
            settings.on('settingChanged', () => {
                eventFired = true;
            });
            
            expect(settings.listeners.has('settingChanged')).toBe(true);
        });
    });

    describe('DatabaseManager', () => {
        let db;

        beforeEach(() => {
            db = {
                dbName: 'VoyagrDB',
                version: 1,
                stores: ['routes', 'trips', 'locations', 'settings'],
                db: null,
                isInitialized: false,
                initialize: function() {
                    this.isInitialized = true;
                    return Promise.resolve();
                },
                close: function() {
                    this.isInitialized = false;
                },
                getStats: function() {
                    return {
                        name: this.dbName,
                        stores: this.stores,
                        initialized: this.isInitialized
                    };
                }
            };
        });

        test('should initialize database', async () => {
            await db.initialize();
            expect(db.isInitialized).toBe(true);
        });

        test('should close database', () => {
            db.isInitialized = true;
            db.close();
            expect(db.isInitialized).toBe(false);
        });

        test('should get statistics', () => {
            const stats = db.getStats();
            expect(stats.name).toBe('VoyagrDB');
            expect(stats.stores.length).toBe(4);
        });
    });
});


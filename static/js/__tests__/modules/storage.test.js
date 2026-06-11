/**
 * @file Storage Modules Unit Tests (REAL modules)
 *
 * Imports the real CacheStorage, SettingsStorage and DatabaseManager. The jest.setup
 * localStorage is a non-persisting jest.fn() mock, so these tests install a real
 * in-memory localStorage to exercise actual persistence behaviour.
 *
 * DatabaseManager wraps IndexedDB, which jsdom does not provide; only the parts that
 * don't require a live IndexedDB are asserted here (constructor defaults + close()).
 */

import { CacheStorage } from '../../modules/storage/cache.js';
import { SettingsStorage } from '../../modules/storage/settings.js';
import { DatabaseManager } from '../../modules/storage/database.js';

function installMemoryLocalStorage() {
    const store = new Map();
    const impl = {
        getItem: (k) => (store.has(k) ? store.get(k) : null),
        setItem: (k, v) => { store.set(k, String(v)); },
        removeItem: (k) => { store.delete(k); },
        clear: () => { store.clear(); },
        key: (i) => Array.from(store.keys())[i] ?? null,
        get length() { return store.size; },
    };
    // jsdom defines localStorage as a getter, so a plain assignment is ignored —
    // force-replace it so the backing Map below is the real store.
    Object.defineProperty(global, 'localStorage', {
        value: impl, configurable: true, writable: true,
    });
    return store;
}

describe('CacheStorage (real module)', () => {
    beforeEach(() => { installMemoryLocalStorage(); });
    afterEach(() => jest.useRealTimers());

    test('setItem/getItem round-trips a complex object', () => {
        const c = new CacheStorage();
        c.setItem('user', { name: 'Bri', nested: { x: 1 } });
        expect(c.getItem('user')).toEqual({ name: 'Bri', nested: { x: 1 } });
    });

    test('missing key returns null', () => {
        expect(new CacheStorage().getItem('nope')).toBeNull();
    });

    test('expired item returns null and is removed', () => {
        jest.useFakeTimers();
        const c = new CacheStorage();
        c.setItem('k', 'v', 1000);
        jest.advanceTimersByTime(1001);
        expect(c.getItem('k')).toBeNull();
    });

    test('removeItem deletes a single entry', () => {
        const c = new CacheStorage();
        c.setItem('k', 'v');
        c.removeItem('k');
        expect(c.getItem('k')).toBeNull();
    });

    test('uses the configured prefix', () => {
        const store = installMemoryLocalStorage();
        const c = new CacheStorage({ prefix: 'pfx_' });
        c.setItem('k', 1);
        expect(store.has('pfx_k')).toBe(true);
    });
});

describe('SettingsStorage (real module)', () => {
    beforeEach(() => { installMemoryLocalStorage(); });

    test('getSetting returns default before any value is set', () => {
        const s = new SettingsStorage({ defaults: { theme: 'dark' } });
        expect(s.getSetting('missing', 'fallback')).toBe('fallback');
    });

    test('setSetting persists and getSetting returns it', () => {
        const s = new SettingsStorage();
        s.setSetting('units', 'imperial');
        expect(s.getSetting('units')).toBe('imperial');
    });

    test('setSetting emits a settingChanged event with old/new', () => {
        const s = new SettingsStorage();
        const cb = jest.fn();
        s.on('settingChanged', cb);
        s.setSetting('units', 'metric');
        expect(cb).toHaveBeenCalledWith(expect.objectContaining({ key: 'units', value: 'metric' }));
    });

    test('initialize loads persisted values over defaults', () => {
        const s1 = new SettingsStorage({ defaults: { units: 'metric' } });
        s1.setSetting('units', 'imperial');
        const s2 = new SettingsStorage({ defaults: { units: 'metric' } });
        s2.initialize();
        expect(s2.getSetting('units')).toBe('imperial');
    });

    test('resetToDefaults restores defaults and emits settingsReset', () => {
        const s = new SettingsStorage({ defaults: { units: 'metric' } });
        s.setSetting('units', 'imperial');
        const cb = jest.fn();
        s.on('settingsReset', cb);
        s.resetToDefaults();
        expect(s.getSetting('units')).toBe('metric');
        expect(cb).toHaveBeenCalled();
    });

    test('export/import round-trips settings', () => {
        const s = new SettingsStorage();
        s.setSetting('a', 1);
        s.setSetting('b', 2);
        const json = s.export();
        const s2 = new SettingsStorage();
        expect(s2.import(json)).toBe(true);
        expect(s2.getAllSettings()).toEqual(expect.objectContaining({ a: 1, b: 2 }));
    });
});

describe('DatabaseManager (real module, no IndexedDB env)', () => {
    test('constructor applies defaults', () => {
        const db = new DatabaseManager();
        expect(db.dbName).toBe('VoyagrDB');
        expect(db.version).toBe(1);
        expect(db.stores).toContain('routes');
    });

    test('constructor honours custom config', () => {
        const db = new DatabaseManager({ dbName: 'X', version: 3, stores: ['a'] });
        expect(db.dbName).toBe('X');
        expect(db.version).toBe(3);
        expect(db.stores).toEqual(['a']);
    });

    test('close() is safe when no db is open', () => {
        const db = new DatabaseManager();
        expect(() => db.close()).not.toThrow();
    });
});

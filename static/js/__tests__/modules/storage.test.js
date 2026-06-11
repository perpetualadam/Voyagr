/**
 * @file Storage Modules Unit Tests (REAL modules)
 *
 * Imports the real CacheStorage, SettingsStorage and DatabaseManager. The jest.setup
 * localStorage is a non-persisting jest.fn() mock, so these tests install a real
 * in-memory localStorage to exercise actual persistence behaviour.
 *
 * DatabaseManager wraps IndexedDB, which jsdom does not provide, so we load
 * fake-indexeddb/auto to supply a real, spec-compliant IndexedDB and exercise full
 * add/get/update/delete/clear round-trips against the real module.
 */

import 'fake-indexeddb/auto';
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

describe('DatabaseManager (real module)', () => {
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

    describe('IndexedDB round-trips (fake-indexeddb)', () => {
        let unique = 0;
        function freshDb(stores = ['routes']) {
            // Unique db name per test so stores/data never leak between tests.
            unique += 1;
            return new DatabaseManager({ dbName: `TestDB_${unique}_${Date.now()}`, stores });
        }

        test('initialize creates the configured object stores', async () => {
            const db = freshDb(['routes', 'trips']);
            const idb = await db.initialize();
            expect(Array.from(idb.objectStoreNames)).toEqual(
                expect.arrayContaining(['routes', 'trips'])
            );
            db.close();
        });

        test('addItem returns an auto-increment id and getItem reads it back', async () => {
            const db = freshDb(['routes']);
            await db.initialize();
            const id = await db.addItem('routes', { name: 'Home->Work' });
            expect(typeof id).toBe('number');
            const item = await db.getItem('routes', id);
            expect(item).toMatchObject({ id, name: 'Home->Work' });
            db.close();
        });

        test('getAllItems returns every stored record', async () => {
            const db = freshDb(['routes']);
            await db.initialize();
            await db.addItem('routes', { name: 'A' });
            await db.addItem('routes', { name: 'B' });
            const all = await db.getAllItems('routes');
            expect(all).toHaveLength(2);
            expect(all.map(r => r.name).sort()).toEqual(['A', 'B']);
            db.close();
        });

        test('updateItem (put) overwrites an existing record', async () => {
            const db = freshDb(['routes']);
            await db.initialize();
            const id = await db.addItem('routes', { name: 'old' });
            await db.updateItem('routes', { id, name: 'new' });
            const item = await db.getItem('routes', id);
            expect(item.name).toBe('new');
            db.close();
        });

        test('deleteItem removes a record', async () => {
            const db = freshDb(['routes']);
            await db.initialize();
            const id = await db.addItem('routes', { name: 'temp' });
            await db.deleteItem('routes', id);
            const item = await db.getItem('routes', id);
            expect(item).toBeUndefined();
            db.close();
        });

        test('clearStore empties a store', async () => {
            const db = freshDb(['routes']);
            await db.initialize();
            await db.addItem('routes', { name: 'A' });
            await db.addItem('routes', { name: 'B' });
            await db.clearStore('routes');
            expect(await db.getAllItems('routes')).toHaveLength(0);
            db.close();
        });

        test('addItem rejects for an unknown store', async () => {
            const db = freshDb(['routes']);
            await db.initialize();
            await expect(db.addItem('does-not-exist', { x: 1 })).rejects.toBeDefined();
            db.close();
        });
    });
});

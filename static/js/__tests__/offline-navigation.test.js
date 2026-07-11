/**
 * Tests for modules/navigation/offline-navigation.js
 */
require('fake-indexeddb/auto');
const OFF = require('../modules/navigation/offline-navigation.js');

describe('offline-navigation module', () => {
    test('exposes banner ids and style builders', () => {
        expect(OFF.OFFLINE_BANNER_ID).toBe('offlineBanner');
        expect(OFF.RESUME_NAV_BANNER_ID).toBe('resumeNavBanner');
        expect(OFF.getOfflineBannerStyleCssText()).toContain('position:fixed');
        expect(OFF.getResumeNavigationBannerStyleCssText()).toContain('bottom:80px');
    });

    test('buildOfflineBannerInnerHtml includes offline message', () => {
        const html = OFF.buildOfflineBannerInnerHtml();
        expect(html).toContain('offline');
        expect(html).toContain('📡');
    });

    test('buildResumeNavigationBannerHtml includes step count and buttons', () => {
        const html = OFF.buildResumeNavigationBannerHtml(12);
        expect(html).toContain('Resume navigation?');
        expect(html).toContain('12 steps');
        expect(html).toContain('resumeNavYes');
        expect(html).toContain('resumeNavNo');
    });
});

describe('offline route persistence helpers', () => {
    test('isPersistedRouteExpired respects four-hour TTL', () => {
        const now = 1_000_000;
        expect(OFF.isPersistedRouteExpired(now - OFF.ROUTE_PERSIST_MAX_AGE_MS - 1, now)).toBe(true);
        expect(OFF.isPersistedRouteExpired(now - OFF.ROUTE_PERSIST_MAX_AGE_MS + 1, now)).toBe(false);
    });

    test('buildActiveRoutePersistRecord normalises snapshot', () => {
        const record = OFF.buildActiveRoutePersistRecord({
            polyline: [[51.5, -0.1]],
            steps: [{ type: 1 }],
            stepIndex: 2,
            destination: '51.6,-0.2',
            routeData: { distance_km: 5 },
            savedAt: 42,
        });
        expect(record.id).toBe('current');
        expect(record.polyline).toHaveLength(1);
        expect(record.stepIndex).toBe(2);
        expect(record.destination).toBe('51.6,-0.2');
        expect(record.savedAt).toBe(42);
    });

    test('persist and load active route via IndexedDB', async () => {
        const record = OFF.buildActiveRoutePersistRecord({
            polyline: [[51.5, -0.1], [51.6, -0.2]],
            steps: [{ type: 8 }],
            stepIndex: 0,
            destination: '51.6,-0.2',
            routeData: { duration_minutes: 10 },
        });
        await OFF.persistActiveRouteRecord(indexedDB, record);
        const loaded = await OFF.loadActiveRouteRecord(indexedDB);
        expect(loaded.destination).toBe('51.6,-0.2');
        expect(loaded.steps).toHaveLength(1);
        await OFF.clearActiveRouteRecord(indexedDB);
        expect(await OFF.loadActiveRouteRecord(indexedDB)).toBeNull();
    });

    test('speed limit cache round-trip', async () => {
        await OFF.putSpeedLimitCacheEntry(indexedDB, '51.50,-0.10', 30, 'osm');
        const cached = await OFF.getSpeedLimitCacheEntry(indexedDB, '51.50,-0.10');
        expect(cached.speedLimit).toBe(30);
        expect(cached.source).toBe('osm');
    });
});

describe('tile precache planning helpers', () => {
    test('parseVectorTileSourcesFromStyle extracts templated vector sources', () => {
        const entries = OFF.parseVectorTileSourcesFromStyle({
            sources: {
                osm: { type: 'vector', tiles: ['https://tiles/{z}/{x}/{y}.pbf'], minzoom: 5, maxzoom: 14 },
                raster: { type: 'raster', tiles: ['https://img/{z}/{x}/{y}.png'] },
            },
        });
        expect(entries).toHaveLength(1);
        expect(entries[0].template).toContain('{z}');
        expect(entries[0].maxzoom).toBe(14);
    });

    test('expandTileTemplate substitutes z/x/y tokens', () => {
        expect(OFF.expandTileTemplate('https://t/{z}/{x}/{y}', 13, 4096, 2720))
            .toBe('https://t/13/4096/2720');
    });

    test('latLonToTileXY maps London to expected tile at z13', () => {
        const tile = OFF.latLonToTileXY(51.5, -0.1, 13);
        expect(tile.x).toBeGreaterThan(0);
        expect(tile.y).toBeGreaterThan(0);
    });

    test('buildRouteCorridorTileUrlPlan deduplicates and caps URLs', () => {
        const polyline = [];
        for (let i = 0; i < 200; i++) {
            polyline.push([51.5 + i * 0.001, -0.1 + i * 0.001]);
        }
        const plan = OFF.buildRouteCorridorTileUrlPlan(polyline, [
            { template: 'https://tiles/{z}/{x}/{y}.pbf', minzoom: 0, maxzoom: 15 },
            { template: 'https://alt/{z}/{x}/{y}.pbf', minzoom: 0, maxzoom: 15 },
        ], { maxUrls: 10, zoomLevels: [13, 14, 15], samplePoints: 20 });
        expect(plan.urls.length).toBeLessThanOrEqual(10);
        if (plan.originalCount > 10) {
            expect(plan.capped).toBe(true);
            expect(plan.urls.length).toBe(10);
        }
        expect(plan.urls[0]).toMatch(/^https:\/\//);
    });

    test('normalizePrefetchTileUrl resolves relative expanded tile paths', () => {
        expect(OFF.normalizePrefetchTileUrl('/tiles/13/4096/2720.pbf', 'https://app.test'))
            .toBe('https://app.test/tiles/13/4096/2720.pbf');
    });

    test('buildPrecacheRouteTilesExecutePlan gates on polyline and templates', () => {
        expect(OFF.buildCollectVectorTileTemplatesPreflightPlan({
            hasOfflineModule: false,
            hasMap: true,
        }).canCollect).toBe(false);

        const execute = OFF.buildPrecacheRouteTilesExecutePlan({
            polylineLength: 10,
            hasCaches: true,
            urls: ['https://tiles/1/1/1.pbf'],
            templateCount: 1,
        });
        expect(execute.shouldPrecache).toBe(true);
        expect(execute.batchSize).toBe(OFF.TILE_PRECACHE_BATCH_SIZE);
        expect(OFF.buildPrecacheRouteTilesExecutePlan({
            polylineLength: 1,
            hasCaches: true,
            urls: [],
            templateCount: 0,
        }).shouldPrecache).toBe(false);
    });

    test('buildTryResumeNavigationPreflightPlan requires polyline and steps', () => {
        expect(OFF.buildTryResumeNavigationPreflightPlan(null).shouldOffer).toBe(false);
        const offer = OFF.buildTryResumeNavigationPreflightPlan({
            polyline: [[51.5, -0.1], [51.6, -0.2]],
            steps: [{ type: 1 }, { type: 2 }],
            stepIndex: 1,
        });
        expect(offer.shouldOffer).toBe(true);
        expect(offer.stepCount).toBe(2);
        expect(offer.resumeStepIndex).toBe(1);
        expect(offer.resumeYesId).toBe(OFF.RESUME_NAV_YES_ID);
    });
});

/**
 * @file Weather Layer tests (REAL module: modules/map/weather-layer.js)
 *
 * The imperative add/remove/toggle functions live in the monolithic voyagr-app.js and
 * are tightly coupled to the live map + mutable globals, so they aren't importable. The
 * genuinely logic-bearing pieces (tile URL + MapLibre source/layer specs + type names)
 * were extracted into modules/map/weather-layer.js; voyagr-app.js delegates to them with
 * an inline fallback. These tests assert the real extracted behaviour.
 */

const WL = require('../modules/map/weather-layer.js');

describe('weather-layer module (real implementation)', () => {
    describe('buildWeatherTileUrl', () => {
        test('builds an OpenWeatherMap raster URL with type and key', () => {
            const url = WL.buildWeatherTileUrl('precipitation_new', 'KEY123');
            expect(url).toBe(
                'https://tile.openweathermap.org/map/precipitation_new/{z}/{x}/{y}.png?appid=KEY123'
            );
        });

        test('supports every documented layer type', () => {
            ['precipitation_new', 'clouds_new', 'temp_new', 'wind_new'].forEach(type => {
                const url = WL.buildWeatherTileUrl(type, 'k');
                expect(url).toContain(`/map/${type}/`);
                expect(url).toContain('appid=k');
            });
        });

        test('falls back to the default type for an unknown type', () => {
            const url = WL.buildWeatherTileUrl('bogus_type', 'k');
            expect(url).toContain(`/map/${WL.DEFAULT_WEATHER_LAYER_TYPE}/`);
        });

        test('tolerates a missing api key', () => {
            expect(WL.buildWeatherTileUrl('clouds_new')).toContain('appid=');
        });
    });

    describe('buildWeatherSourceSpec', () => {
        test('produces a raster source spec MapLibre can consume', () => {
            const spec = WL.buildWeatherSourceSpec('http://tiles/{z}/{x}/{y}.png');
            expect(spec).toMatchObject({
                type: 'raster',
                tiles: ['http://tiles/{z}/{x}/{y}.png'],
                tileSize: 256,
                minzoom: 1,
                maxzoom: 18,
            });
            expect(spec.bounds).toEqual([-180, -85.0511, 180, 85.0511]);
        });
    });

    describe('buildWeatherLayerSpec', () => {
        test('produces a raster layer bound to the weather source', () => {
            const spec = WL.buildWeatherLayerSpec();
            expect(spec).toMatchObject({
                id: WL.WEATHER_LAYER_ID,
                type: 'raster',
                source: WL.WEATHER_SOURCE_ID,
            });
            expect(spec.paint['raster-opacity']).toBe(0.7);
        });
    });

    describe('isValidWeatherLayerType / weatherLayerDisplayName', () => {
        test('recognises known types', () => {
            expect(WL.isValidWeatherLayerType('temp_new')).toBe(true);
            expect(WL.isValidWeatherLayerType('nope')).toBe(false);
        });

        test('maps types to human-friendly names', () => {
            expect(WL.weatherLayerDisplayName('precipitation_new')).toBe('Precipitation');
            expect(WL.weatherLayerDisplayName('clouds_new')).toBe('Clouds');
            expect(WL.weatherLayerDisplayName('temp_new')).toBe('Temperature');
            expect(WL.weatherLayerDisplayName('wind_new')).toBe('Wind');
        });

        test('returns the raw type when unknown', () => {
            expect(WL.weatherLayerDisplayName('custom')).toBe('custom');
        });
    });

    describe('source/layer spec compatibility', () => {
        test('layer.source matches the source id used when adding the source', () => {
            const url = WL.buildWeatherTileUrl('wind_new', 'k');
            const source = WL.buildWeatherSourceSpec(url);
            const layer = WL.buildWeatherLayerSpec();
            expect(layer.source).toBe(WL.WEATHER_SOURCE_ID);
            expect(source.tiles[0]).toContain('wind_new');
        });
    });

    describe('toggle and preference plans', () => {
        test('resolveShowWeatherEnabledFromStorage defaults off', () => {
            expect(WL.resolveShowWeatherEnabledFromStorage(null)).toBe(false);
            expect(WL.resolveShowWeatherEnabledFromStorage('true')).toBe(true);
        });

        test('buildToggleWeatherLayerExecutePlan wires map action', () => {
            const execute = WL.buildToggleWeatherLayerExecutePlan({ enabled: true });
            expect(execute.mapAction).toBe('addWeatherLayer');
            expect(execute.storageKey).toBe(WL.SHOW_WEATHER_STORAGE_KEY);
        });

        test('buildSetWeatherLayerTypeExecutePlan falls back invalid types', () => {
            const execute = WL.buildSetWeatherLayerTypeExecutePlan('bogus');
            expect(execute.layerType).toBe(WL.DEFAULT_WEATHER_LAYER_TYPE);
            expect(execute.statusMessage).toContain('Precipitation');
        });

        test('weather add/remove/init orchestration plans', () => {
            const add = WL.buildAddWeatherLayerOrchestrationPlan({ hasMap: true, isStyleLoaded: false });
            expect(add.shouldProceed).toBe(true);
            expect(add.sourceId).toBe(WL.WEATHER_SOURCE_ID);

            const remove = WL.buildRemoveWeatherLayerExecutePlan({ hasWeatherLayerRef: true, hasMap: true });
            expect(remove.shouldRemove).toBe(true);

            const init = WL.buildInitWeatherLayerExecutePlan({ enabled: true });
            expect(init.deferOnBootstrapStyle).toBe(true);
            expect(init.addWeatherLayer).toBe(true);
        });
    });
});

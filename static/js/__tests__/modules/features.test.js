/**
 * @file Feature Modules Unit Tests (REAL modules)
 *
 * Imports the real HazardsManager, WeatherManager, TrafficManager and the
 * createFeaturesSystem factory, asserting their actual behaviour (fetch + events,
 * weather impact maths, traffic level helpers, combined stats) against mocked fetch.
 */

import {
    HazardsManager,
    WeatherManager,
    TrafficManager,
    createFeaturesSystem,
} from '../../modules/features/index.js';

function mockFetchJson(data, ok = true, status = 200) {
    return jest.fn().mockResolvedValue({ ok, status, json: async () => data });
}

describe('HazardsManager (real module)', () => {
    afterEach(() => { delete global.fetch; });

    test('fetchNearbyHazards stores hazards and emits hazardsUpdated', async () => {
        global.fetch = mockFetchJson({ hazards: [{ type: 'camera', lat: 51.5, lon: -0.1 }] });
        const m = new HazardsManager();
        const cb = jest.fn();
        m.on('hazardsUpdated', cb);
        const res = await m.fetchNearbyHazards(51.5, -0.1);
        expect(res).toHaveLength(1);
        expect(cb).toHaveBeenCalled();
        expect(m.getHazards()).toHaveLength(1);
    });

    test('fetchNearbyHazards returns [] and emits error on failure', async () => {
        global.fetch = jest.fn().mockRejectedValue(new Error('down'));
        const m = new HazardsManager();
        const err = jest.fn();
        m.on('error', err);
        const res = await m.fetchNearbyHazards(51.5, -0.1);
        expect(res).toEqual([]);
        expect(err).toHaveBeenCalledWith({ message: 'down' });
    });

    test('getHazardsOnRoute filters by proximity (<100m)', () => {
        const m = new HazardsManager();
        m.hazards = [
            { type: 'pothole', lat: 51.5000, lon: -0.1000 },
            { type: 'camera', lat: 52.0000, lon: -1.0000 },
        ];
        const onRoute = m.getHazardsOnRoute([[51.5000, -0.1000]]);
        expect(onRoute).toHaveLength(1);
        expect(onRoute[0].type).toBe('pothole');
    });

    test('enable/disable avoidance', () => {
        const m = new HazardsManager();
        m.disableAvoidance();
        expect(m.avoidanceEnabled).toBe(false);
        m.enableAvoidance();
        expect(m.avoidanceEnabled).toBe(true);
    });
});

describe('WeatherManager (real module)', () => {
    afterEach(() => { delete global.fetch; });

    test('fetchWeather stores data and emits weatherUpdated', async () => {
        global.fetch = mockFetchJson({ condition: 'clear', temperature: 18 });
        const m = new WeatherManager();
        const cb = jest.fn();
        m.on('weatherUpdated', cb);
        const data = await m.fetchWeather(51.5, -0.1);
        expect(data.condition).toBe('clear');
        expect(cb).toHaveBeenCalled();
    });

    test('fetchWeather serves from cache within cacheTime', async () => {
        global.fetch = mockFetchJson({ condition: 'clear' });
        const m = new WeatherManager();
        await m.fetchWeather(51.5, -0.1);
        await m.fetchWeather(51.5, -0.1);
        expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    test('isSevereWeather detects storms / high severity', () => {
        const m = new WeatherManager();
        m.weatherData = { condition: 'thunderstorm', severity: 'low' };
        expect(m.isSevereWeather()).toBe(true);
        m.weatherData = { condition: 'clear', severity: 'high' };
        expect(m.isSevereWeather()).toBe(true);
        m.weatherData = { condition: 'clear', severity: 'low' };
        expect(m.isSevereWeather()).toBe(false);
    });

    test('getWeatherImpact reduces speed and warns for rain', () => {
        const m = new WeatherManager();
        m.weatherData = { condition: 'rain', temperature: 12 };
        const impact = m.getWeatherImpact();
        expect(impact.speedReduction).toBe(10);
        expect(impact.warnings).toContain('Wet roads - reduce speed');
    });

    test('getWeatherImpact escalates for snow / sub-zero', () => {
        const m = new WeatherManager();
        m.weatherData = { condition: 'snow', temperature: -2 };
        const impact = m.getWeatherImpact();
        expect(impact.speedReduction).toBe(20);
    });
});

describe('TrafficManager (real module)', () => {
    afterEach(() => {
        delete global.fetch;
        jest.useRealTimers();
    });

    test('fetchTraffic stores data and emits trafficUpdated', async () => {
        global.fetch = mockFetchJson({ level: 'moderate', average_speed: 40 });
        const m = new TrafficManager();
        const cb = jest.fn();
        m.on('trafficUpdated', cb);
        await m.fetchTraffic(51.5, -0.1);
        expect(cb).toHaveBeenCalled();
        expect(m.getTrafficLevel()).toBe('moderate');
        expect(m.getAverageSpeed()).toBe(40);
    });

    test('isHeavyTraffic for heavy/congested only', () => {
        const m = new TrafficManager();
        m.trafficData = { level: 'heavy' };
        expect(m.isHeavyTraffic()).toBe(true);
        m.trafficData = { level: 'light' };
        expect(m.isHeavyTraffic()).toBe(false);
    });

    test('getters default sensibly when no data', () => {
        const m = new TrafficManager();
        expect(m.getTrafficLevel()).toBe('unknown');
        expect(m.getAverageSpeed()).toBeNull();
        expect(m.getCongestionPercentage()).toBe(0);
        expect(m.getEstimatedDelay()).toBe(0);
    });

    test('startAutoUpdate fetches immediately then on interval; stop clears it', async () => {
        jest.useFakeTimers();
        global.fetch = mockFetchJson({ level: 'free' });
        const m = new TrafficManager({ updateInterval: 1000 });
        m.startAutoUpdate(51.5, -0.1);
        expect(global.fetch).toHaveBeenCalledTimes(1); // immediate
        jest.advanceTimersByTime(1000);
        expect(global.fetch).toHaveBeenCalledTimes(2); // interval tick
        m.stopAutoUpdate();
        expect(m.updateTimer).toBeNull();
    });
});

describe('createFeaturesSystem (real factory)', () => {
    afterEach(() => { delete global.fetch; });

    test('wires the three managers and aggregates stats', () => {
        const sys = createFeaturesSystem();
        expect(sys.hazards).toBeInstanceOf(HazardsManager);
        expect(sys.weather).toBeInstanceOf(WeatherManager);
        expect(sys.traffic).toBeInstanceOf(TrafficManager);
        const stats = sys.getStats();
        expect(stats.hazards.count).toBe(0);
        expect(stats.traffic.level).toBe('unknown');
    });

    test('initialize fetches all three features', async () => {
        global.fetch = mockFetchJson({ hazards: [], condition: 'clear', level: 'free' });
        const sys = createFeaturesSystem();
        await sys.initialize(51.5, -0.1);
        expect(global.fetch).toHaveBeenCalledTimes(3);
    });
});

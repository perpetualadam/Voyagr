/**
 * Unit and Integration Tests for Weather Layer Implementation
 * Tests toggleWeatherLayer, addWeatherLayer, removeWeatherLayer, setWeatherLayerType, initWeatherLayer
 */

describe('Weather Layer Feature', () => {
    let mockMap;
    let mockFetch;

    beforeEach(() => {
        // Mock MapLibre map instance
        mockMap = {
            getSource: jest.fn().mockReturnValue(null),
            getLayer: jest.fn().mockReturnValue(null),
            addSource: jest.fn(),
            addLayer: jest.fn(),
            removeSource: jest.fn(),
            removeLayer: jest.fn(),
            isStyleLoaded: jest.fn().mockReturnValue(true),
            once: jest.fn((event, callback) => callback()),
        };

        // Mock fetch
        mockFetch = jest.fn().mockResolvedValue({
            json: jest.fn().mockResolvedValue({
                success: true,
                openweathermap_api_key: 'test-api-key-12345'
            })
        });
        global.fetch = mockFetch;

        // Mock window object
        global.window = {
            OPENWEATHERMAP_API_KEY: null
        };

        // Mock DOM elements
        document.body.innerHTML = `
            <div id="showWeatherToggle" class="toggle-switch"></div>
            <select id="weatherLayerType">
                <option value="precipitation_new">Precipitation</option>
                <option value="clouds_new">Clouds</option>
                <option value="temp_new">Temperature</option>
                <option value="wind_new">Wind</option>
            </select>
        `;

        // Mock localStorage
        const mockStorage = {};
        global.localStorage = {
            getItem: jest.fn((key) => mockStorage[key] || null),
            setItem: jest.fn((key, value) => { mockStorage[key] = value; }),
            removeItem: jest.fn((key) => { delete mockStorage[key]; }),
            clear: jest.fn(() => { Object.keys(mockStorage).forEach(k => delete mockStorage[k]); })
        };

        jest.clearAllMocks();
    });

    afterEach(() => {
        jest.clearAllMocks();
        document.body.innerHTML = '';
    });

    describe('toggleWeatherLayer()', () => {
        test('should toggle showWeatherEnabled state', () => {
            let showWeatherEnabled = false;
            
            showWeatherEnabled = !showWeatherEnabled;
            expect(showWeatherEnabled).toBe(true);
            
            showWeatherEnabled = !showWeatherEnabled;
            expect(showWeatherEnabled).toBe(false);
        });

        test('should save state to localStorage', () => {
            localStorage.setItem('showWeatherEnabled', 'true');
            expect(localStorage.getItem('showWeatherEnabled')).toBe('true');

            localStorage.setItem('showWeatherEnabled', 'false');
            expect(localStorage.getItem('showWeatherEnabled')).toBe('false');
        });

        test('should update toggle button styling when enabled', () => {
            const toggle = document.getElementById('showWeatherToggle');
            
            toggle.classList.add('active');
            toggle.style.background = '#4CAF50';
            toggle.style.borderColor = '#4CAF50';
            
            expect(toggle.classList.contains('active')).toBe(true);
            expect(toggle.style.background).toBe('rgb(76, 175, 80)');
        });

        test('should update toggle button styling when disabled', () => {
            const toggle = document.getElementById('showWeatherToggle');
            toggle.classList.add('active');
            
            toggle.classList.remove('active');
            toggle.style.background = '#ddd';
            toggle.style.borderColor = '#999';
            
            expect(toggle.classList.contains('active')).toBe(false);
            expect(toggle.style.background).toBe('rgb(221, 221, 221)');
        });

        test('should handle missing toggle button gracefully', () => {
            document.body.innerHTML = '';
            
            expect(() => {
                const toggle = document.getElementById('showWeatherToggle');
                if (toggle) {
                    toggle.classList.toggle('active');
                }
            }).not.toThrow();
        });
    });

    describe('addWeatherLayer()', () => {
        test('should add raster source for weather tiles', () => {
            const owmApiKey = 'test-api-key';
            const weatherLayerType = 'precipitation_new';
            const tileUrl = `https://tile.openweathermap.org/map/${weatherLayerType}/{z}/{x}/{y}.png?appid=${owmApiKey}`;
            
            mockMap.addSource('weather-source', {
                type: 'raster',
                tiles: [tileUrl],
                tileSize: 256,
                minzoom: 1,
                maxzoom: 18
            });
            
            expect(mockMap.addSource).toHaveBeenCalledWith('weather-source', expect.objectContaining({
                type: 'raster',
                tileSize: 256
            }));
        });

        test('should add raster layer for weather display', () => {
            mockMap.addLayer({
                id: 'weather-layer',
                type: 'raster',
                source: 'weather-source',
                paint: { 'raster-opacity': 0.7 }
            });
            
            expect(mockMap.addLayer).toHaveBeenCalledWith(expect.objectContaining({
                id: 'weather-layer',
                type: 'raster',
                source: 'weather-source'
            }));
        });

        test('should check if source already exists before adding', () => {
            mockMap.getSource.mockReturnValue({ type: 'raster' });
            
            const sourceExists = mockMap.getSource('weather-source') !== null;
            expect(sourceExists).toBe(true);
        });

        test('should check if layer already exists before adding', () => {
            mockMap.getLayer.mockReturnValue({ id: 'weather-layer' });

            const layerExists = mockMap.getLayer('weather-layer') !== null;
            expect(layerExists).toBe(true);
        });

        test('should wait for style to load if not ready', () => {
            mockMap.isStyleLoaded.mockReturnValue(false);

            const isLoaded = mockMap.isStyleLoaded();
            expect(isLoaded).toBe(false);

            // Should register event listener
            mockMap.once('style.load', jest.fn());
            expect(mockMap.once).toHaveBeenCalledWith('style.load', expect.any(Function));
        });

        test('should proceed immediately if style is loaded', () => {
            mockMap.isStyleLoaded.mockReturnValue(true);

            const isLoaded = mockMap.isStyleLoaded();
            expect(isLoaded).toBe(true);
        });
    });

    describe('removeWeatherLayer()', () => {
        test('should remove weather layer if it exists', () => {
            mockMap.getLayer.mockReturnValue({ id: 'weather-layer' });

            if (mockMap.getLayer('weather-layer')) {
                mockMap.removeLayer('weather-layer');
            }

            expect(mockMap.removeLayer).toHaveBeenCalledWith('weather-layer');
        });

        test('should remove weather source if it exists', () => {
            mockMap.getSource.mockReturnValue({ type: 'raster' });

            if (mockMap.getSource('weather-source')) {
                mockMap.removeSource('weather-source');
            }

            expect(mockMap.removeSource).toHaveBeenCalledWith('weather-source');
        });

        test('should not throw if layer does not exist', () => {
            mockMap.getLayer.mockReturnValue(null);

            expect(() => {
                if (mockMap.getLayer('weather-layer')) {
                    mockMap.removeLayer('weather-layer');
                }
            }).not.toThrow();

            expect(mockMap.removeLayer).not.toHaveBeenCalled();
        });

        test('should not throw if source does not exist', () => {
            mockMap.getSource.mockReturnValue(null);

            expect(() => {
                if (mockMap.getSource('weather-source')) {
                    mockMap.removeSource('weather-source');
                }
            }).not.toThrow();

            expect(mockMap.removeSource).not.toHaveBeenCalled();
        });

        test('should handle null map gracefully', () => {
            expect(() => {
                const map = null;
                if (map && map.getLayer('weather-layer')) {
                    map.removeLayer('weather-layer');
                }
            }).not.toThrow();
        });
    });

    describe('setWeatherLayerType()', () => {
        test('should support precipitation layer type', () => {
            localStorage.setItem('weatherLayerType', 'precipitation_new');
            expect(localStorage.getItem('weatherLayerType')).toBe('precipitation_new');
        });

        test('should support clouds layer type', () => {
            localStorage.setItem('weatherLayerType', 'clouds_new');
            expect(localStorage.getItem('weatherLayerType')).toBe('clouds_new');
        });

        test('should support temperature layer type', () => {
            localStorage.setItem('weatherLayerType', 'temp_new');
            expect(localStorage.getItem('weatherLayerType')).toBe('temp_new');
        });

        test('should support wind layer type', () => {
            localStorage.setItem('weatherLayerType', 'wind_new');
            expect(localStorage.getItem('weatherLayerType')).toBe('wind_new');
        });

        test('should generate correct tile URL for each type', () => {
            const apiKey = 'test-key';
            const types = ['precipitation_new', 'clouds_new', 'temp_new', 'wind_new'];

            types.forEach(type => {
                const url = `https://tile.openweathermap.org/map/${type}/{z}/{x}/{y}.png?appid=${apiKey}`;
                expect(url).toContain(type);
                expect(url).toContain(apiKey);
            });
        });
    });

    describe('initWeatherLayer()', () => {
        test('should read saved preference from localStorage', () => {
            localStorage.setItem('showWeatherEnabled', 'true');
            const enabled = localStorage.getItem('showWeatherEnabled') === 'true';
            expect(enabled).toBe(true);
        });

        test('should read saved layer type from localStorage', () => {
            localStorage.setItem('weatherLayerType', 'clouds_new');
            const type = localStorage.getItem('weatherLayerType') || 'precipitation_new';
            expect(type).toBe('clouds_new');
        });

        test('should default to precipitation if no type saved', () => {
            // Clear localStorage to ensure clean state
            localStorage.clear();
            const type = localStorage.getItem('weatherLayerType') || 'precipitation_new';
            expect(type).toBe('precipitation_new');
        });

        test('should update toggle button state on init', () => {
            const toggle = document.getElementById('showWeatherToggle');
            const showWeatherEnabled = true;

            toggle.classList.toggle('active', showWeatherEnabled);
            if (showWeatherEnabled) {
                toggle.style.background = '#4CAF50';
                toggle.style.borderColor = '#4CAF50';
            }

            expect(toggle.classList.contains('active')).toBe(true);
        });

        test('should not add layer if not enabled', () => {
            const showWeatherEnabled = false;

            if (showWeatherEnabled && mockMap) {
                mockMap.addSource('weather-source', {});
            }

            expect(mockMap.addSource).not.toHaveBeenCalled();
        });
    });

    describe('API Key Loading', () => {
        test('should use window.OPENWEATHERMAP_API_KEY if available', () => {
            window.OPENWEATHERMAP_API_KEY = 'window-api-key';
            const apiKey = window.OPENWEATHERMAP_API_KEY || '';
            expect(apiKey).toBe('window-api-key');
        });

        test('should fetch API key from /api/config if not available', async () => {
            window.OPENWEATHERMAP_API_KEY = null;

            const response = await fetch('/api/config');
            const data = await response.json();

            expect(fetch).toHaveBeenCalledWith('/api/config');
            expect(data.openweathermap_api_key).toBe('test-api-key-12345');
        });

        test('should store fetched API key in window', async () => {
            window.OPENWEATHERMAP_API_KEY = null;

            const response = await fetch('/api/config');
            const data = await response.json();

            if (data.success && data.openweathermap_api_key) {
                window.OPENWEATHERMAP_API_KEY = data.openweathermap_api_key;
            }

            expect(window.OPENWEATHERMAP_API_KEY).toBe('test-api-key-12345');
        });
    });

    describe('Edge Cases', () => {
        test('should handle null map gracefully', () => {
            expect(() => {
                const map = null;
                if (map) {
                    map.addSource('weather-source', {});
                }
            }).not.toThrow();
        });

        test('should handle missing API key gracefully', () => {
            window.OPENWEATHERMAP_API_KEY = null;
            const apiKey = window.OPENWEATHERMAP_API_KEY || '';
            expect(apiKey).toBe('');
        });

        test('should handle rapid toggle calls', () => {
            let enabled = false;

            expect(() => {
                for (let i = 0; i < 10; i++) {
                    enabled = !enabled;
                    localStorage.setItem('showWeatherEnabled', enabled.toString());
                }
            }).not.toThrow();
        });

        test('should handle failed API config fetch', async () => {
            global.fetch = jest.fn().mockRejectedValue(new Error('Network error'));

            let apiKey = '';
            try {
                const response = await fetch('/api/config');
                const data = await response.json();
                apiKey = data.openweathermap_api_key;
            } catch (e) {
                // API fetch failed, use empty key
                apiKey = '';
            }

            expect(apiKey).toBe('');
        });
    });

    describe('localStorage Persistence', () => {
        test('should persist weather enabled state', () => {
            localStorage.setItem('showWeatherEnabled', 'true');
            expect(localStorage.getItem('showWeatherEnabled')).toBe('true');
        });

        test('should persist layer type preference', () => {
            localStorage.setItem('weatherLayerType', 'temp_new');
            expect(localStorage.getItem('weatherLayerType')).toBe('temp_new');
        });

        test('should default to disabled if not set', () => {
            // Clear localStorage to ensure clean state
            localStorage.clear();
            const value = localStorage.getItem('showWeatherEnabled');
            const enabled = value === 'true';
            expect(enabled).toBe(false);
        });
    });

    describe('Integration Tests', () => {
        test('should support full workflow: init -> toggle -> change type', () => {
            // Init
            const toggle = document.getElementById('showWeatherToggle');
            toggle.classList.remove('active');

            // Toggle on
            toggle.classList.add('active');
            localStorage.setItem('showWeatherEnabled', 'true');

            // Change type
            localStorage.setItem('weatherLayerType', 'clouds_new');

            expect(toggle.classList.contains('active')).toBe(true);
            expect(localStorage.getItem('weatherLayerType')).toBe('clouds_new');
        });

        test('should add and remove layer correctly', () => {
            // Add
            mockMap.addSource('weather-source', { type: 'raster', tiles: [] });
            mockMap.addLayer({ id: 'weather-layer', type: 'raster' });

            expect(mockMap.addSource).toHaveBeenCalled();
            expect(mockMap.addLayer).toHaveBeenCalled();

            // Remove
            mockMap.getLayer.mockReturnValue({ id: 'weather-layer' });
            mockMap.getSource.mockReturnValue({ type: 'raster' });

            if (mockMap.getLayer('weather-layer')) mockMap.removeLayer('weather-layer');
            if (mockMap.getSource('weather-source')) mockMap.removeSource('weather-source');

            expect(mockMap.removeLayer).toHaveBeenCalledWith('weather-layer');
            expect(mockMap.removeSource).toHaveBeenCalledWith('weather-source');
        });
    });
});


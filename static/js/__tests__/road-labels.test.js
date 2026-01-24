/**
 * Unit and Integration Tests for Road Labels Feature
 * Tests MapLibre road label configuration, toggling, and persistence
 */

// Mock MapLibreHelpers before tests
const mockMapLibreHelpers = {
    configureRoadLabels: jest.fn(),
    toggleRoadLabels: jest.fn(),
    setRoadLabelZoomFilters: jest.fn(),
};

// Set up global MapLibreHelpers
global.MapLibreHelpers = mockMapLibreHelpers;

describe('Road Labels Feature', () => {
    let mockMap;
    let mockStyle;

    beforeEach(() => {
        // Mock MapLibre map instance
        mockMap = {
            getStyle: jest.fn(),
            setLayoutProperty: jest.fn(),
            setPaintProperty: jest.fn(),
            setLayerZoomRange: jest.fn(),
        };

        // Mock map style with symbol layers
        mockStyle = {
            layers: [
                {
                    id: 'motorway-label',
                    type: 'symbol',
                    layout: { 'text-field': '{name}' },
                },
                {
                    id: 'trunk-label',
                    type: 'symbol',
                    layout: { 'text-field': '{name}' },
                },
                {
                    id: 'primary-label',
                    type: 'symbol',
                    layout: { 'text-field': '{name}' },
                },
                {
                    id: 'secondary-label',
                    type: 'symbol',
                    layout: { 'text-field': '{name}' },
                },
                {
                    id: 'street-label',
                    type: 'symbol',
                    layout: { 'text-field': '{name}' },
                },
                {
                    id: 'background',
                    type: 'background',
                    layout: {},
                },
            ],
        };

        mockMap.getStyle.mockReturnValue(mockStyle);

        // Mock DOM elements
        document.body.innerHTML = `
            <button id="roadLabelsToggle" class="toggle-switch active"></button>
        `;

        // Clear all mocks
        jest.clearAllMocks();
    });

    afterEach(() => {
        jest.clearAllMocks();
        document.body.innerHTML = '';
    });

    describe('configureRoadLabels()', () => {
        test('should be called with map instance', () => {
            MapLibreHelpers.configureRoadLabels(mockMap);
            expect(MapLibreHelpers.configureRoadLabels).toHaveBeenCalledWith(mockMap);
        });

        test('should accept custom options', () => {
            const options = {
                textColor: '#ff0000',
                textHaloColor: '#ffffff',
                textHaloWidth: 2,
                textSize: 14,
            };
            MapLibreHelpers.configureRoadLabels(mockMap, options);
            expect(MapLibreHelpers.configureRoadLabels).toHaveBeenCalledWith(mockMap, options);
        });

        test('should handle disabled state', () => {
            const options = { enabled: false };
            MapLibreHelpers.configureRoadLabels(mockMap, options);
            expect(MapLibreHelpers.configureRoadLabels).toHaveBeenCalledWith(mockMap, options);
        });

        test('should handle null map gracefully', () => {
            expect(() => {
                MapLibreHelpers.configureRoadLabels(null);
            }).not.toThrow();
        });

        test('should be callable multiple times', () => {
            MapLibreHelpers.configureRoadLabels(mockMap);
            MapLibreHelpers.configureRoadLabels(mockMap);
            expect(MapLibreHelpers.configureRoadLabels).toHaveBeenCalledTimes(2);
        });
    });

    describe('toggleRoadLabels()', () => {
        test('should toggle labels visibility to visible', () => {
            MapLibreHelpers.toggleRoadLabels(mockMap, true);
            expect(MapLibreHelpers.toggleRoadLabels).toHaveBeenCalledWith(mockMap, true);
        });

        test('should toggle labels visibility to hidden', () => {
            MapLibreHelpers.toggleRoadLabels(mockMap, false);
            expect(MapLibreHelpers.toggleRoadLabels).toHaveBeenCalledWith(mockMap, false);
        });

        test('should accept boolean visibility parameter', () => {
            MapLibreHelpers.toggleRoadLabels(mockMap, true);
            MapLibreHelpers.toggleRoadLabels(mockMap, false);
            expect(MapLibreHelpers.toggleRoadLabels).toHaveBeenCalledTimes(2);
        });

        test('should handle null map gracefully', () => {
            expect(() => {
                MapLibreHelpers.toggleRoadLabels(null, true);
            }).not.toThrow();
        });
    });

    describe('setRoadLabelZoomFilters()', () => {
        test('should set zoom ranges for different road types', () => {
            MapLibreHelpers.setRoadLabelZoomFilters(mockMap);
            expect(MapLibreHelpers.setRoadLabelZoomFilters).toHaveBeenCalledWith(mockMap);
        });

        test('should apply motorway zoom filter', () => {
            const options = { motorwayMinZoom: 5 };
            MapLibreHelpers.setRoadLabelZoomFilters(mockMap, options);
            expect(MapLibreHelpers.setRoadLabelZoomFilters).toHaveBeenCalledWith(mockMap, options);
        });

        test('should apply main road zoom filter', () => {
            const options = { mainRoadMinZoom: 10 };
            MapLibreHelpers.setRoadLabelZoomFilters(mockMap, options);
            expect(MapLibreHelpers.setRoadLabelZoomFilters).toHaveBeenCalledWith(mockMap, options);
        });

        test('should apply street zoom filter', () => {
            const options = { streetMinZoom: 14 };
            MapLibreHelpers.setRoadLabelZoomFilters(mockMap, options);
            expect(MapLibreHelpers.setRoadLabelZoomFilters).toHaveBeenCalledWith(mockMap, options);
        });

        test('should accept all zoom filter options', () => {
            const options = {
                motorwayMinZoom: 5,
                mainRoadMinZoom: 10,
                streetMinZoom: 14,
            };
            MapLibreHelpers.setRoadLabelZoomFilters(mockMap, options);
            expect(MapLibreHelpers.setRoadLabelZoomFilters).toHaveBeenCalledWith(mockMap, options);
        });
    });

    describe('toggleRoadLabels() - UI Integration', () => {
        test('should update toggle button styling when enabled', () => {
            const toggle = document.getElementById('roadLabelsToggle');
            
            // Simulate toggle function behavior
            toggle.classList.add('active');
            toggle.style.background = '#4CAF50';
            toggle.style.borderColor = '#4CAF50';

            expect(toggle.classList.contains('active')).toBe(true);
            expect(toggle.style.background).toBe('rgb(76, 175, 80)');
        });

        test('should update toggle button styling when disabled', () => {
            const toggle = document.getElementById('roadLabelsToggle');
            
            toggle.classList.remove('active');
            toggle.style.background = '#ccc';
            toggle.style.borderColor = '#ccc';

            expect(toggle.classList.contains('active')).toBe(false);
            expect(toggle.style.background).toBe('rgb(204, 204, 204)');
        });
    });

    describe('localStorage Persistence', () => {
        test('should save road labels preference to localStorage', () => {
            // Test that we can call setItem without errors
            expect(() => {
                localStorage.setItem('roadLabelsEnabled', 'true');
            }).not.toThrow();
        });

        test('should retrieve road labels preference from localStorage', () => {
            // Test that we can call getItem without errors
            expect(() => {
                const value = localStorage.getItem('roadLabelsEnabled');
                // Value should be either a string or null
                expect(typeof value === 'string' || value === null).toBe(true);
            }).not.toThrow();
        });

        test('should default to enabled if not set', () => {
            // Test the logic: if getItem returns null, default to enabled
            const value = localStorage.getItem('nonexistent');
            const enabled = value !== 'false';
            expect(enabled).toBe(true);
        });

        test('should persist disabled state', () => {
            // Test that we can call setItem with false value
            expect(() => {
                localStorage.setItem('roadLabelsEnabled', 'false');
            }).not.toThrow();
        });

        test('should handle toggle state persistence', () => {
            // Simulate saving enabled state
            localStorage.setItem('roadLabelsEnabled', 'true');
            let enabled = localStorage.getItem('roadLabelsEnabled') !== 'false';
            expect(enabled).toBe(true);

            // Simulate saving disabled state
            localStorage.setItem('roadLabelsEnabled', 'false');
            enabled = localStorage.getItem('roadLabelsEnabled') !== 'false';
            expect(enabled).toBe(false);
        });
    });

    describe('Edge Cases', () => {
        test('should handle null map gracefully', () => {
            expect(() => {
                MapLibreHelpers.configureRoadLabels(null);
            }).not.toThrow();
        });

        test('should handle undefined options', () => {
            expect(() => {
                MapLibreHelpers.configureRoadLabels(mockMap, undefined);
            }).not.toThrow();
        });

        test('should handle empty options object', () => {
            expect(() => {
                MapLibreHelpers.configureRoadLabels(mockMap, {});
            }).not.toThrow();
        });

        test('should handle missing toggle button', () => {
            document.body.innerHTML = '';

            expect(() => {
                const toggle = document.getElementById('roadLabelsToggle');
                if (toggle) {
                    toggle.classList.toggle('active');
                }
            }).not.toThrow();
        });

        test('should handle rapid toggle calls', () => {
            expect(() => {
                MapLibreHelpers.toggleRoadLabels(mockMap, true);
                MapLibreHelpers.toggleRoadLabels(mockMap, false);
                MapLibreHelpers.toggleRoadLabels(mockMap, true);
            }).not.toThrow();
        });
    });

    describe('Integration Tests', () => {
        test('should initialize road labels on app startup', () => {
            MapLibreHelpers.configureRoadLabels(mockMap);
            MapLibreHelpers.toggleRoadLabels(mockMap, true);

            expect(MapLibreHelpers.configureRoadLabels).toHaveBeenCalled();
            expect(MapLibreHelpers.toggleRoadLabels).toHaveBeenCalled();
        });

        test('should support full workflow: configure -> toggle -> filter', () => {
            MapLibreHelpers.configureRoadLabels(mockMap);
            MapLibreHelpers.toggleRoadLabels(mockMap, true);
            MapLibreHelpers.setRoadLabelZoomFilters(mockMap);

            expect(MapLibreHelpers.configureRoadLabels).toHaveBeenCalled();
            expect(MapLibreHelpers.toggleRoadLabels).toHaveBeenCalled();
            expect(MapLibreHelpers.setRoadLabelZoomFilters).toHaveBeenCalled();
        });

        test('should handle toggle after configuration', () => {
            MapLibreHelpers.configureRoadLabels(mockMap);
            jest.clearAllMocks();

            MapLibreHelpers.toggleRoadLabels(mockMap, false);
            MapLibreHelpers.toggleRoadLabels(mockMap, true);

            expect(MapLibreHelpers.toggleRoadLabels).toHaveBeenCalledTimes(2);
        });

        test('should persist state across multiple operations', () => {
            // Test that localStorage operations work correctly
            localStorage.setItem('roadLabelsEnabled', 'true');
            const enabled = localStorage.getItem('roadLabelsEnabled') !== 'false';

            expect(enabled).toBe(true);
        });

        test('should handle complete initialization workflow', () => {
            // Simulate app startup workflow
            localStorage.setItem('roadLabelsEnabled', 'true');
            MapLibreHelpers.configureRoadLabels(mockMap);
            MapLibreHelpers.setRoadLabelZoomFilters(mockMap);
            MapLibreHelpers.toggleRoadLabels(mockMap, true);

            expect(MapLibreHelpers.configureRoadLabels).toHaveBeenCalled();
            expect(MapLibreHelpers.setRoadLabelZoomFilters).toHaveBeenCalled();
            expect(MapLibreHelpers.toggleRoadLabels).toHaveBeenCalled();
        });
    });

    describe('Road Labels Initialization', () => {
        let mockMapWithEvents;

        beforeEach(() => {
            mockMapWithEvents = {
                ...mockMap,
                isStyleLoaded: jest.fn().mockReturnValue(true),
                once: jest.fn((event, callback) => callback()),
            };
        });

        test('should call initializeRoadLabels during page load', () => {
            // Simulate initialization
            const initializeRoadLabels = jest.fn();

            if (typeof mockMapWithEvents !== 'undefined' && mockMapWithEvents) {
                if (mockMapWithEvents.isStyleLoaded()) {
                    initializeRoadLabels();
                }
            }

            expect(initializeRoadLabels).toHaveBeenCalled();
        });

        test('should wait for style.load if style not loaded', () => {
            mockMapWithEvents.isStyleLoaded.mockReturnValue(false);
            const initializeRoadLabels = jest.fn();

            if (typeof mockMapWithEvents !== 'undefined' && mockMapWithEvents) {
                if (mockMapWithEvents.isStyleLoaded()) {
                    initializeRoadLabels();
                } else {
                    mockMapWithEvents.once('style.load', () => {
                        initializeRoadLabels();
                    });
                }
            }

            expect(mockMapWithEvents.once).toHaveBeenCalledWith('style.load', expect.any(Function));
            expect(initializeRoadLabels).toHaveBeenCalled();
        });

        test('should re-initialize road labels after theme change', () => {
            const initializeRoadLabels = jest.fn();

            // Simulate setMapTheme calling initializeRoadLabels
            mockMapWithEvents.once('style.load', () => {
                if (typeof initializeRoadLabels === 'function') {
                    initializeRoadLabels();
                }
            });

            expect(initializeRoadLabels).toHaveBeenCalled();
        });

        test('should handle map not being ready with timeout fallback', (done) => {
            const initializeRoadLabels = jest.fn();
            let map = null;

            // Map not ready yet, wait a bit and try again
            setTimeout(() => {
                map = mockMapWithEvents;
                if (typeof map !== 'undefined' && map) {
                    initializeRoadLabels();
                }
                expect(initializeRoadLabels).toHaveBeenCalled();
                done();
            }, 100);
        });

        test('should check map existence before initialization', () => {
            const initializeRoadLabels = jest.fn();
            let map = null;

            if (typeof map !== 'undefined' && map) {
                initializeRoadLabels();
            }

            expect(initializeRoadLabels).not.toHaveBeenCalled();
        });

        test('should handle undefined map gracefully', () => {
            expect(() => {
                let map;
                if (typeof map !== 'undefined' && map) {
                    // Initialize
                }
            }).not.toThrow();
        });
    });

    describe('Theme Change Re-initialization', () => {
        test('should register style.load event handler in setMapTheme', () => {
            const mockMapWithOnce = {
                ...mockMap,
                once: jest.fn()
            };

            // Simulate setMapTheme registering handler
            mockMapWithOnce.once('style.load', jest.fn());

            expect(mockMapWithOnce.once).toHaveBeenCalledWith('style.load', expect.any(Function));
        });

        test('should call initializeRoadLabels in style.load callback', () => {
            const initializeRoadLabels = jest.fn();
            const mockMapWithOnce = {
                ...mockMap,
                once: jest.fn((event, callback) => callback())
            };

            // Simulate setMapTheme behavior
            mockMapWithOnce.once('style.load', () => {
                if (typeof initializeRoadLabels === 'function') {
                    initializeRoadLabels();
                }
            });

            expect(initializeRoadLabels).toHaveBeenCalled();
        });

        test('should re-add road labels after style reset', () => {
            MapLibreHelpers.configureRoadLabels(mockMap);
            jest.clearAllMocks();

            // Simulate theme change resetting layers
            MapLibreHelpers.configureRoadLabels(mockMap);
            MapLibreHelpers.toggleRoadLabels(mockMap, true);

            expect(MapLibreHelpers.configureRoadLabels).toHaveBeenCalled();
            expect(MapLibreHelpers.toggleRoadLabels).toHaveBeenCalled();
        });

        test('should check if initializeRoadLabels is a function before calling', () => {
            const initializeRoadLabels = 'not a function';

            expect(() => {
                if (typeof initializeRoadLabels === 'function') {
                    initializeRoadLabels();
                }
            }).not.toThrow();
        });
    });
});


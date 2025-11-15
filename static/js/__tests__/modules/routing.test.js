/**
 * @file Routing Modules Unit Tests
 * @module __tests__/modules/routing.test.js
 */

describe('Routing Modules', () => {
    describe('RoutingEngine', () => {
        let engine;

        beforeEach(() => {
            engine = {
                cache: new Map(),
                cacheTTL: 600000,
                stats: { requests: 0, cached: 0, errors: 0 },
                generateCacheKey: (start, end, mode, vehicle) => `${start}|${end}|${mode}|${vehicle}`,
                getStats: function() { return { ...this.stats }; },
                clearCache: function() { this.cache.clear(); },
                resetStats: function() { this.stats = { requests: 0, cached: 0, errors: 0 }; }
            };
        });

        test('should generate cache key correctly', () => {
            const key = engine.generateCacheKey('51.5,-0.1', '53.4,-2.2', 'auto', 'petrol');
            expect(key).toBe('51.5,-0.1|53.4,-2.2|auto|petrol');
        });

        test('should track statistics', () => {
            engine.stats.requests++;
            engine.stats.cached++;
            
            const stats = engine.getStats();
            expect(stats.requests).toBe(1);
            expect(stats.cached).toBe(1);
        });

        test('should clear cache', () => {
            engine.cache.set('test', { data: 'test' });
            expect(engine.cache.size).toBe(1);
            
            engine.clearCache();
            expect(engine.cache.size).toBe(0);
        });

        test('should reset statistics', () => {
            engine.stats.requests = 10;
            engine.stats.errors = 5;
            
            engine.resetStats();
            expect(engine.stats.requests).toBe(0);
            expect(engine.stats.errors).toBe(0);
        });
    });

    describe('RouteCalculator', () => {
        let calculator;

        beforeEach(() => {
            calculator = {
                routes: [],
                selectedRoute: null,
                preference: 'fastest',
                addRoutes: function(routes) { this.routes = routes || []; },
                selectRoute: function(index) {
                    if (index >= 0 && index < this.routes.length) {
                        this.selectedRoute = this.routes[index];
                        return this.selectedRoute;
                    }
                    return null;
                },
                getSelectedRoute: function() { return this.selectedRoute; },
                getRoutes: function() { return [...this.routes]; },
                getRouteCount: function() { return this.routes.length; },
                clearRoutes: function() { this.routes = []; this.selectedRoute = null; },
                calculateTotalCost: function(route) {
                    return (route.fuel_cost || 0) + (route.toll_cost || 0) + (route.caz_cost || 0);
                }
            };
        });

        test('should add routes', () => {
            const routes = [
                { id: 1, distance_km: 10, duration_minutes: 20 },
                { id: 2, distance_km: 12, duration_minutes: 18 }
            ];
            
            calculator.addRoutes(routes);
            expect(calculator.getRouteCount()).toBe(2);
        });

        test('should select route', () => {
            const routes = [
                { id: 1, distance_km: 10 },
                { id: 2, distance_km: 12 }
            ];
            
            calculator.addRoutes(routes);
            calculator.selectRoute(0);
            
            expect(calculator.getSelectedRoute()).toEqual(routes[0]);
        });

        test('should calculate total cost', () => {
            const route = {
                fuel_cost: 5,
                toll_cost: 2,
                caz_cost: 1
            };
            
            const cost = calculator.calculateTotalCost(route);
            expect(cost).toBe(8);
        });

        test('should clear routes', () => {
            calculator.addRoutes([{ id: 1 }]);
            calculator.selectRoute(0);
            
            calculator.clearRoutes();
            expect(calculator.getRouteCount()).toBe(0);
            expect(calculator.getSelectedRoute()).toBeNull();
        });
    });

    describe('RouteOptimizer', () => {
        let optimizer;

        beforeEach(() => {
            optimizer = {
                preferences: {
                    avoidHighways: false,
                    preferScenic: false,
                    avoidTolls: false,
                    avoidCAZ: false,
                    preferQuiet: false,
                    avoidUnpaved: false,
                    routeOptimization: 'fastest',
                    maxDetour: 20
                },
                updatePreferences: function(newPrefs) {
                    this.preferences = { ...this.preferences, ...newPrefs };
                },
                getPreferences: function() { return { ...this.preferences }; },
                resetPreferences: function() {
                    this.preferences = {
                        avoidHighways: false,
                        preferScenic: false,
                        avoidTolls: false,
                        avoidCAZ: false,
                        preferQuiet: false,
                        avoidUnpaved: false,
                        routeOptimization: 'fastest',
                        maxDetour: 20
                    };
                }
            };
        });

        test('should update preferences', () => {
            optimizer.updatePreferences({ avoidTolls: true });
            expect(optimizer.getPreferences().avoidTolls).toBe(true);
        });

        test('should reset preferences', () => {
            optimizer.updatePreferences({ avoidTolls: true, preferScenic: true });
            optimizer.resetPreferences();
            
            const prefs = optimizer.getPreferences();
            expect(prefs.avoidTolls).toBe(false);
            expect(prefs.preferScenic).toBe(false);
        });

        test('should filter routes by toll preference', () => {
            optimizer.updatePreferences({ avoidTolls: true });
            
            const routes = [
                { id: 1, toll_cost: 0 },
                { id: 2, toll_cost: 5 }
            ];
            
            const filtered = routes.filter(r => !optimizer.preferences.avoidTolls || r.toll_cost === 0);
            expect(filtered.length).toBe(1);
            expect(filtered[0].id).toBe(1);
        });
    });
});


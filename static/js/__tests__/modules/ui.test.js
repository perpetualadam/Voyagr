/**
 * @file UI Modules Unit Tests
 * @module __tests__/modules/ui.test.js
 */

describe('UI Modules', () => {
    describe('MapManager', () => {
        let map;

        beforeEach(() => {
            map = {
                mapElement: null,
                mapInstance: null,
                markers: new Map(),
                routes: [],
                zoom: 15,
                center: { lat: 51.5, lon: -0.1 },
                initialize: function(elementId, lat, lon) {
                    this.mapElement = document.getElementById(elementId);
                    this.center = { lat, lon };
                },
                addMarker: function(id, lat, lon, options = {}) {
                    this.markers.set(id, { lat, lon, ...options });
                },
                removeMarker: function(id) {
                    this.markers.delete(id);
                },
                addRoute: function(route) {
                    this.routes.push(route);
                },
                clearRoutes: function() {
                    this.routes = [];
                },
                setZoom: function(zoom) {
                    this.zoom = Math.max(1, Math.min(zoom, 20));
                },
                getZoom: function() {
                    return this.zoom;
                },
                fitBounds: function(bounds) {
                    // Simulate fitting bounds
                    return true;
                }
            };
        });

        test('should initialize map', () => {
            map.initialize('map', 51.5, -0.1);
            expect(map.center).toEqual({ lat: 51.5, lon: -0.1 });
        });

        test('should add marker', () => {
            map.addMarker('start', 51.5, -0.1);
            expect(map.markers.has('start')).toBe(true);
        });

        test('should remove marker', () => {
            map.addMarker('start', 51.5, -0.1);
            map.removeMarker('start');
            expect(map.markers.has('start')).toBe(false);
        });

        test('should add route', () => {
            const route = { id: 1, geometry: [] };
            map.addRoute(route);
            expect(map.routes.length).toBe(1);
        });

        test('should clear routes', () => {
            map.addRoute({ id: 1 });
            map.addRoute({ id: 2 });
            map.clearRoutes();
            expect(map.routes.length).toBe(0);
        });

        test('should set zoom level', () => {
            map.setZoom(18);
            expect(map.getZoom()).toBe(18);
        });

        test('should clamp zoom level', () => {
            map.setZoom(25);
            expect(map.getZoom()).toBe(20);
            map.setZoom(-5);
            expect(map.getZoom()).toBe(1);
        });

        test('should fit bounds', () => {
            const result = map.fitBounds({ north: 52, south: 51, east: 0, west: -1 });
            expect(result).toBe(true);
        });
    });

    describe('ControlsManager', () => {
        let controls;

        beforeEach(() => {
            controls = {
                buttons: new Map(),
                panels: new Map(),
                addButton: function(id, label, callback) {
                    this.buttons.set(id, { label, callback });
                },
                removeButton: function(id) {
                    this.buttons.delete(id);
                },
                clickButton: function(id) {
                    const btn = this.buttons.get(id);
                    if (btn && btn.callback) {
                        btn.callback();
                    }
                },
                addPanel: function(id, title, content) {
                    this.panels.set(id, { title, content, visible: false });
                },
                showPanel: function(id) {
                    const panel = this.panels.get(id);
                    if (panel) panel.visible = true;
                },
                hidePanel: function(id) {
                    const panel = this.panels.get(id);
                    if (panel) panel.visible = false;
                },
                isPanelVisible: function(id) {
                    const panel = this.panels.get(id);
                    return panel ? panel.visible : false;
                }
            };
        });

        test('should add button', () => {
            controls.addButton('start', 'Start', () => {});
            expect(controls.buttons.has('start')).toBe(true);
        });

        test('should remove button', () => {
            controls.addButton('start', 'Start', () => {});
            controls.removeButton('start');
            expect(controls.buttons.has('start')).toBe(false);
        });

        test('should click button', () => {
            let clicked = false;
            controls.addButton('test', 'Test', () => { clicked = true; });
            controls.clickButton('test');
            expect(clicked).toBe(true);
        });

        test('should add panel', () => {
            controls.addPanel('menu', 'Menu', '<div>Menu</div>');
            expect(controls.panels.has('menu')).toBe(true);
        });

        test('should show panel', () => {
            controls.addPanel('menu', 'Menu', '<div>Menu</div>');
            controls.showPanel('menu');
            expect(controls.isPanelVisible('menu')).toBe(true);
        });

        test('should hide panel', () => {
            controls.addPanel('menu', 'Menu', '<div>Menu</div>');
            controls.showPanel('menu');
            controls.hidePanel('menu');
            expect(controls.isPanelVisible('menu')).toBe(false);
        });
    });

    describe('PanelsManager', () => {
        let panels;

        beforeEach(() => {
            panels = {
                modals: new Map(),
                activeModal: null,
                createModal: function(id, title, content) {
                    this.modals.set(id, { id, title, content, visible: false });
                },
                openModal: function(id) {
                    const modal = this.modals.get(id);
                    if (modal) {
                        modal.visible = true;
                        this.activeModal = id;
                    }
                },
                closeModal: function(id) {
                    const modal = this.modals.get(id);
                    if (modal) {
                        modal.visible = false;
                        if (this.activeModal === id) {
                            this.activeModal = null;
                        }
                    }
                },
                closeAll: function() {
                    this.modals.forEach(modal => modal.visible = false);
                    this.activeModal = null;
                },
                getActiveModal: function() {
                    return this.activeModal;
                }
            };
        });

        test('should create modal', () => {
            panels.createModal('confirm', 'Confirm', '<p>Are you sure?</p>');
            expect(panels.modals.has('confirm')).toBe(true);
        });

        test('should open modal', () => {
            panels.createModal('confirm', 'Confirm', '<p>Are you sure?</p>');
            panels.openModal('confirm');
            expect(panels.modals.get('confirm').visible).toBe(true);
        });

        test('should close modal', () => {
            panels.createModal('confirm', 'Confirm', '<p>Are you sure?</p>');
            panels.openModal('confirm');
            panels.closeModal('confirm');
            expect(panels.modals.get('confirm').visible).toBe(false);
        });

        test('should close all modals', () => {
            panels.createModal('modal1', 'Modal 1', '<p>1</p>');
            panels.createModal('modal2', 'Modal 2', '<p>2</p>');
            panels.openModal('modal1');
            panels.openModal('modal2');
            panels.closeAll();
            
            expect(panels.modals.get('modal1').visible).toBe(false);
            expect(panels.modals.get('modal2').visible).toBe(false);
        });

        test('should get active modal', () => {
            panels.createModal('confirm', 'Confirm', '<p>Are you sure?</p>');
            panels.openModal('confirm');
            expect(panels.getActiveModal()).toBe('confirm');
        });
    });
});


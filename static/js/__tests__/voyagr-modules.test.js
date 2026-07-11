/**
 * @jest-environment jsdom
 */

const VoyagrUnits = require('../modules/navigation/units');
const VoyagrTripHistory = require('../modules/navigation/trip-history');

describe('VoyagrModules registry', () => {
    beforeEach(() => {
        global.VoyagrUnits = VoyagrUnits;
        global.VoyagrTripHistory = VoyagrTripHistory;
        global.VoyagrPolylineCodec = require('../modules/navigation/polyline-codec');
        global.VoyagrToggleUI = require('../modules/ui/toggle-ui');
        global.VoyagrWeatherLayer = require('../modules/map/weather-layer');
        global.VoyagrTrafficChange = require('../modules/navigation/traffic-change');
        global.VoyagrLaneGuidance = require('../modules/navigation/lane-guidance');
        global.VoyagrSpeedGps = require('../modules/navigation/speed-gps');
        global.VoyagrHazardAlerts = require('../modules/navigation/hazard-alerts');
        global.VoyagrSpeedLimitWidget = require('../modules/navigation/speed-limit-widget');
        global.VoyagrRouteGeometry = require('../modules/navigation/route-geometry');
        global.VoyagrTurnInstructions = require('../modules/navigation/turn-instructions');
        global.VoyagrETA = require('../modules/navigation/eta');
        global.VoyagrVoiceAnnouncements = require('../modules/navigation/voice-announcements');
        global.VoyagrRerouteDecision = require('../modules/navigation/reroute-decision');
        global.VoyagrRoutingRequest = require('../modules/navigation/routing-request');
        global.VoyagrCameraPitch = require('../modules/navigation/camera-pitch');
        global.VoyagrHtml = require('../modules/util/html');
        global.VoyagrRecentDestinations = require('../modules/navigation/recent-destinations');
        jest.resetModules();
    });

    test('registers all declared module keys when globals are present', () => {
        const VoyagrModules = require('../modules/voyagr-modules');
        expect(VoyagrModules.init()).toBe(true);
        expect(VoyagrModules.keys().length).toBeGreaterThanOrEqual(18);
        expect(VoyagrModules.units()).toBe(VoyagrUnits);
        expect(VoyagrModules.tripHistory()).toBe(VoyagrTripHistory);
    });

    test('require throws when a module global is missing', () => {
        delete global.VoyagrUnits;
        jest.resetModules();
        const VoyagrModules = require('../modules/voyagr-modules');
        expect(() => VoyagrModules.units()).toThrow(/VoyagrUnits/);
    });
});

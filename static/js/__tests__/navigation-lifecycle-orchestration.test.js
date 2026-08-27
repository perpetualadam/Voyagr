/**
 * @jest-environment jsdom
 * @file Tests for navigation start status banner behaviour when route layer mount fails.
 */

global.VoyagrMapControls = require('../modules/map/map-controls.js');
global.VoyagrRouteSelection = require('../modules/navigation/route-selection.js');
global.VoyagrRerouteMapOrchestration = require('../app/reroute-map-orchestration.js');
global.VoyagrDeviceEnvironment = require('../modules/ui/device-environment.js');
global.VoyagrTurnInstructions = require('../modules/navigation/turn-instructions.js');
global.VoyagrMapTheme = {
    readStoredMapTheme: () => 'standard',
};
require('../maplibre-helpers.js');

describe('navigation-lifecycle-orchestration nav start status', () => {
    let NavigationLifecycle;
    let showStatus;
    let addPolyline;
    let clearLastDistanceToNextTurn;

    function bindRuntime(overrides) {
        overrides = overrides || {};
        showStatus = jest.fn();
        addPolyline = overrides.addPolyline || jest.fn(() => ({ _added: true }));
        clearLastDistanceToNextTurn = overrides.clearLastDistanceToNextTurn || jest.fn();
        const redrawNavigationRouteLayer = overrides.redrawNavigationRouteLayer || jest.fn();

        const noop = jest.fn();
        NavigationLifecycle.bind({
            mapControls: () => global.VoyagrMapControls,
            routeSelection: () => global.VoyagrRouteSelection,
            routeGeometry: () => ({
                haversineDistanceMeters: jest.fn(() => 100),
                inferRoadClassFromManeuver: jest.fn(() => 'residential'),
            }),
            turnInstructions: () => global.VoyagrTurnInstructions,
            eta: () => ({}),
            toggleUI: () => ({ applyToggleButton: noop }),
            deviceEnvironment: () => global.VoyagrDeviceEnvironment,
            getRouteOptions: () => [],
            getSelectedRouteIndex: () => 0,
            getRouteInProgress: () => NavigationLifecycle.getRouteInProgress(),
            setRouteInProgress: (val) => NavigationLifecycle.setRouteInProgress(val),
            getCurrentLat: () => null,
            getCurrentLon: () => null,
            getIsTrackingActive: () => true,
            getZoomAndFollowEnabled: () => true,
            getMapFollowingActive: () => false,
            getMap: () => ({
                easeTo: jest.fn(),
            }),
            getMapLibreHelpers: () => ({
                addPolyline,
                isPolylineLayerMountOk: window.MapLibreHelpers.isPolylineLayerMountOk,
            }),
            getRouteLayer: () => null,
            setRouteLayer: noop,
            setMapFollowingActive: noop,
            setJourneyOverviewActive: noop,
            setSavedMapState: noop,
            setLastETAAnnouncementTime: noop,
            setLastAnnouncedETA: noop,
            setLastNavTrafficFetchAt: noop,
            setInitialETAMovementRetries: noop,
            clearLastDistanceToNextTurn,
            getDriverPerspectiveEnabled: () => false,
            getArModeActive: () => false,
            getUpdatePending: () => false,
            call: {
                resetVoiceAnnouncementStateForNewRoute: noop,
                resetVehicleMarkerDisplayState: noop,
                resetNavETASnapshot: noop,
                decodePolyline: jest.fn(() => [[51.5, -0.1], [51.6, -0.2]]),
                persistActiveRoute: noop,
                precacheRouteTiles: noop,
                clearAllRouteLayersFromMap: noop,
                clearAllRouteLayerHandles: noop,
                clearPersistedRoute: noop,
                clearRerouteFailureRetries: noop,
                navActiveRouteColor: () => '#3388ff',
                bringNavRouteAboveTrafficEdges: noop,
                redrawNavigationRouteLayer,
                showStatus,
                sendNotification: noop,
                speakMessage: noop,
                startGPSTracking: noop,
                stopGPSTracking: noop,
                startLiveDataRefresh: noop,
                stopLiveDataRefresh: noop,
                updateETACalculation: noop,
                scheduleInitialETAAnnouncement: noop,
                clearInitialETAAnnouncement: noop,
                startAutoTrafficUpdates: noop,
                stopAutoTrafficUpdates: noop,
                startRouteTrafficUpdates: noop,
                stopRouteTrafficUpdates: noop,
                showTurnInstructionWidget: noop,
                hideTurnInstructionWidget: noop,
                updateTurnInstructionDisplay: noop,
                showJourneySummaryBar: noop,
                hideJourneySummaryBar: noop,
                hideRoadNameBar: noop,
                updateNavigationFabVisibility: noop,
                voyagrShowMapIconHint: noop,
                showVolumeHintForNavigation: noop,
                applyZoomFollowButtonUi: noop,
                updateRoadReportFabVisibility: noop,
                updateRecenterButtonVisibility: noop,
                updateSpeedWidgetVisibility: noop,
                shouldUsePitchedDrivingCamera: () => false,
                applyDriverPerspective: noop,
                buildTraveledJourneyRoute: noop,
                persistCompletedTrip: noop,
                showJourneySummary: noop,
                stopARMode: noop,
                saveAppState: noop,
                getTrafficSettingsSnapshot: () => ({
                    autoTrafficUpdateEnabled: false,
                    routeTrafficEnabled: false,
                }),
            },
        });
    }

    beforeEach(() => {
        jest.resetModules();
        global.VoyagrMapControls = require('../modules/map/map-controls.js');
        global.VoyagrRouteSelection = require('../modules/navigation/route-selection.js');
        global.VoyagrRerouteMapOrchestration = require('../app/reroute-map-orchestration.js');
        global.VoyagrDeviceEnvironment = require('../modules/ui/device-environment.js');
        global.VoyagrTurnInstructions = require('../modules/navigation/turn-instructions.js');
        global.VoyagrServiceWorkerOrchestration = {
            getUpdatePending: () => false,
        };
        NavigationLifecycle = require('../app/navigation-lifecycle-orchestration.js');
        NavigationLifecycle.setRouteInProgress(false);
        window.lastCalculatedRoute = null;
        jest.useFakeTimers();
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    test('route layer mount failure keeps warning status instead of success banner', () => {
        bindRuntime({
            addPolyline: jest.fn(() => ({ _added: false })),
        });

        NavigationLifecycle.startTurnByTurnNavigation({
            geometry: 'encoded',
            maneuvers: [{ type: 1, instruction: 'Turn left' }],
        });

        expect(showStatus).toHaveBeenCalledWith(
            expect.stringContaining('retry'),
            'warning'
        );
        expect(showStatus).not.toHaveBeenCalledWith(
            expect.stringContaining('Turn-by-turn navigation active'),
            'success'
        );
    });

    test('deferred pending route layer mount does not schedule redraw retry', () => {
        const redrawNavigationRouteLayer = jest.fn();
        bindRuntime({
            addPolyline: jest.fn(() => ({ _added: false, _pending: true })),
            redrawNavigationRouteLayer,
        });

        NavigationLifecycle.startTurnByTurnNavigation({
            geometry: 'encoded',
            maneuvers: [{ type: 1, instruction: 'Turn left' }],
        });

        expect(showStatus).toHaveBeenCalledWith(
            expect.stringContaining('Turn-by-turn navigation active'),
            'success'
        );
        expect(showStatus).not.toHaveBeenCalledWith(
            expect.stringContaining('retry'),
            'warning'
        );

        jest.advanceTimersByTime(500);
        expect(redrawNavigationRouteLayer).not.toHaveBeenCalled();
    });

    test('successful route layer mount still shows navigation active status', () => {
        bindRuntime({
            addPolyline: jest.fn(() => ({ _added: true })),
        });

        NavigationLifecycle.startTurnByTurnNavigation({
            geometry: 'encoded',
            maneuvers: [{ type: 1, instruction: 'Turn left' }],
        });

        expect(showStatus).toHaveBeenCalledWith(
            expect.stringContaining('Turn-by-turn navigation active'),
            'success'
        );
        expect(showStatus).not.toHaveBeenCalledWith(
            expect.stringContaining('retry'),
            'warning'
        );
    });

    test('nav start clears cached lastDistanceToNextTurn from the previous trip', () => {
        bindRuntime();

        NavigationLifecycle.startTurnByTurnNavigation({
            geometry: 'encoded',
            maneuvers: [{ type: 1, instruction: 'Turn left' }],
        });

        expect(clearLastDistanceToNextTurn).toHaveBeenCalled();
    });

    test('nav stop clears cached lastDistanceToNextTurn', () => {
        bindRuntime();
        NavigationLifecycle.setRouteInProgress(true);

        NavigationLifecycle.stopTurnByTurnNavigation();

        expect(clearLastDistanceToNextTurn).toHaveBeenCalled();
        expect(NavigationLifecycle.getRouteInProgress()).toBe(false);
    });
});

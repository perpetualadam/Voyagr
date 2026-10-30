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

function validRoute() {
    const now=Date.now()/1000;
    const r={id:'synthetic',geometry:require('polyline').encode([[51.5,-0.1],[51.6,-0.2]],6),geometry_precision:6,maneuvers:[{type:1,instruction:'Turn left'}],
        avoidance_assessment:{checked_at:now,geometry_valid:true,requires_acceptance:false,requirements:[],
            origin_integrity:{checked_at:now,navigation_allowed:true,transition_verified:false,
                status:'CONTINUOUS_WITHIN_NUMERICAL_TOLERANCE'}}};
    r.avoidance_assessment.geometry_binding=require('../modules/navigation/avoidance-integrity.js').geometryBinding(r);return r;
}

describe('navigation-lifecycle-orchestration nav start status', () => {
    let NavigationLifecycle;
    let showStatus;
    let addPolyline;
    let clearLastDistanceToNextTurn;

    function bindRuntime(overrides={}) {
        const {bindTransition,bindStart}=require('./fixtures/navigation-transition.cjs');
        const context=bindTransition();showStatus=context.status;
        if(overrides.addPolyline)context.runtime.getMapLibreHelpers=()=>({...context.mapHelpers,addPolyline:overrides.addPolyline});
        const runtime=bindStart(context,{call:{redrawNavigationRouteLayer:overrides.redrawNavigationRouteLayer || jest.fn()}});
        addPolyline=overrides.addPolyline || context.addPolyline;
        clearLastDistanceToNextTurn=runtime.clearLastDistanceToNextTurn;
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
        global.VoyagrAvoidanceIntegrity = require('../modules/navigation/avoidance-integrity.js');
        localStorage.clear();
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
            addPolyline: jest.fn(() => ({ id:'failed-stage',_added:false,remove:jest.fn() })),
        });

        NavigationLifecycle.startTurnByTurnNavigation(validRoute());

        expect(showStatus).toHaveBeenCalledWith(
            expect.stringContaining('retry'),
            'warning'
        );
        expect(showStatus).not.toHaveBeenCalledWith(
            expect.stringContaining('Turn-by-turn navigation active'),
            'success'
        );
    });

    test('deferred pending route layer cannot claim an active navigation start', () => {
        const redrawNavigationRouteLayer = jest.fn();
        bindRuntime({
            addPolyline: jest.fn(() => ({id:'pending-stage',_added:false,_pending:true,remove:jest.fn()})),
            redrawNavigationRouteLayer,
        });

        NavigationLifecycle.startTurnByTurnNavigation(validRoute());

        expect(showStatus).not.toHaveBeenCalledWith(
            expect.stringContaining('Turn-by-turn navigation active'),
            'success'
        );
        expect(NavigationLifecycle.getRouteInProgress()).toBe(false);
        expect(NavigationLifecycle.getRouteStarted()).toBe(false);

        jest.advanceTimersByTime(500);
        expect(redrawNavigationRouteLayer).not.toHaveBeenCalled();
    });

    test('successful route layer mount still shows navigation active status', () => {
        bindRuntime();

        NavigationLifecycle.startTurnByTurnNavigation(validRoute());

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

        NavigationLifecycle.startTurnByTurnNavigation(validRoute());

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

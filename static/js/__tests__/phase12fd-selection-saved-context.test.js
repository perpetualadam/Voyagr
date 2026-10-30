/* Synthetic only: real gate, public selection/restoration/UI entries and lifecycle.
 * Fault exports model broken modules; map/bootstrap doubles are boundaries only. */
const AI = require('../modules/navigation/avoidance-integrity.js');
const RS = require('../modules/navigation/route-selection.js');
const Sharing = require('../modules/navigation/route-sharing.js');
const Compare = require('../app/route-comparison-orchestration.js');
const Saving = require('../app/route-saving-orchestration.js');
const Preview = require('../app/route-preview-orchestration.js');
const Life = require('../app/navigation-lifecycle-orchestration.js');
const codec = require('polyline');
const {bindTransition} = require('./fixtures/navigation-transition.cjs');

function route(id = 'A', end = [53.01, -1], mode = 'mandatory', status = 'SATISFIED') {
    const now = Date.now() / 1000;
    const r = {id, name: id, destination: 'DEST_' + id, destinationName: 'DEST_' + id,
        geometry: codec.encode([[53, -1], end], 6), geometry_precision: 6,
        polyline: [[53, -1], end], maneuvers: [{type:1,instruction:'Synthetic instruction'}], distance_km: 1, duration_minutes: 2,
        avoidance_preferences_snapshot: AI.snapshot(localStorage),
        avoidance_assessment: {checked_at: now, status, geometry_valid: true,
            requirements: [{category: 'tolls', enabled: true, mode, status}],
            requires_acceptance: mode === 'mandatory' && status !== 'SATISFIED',
            origin_integrity: {checked_at: now, navigation_allowed: true, transition_verified: false,
                status: 'CONTINUOUS_WITHIN_NUMERICAL_TOLERANCE', requested_origin: [53, -1]}}};
    r.avoidance_assessment.geometry_binding = AI.geometryBinding(r);
    return r;
}
let status, mapMutation, bootstrap, confirm, display, collapse;
function state() {
    return JSON.stringify({last: window.lastCalculatedRoute, options: Compare.getRouteOptions(),
        index: Compare.getSelectedRouteIndex(), polyline: Life.getRoutePolyline(),
        active: Life.getRouteInProgress(), started: Life.getRouteStarted()});
}
beforeEach(() => {
    localStorage.clear(); global.VoyagrAvoidanceIntegrity = AI;
    delete global.VoyagrGpsOrchestration;
    document.body.innerHTML = '<input id="start"><input id="end"><div id="routeComparisonList"></div>' +
        '<p id="routeAvoidanceNotice"></p><button id="startNavBtn">Start</button>';
    status = jest.fn(); mapMutation = jest.fn(); display = jest.fn(); collapse = jest.fn();
    bootstrap = jest.fn(() => { throw new Error('BOOTSTRAP_BOUNDARY'); });
    confirm = jest.spyOn(global, 'confirm').mockReturnValue(true);
    Life.setRouteInProgress(false); Life.setRouteStarted(false); Life.setRoutePolyline([[53, -1], [53.02, -1]]);
    Compare.setRouteOptions([]); Compare.setSelectedRouteIndex(0); window.lastCalculatedRoute = null; window.lastRouteApiResponse = null;
    const traffic = () => ({routeTrafficEnabled: true});
    bindTransition({status,addPolyline:()=>{mapMutation();return {_added:true,remove:jest.fn()};}});
    Compare.bind({routeSelection: () => RS, getMap: () => ({getStyle: () => ({layers: [], sources: {}})}),
        getRouteLayer: () => null, getShowTrafficEnabled: () => false, getTrafficLayer: () => null,
        setRoutePolyline: p => { mapMutation(); Life.setRoutePolyline(p); },
        getMapLibreHelpers: () => ({addPolyline: () => { mapMutation(); return {remove: mapMutation}; }, fitMapBounds: mapMutation}),
        call: {showStatus: status, getTrafficSettingsSnapshot: traffic, convertDistance: String,
            getDistanceUnit: () => 'km', getCurrencySymbol: () => 'GBP',
            fetchAndDisplayRouteTraffic: mapMutation, clearHazardMarkers: jest.fn(), showRoutePreview: jest.fn()}});
    Life.bind({routeSelection: () => RS, getRouteOptions: () => Compare.getRouteOptions(),
        getSelectedRouteIndex: () => Compare.getSelectedRouteIndex(), mapControls: bootstrap, call: {showStatus: status}});
    Preview.bind({routeSelection: () => RS, getRouteInProgress: () => Life.getRouteInProgress(),
        setRouteOptions: Compare.setRouteOptions, getRouteOptions: Compare.getRouteOptions,
        setSelectedRouteIndex: Compare.setSelectedRouteIndex, getSelectedRouteIndex: Compare.getSelectedRouteIndex,
        getCurrentRoutingMode: () => 'auto', getCurrentVehicleType: () => 'petrol_diesel',
        getDistanceUnitValue: () => 'km', getShowTrafficEnabled: () => false, getTrafficLayer: () => null,
        call: {showStatus: status, convertDistance: String, getCurrencySymbol: () => 'GBP', getDistanceUnit: () => 'km',
            getTrafficSettingsSnapshot: () => ({routeTrafficEnabled: false}), displayAllRoutesOnMap: display,
            switchTab: jest.fn(), expandBottomSheet: jest.fn(), collapseBottomSheet: collapse,
            syncLastCalculatedRouteFromSelection: Compare.syncLastCalculatedRouteFromSelection,
            startTurnByTurnNavigation: (...args) => Life.startTurnByTurnNavigation(...args)}});
    Saving.bind({routeSharing: () => Sharing, getRouteInProgress: () => Life.getRouteInProgress(),
        call: {showStatus: status, switchTab: jest.fn(), showRestoredRoutePreview: Preview.showRestoredRoutePreview}});
});
afterEach(() => { jest.restoreAllMocks(); });
function unchanged(before) {
    expect(state()).toBe(before);
    expect(bootstrap).not.toHaveBeenCalled(); expect(mapMutation).not.toHaveBeenCalled();
    expect(confirm).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(expect.any(String), 'warning');
}
const faults = [
    ['missing', undefined], ['noncallable', {gate: true}],
    ['throwing', {gate: () => { throw new Error('BROKEN_VERIFIER'); }}],
    ['false', {gate: () => false}], ['undefined', {gate: () => undefined}],
    ['object', {gate: () => ({allowed: true})}], ['string', {gate: () => 'true'}],
    ['promise', {gate: () => Promise.resolve(true)}],
];
describe.each(['selectRoute', 'useRoute'])('F2 %s', entry => {
    test.each([false, true].flatMap(mandatory => faults.map(([name, verifier]) => [mandatory, name, verifier])))(
        'active selection mandatory=%s verifier=%s refuses before mutation', (mandatory, _name, verifier) => {
        if (mandatory) localStorage.setItem('pref_avoidance_mode', 'mandatory');
        const old = route('OLD', [53.02, -1]), next = route('NEW', [53.01, -1], mandatory ? 'mandatory' : 'preference');
        Compare.setRouteOptions([old, next]); window.lastCalculatedRoute = old;
        Life.setRouteInProgress(true); Life.setRouteStarted(true);
        global.VoyagrAvoidanceIntegrity = verifier; status.mockClear();
        const before = state();
        expect(Compare[entry](1)).toBe(false);
        unchanged(before);
    });
    test('literal synchronous true authorizes active selection', () => {
        global.VoyagrAvoidanceIntegrity = {...AI,gate: () => true};
        Compare.setRouteOptions([route('OLD'), route('NEW')]); window.lastCalculatedRoute = route('OLD');
        Life.setRouteInProgress(true);
        Compare[entry](1);
        expect(Compare.getSelectedRouteIndex()).toBe(1);
        expect(mapMutation).toHaveBeenCalled(); expect(confirm).not.toHaveBeenCalled();
    });
    test.each(['VIOLATED', 'UNVERIFIED', 'UNSUPPORTED'])('real mandatory %s refuses before mutation', evidence => {
        localStorage.setItem('pref_avoidance_mode', 'mandatory');
        const old = route('OLD'), next = route('NEW', [53.01, -1], 'mandatory', evidence);
        Compare.setRouteOptions([old, next]); window.lastCalculatedRoute = old; Life.setRouteInProgress(true);
        const before = state(); expect(Compare[entry](1)).toBe(false); unchanged(before);
    });
    test.each(['mandatory', 'preference'])('real %s route refuses offline and permits online', mode => {
        if (mode === 'mandatory') localStorage.setItem('pref_avoidance_mode', mode);
        const old = route('OLD'), next = route('NEW', [53.01, -1], mode, mode === 'preference' ? 'UNVERIFIED' : 'SATISFIED');
        Compare.setRouteOptions([old, next]); window.lastCalculatedRoute = old; Life.setRouteInProgress(true);
        const online = jest.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
        const before = state(); expect(Compare[entry](1)).toBe(false); unchanged(before);
        online.mockReturnValue(true); Compare[entry](1);
        expect(Compare.getSelectedRouteIndex()).toBe(1); expect(mapMutation).toHaveBeenCalled();
    });
    test('real accepted GPS displacement refuses the candidate', () => {
        const old = route('OLD'), next = route('NEW');
        global.VoyagrGpsOrchestration = {getAcceptedOriginFix: () => ({lat: 54, lon: -2, timestamp: Date.now()})};
        Compare.setRouteOptions([old, next]); window.lastCalculatedRoute = old; Life.setRouteInProgress(true);
        const before = state(); expect(Compare[entry](1)).toBe(false); unchanged(before);
    });
});

const scenarios = ['different', 'matching', 'destination', 'geometry', 'identity', 'multiple', 'none',
    'stale_saved', 'missing_saved', 'malformed_saved', 'stale_preview', 'mandatory_changed', 'offline', 'missing_verifier', 'reinjected_options'];
describe.each(['lifecycle', 'startNavigation', 'startNavigationFromPreview'])('F3 %s', entry => {
    test.each(scenarios)('localStorage restore %s is inspection only and cannot borrow a preview', scenario => {
        localStorage.setItem('pref_avoidance_mode', 'mandatory');
        const a = route(), saved = {id: 'SAVED_B', name: 'Saved synthetic journey', start: 'SYNTHETIC_START', end: 'DEST_B',
            geometry: codec.encode([[53, -1], [53.02, -1]], 6), distance_km: 2, duration_minutes: 3};
        if (scenario === 'matching') { saved.end = a.destination; saved.geometry = a.geometry; }
        if (scenario === 'destination') saved.geometry = a.geometry;
        if (scenario === 'geometry') saved.end = a.destination;
        if (scenario === 'identity') { saved.end = a.destination; saved.geometry = a.geometry; saved.id = 'DIFFERENT_ID'; }
        if (scenario === 'stale_saved') saved.avoidance_assessment = {...a.avoidance_assessment, checked_at: 1};
        if (scenario === 'malformed_saved') saved.avoidance_assessment = 'invalid';
        if (scenario === 'stale_preview') a.avoidance_assessment.checked_at = 1;
        Compare.setRouteOptions(scenario === 'none' ? [] : scenario === 'multiple' ? [route('OTHER'), a] : [a]);
        Compare.setSelectedRouteIndex(scenario === 'multiple' ? 1 : 0); window.lastCalculatedRoute = a;
        localStorage.setItem('savedRoutes', JSON.stringify([saved]));
        Saving.useSavedRoute(saved.id);
        if (scenario === 'reinjected_options') Compare.setRouteOptions([a]);
        if (scenario === 'mandatory_changed') localStorage.setItem('pref_avoidance_requirements', JSON.stringify([{category: 'motorways', enabled: true, mode: 'mandatory'}]));
        if (scenario === 'offline') jest.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
        if (scenario === 'missing_verifier') delete global.VoyagrAvoidanceIntegrity;
        status.mockClear(); display.mockClear(); const before = state();
        const result = entry === 'lifecycle' ? Life.startTurnByTurnNavigation(window.lastCalculatedRoute) : Preview[entry]();
        expect(result).toBe(false); unchanged(before);
        expect(display).not.toHaveBeenCalled(); expect(collapse).not.toHaveBeenCalled();
        expect(window.lastCalculatedRoute.geometry).toBe(saved.geometry);
        expect(window.lastCalculatedRoute.destination).toBe(saved.end);
        expect(window.lastCalculatedRoute.id).toBe(saved.id);
        expect(window.lastCalculatedRoute.navigation_resume_requires_fresh_gps).toBe(true);
        expect(window.lastCalculatedRoute.avoidance_assessment).not.toEqual(a.avoidance_assessment);
        expect(Compare.getRouteOptions()).toEqual(scenario === 'reinjected_options' ? [a] : [window.lastCalculatedRoute]);
        expect(document.getElementById('end').value).toBe(saved.end);
    });
    test('new separately assessed route remains usable after inspecting a saved journey', () => {
        const saved = {id: 'B', start: 'START_B', end: 'DEST_B', geometry: route('B').geometry};
        localStorage.setItem('savedRoutes', JSON.stringify([saved])); Saving.useSavedRoute('B');
        const fresh = route('NEW'); Compare.setRouteOptions([fresh]); window.lastCalculatedRoute = fresh;
        expect(() => entry === 'lifecycle' ? Life.startTurnByTurnNavigation(fresh) : Preview[entry]()).toThrow('BOOTSTRAP_BOUNDARY');
        expect(bootstrap).toHaveBeenCalledTimes(1); expect(confirm).not.toHaveBeenCalled();
    });
});
test('saved inspection cannot replace an active navigation context', () => {
    const active = route(); Compare.setRouteOptions([active]); window.lastCalculatedRoute = active;
    Life.setRouteInProgress(true); localStorage.setItem('savedRoutes', JSON.stringify([{id: 'B', geometry: route('B').geometry}]));
    const before = state(); expect(Saving.useSavedRoute('B')).toBe(false); unchanged(before);
});
test('selection helper cannot transfer permission into a restored candidate', () => {
    const saved = Sharing.buildUseSavedRoutePlan('B', [{id: 'B', end: 'DEST_B', geometry: route('B').geometry}]).lastCalculatedRoutePatch;
    expect(RS.mergeLastCalculatedRouteFromSelection(saved, route('A'))).toBe(saved);
    expect(RS.mergeNavigationRouteFromSelected(saved, [route('A')], 0)).toBe(saved);
});
test.each(['startNavigation', 'startNavigationFromPreview'])('live %s refusal also precedes selection synchronization', entry => {
    const old = route('OLD'), bad = route('BAD', [53.02, -1], 'mandatory', 'VIOLATED');
    Compare.setRouteOptions([bad]); window.lastCalculatedRoute = old;
    const before = state(); expect(Preview[entry]()).toBe(false); unchanged(before);
    expect(window.lastCalculatedRoute.avoidance_assessment).toBe(old.avoidance_assessment);
});
test('pure navigation and preview merges use the selected identity and endpoints with its evidence', () => {
    const old = {...route('OLD'), end_lat: 53.02, end_lon: -1};
    const next = {...route('NEW'), end_lat: 53.01, end_lon: -1};
    for (const candidate of [RS.mergeNavigationRouteFromSelected(old, [next], 0), RS.mergeLastCalculatedRouteFromSelection(old, next)]) {
        expect(candidate.id).toBe(next.id); expect(candidate.destination).toBe(next.destination);
        expect(candidate.end_lat).toBe(next.end_lat); expect(candidate.geometry).toBe(next.geometry);
        expect(candidate.avoidance_assessment).toBe(next.avoidance_assessment);
        expect(AI.gate(candidate)).toBe(true);
    }
});
test('saved inspection also discards the unrelated API envelope used by preview cards', () => {
    window.lastRouteApiResponse = {routes: [route('A')], avoidance_assessment: route('A').avoidance_assessment};
    localStorage.setItem('savedRoutes', JSON.stringify([{id: 'B', end: 'DEST_B', geometry: route('B').geometry}]));
    expect(Saving.useSavedRoute('B')).toBe(true);
    expect(window.lastRouteApiResponse).toBeNull();
    expect(document.getElementById('routeAvoidanceNotice').textContent).toContain('navigation cannot start');
});

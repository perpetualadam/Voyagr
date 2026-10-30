/* Synthetic controls only. Recorded fixture 0 runs via the private Python adapter. */
const {checkRejected} = require('../../../tests/phase12fc_browser_gate.cjs');
const AI = require('../modules/navigation/avoidance-integrity.js');
const codec = require('polyline');
const {IDBFactory} = require('fake-indexeddb');
function syntheticRoute(allowed) {
    const now = Date.now() / 1000;
    const r={id: 1, source: 'Valhalla', geometry: codec.encode([[53, -1], [53.01075, -1]], 6),
        geometry_precision: 6, maneuvers: [{type:1,instruction:'Synthetic instruction'}], avoidance_assessment: {
            geometry_valid: true, checked_at: now, requirements: [],
            automatic_selection_allowed: allowed, requires_acceptance: !allowed,
            origin_integrity_required: true,
            origin_integrity: {checked_at: now, navigation_allowed: allowed,
                status: allowed ? 'CONTINUOUS_WITHIN_NUMERICAL_TOLERANCE' : 'UNVERIFIED',
                reason: allowed ? 'no_material_relocation' : 'material_endpoint_relocation',
                transition_verified: false}}};
    r.avoidance_assessment.geometry_binding=AI.geometryBinding(r);return r;
}
beforeEach(() => {
    window.VoyagrAvoidanceIntegrity = AI;
    global.indexedDB = new IDBFactory();
    localStorage.clear();
});
afterEach(() => { jest.restoreAllMocks(); });
test('synthetic endpoint rejection reaches real start, selection, reroute and persisted resume', async () => {
    const result = await checkRejected({routes: [syntheticRoute(false)]});
    expect(result).toEqual({manual_refused: true, automatic_refused: true,
        start_refused: true, selection_refused: true, reroute_refused: true,
        resume_refused: true, resume_preserves_endpoint_refusal: true,
        confirmation_never_invoked: true, navigation_unchanged: true});
});
test('positive metadata control proves browser gate is not unconditionally refusing', () => {
    // Synthetic metadata control only, not endpoint validation or recorded evidence.
    expect(AI.gate(syntheticRoute(true), {storage: localStorage})).toBe(true);
});
test('positive metadata reaches bootstrap; an initialization exception safely refuses', () => {
    const Lifecycle = require('../app/navigation-lifecycle-orchestration.js');
    const RS = require('../modules/navigation/route-selection.js');
    const route = syntheticRoute(true);
    const bootstrap = jest.fn(() => { throw new Error('CONTROL_BOOTSTRAP_REACHED'); });
    Lifecycle.bind({routeSelection: () => RS, getRouteOptions: () => [route],
        getSelectedRouteIndex: () => 0, mapControls: bootstrap, call: {showStatus: jest.fn()}});
    expect(Lifecycle.startTurnByTurnNavigation(route)).toBe(false);
    expect(Lifecycle.getRouteInProgress()).toBe(false);
    expect(bootstrap).toHaveBeenCalledTimes(1);
});

/* Test-only bridge. Private backend-computed envelope arrives on stdin, never argv.
 * No replacement of the production gate/start/resume functions. */
async function checkRejected(body) {
    const AI = require('../static/js/modules/navigation/avoidance-integrity.js');
    const RS = require('../static/js/modules/navigation/route-selection.js');
    const Lifecycle = require('../static/js/app/navigation-lifecycle-orchestration.js');
    const Reroute = require('../static/js/app/reroute-map-orchestration.js');
    const Offline = require('../static/js/modules/navigation/offline-navigation.js');
    const Resume = require('../static/js/app/offline-navigation-orchestration.js');
    const codec = require('polyline');
    const route = body.routes[0];
    window.VoyagrAvoidanceIntegrity = AI;
    localStorage.clear();
    let confirmations = 0, mutations = 0;
    window.confirm = () => { confirmations++; return true; };
    const showStatus = () => {};
    const bootstrap = () => { mutations++; throw new Error('Unexpected navigation bootstrap'); };
    Lifecycle.setRouteInProgress(false);
    Lifecycle.setRouteStarted(false);
    Lifecycle.bind({routeSelection: () => RS, getRouteOptions: () => [route],
        getSelectedRouteIndex: () => 0, mapControls: bootstrap, call: {showStatus}});
    const manual = AI.gate(route, {storage: localStorage, confirm: window.confirm});
    const automatic = AI.gate(route, {storage: localStorage, automatic: true});
    const started = Lifecycle.startTurnByTurnNavigation(route);
    const selected = RS.mergeLastCalculatedRouteFromSelection(
        {avoidance_assessment: {automatic_selection_allowed: true}}, route);
    const selection = AI.gate(selected, {storage: localStorage, confirm: window.confirm});
    Reroute.bind({call: {showStatus}, rerouteDecision: bootstrap});
    const rerouted = Reroute.updateRouteOnMap(route);

    const points = codec.decode(route.geometry, route.geometry_precision);
    const record = Offline.buildActiveRoutePersistRecord({polyline: points,
        routeData: route, steps: route.maneuvers || [], stepIndex: 0});
    await Offline.persistActiveRouteRecord(indexedDB, record);
    let resumeCalls = 0, resumeResult = null, resumePreserved = false;
    Resume.bind({offlineNavigation: () => Offline, routeSelection: () => RS,
        polylineCodec: () => ({encodePolyline: (p, precision) => codec.encode(p, precision)}),
        call: {showStatus, startTurnByTurnNavigation: (...args) => {
            resumeCalls++;
            const origin = args[0].avoidance_assessment.origin_integrity;
            resumePreserved = origin.navigation_allowed === false && origin.reason === 'material_endpoint_relocation';
            resumeResult = Lifecycle.startTurnByTurnNavigation(...args);
            return resumeResult;
        }}});
    // Use real persistence, banner event handler and navigation start. Clean the
    // banner timer so this test-only Node process cannot wait for 30 seconds.
    const timers = [], originalTimeout = global.setTimeout;
    global.setTimeout = (...args) => { const id = originalTimeout(...args); timers.push(id); return id; };
    try {
        await Resume.tryResumeNavigation();
        const button = document.getElementById(Offline.RESUME_NAV_YES_ID);
        if (!button || typeof button.onclick !== 'function') throw new Error('Resume path not reached');
        button.onclick();
    } finally {
        global.setTimeout = originalTimeout;
        timers.forEach(clearTimeout);
        await Offline.clearActiveRouteRecord(indexedDB);
    }
    return {
        manual_refused: manual === false,
        automatic_refused: automatic === false,
        start_refused: started === false,
        selection_refused: selection === false,
        reroute_refused: rerouted.ok === false && rerouted.reason === 'avoidance_not_established',
        resume_refused: resumeCalls === 1 && resumeResult === false,
        resume_preserves_endpoint_refusal: resumePreserved,
        confirmation_never_invoked: confirmations === 0,
        navigation_unchanged: !Lifecycle.getRouteInProgress() && !Lifecycle.getRouteStarted() && mutations === 0,
    };
}
module.exports = {checkRejected};
if (require.main === module) {
    const {JSDOM} = require('jsdom');
    const dom = new JSDOM('', {url: 'https://voyagr.invalid/'});
    global.window = dom.window; global.document = dom.window.document;
    global.localStorage = dom.window.localStorage;
    Object.defineProperty(global, 'navigator', {value: dom.window.navigator, configurable: true});
    global.indexedDB = new (require('fake-indexeddb').IDBFactory)();
    let networkCalls = 0;
    const noNetwork = () => { networkCalls++; throw new Error('Offline regression'); };
    global.fetch = window.fetch = noNetwork;
    global.XMLHttpRequest = window.XMLHttpRequest = noNetwork;
    console.log = console.warn = console.error = () => {};
    try {
        const input = require('fs').readFileSync(0, 'utf8');
        if (Buffer.byteLength(input) > 8 * 1024 * 1024) throw new Error('Input limit');
        checkRejected(JSON.parse(input)).then(result => {
            result.no_network = networkCalls === 0;
            process.stdout.write(JSON.stringify(result));
            dom.window.close();
            if (!Object.values(result).every(v => v === true)) process.exitCode = 1;
        }).catch(() => { dom.window.close(); process.exitCode = 2; });
    } catch (_) { dom.window.close(); process.exitCode = 2; }
}

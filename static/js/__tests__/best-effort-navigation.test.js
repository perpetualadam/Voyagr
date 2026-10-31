const AI=require('../modules/navigation/avoidance-integrity.js');
const UX=require('../app/navigation-safety-ux.js');
const {makeRoute,bindTransition,bindStart}=require('./fixtures/navigation-transition.cjs');
const Life=require('../app/navigation-lifecycle-orchestration.js');
const Reroute=require('../app/reroute-map-orchestration.js');
function route(category='speed_cameras',status='VIOLATED',mode='preference') {
    const r=makeRoute();
    r.avoidance_assessment.status=status;
    r.avoidance_assessment.automatic_selection_allowed=mode==='preference'||status==='SATISFIED';
    r.avoidance_assessment.requires_acceptance=!r.avoidance_assessment.automatic_selection_allowed;
    r.avoidance_assessment.requirements=[{category,enabled:true,mode,status}];
    return r;
}
const template=require('fs').readFileSync(require('path').join(__dirname,'../../../templates/index.html'),'utf8');
function dom() {
    const warning=template.match(/<aside id="bestEffortWarning"[\s\S]*?<\/aside>/)[0];
    const notices=['routeAvoidanceNotice','navigationStartExplanation'].map(id=>template.match(new RegExp('<p id="'+id+'"[^>]*>[\\s\\S]*?<\\/p>'))[0]).join('');
    const buttons=template.match(/<button[^>]*data-navigation-start[^>]*>[\s\S]*?<\/button>/g).join('');
    document.body.innerHTML='<div id="map"><canvas tabindex="0"></canvas></div>'+notices+buttons+warning;
}
beforeEach(()=>{
    localStorage.clear();jest.useFakeTimers();dom();
    global.VoyagrAvoidanceIntegrity=AI;global.VoyagrNavigationSafetyUX=UX;
    Life.setRouteInProgress(false);Life.setRouteStarted(false);Life.setRoutePolyline(null);Life.setCurrentRouteSteps([]);
    const Compare=require('../app/route-comparison-orchestration.js');Compare.setRouteOptions([]);Compare.setSelectedRouteIndex(0);
    window.lastCalculatedRoute=null;window.lastRouteApiResponse=null;
});
afterEach(()=>{UX.reset();jest.useRealTimers();jest.restoreAllMocks();});

test.each([
    ['speed_cameras','VIOLATED'],['traffic_lights','VIOLATED'],['railway_crossings','VIOLATED'],
    ['tolls','UNSUPPORTED'],['caz','UNVERIFIED'],
])('eligible %s/%s preference starts through the real gate without confirmation', (category,status)=>{
    const r=route(category,status);const context=bindTransition();bindStart(context);
    const confirm=jest.spyOn(global,'confirm').mockReturnValue(true);
    expect(AI.currentDecision(r,{},localStorage)).toMatchObject({allowed:true,outcome:'BEST_EFFORT'});
    expect(AI.gate(r,{storage:localStorage})).toBe(true);
    expect(Life.startTurnByTurnNavigation(r)).toBe(true);
    expect(Life.getRouteInProgress()).toBe(true);
    expect(document.getElementById('bestEffortWarning').hidden).toBe(false);
    expect(confirm).not.toHaveBeenCalled();
});
test('verified route starts without the hazard warning',()=>{
    const r=route('speed_cameras','SATISFIED');const context=bindTransition();bindStart(context);
    expect(AI.decision(r).outcome).toBe('VERIFIED');
    expect(Life.startTurnByTurnNavigation(r)).toBe(true);
    expect(document.getElementById('bestEffortWarning').hidden).toBe(true);
});
test.each(['VIOLATED','UNVERIFIED','UNSUPPORTED'])('mandatory %s never becomes best effort or changes protected state',status=>{
    const r=route('speed_cameras',status,'mandatory');const context=bindTransition();bindStart(context);
    const before=context.snapshot();const confirm=jest.spyOn(global,'confirm').mockReturnValue(true);
    for (const automatic of [false,true]) expect(AI.gate(r,{storage:localStorage,automatic,confirm})).toBe(false);
    expect(Life.startTurnByTurnNavigation(r)).toBe(false);
    expect(context.snapshot()).toBe(before);
    expect(UX.present(r)).toMatchObject({allowed:false,outcome:'REFUSED'});
    expect(document.getElementById('startVerifiedHere').disabled).toBe(true);
    expect(document.getElementById('routeAvoidanceNotice').textContent).toMatch(/safety requirements/);
    expect(confirm).not.toHaveBeenCalled();
});
test.each(['origin','binding','stale','snapshot','saved','backend','missing','mandatory-missing'])('%s critical failure cannot be replaced by a preference warning',failure=>{
    const r=route();
    if(failure==='origin')r.avoidance_assessment.origin_integrity.navigation_allowed=false;
    if(failure==='binding')r.avoidance_assessment.geometry_binding='00000000';
    if(failure==='stale')r.avoidance_assessment.checked_at=Date.now()/1000-601;
    if(failure==='snapshot')localStorage.setItem('pref_cameras','false');
    if(failure==='saved')r.navigation_resume_requires_fresh_gps=true;
    if(failure==='backend')r.avoidance_assessment.automatic_selection_allowed=false;
    if(failure==='missing')delete r.avoidance_assessment;
    if(failure==='mandatory-missing')r.avoidance_requirements=[{category:'tolls',enabled:true,mode:'mandatory'}];
    // A forged display label never grants permission.
    r.navigation_outcome='BEST_EFFORT';
    expect(AI.gate(r,{storage:localStorage})).toBe(false);
    expect(UX.present(r).outcome).toBe('REFUSED');
    expect(document.getElementById('bestEffortWarning').hidden).toBe(true);
});
test('offline start refuses and button eligibility follows connectivity and evidence expiry',()=>{
    const r=route();const online=jest.spyOn(navigator,'onLine','get');online.mockReturnValue(false);
    expect(UX.present(r).outcome).toBe('REFUSED');
    online.mockReturnValue(true);window.dispatchEvent(new Event('online'));
    expect(document.getElementById('startVerifiedHere').disabled).toBe(false);
    jest.advanceTimersByTime(601000);
    expect(document.getElementById('startVerifiedHere').disabled).toBe(true);
    expect(document.getElementById('navigationStartExplanation').textContent).toMatch(/stale/);
});
test('warning expires at six seconds, remains in details, and does not repeat on ordinary refresh',()=>{
    const r=route();UX.committed(r);
    const warning=document.getElementById('bestEffortWarning');expect(warning.getAttribute('role')).toBe('status');
    expect(warning.getAttribute('aria-live')).toBe('polite');
    jest.advanceTimersByTime(5999);expect(warning.hidden).toBe(false);
    jest.advanceTimersByTime(1);expect(warning.hidden).toBe(true);
    expect(document.getElementById('routeAvoidanceNotice').textContent).toContain('Some hazards could not be avoided');
    UX.refresh();UX.committed(JSON.parse(JSON.stringify(r)));
    expect(warning.hidden).toBe(true);
});
test('warning is keyboard dismissible; timeout returns focus without trapping it',()=>{
    UX.committed(route());const close=document.getElementById('dismissBestEffortWarning');close.focus();
    jest.advanceTimersByTime(6000);
    expect(document.activeElement).toBe(document.querySelector('#map canvas'));
    UX.committed(route('traffic_lights'));close.focus();close.click();
    expect(document.getElementById('bestEffortWarning').hidden).toBe(true);
});
test('actual reroute changes warnings only after a verified replacement commits',()=>{
    const previous=route();const context=bindTransition();bindStart(context);
    expect(Life.startTurnByTurnNavigation(previous)).toBe(true);jest.advanceTimersByTime(6000);
    const next=route('railway_crossings');next.id='B';
    expect(Reroute.updateRouteOnMap(next)).toMatchObject({ok:true});
    expect(document.getElementById('bestEffortWarning').hidden).toBe(false);
    expect(document.getElementById('routeAvoidanceNotice').textContent).toContain('railway crossings');
    const before=context.snapshot();const bad=route('speed_cameras','VIOLATED','mandatory');
    expect(Reroute.updateRouteOnMap(bad)).toMatchObject({ok:false});
    expect(context.snapshot()).toBe(before);
    expect(document.getElementById('routeAvoidanceNotice').textContent).toContain('railway crossings');
});
test('selected alternative cannot borrow primary eligibility',()=>{
    const RS=require('../modules/navigation/route-selection.js');
    const good=route(),bad=route('tolls','UNVERIFIED','mandatory');bad.id='bad';
    const chosen=RS.mergeNavigationRouteFromSelected(good,[good,bad],1);
    expect(UX.present(chosen).outcome).toBe('REFUSED');
});

test('GPS movement cannot erase active preference details or reauthorize a new start',()=>{
    const r=route();const context=bindTransition();bindStart(context);
    expect(Life.startTurnByTurnNavigation(r)).toBe(true);
    const saved=global.VoyagrGpsOrchestration;
    global.VoyagrGpsOrchestration={getAcceptedOriginFix:()=>({lat:54,lon:-1,timestamp:Date.now()})};
    try {
        UX.refresh();
        expect(document.getElementById('routeAvoidanceNotice').textContent).toContain('Some hazards could not be avoided');
        expect(AI.gate(r,{storage:localStorage})).toBe(false);
        expect(document.getElementById('startVerifiedHere').disabled).toBe(true);
    } finally {global.VoyagrGpsOrchestration=saved;}
});
test('verified replacement clears the warning; later changed compliance announces again',()=>{
    UX.committed(route());
    UX.committed(route('speed_cameras','SATISFIED'));
    expect(document.getElementById('bestEffortWarning').hidden).toBe(true);
    UX.committed(route());
    expect(document.getElementById('bestEffortWarning').hidden).toBe(false);
});
test('an incomplete map transaction never publishes a best-effort warning',()=>{
    const r=route();const context=bindTransition();
    context.runtime.getMapLibreHelpers=()=>({...context.mapHelpers,addPolyline:()=>null});
    bindStart(context);
    expect(Life.startTurnByTurnNavigation(r)).toBe(false);
    expect(Life.getRouteInProgress()).toBe(false);
    expect(document.getElementById('bestEffortWarning').hidden).toBe(true);
});

test('clearing the presentation cannot leave start controls enabled without a route',()=>{
    expect(UX.present(route()).allowed).toBe(true);
    expect(document.getElementById('startVerifiedHere').disabled).toBe(false);
    UX.reset();
    expect(document.getElementById('startVerifiedHere').disabled).toBe(true);
    expect(document.getElementById('navigationStartExplanation').textContent).toContain('navigation cannot start');
    expect(document.getElementById('bestEffortWarning').hidden).toBe(true);
});

/** Real application gates with an isolated strict bootstrap; synthetic authority only. */
const Policy=require('../modules/navigation/strict-route-policy.js');
const AI=require('../modules/navigation/avoidance-integrity.js');
const UX=require('../app/navigation-safety-ux.js');
const Life=require('../app/navigation-lifecycle-orchestration.js');
const Reroute=require('../app/reroute-map-orchestration.js');
const Compare=require('../app/route-comparison-orchestration.js');
const Selection=require('../modules/navigation/route-selection.js');
const {makeRoute,bindTransition,bindStart}=require('./fixtures/navigation-transition.cjs');
function context(){return {graph_version:'a'.repeat(64),source_version:'b'.repeat(64),policy_version:'c'.repeat(64),request_binding:'d'.repeat(64),scope:'navigation_verified',navigation_authorized:true,issued_at_ms:Date.now()-1000,valid_until_ms:Date.now()+300000,requirements:[{category:'tolls',enabled:true,mode:'mandatory'}]};}
function boundRoute(){const route=makeRoute();route.navigation_allowed=true;route.routing_context={...context(),checked_at_ms:Date.now()};return route;}
beforeEach(()=>{
    jest.useFakeTimers();localStorage.clear();document.body.innerHTML='<p id="routeAvoidanceNotice"></p><p id="navigationStartExplanation"></p><button data-navigation-start></button>';
    global.VOYAGR_STRICT_ROUTING=true;global.VoyagrStrictRoutePolicy=Policy.create(context());
    global.VoyagrAvoidanceIntegrity=AI;global.VoyagrNavigationSafetyUX=UX;
    Life.setRouteInProgress(false);Life.setRouteStarted(false);Life.setRoutePolyline(null);Life.setCurrentRouteSteps([]);
});
afterEach(()=>{UX.reset();jest.useRealTimers();jest.restoreAllMocks();delete global.VOYAGR_STRICT_ROUTING;delete global.VoyagrStrictRoutePolicy;delete global.VoyagrJourneyModes;});

test('a context-bound synthetic candidate retains the existing integrity gate',()=>{
    const route=boundRoute();
    expect(AI.currentDecision(route,{},localStorage)).toMatchObject({allowed:true,outcome:'VERIFIED'});
    expect(AI.prepareGuidanceCandidate(route)).not.toBeNull();
    expect(UX.present(route).allowed).toBe(true);
});

test.each(['VIOLATED','UNVERIFIED','UNSUPPORTED'])('strict mandatory %s cannot become advisory or manual guidance',status=>{
    const route=boundRoute();route.avoidance_assessment.requirements[0].status=status;
    const transition=bindTransition();bindStart(transition);const before=transition.snapshot();
    expect(AI.gate(route,{storage:localStorage})).toBe(false);
    expect(AI.prepareGuidanceCandidate(route)).toBeNull();
    expect(UX.present(route)).toMatchObject({allowed:false,outcome:'REFUSED'});
    expect(document.querySelector('[data-navigation-start]').disabled).toBe(true);
    expect(Life.startTurnByTurnNavigation(route)).toBe(false);
    expect(transition.snapshot()).toBe(before);
});

test.each(['graph_version','source_version','policy_version','request_binding'])('%s changes reject a reused candidate and obsolete response',field=>{
    const route=boundRoute();const ticket=AI.begin(localStorage);
    const response={routes:[route]};AI.tag(response,ticket);
    expect(AI.current(ticket,localStorage)).toBe(true);
    const changed=context();changed[field]='e'.repeat(64);global.VoyagrStrictRoutePolicy.update(changed);
    expect(AI.current(ticket,localStorage)).toBe(false);
    expect(AI.responseCurrent(response,localStorage)).toBe(false);
    expect(AI.currentDecision(route,{},localStorage).allowed).toBe(false);
    expect(AI.prepareNavigationCandidate(route)).toBeNull();
});

test('expired cached assessment, changed rules and missing policy remain refused on explicit Start',()=>{
    const route=boundRoute();route.routing_context.valid_until_ms=Date.now()-1;
    expect(UX.present(route).allowed).toBe(false);
    const changed=boundRoute();changed.avoidance_assessment.requirements[0].enabled=false;
    expect(AI.prepareGuidanceCandidate(changed)).toBeNull();
    delete global.VoyagrStrictRoutePolicy;
    expect(AI.decision(boundRoute()).allowed).toBe(false);
    expect(UX.present(boundRoute())).toMatchObject({allowed:false,outcome:'REFUSED'});
});

test('selected-fixture preview can never authorize navigation even with a forged route flag',()=>{
    global.VoyagrStrictRoutePolicy.update({navigation_authorized:false,scope:'selected_fixture_graph_checks_only'});
    expect(AI.prepareGuidanceCandidate(boundRoute())).toBeNull();
    expect(UX.present(boundRoute())).toMatchObject({allowed:false,reasonCode:'STRICT_PREVIEW_ONLY'});
});

test('strict context cannot override a legacy integrity refusal',()=>{
    const route=boundRoute();route.avoidance_preferences_snapshot='old settings';
    expect(global.VoyagrStrictRoutePolicy.decision(route).allowed).toBe(true);
    expect(AI.currentDecision(route,{},localStorage).allowed).toBe(false);
    expect(UX.present(route)).toMatchObject({allowed:false,outcome:'REFUSED'});
});


test('manual guidance permission cannot bypass a strict refusal in the actual start transaction',()=>{
    const transition=bindTransition();bindStart(transition);
    global.VoyagrJourneyModes={PROTOCOL:1,endpointIntentCompatible:()=>true,liveStartPermitted:()=>true,userGuidanceStartPermitted:()=>true};
    const route=boundRoute();route.avoidance_assessment.requirements[0].status='VIOLATED';
    const before=transition.snapshot();
    const preparation=jest.spyOn(AI,'prepareGuidanceCandidate');
    expect(Life.startTurnByTurnNavigation(route)).toBe(false);
    expect(preparation).toHaveBeenCalled();
    expect(transition.snapshot()).toBe(before);
});

test('a refused alternative selection and automatic replacement retain the current route and map',()=>{
    const transition=bindTransition();bindStart(transition);
    const good=boundRoute(),bad=boundRoute();bad.id='bad';bad.avoidance_assessment.requirements[0].status='UNVERIFIED';
    window.lastCalculatedRoute=good;window.lastRouteApiResponse={routes:[good,bad]};
    Compare.setRouteOptions([good,bad]);Compare.setSelectedRouteIndex(0);
    Life.setRoutePolyline(good.polyline);Life.setCurrentRouteSteps(good.maneuvers);Life.setRouteInProgress(true);
    const before=transition.snapshot();
    expect(Compare.selectRoute(1)).toBe(false);
    expect(Compare.useRoute(1)).toBe(false);
    expect(transition.snapshot()).toBe(before);
    expect(Reroute.updateRouteOnMap(bad)).toMatchObject({ok:false});
    expect(transition.snapshot()).toBe(before);
});

test('cached route evidence is rechecked rather than becoming explicit-Start permission',()=>{
    const cached=JSON.parse(JSON.stringify(boundRoute()));
    expect(AI.currentDecision(cached,{},localStorage).allowed).toBe(true);
    cached.avoidance_assessment.checked_at=Date.now()/1000-601;
    expect(global.VoyagrStrictRoutePolicy.decision(cached).allowed).toBe(true);
    expect(AI.currentDecision(cached,{},localStorage).allowed).toBe(false);
    expect(UX.present(cached)).toMatchObject({allowed:false,outcome:'REFUSED'});
    const fresh=boundRoute();fresh.routing_context.request_binding='f'.repeat(64);
    expect(AI.prepareGuidanceCandidate(fresh)).toBeNull();
});


test('route payload flags cannot turn off the trusted strict bootstrap',()=>{
    const route=boundRoute();route.VOYAGR_STRICT_ROUTING=false;route.strict_mode=false;
    route.avoidance_assessment.requirements[0].status='VIOLATED';
    expect(UX.present(route)).toMatchObject({allowed:false,outcome:'REFUSED'});
});

test('the real start transaction accepts a fully bound synthetic positive control',()=>{
    const transition=bindTransition();bindStart(transition);
    const route=boundRoute();Compare.setRouteOptions([]);Compare.setSelectedRouteIndex(0);
    window.lastCalculatedRoute=null;window.lastRouteApiResponse=null;
    expect(Life.startTurnByTurnNavigation(route)).toBe(true);
    expect(Life.getRouteInProgress()).toBe(true);
    expect(Life.getRoutePolyline()).toEqual(route.polyline);
});

test('a context-bound synthetic replacement can commit through the actual reroute transaction',()=>{
    const transition=bindTransition();bindStart(transition);
    const good=boundRoute();
    expect(Life.startTurnByTurnNavigation(good)).toBe(true);
    const next=makeRoute('replacement',[[53,-1],[53.005,-1.001],[53.01,-1]]);
    next.navigation_allowed=true;next.routing_context={...context(),checked_at_ms:Date.now()};
    expect(Reroute.updateRouteOnMap(next)).toMatchObject({ok:true});
    const actual=Life.getRoutePolyline();expect(actual).toHaveLength(next.polyline.length);
    actual.forEach((point,i)=>point.forEach((value,j)=>expect(value).toBeCloseTo(next.polyline[i][j],10)));
    expect(window.lastCalculatedRoute.id).toBe('replacement');
});

const selectionMerges=[
    ['navigation', (base,next)=>Selection.mergeNavigationRouteFromSelected(base,[next],0)],
    ['preview', (base,next)=>Selection.mergeLastCalculatedRouteFromSelection(base,next)]
];
describe.each(selectionMerges)('%s selected-route strict metadata',(_name,merge)=>{
    test.each(['refused','missing_permission','missing_context'])('old authority cannot survive a %s selected route',fault=>{
        const base=boundRoute(),next=boundRoute();next.id='NEW';
        if(fault==='refused')next.navigation_allowed=false;
        if(fault==='missing_permission')delete next.navigation_allowed;
        if(fault==='missing_context')delete next.routing_context;
        const inputs=JSON.stringify([base,next]);
        const merged=merge(base,next);
        expect(merged.id).toBe('NEW');
        expect(AI.currentDecision(merged,{},localStorage).allowed).toBe(false);
        expect(AI.prepareGuidanceCandidate(merged)).toBeNull();
        expect(JSON.stringify([base,next])).toBe(inputs);
    });
    test('new valid authority replaces an old refusal and binding',()=>{
        const base=boundRoute();base.navigation_allowed=false;base.routing_context.request_binding='e'.repeat(64);
        const next=boundRoute();next.id='NEW';
        const merged=merge(base,next);
        expect(merged.id).toBe(next.id);
        expect(merged.routing_context).toEqual(next.routing_context);
        expect(AI.gate(merged,{storage:localStorage})).toBe(true);
        expect(AI.prepareGuidanceCandidate(merged)).not.toBeNull();
    });
    test.each(['graph_version','source_version','policy_version','request_binding','expired'])('new %s mismatch cannot borrow the previous context',field=>{
        const base=boundRoute(),next=boundRoute();next.id='NEW';
        if(field==='expired')next.routing_context.valid_until_ms=Date.now()-1;
        else next.routing_context[field]='e'.repeat(64);
        expect(AI.currentDecision(merge(base,next),{},localStorage).allowed).toBe(false);
    });
});

test.each([false,true])('actual Start uses the selected permission %s rather than the old one',allowed=>{
    const transition=bindTransition();bindStart(transition);
    const old=boundRoute();old.navigation_allowed=!allowed;old.id='OLD';
    const next=boundRoute();next.navigation_allowed=allowed;next.id='NEW';
    Compare.setRouteOptions([old,next]);Compare.setSelectedRouteIndex(1);
    window.lastCalculatedRoute=old;window.lastRouteApiResponse={routes:[old,next]};
    const before=transition.snapshot();
    expect(Life.startTurnByTurnNavigation(old)).toBe(allowed);
    if(allowed){
        expect(Life.getRouteInProgress()).toBe(true);
        expect(window.lastCalculatedRoute.id).toBe('NEW');
        expect(window.lastCalculatedRoute.routing_context).toEqual(next.routing_context);
        expect(window.lastCalculatedRoute.navigation_allowed).toBe(true);
    }else expect(transition.snapshot()).toBe(before);
});

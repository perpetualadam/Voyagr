const AI=require('../modules/navigation/avoidance-integrity.js');
const RS=require('../modules/navigation/route-selection.js');
function route(allowed=true) {
    return {geometry:[[53,-1],[53.01,-1]],avoidance_assessment:{checked_at:Date.now()/1000,
        geometry_valid:true,automatic_selection_allowed:allowed,requires_acceptance:!allowed,
        origin_integrity:{status:allowed?'CONTINUOUS_WITHIN_NUMERICAL_TOLERANCE':'UNVERIFIED',navigation_allowed:allowed,checked_at:Date.now()/1000,transition_verified:false},requirements:[]}};
}
beforeEach(()=>{localStorage.clear();});
test('relocation cannot be overridden manually or during automatic reroute',()=>{
    const confirm=jest.fn(()=>true);
    expect(AI.gate(route(false),{storage:localStorage,confirm})).toBe(false);
    expect(AI.gate(route(false),{storage:localStorage,automatic:true,confirm})).toBe(false);
    expect(confirm).not.toHaveBeenCalled();
});
test('safe geometry retains primary permission and unsafe selected alternative cannot inherit it',()=>{
    const safe=route(),bad=route(false);
    expect(AI.gate(safe,{storage:localStorage})).toBe(true);
    const selected=RS.mergeLastCalculatedRouteFromSelection(safe,bad);
    expect(AI.gate(selected,{storage:localStorage})).toBe(false);
});
test.each([undefined,0,NaN,Infinity,Date.now()/1000-601])('missing/stale origin validation %s requires recalculation',at=>{
    const r=route();r.avoidance_assessment.origin_integrity.checked_at=at;
    expect(AI.decision(r).allowed).toBe(false);
});
test('offline or legacy cached routes cannot invent continuity',()=>{
    expect(AI.decision(route(),{offline:true}).allowed).toBe(false);
    expect(AI.decision({geometry:'legacy'}).allowed).toBe(false);
});
test('GPS accuracy only accompanies a fresh matching origin, never a geocoded remote point',()=>{
    const body={start:'53,-1',origin_accuracy_m:100};
    const fix={lat:53,lon:-1,timestamp:Date.now(),accuracy:8};
    expect(AI.augment(body,localStorage,fix).origin_accuracy_m).toBe(8);
    expect(AI.augment(body,localStorage,{...fix,lat:54}).origin_accuracy_m).toBeUndefined();
    expect(AI.augment(body,localStorage,{...fix,timestamp:Date.now()-16000}).origin_accuracy_m).toBeUndefined();
    expect(AI.augment(body,localStorage).origin_accuracy_m).toBeUndefined();
});

test('a fresh actual GPS fix cannot silently reuse a route requested at another location',()=>{
    const previous=global.VoyagrGpsOrchestration;
    global.VoyagrGpsOrchestration={getAcceptedOriginFix:()=>({lat:53.001,lon:-1,timestamp:Date.now(),accuracy:8})};
    try {
        const r=route();r.avoidance_assessment.origin_integrity.requested_origin=[53,-1];
        expect(AI.decision(r)).toMatchObject({allowed:false,acceptance:false});
    } finally {global.VoyagrGpsOrchestration=previous;}
});
test('persisted preference origins must be reassessed even if old origin timestamp looks fresh',()=>{
    const r=route();r.avoidance_assessment.checked_at=0;
    expect(AI.decision(r).allowed).toBe(false);
});

const AI=require('../modules/navigation/avoidance-integrity.js');
const Compare=require('../app/route-comparison-orchestration.js');
const Reroute=require('../app/reroute-map-orchestration.js');
const Life=require('../app/navigation-lifecycle-orchestration.js');
const {makeRoute,bindTransition}=require('./fixtures/navigation-transition.cjs');
let old,next,ctx,confirm;
beforeEach(()=>{
    localStorage.clear();localStorage.setItem('pref_avoidance_mode','mandatory');
    delete global.VoyagrGpsOrchestration;
    old=makeRoute('OLD',[[53,-1],[53.005,-1.01],[53.01,-1]]);next=makeRoute('NEW');
    Life.setRouteInProgress(true);Life.setCurrentRouteSteps(old.maneuvers);Life.setRoutePolyline(old.polyline);
    Life.setCurrentStepIndex(2);Life.setLastSnappedRouteIndex(8);Life.setLastTurnDetectRouteVertexIndex(9);
    Life.setNextManeuverDistance(400);Life.setNavigationArrivalTriggered(true);Life.setNavigationArrivalZoneSince(1234);
    Compare.setRouteOptions([old,next]);Compare.setSelectedRouteIndex(0);window.lastCalculatedRoute=old;
    window.lastRouteApiResponse={routes:[old,next]};ctx=bindTransition();
    confirm=jest.spyOn(global,'confirm').mockReturnValue(true);
});
afterEach(()=>jest.restoreAllMocks());
function invoke(entry){return entry==='reroute'?Reroute.updateRouteOnMap(next).ok:Compare[entry](1);}
function refused(entry){const before=ctx.snapshot();expect(invoke(entry)).toBe(false);
    expect(ctx.snapshot()).toBe(before);expect(ctx.addPolyline).not.toHaveBeenCalled();
    expect(confirm).not.toHaveBeenCalled();expect(ctx.status).toHaveBeenCalledWith(expect.any(String),'warning');}
describe.each(['selectRoute','useRoute'])('R1 original active %s',entry=>{
    test.each([true,false])('traffic=%s changes geometry, steps, progress and identity together',traffic=>{
        ctx=bindTransition({traffic});expect(invoke(entry)).toBe(true);
        expect(Life.getRoutePolyline()).toEqual(next.polyline);expect(Life.getCurrentRouteSteps()).toEqual(next.maneuvers);
        expect(Life.getCurrentStepIndex()).toBe(0);expect(Life.getLastSnappedRouteIndex()).toBe(0);
        expect(Life.getLastTurnDetectRouteVertexIndex()).toBe(0);expect(Compare.getSelectedRouteIndex()).toBe(1);
        expect(Life.getNextManeuverDistance()).toBe(0);expect(Life.getNavigationArrivalTriggered()).toBe(false);expect(Life.getNavigationArrivalZoneSince()).toBe(0);
        expect(window.lastCalculatedRoute.id).toBe(next.id);expect(window.lastCalculatedRoute.avoidance_assessment).toEqual(next.avoidance_assessment);
        expect([...ctx.layers]).toEqual(['staged-1']);expect(confirm).not.toHaveBeenCalled();
    });
    test('R2 original separately supplied polyline never replaces assessed geometry',()=>{
        next.polyline=old.polyline;refused(entry);
    });
});
test('R3 original direct display invocation cannot mutate an active route without a verifier',()=>{
    delete global.VoyagrAvoidanceIntegrity;const before=ctx.snapshot();
    expect(Compare.displaySingleRoute(1)).toBe(false);expect(ctx.snapshot()).toBe(before);
    expect(ctx.addPolyline).not.toHaveBeenCalled();expect(ctx.status).toHaveBeenCalledWith(expect.any(String),'warning');
});
test('lower exported single-route display helper also enforces inactive-preview-only use',()=>{
    const RS=require('../modules/navigation/route-selection.js');
    const plan=RS.buildDisplaySingleRouteEntryOrchestrationPlan({index:1,routeOptions:[old,next],runtime:{displayOpts:{routeTrafficEnabled:true}}});
    const before=ctx.snapshot();expect(Compare.applySingleRouteMapDisplayFromPlan(plan.apply.execute)).toBe(false);
    expect(ctx.snapshot()).toBe(before);expect(ctx.addPolyline).not.toHaveBeenCalled();
});
describe.each(['selectRoute','useRoute','reroute'])('complete candidate %s',entry=>{
    test.each(['no_steps','empty_steps','null_step','bad_instruction','bad_index','no_geometry','bad_geometry',
        'no_binding','bad_binding','wrong_binding','no_id','stale','mandatory_bad','offline','missing_verifier','throwing_verifier'])(
        '%s refuses before protected mutation',condition=>{
            if(condition==='no_steps')delete next.maneuvers;
            if(condition==='empty_steps')next.maneuvers=[];
            if(condition==='null_step')next.maneuvers=[null];
            if(condition==='bad_instruction')next.maneuvers=[{type:1,instruction:42}];
            if(condition==='bad_index')next.maneuvers[0].begin_shape_index=999;
            if(condition==='no_geometry')delete next.geometry;
            if(condition==='bad_geometry')next.geometry={type:'LineString',coordinates:null};
            if(condition==='no_binding')delete next.avoidance_assessment.geometry_binding;
            if(condition==='bad_binding')next.avoidance_assessment.geometry_binding={allowed:true};
            if(condition==='wrong_binding')next.avoidance_assessment.geometry_binding='00000000';
            if(condition==='no_id')delete next.id;
            if(condition==='stale')next.avoidance_assessment.checked_at=1;
            if(condition==='mandatory_bad')next.avoidance_assessment.requirements[0].status='VIOLATED';
            if(condition==='offline')jest.spyOn(navigator,'onLine','get').mockReturnValue(false);
            if(condition==='missing_verifier')delete global.VoyagrAvoidanceIntegrity;
            if(condition==='throwing_verifier')global.VoyagrAvoidanceIntegrity={...AI,gate:()=>{throw new Error('BROKEN');}};
            refused(entry);
        });
});
test('map not ready refuses with old line and all route state intact',()=>{
    ctx=bindTransition({map:{isStyleLoaded:()=>false}});refused('reroute');
});
test('failed staged mount rolls back without clearing the old route',()=>{
    const remove=jest.fn();ctx=bindTransition({addPolyline:jest.fn(()=>({_added:false,remove}))});
    const before=ctx.snapshot();expect(invoke('reroute')).toBe(false);expect(ctx.snapshot()).toBe(before);expect(remove).toHaveBeenCalledTimes(1);
});
test('setter failure restores the complete previous context and removes staged line',()=>{
    const before=ctx.snapshot();const setter=ctx.runtime.setCurrentRouteSteps;let fail=true;
    ctx.runtime.setCurrentRouteSteps=value=>{if(fail){fail=false;throw new Error('STATE_FAILURE');}setter(value);};
    expect(invoke('reroute')).toBe(false);expect(ctx.snapshot()).toBe(before);expect([...ctx.layers]).toEqual(['old']);
});
test('navigation candidate consumes a fresh decode rather than the supplied polyline object',()=>{
    const prepared=AI.prepareNavigationCandidate(next);
    expect(prepared.polyline).toEqual(next.polyline);expect(prepared.polyline).not.toBe(next.polyline);
    expect(prepared.maneuvers).not.toBe(next.maneuvers);expect(AI.gate(prepared)).toBe(true);
});
test('a missing decoded cache is rebuilt from authoritative assessed geometry',()=>{
    delete next.polyline;expect(invoke('reroute')).toBe(true);
    expect(Life.getRoutePolyline()).toEqual(require('polyline').decode(next.geometry,6));
});
test('precision-five geometry remains bound and is consumed using its declared precision',()=>{
    const codec=require('polyline');next.geometry=codec.encode([[53,-1],[53.010123,-1.000456]],5);next.geometry_precision=5;
    next.polyline=codec.decode(next.geometry,5);next.avoidance_assessment.geometry_binding=AI.geometryBinding(next);
    expect(invoke('reroute')).toBe(true);
    expect(Life.getRoutePolyline()).toEqual(require('../modules/navigation/polyline-codec.js').decodePolyline(next.geometry,5));
    expect(AI.geometryBinding({geometry:Life.getRoutePolyline()})).toBe(next.avoidance_assessment.geometry_binding);
});
test('preference-only stale assessment cannot authorize a new navigation candidate',()=>{
    next.avoidance_assessment.requirements[0].mode='preference';localStorage.setItem('pref_avoidance_mode','preference');
    next.avoidance_preferences_snapshot=AI.snapshot(localStorage);next.avoidance_assessment.checked_at=1;
    refused('reroute');
});
test('unbound persisted polyline options cannot replace the geometry of a fresh navigation start',()=>{
    const mapControls=jest.fn(),status=jest.fn();
    Life.bind({routeSelection:()=>require('../modules/navigation/route-selection.js'),getRouteOptions:Compare.getRouteOptions,
        getSelectedRouteIndex:Compare.getSelectedRouteIndex,mapControls,call:{showStatus:status}});
    const before=ctx.snapshot();
    expect(Life.startTurnByTurnNavigation(next,{persistedPolyline:old.polyline})).toBe(false);
    expect(ctx.snapshot()).toBe(before);expect(mapControls).not.toHaveBeenCalled();expect(status).toHaveBeenCalledWith(expect.any(String),'warning');
});
test('automatic replacement with no supplied destination cannot inherit unrelated endpoint labels',()=>{
    delete next.destination;delete next.destinationName;
    expect(invoke('reroute')).toBe(true);
    expect(window.lastCalculatedRoute.destination).toBe(next.polyline[next.polyline.length-1].join(','));
    expect(window.lastCalculatedRoute.destinationName).toBe(window.lastCalculatedRoute.destination);
});
test('starting a newly selected route during active navigation uses the same coherent transition',()=>{
    Compare.setSelectedRouteIndex(1);
    Life.bind({routeSelection:()=>require('../modules/navigation/route-selection.js'),getRouteOptions:Compare.getRouteOptions,
        getSelectedRouteIndex:Compare.getSelectedRouteIndex,call:{showStatus:ctx.status}});
    expect(Life.startTurnByTurnNavigation(window.lastCalculatedRoute)).toBe(true);
    expect(Life.getRoutePolyline()).toEqual(next.polyline);expect(Life.getCurrentRouteSteps()).toEqual(next.maneuvers);
    expect(window.lastCalculatedRoute.id).toBe(next.id);expect(Life.getCurrentStepIndex()).toBe(0);
});
test('automatic GPS response with incomplete instructions cannot mutate routes or announce success',async()=>{
    const GPS=require('../app/gps-orchestration.js'),RD=require('../modules/navigation/reroute-decision.js');
    delete next.maneuvers;next.avoidance_assessment.automatic_selection_allowed=true;
    const values={rerouteInProgress:false,lastRerouteAttemptTime:0,postRerouteGraceUntil:0,rerouteFailureRetryCount:0,voiceAnnouncementsEnabled:false};
    const notification=jest.fn(),mapAttempt=jest.fn(r=>Reroute.updateRouteOnMap(r));
    GPS.bind({g:k=>values[k],s:(k,v)=>{values[k]=v;},m:{rerouteDecision:()=>RD},
        call:{resolveNavigationDestination:()=> '53.01,-1',showStatus:ctx.status,buildRouteRequest:()=>({start:'53,-1',end:'53.01,-1'}),
            updateRouteOnMap:mapAttempt,sendNotification:notification,convertDistance:String,getDistanceUnit:()=> 'km'}});
    const previousFetch=global.fetch;global.fetch=jest.fn(async()=>({json:async()=>({success:true,routes:[next]})}));
    const before=ctx.snapshot();
    try {await GPS.triggerAutomaticRerouteWithHazardHandling(53,-1);
        expect(mapAttempt).toHaveBeenCalledTimes(1);expect(ctx.snapshot()).toBe(before);
        expect(notification).not.toHaveBeenCalled();expect(values._preferPrimaryRouteOnNextNavUpdate).toBeUndefined();
        expect(ctx.addPolyline).not.toHaveBeenCalled();
    } finally {global.fetch=previousFetch;}
});

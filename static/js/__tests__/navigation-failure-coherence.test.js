/* R4–R8: production verifier/planners/lifecycle/renderer, synthetic MapLibre API. */
let AI,Life,Compare,Reroute,fixture,old,next,ctx;
beforeEach(()=>{
    jest.resetModules();localStorage.clear();
    AI=require('../modules/navigation/avoidance-integrity.js');
    Life=require('../app/navigation-lifecycle-orchestration.js');
    Compare=require('../app/route-comparison-orchestration.js');
    Reroute=require('../app/reroute-map-orchestration.js');
    fixture=require('./fixtures/navigation-transition.cjs');
    old=fixture.makeRoute('OLD',[[53,-1],[53.005,-1.01],[53.01,-1]]);next=fixture.makeRoute('NEW');
    window.lastCalculatedRoute=old;
    Life.setRoutePolyline(AI.prepareNavigationCandidate(old).polyline);old.polyline=Life.getRoutePolyline();
    Life.setCurrentRouteSteps(old.maneuvers);Life.setCurrentStepIndex(1);Life.setLastSnappedRouteIndex(1);
    ctx=fixture.bindTransition();Compare.setRouteOptions([old,next]);Compare.setSelectedRouteIndex(0);
    Life.setRouteInProgress(true);Life.setRouteStarted(true);
    expect(Reroute.authoriseCurrentRouteRedraw()).toBe(true);
});
afterEach(()=>jest.useRealTimers());
function retained(before){expect(ctx.snapshot()).toBe(before);expect(Life.getNavigationFailure()).toBeNull();}
function stopped(){
    expect(Life.getRouteInProgress()).toBe(false);expect(Life.getRouteStarted()).toBe(false);
    expect(Life.getCurrentRouteSteps()).toEqual([]);expect(Life.getNavigationFailure()).toBe('inconsistent_map');
    expect(ctx.status).toHaveBeenCalledWith(expect.stringContaining('stopped'),'error');
    expect(Reroute.updateRouteOnMap(next).ok).toBe(false);
}
function initial(overrides={}){
    Life.setRouteInProgress(false);Life.setRouteStarted(false);Compare.setSelectedRouteIndex(1);
    return fixture.bindStart(ctx,overrides);
}
// The twelve independently reproduced failures, preserving their input conditions.
test('R8 original stage failure and cleanup throw stop guidance explicitly',()=>{
    ctx.runtime.getMapLibreHelpers=()=>({...ctx.mapHelpers,addPolyline:()=>{
        ctx.map.addSource('leak',{type:'geojson',data:{}});return {id:'leak',_added:false,remove:()=>{throw Error('cleanup');}};
    }});
    expect(Reroute.updateRouteOnMap(next)).toMatchObject({ok:false,reason:'inconsistent_map'});stopped();
});
test('R8 original old-layer remove throw refuses and retains a verified old line',()=>{
    ctx.oldLayer.remove=()=>{throw Error('remove');};const before=ctx.snapshot();
    expect(Reroute.updateRouteOnMap(next)).toMatchObject({ok:false,reason:'route_cleanup_failed'});retained(before);
});
test.each(['displayAllRoutesOnMap','showAllRoutes'])('R4 original %s cannot remove the guidance line',entry=>{
    delete global.VoyagrAvoidanceIntegrity;const before=ctx.snapshot();ctx.mapMutation.mockClear();
    expect(Compare[entry]()).toBe(false);retained(before);expect(ctx.mapMutation).not.toHaveBeenCalled();
    expect(ctx.mapHelpers.isPolylineLayerMounted(ctx.map,ctx.oldLayer,Life.getRoutePolyline())).toBe(true);
});
test('R4 original direct clear handles cannot remove the guidance line',()=>{
    delete global.VoyagrAvoidanceIntegrity;const before=ctx.snapshot();
    expect(Compare.clearRouteLayerHandlesFromPlan({clearRouteLayerHandle:true})).toBe(false);retained(before);
});
test('R4 original direct context sync cannot donate identity or assessment',()=>{
    delete global.VoyagrAvoidanceIntegrity;const before=ctx.snapshot();
    expect(Compare.syncLastCalculatedRouteFromSelection(1)).toBe(false);retained(before);
});
test('R5 original undefined lifecycle does not permit single-route mutation',()=>{
    const before=ctx.snapshot();global.VoyagrNavigationLifecycleOrchestration={getRouteInProgress:()=>undefined};
    expect(Compare.displaySingleRoute(1)).toBe(false);retained(before);
});
test('R7 original failed recovery mount preserves the existing verified line',()=>{
    ctx.runtime.getMapLibreHelpers=()=>({...ctx.mapHelpers,addPolyline:()=>{throw Error('mount');}});
    const before=ctx.snapshot();expect(Reroute.redrawNavigationRouteLayer('test')).toBe(false);retained(before);
    expect(ctx.mapHelpers.isPolylineLayerMounted(ctx.map,ctx.oldLayer,Life.getRoutePolyline())).toBe(true);
});
test('R6 original failed persistence leaves no active or successful start',()=>{
    const runtime=initial({call:{persistActiveRoute:()=>{throw Error('persist');}}});const before=ctx.snapshot();
    expect(Life.startTurnByTurnNavigation(next)).toBe(false);retained(before);
    expect(runtime.call.sendNotification).not.toHaveBeenCalled();expect(Life.getRouteInProgress()).toBe(false);
});
test('R6 original failed startup mounting retains the previous preview without activation',()=>{
    const runtime=initial({getMapLibreHelpers:()=>({...ctx.mapHelpers,addPolyline:()=>{throw Error('mount');}})});
    const before=ctx.snapshot();expect(Life.startTurnByTurnNavigation(next)).toBe(false);retained(before);
    expect(runtime.call.sendNotification).not.toHaveBeenCalled();
});
test('R8 original real renderer removal failure cannot report success',()=>{
    const remove=ctx.map.removeLayer;ctx.map.removeLayer=id=>{if(id===ctx.oldLayer.id)throw Error('remove');remove(id);};
    const before=ctx.snapshot();expect(Reroute.updateRouteOnMap(next).ok).toBe(false);retained(before);
});
test('R8 original real renderer staging plus source cleanup failure stops guidance',()=>{
    ctx.map.addLayer=()=>{throw Error('add');};ctx.map.removeSource=()=>{throw Error('source');};
    expect(Reroute.updateRouteOnMap(next)).toMatchObject({ok:false,reason:'inconsistent_map'});stopped();
});

test.each([undefined,null,0,'', 'false',{},Promise.resolve(false)])('R5 malformed lifecycle value %p refuses all preview entries',value=>{
    const before=ctx.snapshot();global.VoyagrNavigationLifecycleOrchestration={getRouteInProgress:()=>value};
    for(const entry of ['displaySingleRoute','showAllRoutes','displayAllRoutesOnMap'])expect(Compare[entry](1)).toBe(false);
    retained(before);
});
test.each(['missing','throwing','unbound'])('R5 %s lifecycle/runtime refuses without mutation',condition=>{
    const before=ctx.snapshot();
    if(condition==='missing')delete global.VoyagrNavigationLifecycleOrchestration;
    if(condition==='throwing')global.VoyagrNavigationLifecycleOrchestration={getRouteInProgress:()=>{throw Error('state');}};
    if(condition==='unbound')Compare.bind(null);
    expect(Compare.displaySingleRoute(1)).toBe(false);retained(before);
});
test('R4 direct selection setters require the verified transaction capability',()=>{
    const before=ctx.snapshot();expect(Compare.setRouteOptions([next])).toBe(false);
    expect(Compare.setSelectedRouteIndex(1)).toBe(false);retained(before);
});
test.each([true,false])('valid replacement traffic=%s commits one complete assessed candidate',traffic=>{
    ctx.compareRuntime.call.getTrafficSettingsSnapshot=()=>({routeTrafficEnabled:traffic});
    expect(Compare.selectRoute(1)).toBe(true);expect(window.lastCalculatedRoute.id).toBe('NEW');
    expect(Life.getCurrentRouteSteps()).toEqual(next.maneuvers);expect(Life.getRoutePolyline()).toEqual(AI.prepareNavigationCandidate(next).polyline);
    expect(ctx.mapHelpers.isPolylineLayerRemoved(ctx.map,ctx.oldLayer)).toBe(true);
    expect(ctx.mapHelpers.isPolylineLayerMounted(ctx.map,ctx.runtime.getRouteLayer(),Life.getRoutePolyline())).toBe(true);
});
test('valid initial startup completes real lifecycle and owns a mounted line',()=>{
    const runtime=initial();expect(Life.startTurnByTurnNavigation(next)).toBe(true);
    expect(Life.getRouteStarted()).toBe(true);expect(Life.getRouteInProgress()).toBe(true);
    expect(runtime.call.persistActiveRoute).toHaveBeenCalledWith(expect.objectContaining({id:'NEW'}));
    expect(runtime.call.sendNotification).toHaveBeenCalledTimes(1);
    expect(ctx.mapHelpers.isPolylineLayerMounted(ctx.map,ctx.runtime.getRouteLayer(),Life.getRoutePolyline())).toBe(true);
});
test.each([true,false])('pending persistence success=%s does not activate guidance early',async success=>{
    let resolve;const persisted=new Promise(r=>{resolve=r;});const runtime=initial({call:{persistActiveRoute:()=>persisted}});
    const pending=Life.startTurnByTurnNavigation(next);expect(Life.getRouteInProgress()).toBe(false);
    expect(Life.getNavigationStarting()).toBe(true);expect(runtime.call.sendNotification).not.toHaveBeenCalled();
    expect(Compare.displaySingleRoute(0)).toBe(false);resolve(success);
    expect(await pending).toBe(success);expect(Life.getRouteInProgress()).toBe(success);
});
test('pending persistence times out with an explicit refusal and no guidance',async()=>{
    jest.useFakeTimers();initial({call:{persistActiveRoute:()=>new Promise(()=>{})}});
    const pending=Life.startTurnByTurnNavigation(next);jest.advanceTimersByTime(5000);
    expect(await pending).toBe(false);expect(Life.getRouteInProgress()).toBe(false);expect(Life.getNavigationStarting()).toBe(false);
});
test('settings changed while persistence is pending refuse before guidance bootstrap',async()=>{
    let resolve;initial({call:{persistActiveRoute:()=>new Promise(r=>{resolve=r;})}});
    const pending=Life.startTurnByTurnNavigation(next);localStorage.setItem('pref_avoidance_mode','mandatory');resolve(true);
    expect(await pending).toBe(false);expect(Life.getRouteInProgress()).toBe(false);
});
test('required service initialization exception stops guidance and emits no start success',()=>{
    const runtime=initial({call:{startLiveDataRefresh:()=>{throw Error('service');}}});
    expect(Life.startTurnByTurnNavigation(next)).toBe(false);expect(Life.getRouteInProgress()).toBe(false);
    expect(Life.getRouteStarted()).toBe(false);expect(runtime.call.sendNotification).not.toHaveBeenCalled();
});
test('valid recovery uses the authorised geometry even offline and after evidence ages',()=>{
    jest.spyOn(navigator,'onLine','get').mockReturnValue(false);
    jest.spyOn(Date,'now').mockReturnValue(Date.now()+700000);
    expect(Reroute.redrawNavigationRouteLayer('offline recovery')).toBe(true);
    expect(Life.getRouteInProgress()).toBe(true);expect(ctx.mapHelpers.isPolylineLayerRemoved(ctx.map,ctx.oldLayer)).toBe(true);
    jest.restoreAllMocks();
});
test('contradictory current recovery geometry stops guidance rather than drawing an unassessed cache',()=>{
    Life.setRoutePolyline(next.polyline);expect(Reroute.redrawNavigationRouteLayer('corrupt').ok).toBe(false);stopped();
});

test('persistence rejection returns an explicit failure without bootstrap',async()=>{
    const runtime=initial({call:{persistActiveRoute:()=>Promise.reject(Error('disk'))}});
    expect(await Life.startTurnByTurnNavigation(next)).toBe(false);
    expect(Life.getRouteInProgress()).toBe(false);expect(runtime.call.sendNotification).not.toHaveBeenCalled();
});
test('late cancelled start completion cannot overwrite a newer successful session',async()=>{
    let resolve;initial({call:{persistActiveRoute:()=>new Promise(r=>{resolve=r;})}});
    const cancelled=Life.startTurnByTurnNavigation(next);
    Life.stopTurnByTurnNavigation();expect(Life.getRouteInProgress()).toBe(false);
    // Explicit map recovery before a new independently assessed calculation.
    expect(Life.recoverNavigationMap()).toBe(true);
    const newer=fixture.makeRoute('NEWER');Compare.setRouteOptions([newer]);window.lastCalculatedRoute=newer;
    fixture.bindStart(ctx);expect(Life.startTurnByTurnNavigation(newer)).toBe(true);
    resolve(true);expect(await cancelled).toBe(false);
    expect(Life.getRouteInProgress()).toBe(true);expect(window.lastCalculatedRoute.id).toBe('NEWER');
    expect(Life.getCurrentRouteSteps()).toEqual(newer.maneuvers);
});
test('terminal map failure blocks guidance until verified resource recovery and a fresh route',()=>{
    const add=ctx.map.addLayer,remove=ctx.map.removeSource;
    ctx.map.addLayer=()=>{throw Error('add');};ctx.map.removeSource=()=>{throw Error('remove');};
    expect(Reroute.updateRouteOnMap(next).ok).toBe(false);stopped();fixture.bindStart(ctx);
    expect(Life.recoverNavigationMap()).toBe(false);
    ctx.map.addLayer=add;ctx.map.removeSource=remove;
    expect(Life.recoverNavigationMap()).toBe(true);
    expect(Life.startTurnByTurnNavigation(window.lastCalculatedRoute)).toBe(false);
    const fresh=fixture.makeRoute('FRESH');Compare.setRouteOptions([fresh]);window.lastCalculatedRoute=fresh;
    expect(Life.startTurnByTurnNavigation(fresh)).toBe(true);expect(Life.getRouteInProgress()).toBe(true);
});
test('loss of both recovery lines stops rather than claiming a retained route',()=>{
    ctx.oldLayer.remove();ctx.runtime.getMapLibreHelpers=()=>({...ctx.mapHelpers,addPolyline:()=>{throw Error('mount');}});
    expect(Reroute.redrawNavigationRouteLayer('lost')).toMatchObject({ok:false,reason:'inconsistent_map'});stopped();
});
test('partial old outline removal plus main line failure stops guidance',()=>{
    // Give the currently owned route an outline, as the production active style does.
    ctx.oldLayer.remove();const layer=ctx.mapHelpers.addPolyline(ctx.map,Life.getRoutePolyline(),{outlineColor:'#fff'});
    ctx.runtime.setRouteLayer(layer);const remove=ctx.map.removeLayer;
    ctx.map.removeLayer=id=>{if(id===layer.id)throw Error('main');remove(id);};
    expect(Reroute.updateRouteOnMap(next)).toMatchObject({ok:false,reason:'inconsistent_map'});stopped();
});
test.each(['startNavigation','startNavigationFromPreview'])('real UI %s waits for completed persistence before success effects',async entry=>{
    const Preview=require('../app/route-preview-orchestration.js');let resolve;
    const runtime=initial({call:{persistActiveRoute:()=>new Promise(r=>{resolve=r;})}});
    const collapse=jest.fn();Preview.bind({routeSelection:()=>require('../modules/navigation/route-selection.js'),
        getSelectedRouteIndex:Compare.getSelectedRouteIndex,call:{showStatus:ctx.status,
            startTurnByTurnNavigation:(...args)=>Life.startTurnByTurnNavigation(...args),collapseBottomSheet:collapse}});
    window.lastCalculatedRoute=next;const pending=Preview[entry]();expect(collapse).not.toHaveBeenCalled();
    expect(runtime.call.sendNotification).not.toHaveBeenCalled();resolve(true);expect(await pending).toBe(true);
    expect(collapse).toHaveBeenCalled();expect(Life.getRouteStarted()).toBe(true);
});

test.each([undefined,null,0,'false',{},Promise.resolve(true)])('unknown lifecycle %p cannot select/use an active route',value=>{
    const before=ctx.snapshot();global.VoyagrNavigationLifecycleOrchestration={getRouteInProgress:()=>value};
    expect(Compare.selectRoute(1)).toBe(false);expect(Compare.useRoute(1)).toBe(false);retained(before);
});
test('cancelled pending production map mount cannot appear after refusal',()=>{
    jest.useFakeTimers();const callbacks=[];let ready=false;
    ctx.map.isStyleLoaded=()=>ready;ctx.map.once=(_name,fn)=>callbacks.push(fn);
    const pending=ctx.mapHelpers.addPolyline(ctx.map,next.polyline,{});
    expect(pending._pending).toBe(true);expect(pending.remove()).toBe(true);ready=true;
    callbacks.forEach(fn=>fn());jest.advanceTimersByTime(500);
    expect(ctx.mapHelpers.isPolylineLayerRemoved(ctx.map,pending)).toBe(true);
});

test('comparison cleanup checks its distinct source id rather than accepting a silent no-op',()=>{
    Life.setRouteInProgress(false);Compare.displayAllRoutesOnMap();
    expect(Compare.getAllRouteLayers().length).toBe(2);
    ctx.map.removeSource=()=>{};
    expect(Compare.clearComparisonRouteLayers()).toBe(false);
    expect(Compare.getAllRouteLayers().length).toBe(2);
});

test.each([true,false])('production IndexedDB persistence success=%s controls startup completion',async success=>{
    const Offline=require('../modules/navigation/offline-navigation.js');
    const Adapter=require('../app/offline-navigation-orchestration.js');
    const previous=global.indexedDB;
    global.indexedDB=success ? new (require('fake-indexeddb').IDBFactory)() : {open:()=>{throw Error('IDB unavailable');}};
    Adapter.bind({offlineNavigation:()=>Offline});
    const runtime=initial({call:{persistActiveRoute:route=>Adapter.persistActiveRoute(route)}});
    try {
        expect(await Life.startTurnByTurnNavigation(next)).toBe(success);
        expect(Life.getRouteInProgress()).toBe(success);
        if(success) {
            const record=await Offline.loadActiveRouteRecord(global.indexedDB);
            expect(record.routeData.id).toBe('NEW');
            expect(record.polyline).toEqual(AI.prepareNavigationCandidate(next).polyline);
        } else expect(runtime.call.sendNotification).not.toHaveBeenCalled();
    } finally {global.indexedDB=previous;}
});
test('unbound comparison runtime refuses selection and raw selection writes',()=>{
    Compare.bind(null);const before=ctx.snapshot();
    expect(Compare.selectRoute(1)).toBe(false);expect(Compare.useRoute(1)).toBe(false);
    expect(Compare.setRouteOptions([next])).toBe(false);expect(Compare.setSelectedRouteIndex(1)).toBe(false);retained(before);
});

test('silent setter failure cannot report a successful route commitment',()=>{
    ctx.runtime.setCurrentRouteSteps=()=>{};const before=ctx.snapshot();
    expect(Reroute.updateRouteOnMap(next).ok).toBe(false);retained(before);
});
test('silent startup layer-handle commitment failure stops guidance',()=>{
    const runtime=initial({setRouteLayer:()=>{}});
    expect(Life.startTurnByTurnNavigation(next)).toBe(false);expect(Life.getRouteInProgress()).toBe(false);
    expect(runtime.call.sendNotification).not.toHaveBeenCalled();
});
test('silent recovery layer-handle commitment failure cannot leave active guidance',()=>{
    ctx.runtime.setRouteLayer=()=>{};
    expect(Reroute.redrawNavigationRouteLayer('setter')).toMatchObject({ok:false,reason:'inconsistent_map'});stopped();
});

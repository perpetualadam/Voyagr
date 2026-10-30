/* M3/M4: actual preview, renderer, lifecycle, verifier and planners. Map API only is doubled. */
let fixture,Life,Compare,ctx,old,next;
beforeEach(()=>{
    jest.resetModules();jest.useFakeTimers();localStorage.clear();
    Life=require('../app/navigation-lifecycle-orchestration.js');Compare=require('../app/route-comparison-orchestration.js');
    fixture=require('./fixtures/navigation-transition.cjs');old=fixture.makeRoute('OLD');next=fixture.makeRoute('NEXT',[[53,-1],[53.005,-1.01],[53.01,-1]]);
    Life.setRoutePolyline(old.polyline);Life.setCurrentRouteSteps(old.maneuvers);window.lastCalculatedRoute=old;
    ctx=fixture.bindTransition();Compare.setRouteOptions([old,next]);Compare.setSelectedRouteIndex(0);
});
afterEach(()=>{jest.restoreAllMocks();jest.useRealTimers();});
function inventory(){const style=ctx.map.getStyle();return JSON.stringify({layers:style.layers,sources:style.sources,
    options:Compare.getRouteOptions(),last:window.lastCalculatedRoute,steps:Life.getCurrentRouteSteps(),polyline:Life.getRoutePolyline(),
    progress:[Life.getCurrentStepIndex(),Life.getLastSnappedRouteIndex()],active:Life.getRouteInProgress(),failure:Life.getNavigationFailure()});}
function completePreview(){
    const handles=Compare.getAllRouteLayers();expect(handles).toHaveLength(Compare.getRouteOptions().length);
    for(const handle of handles){expect(handle._added).toBe(true);expect(ctx.map.getLayer(handle.id)).toBeDefined();expect(ctx.map.getSource(handle.sourceId)).toBeDefined();}
    expect(Life.getRouteInProgress()).toBe(false);
}
function start(route=next){Compare.setRouteOptions([route]);Compare.setSelectedRouteIndex(0);window.lastCalculatedRoute=route;fixture.bindStart(ctx);
    expect(Life.startTurnByTurnNavigation(route)).toBe(true);expect(Life.getRouteInProgress()).toBe(true);
    expect(window.lastCalculatedRoute.id).toBe(route.id);expect(Life.getCurrentRouteSteps()).toEqual(route.maneuvers);
    expect(ctx.mapHelpers.isPolylineLayerMounted(ctx.map,ctx.runtime.getRouteLayer(),Life.getRoutePolyline())).toBe(true);}

test('M3 original obsolete cleanup cannot erase a newer successful preview with reused ids',()=>{
    const add=ctx.map.addSource;let reentered=false,inner,obsolete;
    ctx.map.addSource=(id,data)=>{add(id,data);if(id==='route-source-0'&&!reentered){reentered=true;obsolete=Compare.getAllRouteLayers()[0];inner=Compare.displayAllRoutesOnMap();expect(inner).toBe(true);completePreview();}};
    expect(Compare.displayAllRoutesOnMap()).toBe(false);expect(inner).toBe(true);completePreview();
    expect(Compare.getAllRouteLayers()).not.toContain(obsolete);expect(obsolete._added).toBe(false);
    const before=inventory();expect(obsolete.remove()).toBe(true);expect(inventory()).toBe(before);
});
test('M4 original deferred batch cannot acquire a new token after its first write',()=>{
    const add=ctx.map.addSource,callbacks=[];let ready=false,reentered=false,inner;const current=fixture.makeRoute('CURRENT');
    ctx.map.isStyleLoaded=()=>ready;ctx.map.once=(_event,fn)=>callbacks.push(fn);
    ctx.map.addSource=(id,data)=>{add(id,data);if(id==='route-source-0'&&!reentered){reentered=true;Compare.setRouteOptions([current]);inner=Compare.displayAllRoutesOnMap();}};
    Compare.displayAllRoutesOnMap();expect(callbacks).toHaveLength(1);ready=true;
    expect(callbacks[0]()).toBe(false);expect(inner).toBe(true);completePreview();
    expect(ctx.map.getLayer('route-layer-1')).toBeUndefined();expect(ctx.map.getSource('route-source-1')).toBeUndefined();
    expect(Compare.getRouteOptions().map(r=>r.id)).toEqual(['CURRENT']);
});
test.each(['removeLayer','removeSource'])('synchronous reentry during %s refuses recursion and keeps ownership consistent',method=>{
    expect(Compare.displayAllRoutesOnMap()).toBe(true);const remove=ctx.map[method];let once=true,inner;
    ctx.map[method]=id=>{remove(id);if(once){once=false;inner=Compare.displayAllRoutesOnMap();}};
    expect(Compare.clearComparisonRouteLayers()).toBe(false);expect(inner).toBe(false);
    // A fresh generation may recover, but no recursive attempt claims success.
    expect(Compare.displayAllRoutesOnMap()).toBe(true);completePreview();start();
});
test('invalidation after the first layer write aborts every remaining old step',()=>{
    const add=ctx.map.addLayer;let once=true;const current=fixture.makeRoute('CURRENT');
    ctx.map.addLayer=(layer,...args)=>{add(layer,...args);if(layer.id==='route-layer-0'&&once){once=false;Compare.setRouteOptions([current]);expect(Compare.displayAllRoutesOnMap()).toBe(true);}};
    expect(Compare.displayAllRoutesOnMap()).toBe(false);completePreview();
    expect(ctx.map.getSource('route-source-1')).toBeUndefined();expect(ctx.map.getLayer('route-layer-1')).toBeUndefined();
    expect(Compare.getRouteOptions()[0].id).toBe('CURRENT');
});
test('invalidation between batch steps does not start a later obsolete step',()=>{
    const add=ctx.map.addLayer;let once=true;
    ctx.map.addLayer=(layer,...args)=>{add(layer,...args);if(layer.id==='route-layer-0'&&once){once=false;Compare.clearComparisonRouteLayers();}};
    expect(Compare.displayAllRoutesOnMap()).toBe(false);
    expect(ctx.map.getLayer('route-layer-1')).toBeUndefined();expect(ctx.map.getSource('route-source-1')).toBeUndefined();
    expect(Compare.displayAllRoutesOnMap()).toBe(true);completePreview();
});
test('three overlapping generations preserve only the newest resources and records',()=>{
    const add=ctx.map.addSource;let depth=0;const handles=[],results=[];
    ctx.map.addSource=(id,data)=>{add(id,data);if(id==='route-source-0'&&depth<2){handles.push(Compare.getAllRouteLayers()[0]);depth++;Compare.setRouteOptions([fixture.makeRoute('GEN-'+depth)]);results.push(Compare.displayAllRoutesOnMap());}};
    expect(Compare.displayAllRoutesOnMap()).toBe(false);expect(results).toEqual([true,false]);completePreview();
    expect(Compare.getRouteOptions()[0].id).toBe('GEN-2');const before=inventory();
    for(const handle of handles){expect(handle.remove()).toBe(true);expect(handle._added).toBe(false);expect(Compare.getAllRouteLayers()).not.toContain(handle);}
    expect(inventory()).toBe(before);expect(ctx.map.getLayer('route-layer-1')).toBeUndefined();
});
test('old scheduled callback after reconciliation cannot mutate a newer preview',()=>{
    const callbacks=[];let ready=false;ctx.map.isStyleLoaded=()=>ready;ctx.map.once=(_event,fn)=>callbacks.push(fn);
    Compare.displayAllRoutesOnMap();expect(callbacks).toHaveLength(1);Compare.clearComparisonRouteLayers();ready=true;
    expect(Compare.displayAllRoutesOnMap()).toBe(true);const before=inventory();callbacks[0]();jest.advanceTimersByTime(500);
    expect(inventory()).toBe(before);completePreview();
});
test.each(['removeLayer','removeSource'])('failed %s retains the obsolete owner until verified recovery',method=>{
    expect(Compare.displayAllRoutesOnMap()).toBe(true);const handles=Compare.getAllRouteLayers().slice(),remove=ctx.map[method];
    ctx.map[method]=()=>{throw Error('removal');};
    expect(Compare.clearComparisonRouteLayers()).toBe(false);expect(Compare.getAllRouteLayers().length).toBeGreaterThan(0);
    expect(Compare.displayAllRoutesOnMap()).toBe(false);
    fixture.bindStart(ctx);Compare.setSelectedRouteIndex(1);expect(Life.startTurnByTurnNavigation(next)).toBe(false);expect(Life.getRouteInProgress()).toBe(false);
    ctx.map[method]=remove;expect(Life.recoverNavigationMap()).toBe(true);start();
    for(const handle of handles)expect(handle.remove()).toBe(true);
    expect(ctx.mapHelpers.isPolylineLayerMounted(ctx.map,ctx.runtime.getRouteLayer(),Life.getRoutePolyline())).toBe(true);
});
test.each([true,false])('valid current-generation preview and navigation traffic=%s',traffic=>{
    ctx.compareRuntime.call.getTrafficSettingsSnapshot=()=>({routeTrafficEnabled:traffic});
    expect(Compare.displayAllRoutesOnMap()).toBe(true);completePreview();start();
    expect(Compare.getAllRouteLayers()).toEqual([]);
});
test('an explicitly released handle updates the live ownership list and added flag',()=>{
    expect(Compare.displayAllRoutesOnMap()).toBe(true);const handle=Compare.getAllRouteLayers()[0];
    expect(handle.remove()).toBe(true);expect(handle._added).toBe(false);expect(Compare.getAllRouteLayers()).not.toContain(handle);
    expect(ctx.map.getLayer(handle.id)).toBeUndefined();expect(ctx.map.getSource(handle.sourceId)).toBeUndefined();
});

test('single-route renderer reentry cannot append obsolete geometry or write stale traffic state',()=>{
    const add=ctx.map.addSource;let once=true,inner;const current=fixture.makeRoute('CURRENT');const polyline=Life.getRoutePolyline();
    ctx.map.addSource=(id,data)=>{add(id,data);if(id.startsWith('polyline-')&&once){once=false;Compare.setRouteOptions([current]);inner=Compare.displayAllRoutesOnMap();}};
    expect(Compare.displaySingleRoute(0)).toBe(false);expect(inner).toBe(true);completePreview();
    expect(ctx.map.getStyle().layers.map(x=>x.id)).toEqual(['route-layer-0']);expect(Life.getRoutePolyline()).toBe(polyline);start(current);
});
test('single-route post-mount reentry stops later obsolete effects',()=>{
    ctx.compareRuntime.call.clearHazardMarkers=jest.fn();
    let once=true,inner;const current=fixture.makeRoute('CURRENT');const polyline=Life.getRoutePolyline();
    ctx.mapHelpers.fitMapBounds=()=>{if(once){once=false;Compare.setRouteOptions([current]);inner=Compare.displayAllRoutesOnMap();}};
    expect(Compare.displaySingleRoute(0)).toBe(false);expect(inner).toBe(true);completePreview();
    expect(ctx.compareRuntime.call.clearHazardMarkers).not.toHaveBeenCalled();expect(Life.getRoutePolyline()).toBe(polyline);
});
test('post-batch reentry cannot run obsolete hazard effects after a newer preview completes',()=>{
    let once=true,inner;const current=fixture.makeRoute('CURRENT');const hazards=ctx.compareRuntime.call.displayAllRouteHazards;
    ctx.mapHelpers.fitMapBounds=()=>{if(once){once=false;Compare.setRouteOptions([current]);inner=Compare.displayAllRoutesOnMap();}};
    expect(Compare.displayAllRoutesOnMap()).toBe(false);expect(inner).toBe(true);completePreview();
    expect(hazards).toHaveBeenCalledTimes(1);
});
test('already queued ordering callbacks retain their obsolete token',()=>{
    expect(Compare.displayAllRoutesOnMap()).toBe(true);ctx.map.moveLayer=jest.fn();
    const timers=jest.spyOn(global,'setTimeout');
    Compare.applyDisplayAllRoutesStyleLoadScheduleFromPlan({strategy:'immediate'},token=>{Compare.bringRoutesToTop(token);return true;});
    const oldCallbacks=timers.mock.calls.map(call=>call[0]);expect(oldCallbacks.length).toBeGreaterThan(0);
    Compare.clearComparisonRouteLayers();expect(Compare.displayAllRoutesOnMap()).toBe(true);const before=inventory();
    oldCallbacks.forEach(fn=>fn());expect(ctx.map.moveLayer).not.toHaveBeenCalled();expect(inventory()).toBe(before);
});

test('expired or fabricated batch tokens cannot be replaced with the latest generation',()=>{
    let token;expect(Compare.applyDisplayAllRoutesStyleLoadScheduleFromPlan({strategy:'immediate'},value=>{token=value;return true;})).toBe(true);
    expect(Object.isFrozen(token)).toBe(true);Compare.clearComparisonRouteLayers();
    expect(Compare.displayAllRoutesOnMap()).toBe(true);const before=inventory();
    expect(Compare.doAddRouteLayers(token)).toBe(false);
    const draw=jest.fn();expect(Compare.applyDisplayAllRoutesStyleLoadScheduleFromPlan({strategy:'immediate'},draw,{map:ctx.map,generation:token.generation+1})).toBe(false);
    expect(draw).not.toHaveBeenCalled();expect(inventory()).toBe(before);
});

/* Real renderer, preview and lifecycle functions with a synthetic MapLibre API. */
let fixture,Life,Compare,Reroute,AI,ctx,old,next;
beforeEach(()=>{
    jest.resetModules();jest.useFakeTimers();localStorage.clear();
    Life=require('../app/navigation-lifecycle-orchestration.js');Compare=require('../app/route-comparison-orchestration.js');
    Reroute=require('../app/reroute-map-orchestration.js');AI=require('../modules/navigation/avoidance-integrity.js');
    fixture=require('./fixtures/navigation-transition.cjs');old=fixture.makeRoute('OLD');next=fixture.makeRoute('NEW',[[53,-1],[53.005,-1.01],[53.01,-1]]);
    Life.setRoutePolyline(AI.prepareNavigationCandidate(old).polyline);Life.setCurrentRouteSteps(old.maneuvers);
    window.lastCalculatedRoute=old;ctx=fixture.bindTransition();Compare.setRouteOptions([old,next]);Compare.setSelectedRouteIndex(0);
});
afterEach(()=>{jest.useRealTimers();jest.restoreAllMocks();});
function callbacks(){let ready=false;const queued=[];ctx.map.isStyleLoaded=()=>ready;
    ctx.map.once=(_event,fn)=>queued.push(fn);ctx.map.off=jest.fn(()=>{throw Error('already queued');});
    return {queued,ready:()=>{ready=true},run:()=>{queued.forEach(fn=>fn());jest.advanceTimersByTime(500)}};}
function inventory(){const style=ctx.map.getStyle();return {layers:style.layers.map(x=>x.id).sort(),sources:Object.keys(style.sources).sort()};}
function start(){Compare.setRouteOptions([next]);Compare.setSelectedRouteIndex(0);window.lastCalculatedRoute=next;
    fixture.bindStart(ctx);expect(Life.startTurnByTurnNavigation(next)).toBe(true);
    expect(Life.getRouteInProgress()).toBe(true);expect(ctx.mapHelpers.isPolylineLayerMounted(ctx.map,ctx.runtime.getRouteLayer(),Life.getRoutePolyline())).toBe(true);}
function mounted(handle,route){return ctx.mapHelpers.isPolylineLayerMounted(ctx.map,handle,route.polyline);}
function noResource(handle){expect(ctx.mapHelpers.isPolylineLayerRemoved(ctx.map,handle)).toBe(true);}
function display(){ctx.compareRuntime.call.displayAllRouteHazards=jest.fn();Compare.displayAllRoutesOnMap();}

test('M1 original reconciliation cancels old pending geometry before a new navigation start',()=>{
    const q=callbacks(),pending=ctx.mapHelpers.addPolyline(ctx.map,old.polyline,{});q.ready();
    expect(ctx.mapHelpers.reconcilePolylineLayers(ctx.map)).toBe(true);const generation=pending._generation;
    start();const before=inventory();q.run();expect(inventory()).toEqual(before);noResource(pending);expect(pending._removed).toBe(true);
    expect(ctx.runtime.getRouteLayer().id).not.toBe(pending.id);expect(generation).toBeGreaterThanOrEqual(0);
});
test('M1 original real traffic deferred mount cannot reappear after recovery and restart',()=>{
    const Traffic=require('../app/traffic-orchestration.js'),Flow=require('../modules/navigation/route-traffic-flow.js');
    const queued=[];let checks=0;ctx.map.once=(_event,fn)=>queued.push(fn);ctx.map.off=()=>{};
    ctx.map.isStyleLoaded=()=>++checks===1;
    Traffic.bind({getMap:()=>ctx.map,getMapLibreHelpers:()=>ctx.mapHelpers,getRoutePolyline:()=>old.polyline,
        routeTrafficFlow:()=>Flow,routeSelection:()=>require('../modules/navigation/route-selection.js'),
        applyMapLayerReorderFromPlan:jest.fn(),getRouteLayer:()=>ctx.runtime.getRouteLayer(),getAllRouteLayers:Compare.getAllRouteLayers});
    expect(Traffic.displayRouteTrafficEdges([{start:old.polyline[0],end:old.polyline.at(-1),traffic_level:'red'}])).toBe(1);
    expect(queued.length).toBeGreaterThan(0);Life.failNavigation('inconsistent_map');ctx.map.isStyleLoaded=()=>true;fixture.bindStart(ctx);
    expect(Life.recoverNavigationMap()).toBe(true);start();const before=inventory();queued.forEach(fn=>fn());jest.advanceTimersByTime(500);
    expect(inventory()).toEqual(before);expect(Life.getCurrentRouteSteps()).toEqual(next.maneuvers);
});
test('M2 original failed preview layer leaves no source through successful startup',()=>{
    const add=ctx.map.addLayer;ctx.map.addLayer=()=>{throw Error('layer');};display();ctx.map.addLayer=add;
    expect(Object.keys(ctx.map.getStyle().sources).filter(id=>id.startsWith('route-source-'))).toEqual([]);
    expect(Compare.getAllRouteLayers()).toEqual([]);start();expect(Object.keys(ctx.map.getStyle().sources)).toEqual([ctx.runtime.getRouteLayer().id]);
});
test('queued callbacks after a valid active replacement cannot restore the old generation',()=>{
    const q=callbacks(),pending=ctx.mapHelpers.addPolyline(ctx.map,old.polyline,{});q.ready();Life.setRouteInProgress(true);
    expect(Compare.useRoute(1)).toBe(true);const before=inventory();q.run();expect(inventory()).toEqual(before);noResource(pending);
    expect(window.lastCalculatedRoute.id).toBe('NEW');expect(Life.getCurrentRouteSteps()).toEqual(next.maneuvers);
});
test('multiple generations reject obsolete callbacks and preserve current generation',()=>{
    const q=callbacks(),first=ctx.mapHelpers.addPolyline(ctx.map,old.polyline,{});
    ctx.mapHelpers.invalidateDeferredPolylineMounts(ctx.map);const second=ctx.mapHelpers.addPolyline(ctx.map,next.polyline,{});
    ctx.mapHelpers.invalidateDeferredPolylineMounts(ctx.map);const current=ctx.mapHelpers.addPolyline(ctx.map,old.polyline,{});
    expect(first._generation).toBeLessThan(second._generation);expect(second._generation).toBeLessThan(current._generation);
    q.ready();q.run();noResource(first);noResource(second);expect(mounted(current,old)).toBe(true);
});
test('current-generation deferred style/load/timer callbacks mount exactly one owned line',()=>{
    const q=callbacks(),pending=ctx.mapHelpers.addPolyline(ctx.map,next.polyline,{});q.ready();q.run();
    expect(mounted(pending,next)).toBe(true);expect(ctx.map.getStyle().layers.filter(x=>x.source===pending.id)).toHaveLength(1);
});
test('direct removal invalidates an already queued callback even when resources cannot be removed',()=>{
    const q=callbacks(),pending=ctx.mapHelpers.addPolyline(ctx.map,next.polyline,{});q.ready();q.queued[0]();
    const remove=ctx.map.removeLayer;ctx.map.removeLayer=()=>{throw Error('remove');};
    expect(pending.remove()).toBe(false);ctx.map.removeLayer=remove;ctx.mapHelpers.removeMapLayer(ctx.map,pending.id);q.run();noResource(pending);
});
test('ownership is checked after a synchronous event invalidates a pending mount mid-source creation',()=>{
    const q=callbacks(),pending=ctx.mapHelpers.addPolyline(ctx.map,next.polyline,{}),add=ctx.map.addSource;
    ctx.map.addSource=(...args)=>{add(...args);ctx.mapHelpers.invalidateDeferredPolylineMounts(ctx.map);};q.ready();q.run();noResource(pending);
});
test.each(['source','layer'])('failed preview %s creation verifies cleanup and retains no phantom handle',fault=>{
    if(fault==='source')ctx.map.addSource=()=>{throw Error('source');};else ctx.map.addLayer=()=>{throw Error('layer');};
    display();expect(Compare.getAllRouteLayers()).toEqual([]);expect(inventory()).toEqual({layers:[],sources:[]});
    expect(ctx.status).toHaveBeenCalledWith(expect.stringContaining('could not'),'warning');
});
test.each(['source','layer'])('failed %s removal remains owned and blocks startup until verified cleanup',fault=>{
    ctx.runtime.getRouteLayer().remove();ctx.runtime.setRouteLayer(null);
    const add=ctx.map.addLayer,removeLayer=ctx.map.removeLayer,removeSource=ctx.map.removeSource;
    if(fault==='source'){
        ctx.map.addLayer=()=>{throw Error('add');};ctx.map.removeSource=()=>{throw Error('remove');};
    } else {
        ctx.map.addLayer=(layer,...args)=>{add(layer,...args);throw Error('partial add');};ctx.map.removeLayer=()=>{throw Error('remove');};
    }
    display();expect(Compare.getAllRouteLayers().length).toBeGreaterThan(0);
    expect(ctx.status).toHaveBeenCalledWith(expect.stringContaining('cleanup failed'),'error');
    ctx.map.addLayer=add;fixture.bindStart(ctx);Compare.setSelectedRouteIndex(1);
    expect(Life.startTurnByTurnNavigation(next)).toBe(false);expect(Life.getRouteInProgress()).toBe(false);expect(Life.getNavigationFailure()).toBe('inconsistent_map');
    ctx.map.removeLayer=removeLayer;ctx.map.removeSource=removeSource;
    expect(Life.recoverNavigationMap()).toBe(true);start();expect(Compare.getAllRouteLayers()).toEqual([]);
});
test('failed cleanup during a reentrant invalidated mount remains owned and stops guidance',()=>{
    const q=callbacks(),pending=ctx.mapHelpers.addPolyline(ctx.map,next.polyline,{}),add=ctx.map.addSource;
    ctx.map.addSource=(...args)=>{add(...args);ctx.mapHelpers.invalidateDeferredPolylineMounts(ctx.map);};
    ctx.map.removeSource=()=>{throw Error('remove');};Life.setRouteInProgress(true);q.ready();q.run();
    expect(Life.getRouteInProgress()).toBe(false);expect(Life.getNavigationFailure()).toBe('inconsistent_map');
    expect(ctx.mapHelpers.activeLayers.get(pending.id)).toBe(pending);
    expect(ctx.mapHelpers.invalidateDeferredPolylineMounts(ctx.map)).toBe(false);
});
test('obsolete scheduled preview callbacks do not draw after comparison cleanup',()=>{
    const q=callbacks(),draw=jest.fn();Compare.applyDisplayAllRoutesStyleLoadScheduleFromPlan({shouldApply:true,strategy:'wait',fallbackTimeoutMs:500,runFallbackOnlyIfNoLayers:true},draw);
    Compare.clearComparisonRouteLayers();q.ready();q.run();expect(draw).not.toHaveBeenCalled();
});
test.each([true,false])('repeated preview creation/removal traffic=%s preserves unrelated resources',traffic=>{
    ctx.compareRuntime.call.getTrafficSettingsSnapshot=()=>({routeTrafficEnabled:traffic});
    ctx.map.addSource('unrelated',{type:'geojson',data:{}});ctx.map.addLayer({id:'unrelated',source:'unrelated',type:'line'});
    for(let i=0;i<3;i++){
        display();expect(Compare.getAllRouteLayers()).toHaveLength(2);expect(Compare.clearComparisonRouteLayers()).toBe(true);
        expect(inventory()).toEqual({layers:['unrelated'],sources:['unrelated']});
    }
});

test('ownership is registered before a source operation can partially mutate and throw',()=>{
    const add=ctx.map.addSource;let attempts=0;
    ctx.map.addSource=(id,...args)=>{
        expect(Compare.getAllRouteLayers().some(handle=>handle.sourceId===id)).toBe(true);
        attempts++;add(id,...args);throw Error('partial source add');
    };
    display();expect(attempts).toBe(2);expect(Compare.getAllRouteLayers()).toEqual([]);
    expect(inventory()).toEqual({layers:[],sources:[]});
});
test('foreign resources with coincident preview ids are preserved',()=>{
    ctx.map.addSource('route-source-0',{type:'geojson',data:{foreign:true}});
    ctx.map.addLayer({id:'route-layer-0',source:'route-source-0',type:'line'});
    display();Compare.clearComparisonRouteLayers();
    expect(ctx.map.getSource('route-source-0').data.foreign).toBe(true);
    expect(ctx.map.getLayer('route-layer-0')).toBeDefined();
});
test('current deferred mount can retry a failed layer creation without mistaking its source for a line',()=>{
    const q=callbacks(),pending=ctx.mapHelpers.addPolyline(ctx.map,next.polyline,{}),add=ctx.map.addLayer;
    ctx.map.addLayer=()=>{throw Error('layer');};q.ready();q.queued[0]();
    expect(ctx.map.getSource(pending.id)).toBeDefined();expect(ctx.map.getLayer(pending.id)).toBeUndefined();
    ctx.map.addLayer=add;q.run();expect(mounted(pending,next)).toBe(true);
});
test('a failed Show All preview does not override its cleanup error with a success/info result',()=>{
    ctx.runtime.getRouteLayer().remove();ctx.runtime.setRouteLayer(null);
    ctx.map.addLayer=()=>{throw Error('add');};ctx.map.removeSource=()=>{throw Error('remove');};
    expect(Compare.showAllRoutes()).toBe(false);
    expect(ctx.status.mock.calls.at(-1)[1]).toBe('error');expect(Compare.getAllRouteLayers().length).toBeGreaterThan(0);
});

let Life,Compare,fixture,ctx,routes,Theme;
beforeEach(()=>{
 jest.resetModules();jest.useFakeTimers();localStorage.clear();jest.spyOn(console,'log').mockImplementation(()=>{});jest.spyOn(console,'warn').mockImplementation(()=>{});
 Life=require('../app/navigation-lifecycle-orchestration');Compare=require('../app/route-comparison-orchestration');Theme=require('../modules/map/map-theme');fixture=require('./fixtures/navigation-transition.cjs');
 routes=[fixture.makeRoute('A'),fixture.makeRoute('B',[[53,-1],[53.005,-1.01],[53.01,-1]])];Life.setRoutePolyline(routes[0].polyline);Life.setCurrentRouteSteps(routes[0].maneuvers);window.lastCalculatedRoute=routes[0];
 ctx=fixture.bindTransition({traffic:false});Compare.setRouteOptions(routes);Compare.setSelectedRouteIndex(0);ctx.compareRuntime.call.ensureLabelsOnTop=()=>{};
});
afterEach(()=>{jest.useRealTimers();jest.restoreAllMocks();delete global.VoyagrJourneyModes;});
function wipe(){for(const l of ctx.map.getStyle().layers)ctx.map.removeLayer(l.id);for(const id of Object.keys(ctx.map.getStyle().sources))ctx.map.removeSource(id);}
function snapshot(){return JSON.stringify({routes:Compare.getRouteOptions(),index:Compare.getSelectedRouteIndex(),last:window.lastCalculatedRoute,points:Life.getRoutePolyline(),steps:Life.getCurrentRouteSteps(),progress:[Life.getCurrentStepIndex(),Life.getLastSnappedRouteIndex()],active:Life.getRouteInProgress()});}
test('all alternatives return after a style replacement with current theme colours and no planning side effects',()=>{
 expect(Compare.displayAllRoutesOnMap()).toBe(true);const before=snapshot();wipe();localStorage.setItem('mapTheme','dark');ctx.mapHelpers.fitMapBounds.mockClear();ctx.compareRuntime.call.displayAllRouteHazards.mockClear();
 expect(Compare.restorePreviewAfterStyleLoad(ctx.map)).toBe(true);expect(Compare.getAllRouteLayers()).toHaveLength(2);
 expect(ctx.map.getLayer('route-layer-0').paint['line-color']).toBe(Theme.DARK_MAP_ROUTE_COLORS[0]);expect(ctx.map.getSource('route-source-1').data.geometry.coordinates).toEqual(routes[1].polyline.map(([lat,lon])=>[lon,lat]));
 expect(snapshot()).toBe(before);expect(ctx.mapHelpers.fitMapBounds).not.toHaveBeenCalled();expect(ctx.compareRuntime.call.displayAllRouteHazards).not.toHaveBeenCalled();expect(Compare.restorePreviewAfterStyleLoad(ctx.map)).toBe(false);
});
test('single selected preview remains single, preserves geometry/colour index, and does not fetch or refit',()=>{
 expect(Compare.displaySingleRoute(1)).toBe(true);const before=snapshot();wipe();localStorage.setItem('mapTheme','dark');ctx.mapHelpers.fitMapBounds.mockClear();ctx.compareRuntime.call.fetchAndDisplayRouteTraffic.mockClear();
 expect(Compare.restorePreviewAfterStyleLoad(ctx.map)).toBe(true);expect(Compare.getAllRouteLayers()).toHaveLength(1);const line=Compare.getAllRouteLayers()[0];expect(ctx.map.getLayer(line.id).paint['line-color']).toBe(Theme.DARK_MAP_ROUTE_COLORS[1]);expect(ctx.map.getSource(line.id).data.geometry.coordinates).toEqual(routes[1].polyline.map(([lat,lon])=>[lon,lat]));
 expect(snapshot()).toBe(before);expect(ctx.mapHelpers.fitMapBounds).not.toHaveBeenCalled();expect(ctx.compareRuntime.call.fetchAndDisplayRouteTraffic).not.toHaveBeenCalled();
});
test('clear and newer planning context revoke old preview restoration',()=>{
 Compare.displayAllRoutesOnMap();wipe();expect(Compare.clearComparisonRouteLayers()).toBe(true);expect(Compare.restorePreviewAfterStyleLoad(ctx.map)).toBe(false);expect(ctx.map.getStyle().layers).toEqual([]);
 Compare.displayAllRoutesOnMap();wipe();Compare.setRouteOptions([fixture.makeRoute('NEW')]);expect(Compare.restorePreviewAfterStyleLoad(ctx.map)).toBe(false);expect(ctx.map.getStyle().layers).toEqual([]);
});
test('wrong map, loading style, active navigation and pending commit cannot restore previews',()=>{
 Compare.displayAllRoutesOnMap();wipe();expect(Compare.restorePreviewAfterStyleLoad({})).toBe(false);ctx.map.isStyleLoaded=()=>false;expect(Compare.restorePreviewAfterStyleLoad(ctx.map)).toBe(false);ctx.map.isStyleLoaded=()=>true;
 Life.setRouteInProgress(true);expect(Compare.restorePreviewAfterStyleLoad(ctx.map)).toBe(false);Life.setRouteInProgress(false);global.VoyagrJourneyModes={isJourneyCommitPending:()=>true};expect(Compare.restorePreviewAfterStyleLoad(ctx.map)).toBe(false);delete global.VoyagrJourneyModes;
 expect(ctx.map.getStyle().layers).toEqual([]);expect(Compare.restorePreviewAfterStyleLoad(ctx.map)).toBe(true);
});
test('coincident style resource IDs are not removed or reclaimed',()=>{
 Compare.displayAllRoutesOnMap();wipe();ctx.map.addSource('route-source-0',{type:'geojson',data:{foreign:true}});const before=JSON.stringify(ctx.map.getStyle());expect(Compare.restorePreviewAfterStyleLoad(ctx.map)).toBe(false);expect(JSON.stringify(ctx.map.getStyle())).toBe(before);
});
test('renderer reentry cannot recursively restore or resurrect a cleared preview',()=>{
 Compare.displayAllRoutesOnMap();wipe();const add=ctx.map.addSource;let reentered=false;
 ctx.map.addSource=(id,data)=>{add(id,data);if(!reentered){reentered=true;expect(Compare.restorePreviewAfterStyleLoad(ctx.map)).toBe(false);Compare.clearComparisonRouteLayers();}};
 expect(Compare.restorePreviewAfterStyleLoad(ctx.map)).toBe(false);expect(ctx.map.getStyle().layers).toEqual([]);expect(Object.keys(ctx.map.getStyle().sources)).toEqual([]);expect(Compare.restorePreviewAfterStyleLoad(ctx.map)).toBe(false);
});
test('failed remount cleans partial resources and does not claim a visible route',()=>{
 Compare.displayAllRoutesOnMap();wipe();ctx.map.addLayer=()=>{throw Error('Renderer failed');};expect(Compare.restorePreviewAfterStyleLoad(ctx.map)).toBe(false);expect(ctx.map.getStyle().layers).toEqual([]);expect(Object.keys(ctx.map.getStyle().sources)).toEqual([]);expect(Compare.getAllRouteLayers()).toEqual([]);
});
test('active verified guidance uses its existing recovery owner while preview restoration refuses',()=>{
 const active=routes[0];Compare.setRouteOptions([active]);window.lastCalculatedRoute=active;fixture.bindStart(ctx);expect(Life.startTurnByTurnNavigation(active)).toBe(true);const before=snapshot();wipe();
 expect(Compare.restorePreviewAfterStyleLoad(ctx.map)).toBe(false);expect(require('../app/reroute-map-orchestration').redrawNavigationRouteLayer('style test')).toBe(true);
 expect(ctx.mapHelpers.isPolylineLayerMounted(ctx.map,ctx.runtime.getRouteLayer(),Life.getRoutePolyline())).toBe(true);expect(snapshot()).toBe(before);
});

test('repeated single-preview theme changes keep the displayed arrival context',()=>{
 const previous=window.VoyagrArrivalPreview,calls=[];window.VoyagrArrivalPreview={clearMap:()=>{},showMap:route=>calls.push(route)};
 try {Compare.displaySingleRoute(1);calls.length=0;for(const theme of ['dark','satellite','standard']){wipe();localStorage.setItem('mapTheme',theme);expect(Compare.restorePreviewAfterStyleLoad(ctx.map)).toBe(true);}expect(calls).toEqual([routes[1],routes[1],routes[1]]);}finally{window.VoyagrArrivalPreview=previous;}
});
test('failure after the first alternative mounts cleans only that restoration batch',()=>{
 Compare.displayAllRoutesOnMap();wipe();const add=ctx.map.addLayer;ctx.map.addLayer=(layer,...args)=>{if(layer.id==='route-layer-1')throw Error('Second line failed');return add(layer,...args);};
 expect(Compare.restorePreviewAfterStyleLoad(ctx.map)).toBe(false);expect(ctx.map.getStyle().layers).toEqual([]);expect(Object.keys(ctx.map.getStyle().sources)).toEqual([]);expect(Compare.getAllRouteLayers()).toEqual([]);
});

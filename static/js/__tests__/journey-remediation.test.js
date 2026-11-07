const fs=require('fs');
let AI,Plan,Modes,Life,Compare,Sharing,RR,Location,ctx,lifeRt,rt,old,newRoute,fix,position,stage,marker,api;
function makeContext(r,stops){return {version:1,purpose:'planning',origin:{kind:'map',coordinates:r.polyline[0]},destination:{kind:'searched',coordinates:r.polyline.at(-1)},ordered_stops:stops};}
beforeEach(()=>{
 jest.resetModules();jest.useFakeTimers();localStorage.clear();delete global.VoyagrJourneyModes;delete global.VoyagrNavigationSafetyUX;
 AI=require('../modules/navigation/avoidance-integrity.js');Plan=require('../modules/navigation/journey-plan.js');Life=require('../app/navigation-lifecycle-orchestration.js');Compare=require('../app/route-comparison-orchestration.js');
 RR=require('../modules/navigation/routing-request.js');Sharing=require('../modules/navigation/route-sharing.js');Location=require('../app/location-orchestration.js');
 const {makeRoute,bindTransition,bindStart}=require('./fixtures/navigation-transition.cjs');
 old=makeRoute('old',[[53,-1],[53.001,-1],[53.002,-1],[53.01,-1]]);old.journey_context=makeContext(old,[{coordinates:[53.001,-1],name:'completed',kind:'map'},{coordinates:[53.002,-1],name:'remaining',kind:'gps'}]);
 old.leg_geometry_ranges=[{begin_shape_index:0,end_shape_index:1},{begin_shape_index:1,end_shape_index:2},{begin_shape_index:2,end_shape_index:3}];
 old.polyline=AI.geometryPoints(old);Life.setRoutePolyline(old.polyline);ctx=bindTransition();
 stage={commit:jest.fn(async guard=>guard()),discard:jest.fn(async()=>true)};
 lifeRt=bindStart(ctx,{setInitialETAMovementRetries:()=>{},call:{stageActiveRoute:jest.fn(async()=>stage)}});
 Compare.setRouteOptions([old]);Compare.setSelectedRouteIndex(0);window.lastCalculatedRoute=old;
 Life.setLastSnappedRouteIndex(1);Life.setNavigationArrivalTriggered(true);Life.setRouteInProgress(true);
 global.VoyagrJourneyPlan=Plan;global.VoyagrAvoidanceIntegrity=AI;global.VoyagrServiceWorkerOrchestration={getUpdatePending:()=>false};
 newRoute=makeRoute('new',[[53.0015,-1],[53.002,-1],[53.01,-1]]);newRoute.polyline=AI.geometryPoints(newRoute);newRoute.journey_context=makeContext(newRoute,[old.journey_context.ordered_stops[1]]);newRoute.journey_context.origin.kind='gps';
 newRoute.leg_geometry_ranges=[{begin_shape_index:0,end_shape_index:1},{begin_shape_index:1,end_shape_index:2}];newRoute.avoidance_assessment.origin_integrity.requested_origin=[53.0015,-1];
 position=()=>({timestamp:Date.now(),coords:{latitude:53.0015,longitude:-1,accuracy:5}});fix=null;
 global.VoyagrGpsOrchestration={getAcceptedOriginFix:()=>fix};navigator.geolocation.getCurrentPosition=jest.fn(ok=>ok(position()));
 const template=fs.readFileSync(require('path').join(__dirname,'../../../templates/index.html'),'utf8');
 document.body.innerHTML='<input id="start"><input id="end">'+template.match(/<section id="journeyModeChooser"[\s\S]*?<\/section>/)[0]+template.match(/<section id="simulationControls"[\s\S]*?<\/section>/)[0];
 Modes=require('../app/journey-modes.js');
 api=()=>({ok:true,json:async()=>({success:true,routes:[JSON.parse(JSON.stringify(newRoute))]})});
 rt={replacementProtocol:1,selected:()=>require('../modules/navigation/route-selection.js').mergeNavigationRouteFromSelected(window.lastCalculatedRoute,Compare.getRouteOptions(),Compare.getSelectedRouteIndex()),
 options:Compare.getRouteOptions,setOptions:Compare.setRouteOptions,index:Compare.getSelectedRouteIndex,setIndex:Compare.setSelectedRouteIndex,
 isLive:Life.getRouteInProgress,activeGeometry:Life.getRoutePolyline,progressIndex:Life.getLastSnappedRouteIndex,
 stopLive:Life.stopTurnByTurnNavigation,startLive:(r,o)=>Life.startTurnByTurnNavigation(r,o),stopGps:jest.fn(),getFix:()=>fix,
 acceptPosition:p=>{fix={lat:p.coords.latitude,lon:p.coords.longitude,accuracy:p.coords.accuracy,timestamp:p.timestamp};return true;},
 map:()=>ctx.map,helpers:()=>ctx.mapHelpers,showStatus:ctx.status,buildRequest:()=>({avoid_caz:false}),fetch:jest.fn(async()=>api()),resolveDestination:jest.fn(),addStop:jest.fn(),
 simulationMarker:()=>{const el=document.createElement('i');document.body.append(el);marker={setLngLat:jest.fn(),remove:()=>el.remove(),getElement:()=>el};return marker;}};
 Modes.bind(rt);
});
afterEach(()=>{Modes.exit();Life.setRouteInProgress(false);AI.invalidate();jest.restoreAllMocks();jest.useRealTimers();delete global.VoyagrJourneyModes;delete global.VoyagrGpsOrchestration;delete global.VoyagrServiceWorkerOrchestration;});
function requestedStops(){return rt.fetch.mock.calls.map(c=>JSON.parse(c[1].body).stops.map(s=>s.name));}

test.each(['routing','stale','refusal','persistence','mount'])('R1 %s failure preserves actual live geometry, completed-stop progress and arrival state',async kind=>{
 if(kind==='routing')rt.fetch.mockResolvedValue({ok:false});
 if(kind==='stale')rt.fetch.mockImplementation(async()=>{localStorage.setItem('pref_cameras','false');return api();});
 if(kind==='refusal')newRoute.avoidance_assessment.requirements[0].status='VIOLATED';
 if(kind==='persistence')lifeRt.call.stageActiveRoute.mockRejectedValue(Error('Disk failed'));
 if(kind==='mount')ctx.addPolyline.mockImplementation(()=>{throw Error('Mount failed');});
 expect(rt.activeGeometry()).toEqual(AI.geometryPoints(rt.selected()));const before=ctx.snapshot();expect(await Modes.navigateFromGPS()).toBe(false);
 expect(ctx.snapshot()).toBe(before);expect(Life.getRouteInProgress()).toBe(true);expect(window.lastCalculatedRoute).toBe(old);
 expect(Life.getLastSnappedRouteIndex()).toBe(1);expect(Life.getNavigationArrivalTriggered()).toBe(true);
 expect(requestedStops()).toEqual([['remaining']]);
});
test('R1 repeated failed requests never reintroduce completed stops',async()=>{
 rt.fetch.mockResolvedValue({ok:false});for(let i=0;i<3;i++)expect(await Modes.navigateFromGPS()).toBe(false);
 expect(requestedStops()).toEqual([['remaining'],['remaining'],['remaining']]);expect(Life.getRouteInProgress()).toBe(true);
});
test('R1 actual verifier and replacement commit new geometry, visits and arrival state together',async()=>{
 expect(await Modes.navigateFromGPS()).toBe(true);expect(window.lastCalculatedRoute.id).toBe('new');
 expect(Life.getRoutePolyline()).toEqual(newRoute.polyline);expect(Life.getLastSnappedRouteIndex()).toBe(0);expect(Life.getNavigationArrivalTriggered()).toBe(false);
 expect(window.lastCalculatedRoute.journey_context.ordered_stops.map(s=>s.name)).toEqual(['remaining']);expect(stage.commit).toHaveBeenCalledTimes(1);expect(stage.discard).toHaveBeenCalledTimes(1);
});
test('R1 promotion failure safely stops while retaining new remaining visits for explicit retry',async()=>{
 stage.commit.mockResolvedValue(false);expect(await Modes.navigateFromGPS()).toBe(false);expect(Life.getRouteInProgress()).toBe(false);expect(Life.getNavigationFailure()).toBe('replacement_persistence_failed');
 rt.fetch.mockResolvedValue({ok:false});expect(await Modes.navigateFromGPS()).toBe(false);expect(requestedStops()).toEqual([['remaining'],['remaining']]);
});
test('R1 cancellation and GPS progress advancing during staging refuse without losing active context',async()=>{
 let resolve;lifeRt.call.stageActiveRoute.mockImplementation(()=>new Promise(r=>{resolve=r;}));
 const pending=Modes.navigateFromGPS();for(let i=0;i<10;i++)await Promise.resolve();
 expect(resolve).toBeDefined();Life.setLastSnappedRouteIndex(2);resolve(stage);
 expect(await pending).toBe(false);expect(window.lastCalculatedRoute).toBe(old);expect(Life.getRouteInProgress()).toBe(true);expect(stage.commit).not.toHaveBeenCalled();
});
test('R1 cancelled staging completion cannot overwrite a newer mode',async()=>{
 let resolve;lifeRt.call.stageActiveRoute.mockImplementation(()=>new Promise(r=>{resolve=r;}));
 const pending=Modes.navigateFromGPS();for(let i=0;i<10;i++)await Promise.resolve();Modes.exit();resolve(stage);
 expect(await pending).toBe(false);expect(stage.commit).not.toHaveBeenCalled();expect(Life.getRouteInProgress()).toBe(true);expect(window.lastCalculatedRoute).toBe(old);
});

test.each(['gps','searched','map','saved','coordinates','unknown'])('R2 %s survives real planning serialization, selection, saving, restoration and live intent',kind=>{
 const routeSharing=require('../modules/navigation/route-sharing.js'),RS=require('../modules/navigation/route-selection.js');
 const body=RR.buildInitialRouteRequestBody({start:'53,-1',end:'53.01,-1',stops:[{lat:53.002,lon:-1,name:'visit',duration:0,provenance:kind}],viaPoints:[{lat:53.001,lon:-1,provenance:kind}]});
 const wire=JSON.parse(JSON.stringify(body));expect(wire.stops[0].provenance).toBe(kind);expect(wire.via_points[0].provenance).toBe(kind);expect(wire.stops[0].duration).toBe(0);
 const selected={...newRoute,journey_context:makeContext(newRoute,[{coordinates:[53.002,-1],kind:wire.stops[0].provenance,name:'visit',duration_minutes:0}])};
 const merged=RS.mergeNavigationRouteFromSelected(selected,[selected],0);
 const saved=routeSharing.buildSaveCurrentRoutePlan({lastCalculatedRoute:merged,routeName:'Synthetic',startLabel:'start',endLabel:'end',now:1}).savedRoute;
 const restored=routeSharing.buildUseSavedRoutePlan(1,JSON.parse(JSON.stringify([saved]))).lastCalculatedRoutePatch;
 expect(restored.journey_context.ordered_stops[0]).toMatchObject({kind:kind==='unknown'?'unknown':'saved',source_kind:kind});
 expect(Plan.liveIntent(restored,false,0).stops[0].provenance).toBe(kind==='unknown'?'unknown':'saved');expect(AI.prepareNavigationCandidate(restored)).toBeNull();
 expect(()=>Plan.inspection(restored,AI)).not.toThrow();
});
test('R2 legacy saved context is explicitly unknown and cannot invent canonical pending stops',()=>{
 const r=Sharing.buildUseSavedRoutePlan(1,[{id:1,geometry:old.geometry,start:'old',end:'end'}]).lastCalculatedRoutePatch;
 expect(r.journey_context.origin.kind).toBe('unknown');expect(r.journey_context.destination.kind).toBe('unknown');expect(()=>Plan.liveIntent(r,false,0)).toThrow(/lacks endpoint and stop context/);
});

test.each(['start','end'])('R3 %s delayed GPS cannot replace a newer searched endpoint',field=>{
 Location.bind({call:{showStatus:ctx.status}});let callback;navigator.geolocation.getCurrentPosition.mockImplementation(ok=>{callback=ok;});
 Location.setCurrentLocation(field);const input=document.getElementById(field);input.value='Doncaster';input.dataset.lat='53.52';input.dataset.lon='-1.13';input.dataset.journeySource='searched';input.dispatchEvent(new Event('input',{bubbles:true}));
 callback(position());expect(input.value).toBe('Doncaster');expect(input.dataset.lat).toBe('53.52');expect(input.dataset.journeySource).toBe('searched');
});
test('R3 simultaneous endpoints retain independent ownership and a newer explicit GPS selection wins',()=>{
 Location.bind({call:{showStatus:ctx.status}});const callbacks=[];navigator.geolocation.getCurrentPosition.mockImplementation((ok,fail)=>callbacks.push({ok,fail}));
 Location.setCurrentLocation('start');Location.setCurrentLocation('end');Location.invalidateEndpointRequests('start');
 callbacks[0].ok(position());callbacks[1].ok(position());expect(document.getElementById('start').value).toBe('');expect(document.getElementById('end').dataset.journeySource).toBe('gps');
 Location.setCurrentLocation('start');callbacks[2].ok(position());expect(document.getElementById('start').dataset.journeySource).toBe('gps');
});
test('R3 failure, cancellation and mode transitions preserve manual endpoint data',()=>{
 Location.bind({call:{showStatus:ctx.status}});const input=document.getElementById('end');input.value='manual';input.dataset.journeySource='map';
 const callbacks=[];navigator.geolocation.getCurrentPosition.mockImplementation((ok,fail)=>callbacks.push({ok,fail}));
 Location.setCurrentLocation('end');callbacks[0].fail({message:'Denied'});expect(input.value).toBe('manual');
 Location.setCurrentLocation('end');Modes.choose();callbacks[1].ok(position());expect(input.value).toBe('manual');
 Location.setCurrentLocation('end');Modes.exit();Modes.choose();callbacks[2].ok(position());expect(input.value).toBe('manual');
});

test.each(['layer','source'])('R4 partial %s removal retains warning and actual ownership until verified retry',kind=>{
 expect(Modes.startSimulation()).toBe(true);const count=ctx.layers.size;
 const removal=jest.spyOn(ctx.map,kind==='layer'?'removeLayer':'removeSource').mockImplementation(()=>{throw Error('Renderer busy');});
 expect(Modes.exit()).toBe(false);expect(Modes.isSimulating()).toBe(true);expect(document.getElementById('simulationIndicator').hidden).toBe(false);
 expect(document.getElementById('simulationControls').hidden).toBe(false);expect(Modes.restart()).toBe(false);
 expect(Modes.exit()).toBe(false);removal.mockRestore();expect(Modes.exit()).toBe(true);
 expect(document.getElementById('simulationIndicator').hidden).toBe(true);expect(ctx.layers.size).toBe(count-1);expect(Modes.exit()).toBe(true);
});
test('R4 marker removal failure retains non-authoritative label through retry',()=>{
 Modes.startSimulation();const remove=marker.remove;marker.remove=()=>{throw Error('Marker still connected');};
 expect(Modes.exit()).toBe(false);expect(marker.getElement().isConnected).toBe(true);expect(document.getElementById('simulationIndicator').hidden).toBe(false);
 marker.remove=remove;expect(Modes.exit()).toBe(true);expect(marker.getElement().isConnected).toBe(false);
});

test('R1 real IndexedDB staging cannot replace current until guarded promotion, and discard is idempotent',async()=>{
 jest.useRealTimers();const off=require('../modules/navigation/offline-navigation.js');const {IDBFactory}=require('fake-indexeddb');const idb=new IDBFactory();
 const oldRecord=off.buildActiveRoutePersistRecord({polyline:old.polyline,routeData:old,steps:old.maneuvers});
 const nextRecord=off.buildActiveRoutePersistRecord({polyline:newRoute.polyline,routeData:newRoute,steps:newRoute.maneuvers});
 await off.persistActiveRouteRecord(idb,oldRecord);const pending=await off.stageActiveRouteRecord(idb,nextRecord);
 expect((await off.loadActiveRouteRecord(idb)).routeData.id).toBe('old');expect(await pending.commit(()=>false)).toBe(false);
 expect((await off.loadActiveRouteRecord(idb)).routeData.id).toBe('old');await pending.discard();await pending.discard();
 const success=await off.stageActiveRouteRecord(idb,nextRecord);expect(await success.commit(()=>true)).toBe(true);await success.discard();
 expect((await off.loadActiveRouteRecord(idb)).routeData.id).toBe('new');
});
test('R1 late persistence stage after timeout is discarded without changing current guidance',async()=>{
 let resolve;lifeRt.call.stageActiveRoute.mockImplementation(()=>new Promise(r=>{resolve=r;}));
 const pending=Modes.navigateFromGPS();for(let i=0;i<10;i++)await Promise.resolve();jest.advanceTimersByTime(5000);
 expect(await pending).toBe(false);expect(Life.getRouteInProgress()).toBe(true);expect(window.lastCalculatedRoute).toBe(old);
 resolve(stage);for(let i=0;i<10;i++)await Promise.resolve();expect(stage.discard).toHaveBeenCalled();expect(stage.commit).not.toHaveBeenCalled();
});
test('R4 a production deferred polyline callback cannot remount after verified cleanup',()=>{
 const callbacks=[];let checks=0;ctx.map.isStyleLoaded=()=>++checks===1;
 ctx.map.once=(name,callback)=>callbacks.push(callback);ctx.map.on=()=>{};ctx.map.off=()=>{};
 const before=ctx.layers.size;expect(Modes.startSimulation()).toBe(false);expect(Modes.exit()).toBe(true);
 ctx.map.isStyleLoaded=()=>true;callbacks.forEach(callback=>callback());
 expect(ctx.layers.size).toBe(before);expect(document.getElementById('simulationIndicator').hidden).toBe(true);
});
test('R3 obsolete failure and success from a superseded explicit GPS request cannot change the latest endpoint',()=>{
 Location.bind({call:{showStatus:ctx.status}});const callbacks=[];navigator.geolocation.getCurrentPosition.mockImplementation((ok,fail)=>callbacks.push({ok,fail}));
 Location.setCurrentLocation('end');Location.setCurrentLocation('end');callbacks[1].ok(position());
 const before=document.getElementById('end').outerHTML;callbacks[0].fail({message:'old denial'});callbacks[0].ok({timestamp:Date.now(),coords:{latitude:54,longitude:0}});
 expect(document.getElementById('end').outerHTML).toBe(before);
});

test('R1 asynchronous verifier results cannot authorize active replacement',async()=>{
 jest.spyOn(AI,'gate').mockReturnValue(Promise.resolve(true));const before=ctx.snapshot();
 expect(await Modes.navigateFromGPS()).toBe(false);expect(ctx.snapshot()).toBe(before);expect(lifeRt.call.stageActiveRoute).not.toHaveBeenCalled();
});
test('R1 newer request generation during persistence staging refuses the older candidate',async()=>{
 let resolve;lifeRt.call.stageActiveRoute.mockImplementation(()=>new Promise(r=>{resolve=r;}));
 const pending=Modes.navigateFromGPS();for(let i=0;i<10;i++)await Promise.resolve();AI.begin(localStorage);resolve(stage);
 expect(await pending).toBe(false);expect(window.lastCalculatedRoute).toBe(old);expect(Life.getRouteInProgress()).toBe(true);expect(stage.commit).not.toHaveBeenCalled();
});
test('R3 same-value manual reselection invalidates the pending GPS generation',()=>{
 Location.bind({call:{showStatus:ctx.status}});const Geocoding=require('../app/geocoding-orchestration.js');
 Geocoding.bind({call:{showStatus:ctx.status,recordRecentDestination:()=>{}}});
 Geocoding.selectAutocompleteResult('end',53.52,-1.13,'Doncaster');let callback;navigator.geolocation.getCurrentPosition.mockImplementation(ok=>{callback=ok;});
 Location.setCurrentLocation('end');Geocoding.selectAutocompleteResult('end',53.52,-1.13,'Doncaster');callback(position());
 expect(document.getElementById('end').value).toBe('Doncaster');expect(document.getElementById('end').dataset.journeySource).toBe('searched');
});
test('R3 swapping endpoints invalidates both pending GPS owners while retaining provenance',()=>{
 Location.bind({call:{showStatus:ctx.status},getStartMarker:()=>null,getEndMarker:()=>null,getRouteLayer:()=>null});
 const start=document.getElementById('start'),end=document.getElementById('end');
 start.value='manual';start.dataset.journeySource='map';end.value='saved';end.dataset.journeySource='saved';
 const callbacks=[];navigator.geolocation.getCurrentPosition.mockImplementation(ok=>callbacks.push(ok));Location.setCurrentLocation('start');Location.setCurrentLocation('end');
 Location.swapStartAndDestination();callbacks.forEach(callback=>callback(position()));
 expect(start.value).toBe('saved');expect(start.dataset.journeySource).toBe('saved');expect(end.value).toBe('manual');expect(end.dataset.journeySource).toBe('map');
});

test('R1 independent lifecycle safety stop retains canonical remaining visits before clearing guidance',async()=>{
 Life.failNavigation('synthetic_safety_stop');expect(Life.getRouteInProgress()).toBe(false);
 rt.fetch.mockResolvedValue({ok:false});expect(await Modes.navigateFromGPS()).toBe(false);
 expect(requestedStops()).toEqual([['remaining']]);expect(Life.getNavigationFailure()).toBe('synthetic_safety_stop');
});

test('R1 real aborted staging transaction rejects without replacing the current persisted route',async()=>{
 jest.useRealTimers();const off=require('../modules/navigation/offline-navigation.js');const {IDBFactory}=require('fake-indexeddb');const idb=new IDBFactory();
 await off.persistActiveRouteRecord(idb,off.buildActiveRoutePersistRecord({routeData:old,polyline:old.polyline}));
 const db=await off.openRouteDB(idb),prototype=Object.getPrototypeOf(db),transaction=prototype.transaction;db.close();
 const fault=jest.spyOn(prototype,'transaction').mockImplementation(function(...args){const tx=transaction.apply(this,args);if(args[1]==='readwrite')queueMicrotask(()=>tx.abort());return tx;});
 await expect(off.stageActiveRouteRecord(idb,off.buildActiveRoutePersistRecord({routeData:newRoute,polyline:newRoute.polyline}))).rejects.toBeTruthy();fault.mockRestore();
 expect((await off.loadActiveRouteRecord(idb)).routeData.id).toBe('old');
});

test.each(['app','lifecycle'])('R1 mixed %s replacement protocol fails closed and retains the old journey',async part=>{
 if(part==='app')delete rt.replacementProtocol;else delete Life.JOURNEY_REPLACEMENT_PROTOCOL;
 const before=ctx.snapshot();expect(await Modes.navigateFromGPS()).toBe(false);expect(ctx.snapshot()).toBe(before);expect(lifeRt.call.stageActiveRoute).not.toHaveBeenCalled();
});

test('R1 direct start cannot resurrect completed visits after an explicit lifecycle stop',async()=>{
 Life.stopTurnByTurnNavigation();rt.acceptPosition({timestamp:Date.now(),coords:{latitude:53,longitude:-1,accuracy:5}});
 expect(await Modes.startHere()).toBe(false);expect(lifeRt.call.persistActiveRoute).not.toHaveBeenCalled();expect(Life.getRouteInProgress()).toBe(false);
 expect(ctx.status.mock.calls.at(-1)[0]).toMatch(/Navigate From My Location/);
});

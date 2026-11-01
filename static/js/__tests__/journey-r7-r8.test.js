const base=require('path').join(__dirname,'../')+'/';
let Off,OffApp,idb,priorIDB;
let AI,Plan,Life,Modes,Compare,RR,Location,ctx,calls,old,next,rt,stage,fix;
const flush=async()=>{for(let i=0;i<16;i++)await Promise.resolve();};
function gps(){return {timestamp:Date.now(),coords:{latitude:53.0015,longitude:-1,accuracy:5}};}
function context(r,visits){return {version:1,purpose:'planning',origin:{kind:'map',coordinates:AI.geometryPoints(r)[0]},destination:{kind:'searched',coordinates:[53.01,-1]},ordered_stops:visits};}
beforeEach(()=>{
 jest.resetModules();jest.useRealTimers();priorIDB=global.indexedDB;idb=new (require('fake-indexeddb').IDBFactory)();global.indexedDB=idb;localStorage.clear();delete global.VoyagrJourneyModes;delete global.VoyagrNavigationSafetyUX;
 AI=require(base+'modules/navigation/avoidance-integrity.js');Plan=require(base+'modules/navigation/journey-plan.js');Life=require(base+'app/navigation-lifecycle-orchestration.js');Compare=require(base+'app/route-comparison-orchestration.js');RR=require(base+'modules/navigation/routing-request.js');Location=require(base+'app/location-orchestration.js');
 const {makeRoute,bindTransition,bindStart}=require(base+'__tests__/fixtures/navigation-transition.cjs');
 // These adapters supply renderer/device/services only. All navigation logic is production.
 old=makeRoute('old',[[53,-1],[53.001,-1],[53.002,-1],[53.01,-1]]);old.polyline=AI.geometryPoints(old);
 old.journey_context=context(old,[{coordinates:[53.001,-1],name:'completed',kind:'map'},{coordinates:[53.002,-1],name:'pending',kind:'gps'}]);old.leg_geometry_ranges=[{begin_shape_index:0,end_shape_index:1},{begin_shape_index:1,end_shape_index:2},{begin_shape_index:2,end_shape_index:3}];
 Life.setRoutePolyline(old.polyline);ctx=bindTransition();
 stage={commit:jest.fn(async guard=>guard()),discard:jest.fn(async()=>true)};
 calls=bindStart(ctx,{setInitialETAMovementRetries:()=>{},call:{stageActiveRoute:jest.fn(async()=>stage),clearPersistedRoute:jest.fn()}}).call;
 Compare.setRouteOptions([old]);Compare.setSelectedRouteIndex(0);window.lastCalculatedRoute=old;Life.setCurrentRouteSteps(old.maneuvers);Life.setRouteStarted(true);Life.setLastSnappedRouteIndex(1);Life.setRouteInProgress(true);
 next=makeRoute('replacement',[[53.0015,-1],[53.002,-1],[53.01,-1]]);next.polyline=AI.geometryPoints(next);next.journey_context=context(next,[old.journey_context.ordered_stops[1]]);next.avoidance_assessment.origin_integrity.requested_origin=[53.0015,-1];next.leg_geometry_ranges=[{begin_shape_index:0,end_shape_index:1},{begin_shape_index:1,end_shape_index:2}];
 global.VoyagrAvoidanceIntegrity=AI;global.VoyagrJourneyPlan=Plan;global.VoyagrServiceWorkerOrchestration={getUpdatePending:()=>false};
 document.body.innerHTML='<input id="start"><input id="end"><section id="journeyModeChooser"></section><section id="simulationControls"><strong id="simulationIndicator">SIMULATION — NOT LIVE GPS</strong></section><p id="journeyModeStatus"></p><p id="simulationProgress"></p>';
 fix=null;global.VoyagrGpsOrchestration={getAcceptedOriginFix:()=>fix};navigator.geolocation.getCurrentPosition=jest.fn(ok=>ok(gps()));
 Modes=require(base+'app/journey-modes.js');
 rt={replacementProtocol:1,selected:()=>require(base+'modules/navigation/route-selection.js').mergeNavigationRouteFromSelected(window.lastCalculatedRoute,Compare.getRouteOptions(),Compare.getSelectedRouteIndex()),
 isLive:Life.getRouteInProgress,activeGeometry:Life.getRoutePolyline,progressIndex:Life.getLastSnappedRouteIndex,options:Compare.getRouteOptions,setOptions:Compare.setRouteOptions,index:Compare.getSelectedRouteIndex,setIndex:Compare.setSelectedRouteIndex,
 stopLive:Life.stopTurnByTurnNavigation,startLive:Life.startTurnByTurnNavigation,stopGps:jest.fn(),getFix:()=>fix,acceptPosition:p=>{fix={lat:p.coords.latitude,lon:p.coords.longitude,accuracy:p.coords.accuracy,timestamp:p.timestamp};return true;},
 map:()=>ctx.map,helpers:()=>ctx.mapHelpers,showStatus:ctx.status,buildRequest:()=>({avoid_caz:false}),fetch:jest.fn(async()=>({ok:true,json:async()=>({success:true,routes:[JSON.parse(JSON.stringify(next))]})})),resolveDestination:jest.fn(),
 simulationMarker:()=>{const el=document.createElement('i');document.body.append(el);return {setLngLat:()=>{},remove:()=>el.remove(),getElement:()=>el};}};
 Off=require('../modules/navigation/offline-navigation.js');OffApp=require('../app/offline-navigation-orchestration.js');OffApp.bind({offlineNavigation:()=>Off});rt.confirmPlanReplacement=jest.fn(()=>true);rt.stageAbandonJourney=OffApp.stageAbandonJourney;
 Modes.bind(rt);
});
afterEach(()=>{global.indexedDB=priorIDB;Modes.exit();Life.setRouteInProgress(false);AI.invalidate();jest.restoreAllMocks();jest.useRealTimers();delete global.VoyagrJourneyModes;delete global.VoyagrGpsOrchestration;delete global.VoyagrServiceWorkerOrchestration;});
function stopNames(){return rt.fetch.mock.calls.map(call=>JSON.parse(call[1].body).stops.map(s=>s.name));}

async function until(check){for(let i=0;i<50&&!check();i++)await new Promise(resolve=>setTimeout(resolve,1));expect(check()).toBeTruthy();}
async function stored(){await OffApp.persistJourneySnapshot(old,Modes.getContinuation(old));}
function pendingNames(record){return record.continuation.intent.stops.map(s=>s.name);}
test.each(['location','geocoding','calculate-route','route-preview','auto-gps','search-favorites','poi-search','parking','form-clear','trip-history','route-sharing','ml-predictions','voice-control','waypoints'])('R7 incompatible %s endpoint owner refuses mode and direct production handovers',async name=>{
 const globalName='Voyagr'+name.split('-').map(s=>s[0].toUpperCase()+s.slice(1)).join('')+'Orchestration';const module=global[globalName];delete module.ENDPOINT_INTENT_PROTOCOL;
 expect(Modes.endpointIntentCompatible()).toBe(false);const before=ctx.snapshot();expect(await Modes.navigateFromGPS()).toBe(false);expect(ctx.snapshot()).toBe(before);expect(stage.commit).not.toHaveBeenCalled();
 expect(Life.startTurnByTurnNavigation(next)).toBe(false);expect(global.VoyagrRerouteMapOrchestration.updateRouteOnMap(next).ok).toBe(false);expect(ctx.snapshot()).toBe(before);
});
test.each(['missing','malformed-version','missing-api','throwing-readiness','unbound'])('R7 %s location dependency fails closed without changing valid guidance',async kind=>{
 const module=global.VoyagrLocationOrchestration;
 if(kind==='missing')delete global.VoyagrLocationOrchestration;
 if(kind==='malformed-version')module.ENDPOINT_INTENT_PROTOCOL='1';
 if(kind==='missing-api')module.invalidateEndpointRequests=null;
 if(kind==='throwing-readiness')module.endpointIntentReady=()=>{throw Error('initializing');};
 if(kind==='unbound')module.bind(null);
 const before=ctx.snapshot();expect(await Modes.navigateFromGPS()).toBe(false);expect(ctx.snapshot()).toBe(before);expect(await Life.startTurnByTurnNavigation(next,{gpsReplacement:true})).toBe(false);
});
test('R7 changing a protocol during native map staging cannot authorize its captured intent',async()=>{
 ctx.addPolyline.mockImplementationOnce((...args)=>{delete global.VoyagrLocationOrchestration.ENDPOINT_INTENT_PROTOCOL;return window.MapLibreHelpers.addPolyline(...args);});
 const before=ctx.snapshot();expect(await Modes.navigateFromGPS()).toBe(false);expect(ctx.snapshot()).toBe(before);expect(stage.commit).not.toHaveBeenCalled();
});
test.each(['stage','promotion','finalization'])('R8 actual IndexedDB %s abort retains canonical durable continuation',async phase=>{
 await stored();let writes=0;const proto=require('fake-indexeddb').IDBDatabase.prototype,transaction=proto.transaction;
 jest.spyOn(proto,'transaction').mockImplementation(function(...args){const tx=transaction.apply(this,args);if(args[1]==='readwrite'&&++writes===['stage','promotion','finalization'].indexOf(phase)+1)queueMicrotask(()=>tx.abort());return tx;});
 expect(await Modes.abandonJourney()).toBe(false);expect(pendingNames(await Off.loadActiveRouteRecord(idb))).toEqual(['pending']);expect(Modes.getContinuation(old).intent.stops.map(s=>s.name)).toEqual(['pending']);expect(Life.getRouteInProgress()).toBe(false);
});
test('R8 failed abandonment during pending replacement never invokes the incidental durable clear',async()=>{
 await stored();const clear=jest.fn(()=>Off.clearActiveRouteRecord(idb));calls.clearPersistedRoute=clear;
 let release;calls.stageActiveRoute.mockImplementation(()=>new Promise(resolve=>{release=resolve;}));const replacement=Modes.navigateFromGPS();await until(()=>release);rt.stageAbandonJourney=async()=>{throw Error('storage unavailable');};
 expect(await Modes.abandonJourney()).toBe(false);release(stage);expect(await replacement).toBe(false);expect(clear).not.toHaveBeenCalled();expect(pendingNames(await Off.loadActiveRouteRecord(idb))).toEqual(['pending']);
});
test('R8 pending replacement promotion is cancelled before successful abandonment retires the intended journey',async()=>{
 await stored();let release,handle;calls.stageActiveRoute.mockImplementation(async route=>{handle=await OffApp.stageActiveRoute(route);const commit=handle.commit;handle.commit=guard=>new Promise(resolve=>{release=()=>commit(guard).then(resolve);});return handle;});
 const replacement=Modes.navigateFromGPS();await until(()=>release);expect(await Modes.abandonJourney()).toBe(true);await release();expect(await replacement).toBe(false);expect(await Off.loadActiveRouteRecord(idb)).toBeNull();expect(Modes.getContinuation(rt.selected())).toBeNull();expect(Life.getRouteInProgress()).toBe(false);
});
test('R8 successful abandonment is confirmed and idempotent on retry',async()=>{
 await stored();rt.confirmPlanReplacement.mockReturnValue(false);expect(await Modes.abandonJourney()).toBe(false);expect(Life.getRouteInProgress()).toBe(true);
 rt.confirmPlanReplacement.mockReturnValue(true);expect(await Modes.abandonJourney()).toBe(true);expect(await Off.loadActiveRouteRecord(idb)).toBeNull();expect(Modes.getContinuation(old)).toBeNull();expect(await Modes.abandonJourney()).toBe(true);expect(await Off.loadActiveRouteRecord(idb)).toBeNull();
});
test('R8 interrupted abandonment promotion restores the previous journey inspection-only on reload',async()=>{
 await stored();const handle=await OffApp.stageAbandonJourney(old,Modes.getContinuation(old),()=>true,OffApp.getJourneyOwnership());expect(await handle.commit(()=>true)).toBe(true);
 const recovered=await Off.loadActiveRouteRecord(idb);expect(pendingNames(recovered)).toEqual(['pending']);const restored=require('../modules/navigation/route-selection.js').buildRoutePayloadFromPersisted(recovered,require('../modules/navigation/polyline-codec.js').encodePolyline);expect(AI.prepareNavigationCandidate(restored)).toBeNull();expect(Modes.getContinuation(restored).intent.stops.map(s=>s.name)).toEqual(['pending']);
 expect(await handle.finalize(()=>true)).toBe(true);expect(await Off.loadActiveRouteRecord(idb)).toBeNull();
});
test('R8 an obsolete abandonment cannot overwrite a newer durable journey',async()=>{
 await stored();const original=rt.stageAbandonJourney;rt.stageAbandonJourney=async(...args)=>{const handle=await original(...args),commit=handle.commit;handle.commit=async guard=>{await Off.persistActiveRouteRecord(idb,Off.buildActiveRoutePersistRecord({routeData:next,polyline:next.polyline,steps:next.maneuvers}),null,null,(await Off.loadJourneyState(idb)).ownership);return commit(guard);};return handle;};
 expect(await Modes.abandonJourney()).toBe(false);expect((await Off.loadActiveRouteRecord(idb)).routeData.id).toBe('replacement');expect(Modes.getState()).toBe('RECOVERY_REQUIRED');
});
test('R8 endpoint edits during pending promotion cancel rather than adopt the new generation',async()=>{
 await stored();const original=rt.stageAbandonJourney;let release;rt.stageAbandonJourney=async(...args)=>{const handle=await original(...args),commit=handle.commit;handle.commit=guard=>new Promise(resolve=>{release=()=>commit(guard).then(resolve);});return handle;};
 const pending=Modes.abandonJourney();await until(()=>release);const token=Modes.captureIntent();global.VoyagrGeocodingOrchestration.bind({call:{showStatus:ctx.status,recordRecentDestination:()=>{}}});global.VoyagrGeocodingOrchestration.selectAutocompleteResult('end',54,-2,'New destination');expect(Modes.intentCurrent(token)).toBe(false);await release();expect(await pending).toBe(false);expect(pendingNames(await Off.loadActiveRouteRecord(idb))).toEqual(['pending']);
});
test('R8 pending abandonment blocks simulation/live/duplicate requests and timeout leaves offline restoration intact',async()=>{
 await stored();const original=rt.stageAbandonJourney;let release;rt.stageAbandonJourney=(...args)=>new Promise(resolve=>{release=()=>original(...args).then(resolve);});jest.useFakeTimers();
 const pending=Modes.abandonJourney();await flush();expect(Modes.startSimulation()).toBe(false);expect(await Modes.navigateFromGPS()).toBe(false);expect(await Modes.abandonJourney()).toBe(false);expect(rt.confirmPlanReplacement).toHaveBeenCalledTimes(1);
 jest.advanceTimersByTime(5000);expect(await pending).toBe(false);jest.useRealTimers();await release();await flush();jest.spyOn(navigator,'onLine','get').mockReturnValue(false);expect(pendingNames(await Off.loadActiveRouteRecord(idb))).toEqual(['pending']);expect(await Modes.navigateFromGPS()).toBe(false);
});
test('R8 cancellation after owned tombstone finalization rolls back only that owner',async()=>{
 await stored();const original=rt.stageAbandonJourney;rt.stageAbandonJourney=async(...args)=>{const handle=await original(...args),finalize=handle.finalize;handle.finalize=async guard=>{const ok=await finalize(guard);Modes.endpointChanged();return ok;};return handle;};
 expect(await Modes.abandonJourney()).toBe(false);expect(pendingNames(await Off.loadActiveRouteRecord(idb))).toEqual(['pending']);expect(Modes.getContinuation(old).intent.stops.map(s=>s.name)).toEqual(['pending']);
});
test.each(['legacy-helper','legacy-handle','malformed-handle'])('R8 %s journal cannot claim successful abandonment',async kind=>{
 await stored();const original=rt.stageAbandonJourney;
 if(kind==='legacy-helper')delete Off.ABANDONMENT_PROTOCOL;
 else rt.stageAbandonJourney=async(...args)=>{const handle=await original(...args);if(kind==='legacy-handle')delete handle.ABANDONMENT_PROTOCOL;else handle.finalize=Promise.resolve(true);return handle;};
 expect(await Modes.abandonJourney()).toBe(false);expect(pendingNames(await Off.loadActiveRouteRecord(idb))).toEqual(['pending']);expect(Modes.getContinuation(old).intent.stops.map(s=>s.name)).toEqual(['pending']);
});
test('R8 late abandonment stage cannot overwrite a newer journey after timeout',async()=>{
 await stored();const original=rt.stageAbandonJourney;let release;rt.stageAbandonJourney=(...args)=>new Promise(resolve=>{release=()=>original(...args).then(resolve);});jest.useFakeTimers();const pending=Modes.abandonJourney();await flush();jest.advanceTimersByTime(5000);expect(await pending).toBe(false);jest.useRealTimers();
 await Off.persistActiveRouteRecord(idb,Off.buildActiveRoutePersistRecord({routeData:next,polyline:next.polyline,steps:next.maneuvers}),null,null,(await Off.loadJourneyState(idb)).ownership);await release();await flush();expect((await Off.loadActiveRouteRecord(idb)).routeData.id).toBe('replacement');
});
test.each(['poi','parking','form-clear','waypoint'])('R7 %s production selection invalidates a pending GPS generation immediately',async kind=>{
 let release;calls.stageActiveRoute.mockImplementation(()=>new Promise(resolve=>{release=resolve;}));const pending=Modes.navigateFromGPS();await until(()=>release);const token=Modes.captureIntent();
 if(kind==='poi'){const owner=global.VoyagrPoiSearchOrchestration;owner.bind({poiSearch:()=>({POI_MODAL_ID:'poiModal',getPoiSelectDestinationStatusMessage:()=> 'Selected'}),call:{showStatus:ctx.status,calculateRoute:()=>{}}});owner.selectPOI(54,-2,'POI',53,-1);}
 if(kind==='parking'){document.body.insertAdjacentHTML('beforeend','<div id="parkingSection"></div><div id="parkingList"></div>');const owner=global.VoyagrParkingOrchestration;owner.bind({showStatus:ctx.status,getLastCalculatedRoute:()=>null,calculateRoute:async()=>{}});await owner.setParkingAsDestination({name:'Synthetic parking',lat:54,lon:-2});}
 if(kind==='form-clear'){global.VoyagrFormClearOrchestration.bind({call:{showStatus:ctx.status}});expect(global.VoyagrFormClearOrchestration.clearForm()).toBe(false);}
 if(kind==='waypoint'){const owner=global.VoyagrWaypointsOrchestration;owner.bind({waypoints:()=>require('../modules/navigation/waypoints.js'),call:{showStatus:ctx.status},getMap:()=>ctx.map,getMapLibreHelpers:()=>({createMarker:()=>({addTo(){return this;}})})});owner.addStop(54,-2,'Pending stop');expect(owner.getStops().at(-1).name).toBe('Pending stop');}
 expect(Modes.intentCurrent(token)).toBe(false);release(stage);expect(await pending).toBe(false);expect(window.lastCalculatedRoute).toBe(old);expect(Life.getRouteInProgress()).toBe(true);
});
test.each(['lifecycle','renderer'])('R7 cached legacy %s handover cannot bypass endpoint compatibility',async kind=>{
 delete (kind==='lifecycle'?Life:global.VoyagrRerouteMapOrchestration).ENDPOINT_INTENT_PROTOCOL;const before=ctx.snapshot();expect(await Modes.navigateFromGPS()).toBe(false);expect(ctx.snapshot()).toBe(before);expect(Life.startTurnByTurnNavigation(next)).toBe(false);
});
test('R8 cached legacy lifecycle cannot enter a destructive abandonment stop',async()=>{
 await stored();delete Life.PERSISTENCE_TRANSACTION_PROTOCOL;const before=ctx.snapshot();expect(await Modes.abandonJourney()).toBe(false);expect(ctx.snapshot()).toBe(before);expect(pendingNames(await Off.loadActiveRouteRecord(idb))).toEqual(['pending']);
});
test('R8 retired journey preview cannot silently restart completed visits',async()=>{
 await stored();expect(await Modes.abandonJourney()).toBe(true);rt.fetch.mockClear();expect(await Modes.navigateFromGPS()).toBe(false);expect(await Modes.startHere()).toBe(false);expect(rt.fetch).not.toHaveBeenCalled();expect(await Off.loadActiveRouteRecord(idb)).toBeNull();expect(Modes.getContinuation(old)).toBeNull();
});

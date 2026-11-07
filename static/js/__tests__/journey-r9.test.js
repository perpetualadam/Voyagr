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
function ownership(record){return Off.ownershipOf(record);}
async function rawWrite(record){return new Promise((resolve,reject)=>{const open=idb.open('voyagr-nav',2);open.onsuccess=()=>{const db=open.result,tx=db.transaction('active_route','readwrite');tx.objectStore('active_route').put(record);tx.oncomplete=()=>{db.close();resolve();};tx.onerror=tx.onabort=()=>reject(tx.error);};});}
async function newer(route=old){
 const continuation={identity:JSON.stringify([route.id,route.destination,route.geometry,route.maneuvers,route.journey_context]),intent:Plan.liveIntent(route,true,2),progressIndex:2};
 const handle=await Off.stageActiveRouteRecord(idb,Off.buildActiveRoutePersistRecord({routeData:route,polyline:AI.geometryPoints(route),steps:route.maneuvers,continuation}));expect(await handle.commit(()=>true)).toBe(true);return Off.loadActiveRouteRecord(idb);
}
function assertPending(record){expect(Off.ownershipOf(record)).not.toBeNull();expect(record.continuation.progressIndex).toBe(1);expect(pendingNames(record)).toEqual(['pending']);expect(Modes.getContinuation(old).intent.stops.map(s=>s.name)).toEqual(['pending']);expect(Life.getRouteInProgress()).toBe(false);}
test('R9 identical content has distinct durable identities; progress saves preserve journey identity but change writer identity',async()=>{
 const a=Off.buildActiveRoutePersistRecord({routeData:old}),b=Off.buildActiveRoutePersistRecord({routeData:old});expect(a.journey_id).not.toBe(b.journey_id);expect(a.persistence_owner).not.toBe(b.persistence_owner);
 await stored();const first=await Off.loadActiveRouteRecord(idb);expect(OffApp.getJourneyOwnership()).toEqual(ownership(first));Life.setLastSnappedRouteIndex(2);expect(await OffApp.persistJourneySnapshot(old,Modes.getContinuation(old))).toBe(true);const second=await Off.loadActiveRouteRecord(idb);
 expect(second.journey_id).toBe(first.journey_id);expect(second.persistence_owner).not.toBe(first.persistence_owner);expect(second.continuation.progressIndex).toBe(2);expect(second.continuation.intent.stops).toEqual([]);expect(Modes.getContinuation(old).intent.stops).toEqual([]);expect(OffApp.getJourneyOwnership()).toEqual(ownership(second));
});
test.each(['identical-route','different-route','identical-destination-and-stops'])('R9 %s newer owner before checkpoint is never adopted or retired',async kind=>{
 await stored();const expected=OffApp.getJourneyOwnership(),original=rt.stageAbandonJourney;let release,captured;
 rt.stageAbandonJourney=(...args)=>{captured=args[3];return new Promise(resolve=>{release=()=>original(...args).then(resolve);});};const pending=Modes.abandonJourney();await until(()=>release);
 const route=kind==='different-route'?next:JSON.parse(JSON.stringify(old));if(kind==='identical-destination-and-stops'){route.id='another-provider-alternative';}
 const fresh=await newer(route);expect(fresh.journey_id).not.toBe(expected.journey_id);expect(fresh.persistence_owner).not.toBe(expected.persistence_owner);expect(fresh.continuation.intent.stops).toEqual([]);await release();expect(await pending).toBe(false);
 expect(captured).toEqual(expected);expect(Object.isFrozen(captured)).toBe(true);expect(await Off.loadActiveRouteRecord(idb)).toEqual(fresh);expect(OffApp.getJourneyOwnership()).toEqual(expected);expect(Modes.getState()).toBe('RECOVERY_REQUIRED');expect(Life.getRouteInProgress()).toBe(false);expect(Modes.getContinuation(old).intent.stops.map(s=>s.name)).toEqual(['pending']);rt.fetch.mockClear();expect(await Modes.navigateFromGPS()).toBe(false);expect(rt.fetch).not.toHaveBeenCalled();
});
test.each(['staging','promotion','finalization'])('R9 owner change during %s survives stale mutation and rollback',async phase=>{
 await stored();const original=rt.stageAbandonJourney;let fresh;
 rt.stageAbandonJourney=async(...args)=>{const handle=await original(...args);if(phase==='staging'){fresh=await newer();return handle;}
  const name=phase==='promotion'?'commit':'finalize',work=handle[name];handle[name]=async guard=>{fresh=await newer();return work(guard);};return handle;
 };
 expect(await Modes.abandonJourney()).toBe(false);expect(await Off.loadActiveRouteRecord(idb)).toEqual(fresh);expect(fresh.continuation.intent.stops).toEqual([]);expect(OffApp.getJourneyOwnership()).not.toEqual(ownership(fresh));expect(Modes.getState()).toBe('RECOVERY_REQUIRED');expect(Life.getRouteInProgress()).toBe(false);expect(Modes.getContinuation(old).intent.stops.map(s=>s.name)).toEqual(['pending']);
});
test.each(['staging','promotion','finalization'])('R9 actual %s transaction abort preserves owned canonical continuation',async phase=>{
 await stored();const expected=OffApp.getJourneyOwnership(),proto=require('fake-indexeddb').IDBDatabase.prototype,original=proto.transaction;let count=0;
 jest.spyOn(proto,'transaction').mockImplementation(function(...args){const tx=original.apply(this,args);if(args[1]==='readwrite'&&++count===['staging','promotion','finalization'].indexOf(phase)+1)queueMicrotask(()=>tx.abort());return tx;});
 expect(await Modes.abandonJourney()).toBe(false);const record=await Off.loadActiveRouteRecord(idb);assertPending(record);expect(record.journey_id).toBe(expected.journey_id);expect(OffApp.getJourneyOwnership()).toEqual(ownership(record));
});
test('R9 interrupted journal reload captures proven raw owner without changing the logical journey',async()=>{
 await stored();const before=OffApp.getJourneyOwnership(),handle=await OffApp.stageAbandonJourney(old,Modes.getContinuation(old),()=>true,before);expect(await handle.commit(()=>true)).toBe(true);const state=await Off.loadJourneyState(idb);expect(state.ownership.journey_id).toBe(before.journey_id);expect(state.ownership.persistence_owner).not.toBe(before.persistence_owner);expect(pendingNames(state.route)).toEqual(['pending']);
 Life.setRouteInProgress(false);let freshService,freshMode;jest.isolateModules(()=>{freshService=require('../app/offline-navigation-orchestration.js');freshMode=require('../app/journey-modes.js');});freshService.bind({offlineNavigation:()=>Off,getRouteInProgress:()=>false});const loaded=await freshService.loadPersistedRoute();expect(freshService.getJourneyOwnership()).toEqual(state.ownership);
 const restored=require('../modules/navigation/route-selection.js').buildRoutePayloadFromPersisted(loaded,require('../modules/navigation/polyline-codec.js').encodePolyline);window.lastCalculatedRoute=restored;Compare.setRouteOptions([restored]);rt.stageAbandonJourney=freshService.stageAbandonJourney;freshMode.bind(rt);Modes=freshMode;expect(Modes.getContinuation(restored).intent.stops.map(s=>s.name)).toEqual(['pending']);expect(AI.prepareNavigationCandidate(restored)).toBeNull();
 expect(await Modes.abandonJourney()).toBe(true);const retired=await Off.loadJourneyState(idb);expect(retired.route).toBeNull();expect(retired.ownership.journey_id).toBe(before.journey_id);expect(Modes.getContinuation(restored)).toBeNull();expect(Life.getRouteInProgress()).toBe(false);
});
test.each(['missing-journey-id','missing-writer-id','malformed-identity'])('R9 legacy %s is inspectable but cannot supply abandonment ownership',async kind=>{
 await stored();const legacy=await Off.loadActiveRouteRecord(idb);if(kind==='missing-journey-id')delete legacy.journey_id;if(kind==='missing-writer-id')delete legacy.persistence_owner;if(kind==='malformed-identity')legacy.journey_id='old';await rawWrite(legacy);Life.setRouteInProgress(false);
 let service;jest.isolateModules(()=>{service=require('../app/offline-navigation-orchestration.js');});service.bind({offlineNavigation:()=>Off,getRouteInProgress:()=>false});expect((await service.loadPersistedRoute()).routeData.id).toBe('old');expect(service.getJourneyOwnership()).toBeNull();rt.stageAbandonJourney=service.stageAbandonJourney;
 expect(await Modes.abandonJourney()).toBe(false);expect(await Off.loadActiveRouteRecord(idb)).toEqual(legacy);expect(Modes.getContinuation(old).intent.stops.map(s=>s.name)).toEqual(['pending']);expect(await Off.clearActiveRouteRecord(idb)).toBe(false);
});
test('R9 captured expected identity is immutable even if the caller later changes its object',async()=>{
 await stored();const expected=OffApp.getJourneyOwnership(),copy={...expected};const work=OffApp.stageAbandonJourney(old,Modes.getContinuation(old),()=>true,copy);copy.journey_id='changed';copy.persistence_owner='changed';const handle=await work;expect(handle).not.toBeNull();expect(await handle.rollback(()=>true)).toBe(true);expect((await Off.loadActiveRouteRecord(idb)).journey_id).toBe(expected.journey_id);
});
test('R9 retirement and repeated attempts preserve journey id; tombstones grant no navigation permission',async()=>{
 await stored();const expected=OffApp.getJourneyOwnership();expect(await Modes.abandonJourney()).toBe(true);const first=await Off.loadJourneyState(idb);expect(first.route).toBeNull();expect(first.ownership.journey_id).toBe(expected.journey_id);expect(first.ownership.persistence_owner).not.toBe(expected.persistence_owner);expect(Modes.getContinuation(old)).toBeNull();
 expect(await Modes.abandonJourney()).toBe(true);const second=await Off.loadJourneyState(idb);expect(second.route).toBeNull();expect(second.ownership.journey_id).toBe(expected.journey_id);expect(OffApp.getJourneyOwnership()).toEqual(second.ownership);expect(await Off.clearActiveRouteRecord(idb,expected)).toBe(false);expect(await Modes.startHere()).toBe(false);expect(await Modes.navigateFromGPS()).toBe(false);expect(Life.getRouteInProgress()).toBe(false);
});
test('R9 stale background snapshot and lifecycle clear cannot overwrite or delete a newer owner',async()=>{
 await stored();const original=Off.persistActiveRouteRecord,expected=OffApp.getJourneyOwnership();let release;
 Off.persistActiveRouteRecord=(...args)=>new Promise(resolve=>{release=()=>original(...args).then(resolve);});const stale=OffApp.persistJourneySnapshot(old,Modes.getContinuation(old));Off.persistActiveRouteRecord=original;const fresh=await newer();await release();expect(await stale).toBe(false);expect(await Off.loadActiveRouteRecord(idb)).toEqual(fresh);await OffApp.clearPersistedRoute();expect(await Off.loadActiveRouteRecord(idb)).toEqual(fresh);expect(OffApp.getJourneyOwnership()).toEqual(expected);expect(fresh.continuation.intent.stops).toEqual([]);
});
test('R9 final presentation failure does not roll back completed durable retirement',async()=>{
 await stored();const expected=OffApp.getJourneyOwnership();rt.showStatus=message=>{if(message==='Previous journey explicitly ended.')throw Error('status failure');};expect(await Modes.abandonJourney()).toBe(true);const state=await Off.loadJourneyState(idb);expect(state.route).toBeNull();expect(state.ownership.journey_id).toBe(expected.journey_id);expect(Modes.getContinuation(old)).toBeNull();expect(OffApp.getJourneyOwnership()).toEqual(state.ownership);expect(Life.getRouteInProgress()).toBe(false);
});
test('R9 late staging timeout cannot refresh its captured owner or mutate a newer journey',async()=>{
 await stored();const expected=OffApp.getJourneyOwnership(),original=rt.stageAbandonJourney;let release,captured;
 rt.stageAbandonJourney=(...args)=>{captured=args[3];return new Promise(resolve=>{release=()=>original(...args).then(resolve);});};jest.useFakeTimers();const pending=Modes.abandonJourney();await flush();jest.advanceTimersByTime(5000);expect(await pending).toBe(false);jest.useRealTimers();const fresh=await newer();await release();await flush();expect(captured).toEqual(expected);expect(OffApp.getJourneyOwnership()).toEqual(expected);expect(await Off.loadActiveRouteRecord(idb)).toEqual(fresh);expect(fresh.continuation.progressIndex).toBe(2);expect(Modes.getContinuation(old).intent.stops.map(s=>s.name)).toEqual(['pending']);expect(Life.getRouteInProgress()).toBe(false);
});
test('R9 failed rollback retains a recoverable owned journal and explicitly blocks further live starts',async()=>{
 await stored();const expected=OffApp.getJourneyOwnership(),original=rt.stageAbandonJourney;rt.stageAbandonJourney=async(...args)=>{const handle=await original(...args);handle.finalize=async()=>false;handle.rollback=async()=>{throw Error('rollback unavailable');};return handle;};expect(await Modes.abandonJourney()).toBe(false);
 const state=await Off.loadJourneyState(idb);expect(state.ownership.journey_id).toBe(expected.journey_id);assertPending(state.route);expect(Modes.getState()).toBe('RECOVERY_REQUIRED');rt.fetch.mockClear();expect(await Modes.navigateFromGPS()).toBe(false);expect(rt.fetch).not.toHaveBeenCalled();expect(AI.prepareNavigationCandidate(require('../modules/navigation/route-selection.js').buildRoutePayloadFromPersisted(state.route,require('../modules/navigation/polyline-codec.js').encodePolyline))).toBeNull();
});
test('R9 a newer journey committed after retirement finalization survives the old completion',async()=>{
 await stored();const expected=OffApp.getJourneyOwnership(),original=rt.stageAbandonJourney;let fresh;rt.stageAbandonJourney=async(...args)=>{const handle=await original(...args),finalize=handle.finalize;handle.finalize=async guard=>{const ok=await finalize(guard);fresh=await newer();return ok;};return handle;};expect(await Modes.abandonJourney()).toBe(true);expect(await Off.loadActiveRouteRecord(idb)).toEqual(fresh);expect(fresh.journey_id).not.toBe(expected.journey_id);expect(Modes.getContinuation(old)).toBeNull();expect(Life.getRouteInProgress()).toBe(false);
});
test.each(['service','lifecycle','renderer'])('R9 legacy %s cannot bypass the durable ownership contract',async kind=>{
 const target=kind==='service'?OffApp:kind==='lifecycle'?Life:global.VoyagrRerouteMapOrchestration;delete target.DURABLE_OWNERSHIP_PROTOCOL;expect(Modes.endpointIntentCompatible()).toBe(false);const before=ctx.snapshot();expect(await Modes.navigateFromGPS()).toBe(false);expect(ctx.snapshot()).toBe(before);expect(Life.startTurnByTurnNavigation(next)).toBe(false);
});
test('R9 an unowned inspection selection cannot relabel or retire the locally owned durable journey',async()=>{
 await stored();const record=await Off.loadActiveRouteRecord(idb),expected=OffApp.getJourneyOwnership();Modes.getContinuation(old);Life.stopTurnByTurnNavigation({preservePersistedJourney:true});window.lastCalculatedRoute=next;Compare.setRouteOptions([next]);
 expect(await Modes.abandonJourney()).toBe(false);expect(await Off.loadActiveRouteRecord(idb)).toEqual(record);expect(OffApp.getJourneyOwnership()).toEqual(expected);expect(Modes.getState()).toBe('RECOVERY_REQUIRED');expect(Modes.getContinuation(old).intent.stops.map(s=>s.name)).toEqual(['pending']);expect(Life.getRouteInProgress()).toBe(false);
});
test('R9 omitted or stale expected ownership never permits a low-level overwrite or clear',async()=>{
 await stored();const oldRecord=await Off.loadActiveRouteRecord(idb),fresh=await newer();expect(await Off.persistActiveRouteRecord(idb,oldRecord)).toBe(false);expect(await Off.persistActiveRouteRecord(idb,oldRecord,null,null,ownership(oldRecord))).toBe(false);expect(await Off.clearActiveRouteRecord(idb)).toBe(false);expect(await Off.clearActiveRouteRecord(idb,ownership(oldRecord))).toBe(false);expect(await Off.loadActiveRouteRecord(idb)).toEqual(fresh);expect(fresh.continuation.intent.stops).toEqual([]);expect(OffApp.getJourneyOwnership()).toEqual(ownership(oldRecord));
});

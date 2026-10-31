let AI,Plan,Modes,Life,Compare,Calc,Location,Geo,Off,OffApp,ctx,old,next,modeRt,calcRt,idb,priorIDB,timers,confirm;
function continuationContext(route,stops){return {version:1,purpose:'planning',origin:{kind:'map',coordinates:route.polyline[0]},destination:{kind:'searched',coordinates:route.polyline.at(-1)},ordered_stops:stops};}
function marker(){const el=document.createElement('i');return {addTo(){document.body.append(el);return this;},bindPopup(){return this;},remove(){el.remove();},getElement:()=>el};}
async function flush(){for(let i=0;i<20;i++)await Promise.resolve();}
beforeEach(()=>{
 jest.resetModules();jest.useRealTimers();localStorage.clear();delete global.VoyagrJourneyModes;delete global.VoyagrNavigationSafetyUX;
 priorIDB=global.indexedDB;idb=new (require('fake-indexeddb').IDBFactory)();global.indexedDB=idb;
 AI=require('../modules/navigation/avoidance-integrity.js');Plan=require('../modules/navigation/journey-plan.js');Life=require('../app/navigation-lifecycle-orchestration.js');Compare=require('../app/route-comparison-orchestration.js');Calc=require('../app/calculate-route-orchestration.js');Location=require('../app/location-orchestration.js');Geo=require('../app/geocoding-orchestration.js');
 Off=require('../modules/navigation/offline-navigation.js');OffApp=require('../app/offline-navigation-orchestration.js');OffApp.bind({offlineNavigation:()=>Off});
 const {makeRoute,bindTransition,bindStart}=require('./fixtures/navigation-transition.cjs');
 old=makeRoute('old',[[53,-1],[53.001,-1],[53.002,-1],[53.01,-1]]);old.polyline=AI.geometryPoints(old);old.journey_context=continuationContext(old,[{coordinates:[53.001,-1],kind:'map',name:'completed'},{coordinates:[53.002,-1],kind:'gps',name:'pending'}]);
 old.leg_geometry_ranges=[{begin_shape_index:0,end_shape_index:1},{begin_shape_index:1,end_shape_index:2},{begin_shape_index:2,end_shape_index:3}];Life.setRoutePolyline(old.polyline);Life.setCurrentRouteSteps(old.maneuvers);ctx=bindTransition();
 bindStart(ctx,{setInitialETAMovementRetries:()=>{},call:{clearPersistedRoute:jest.fn(),stageActiveRoute:route=>OffApp.stageActiveRoute(route)}});
 Compare.setRouteOptions([old]);window.lastCalculatedRoute=old;Life.setLastSnappedRouteIndex(1);Life.setRouteInProgress(true);
 next=makeRoute('planned',[[54,-1],[54.01,-1]]);next.polyline=AI.geometryPoints(next);next.journey_context=continuationContext(next,[]);next.destination='54.01,-1';next.destinationName='New destination';next.avoidance_assessment.origin_integrity.requested_origin=[54,-1];next.avoidance_assessment.automatic_selection_allowed=true;
 document.body.innerHTML='<input id="start" value="New origin"><input id="end" value="New destination"><p id="journeyModeStatus"></p><div id="journeyModeChooser"></div><div id="simulationControls"><strong id="simulationIndicator"></strong></div><p id="simulationProgress"></p>';
 global.VoyagrJourneyPlan=Plan;global.VoyagrAvoidanceIntegrity=AI;global.VoyagrServiceWorkerOrchestration={getUpdatePending:()=>false};
 Modes=require('../app/journey-modes.js');let fix=null;confirm=jest.fn(()=>true);
 modeRt={replacementProtocol:1,selected:()=>require('../modules/navigation/route-selection.js').mergeNavigationRouteFromSelected(window.lastCalculatedRoute,Compare.getRouteOptions(),Compare.getSelectedRouteIndex()),
 isLive:Life.getRouteInProgress,activeGeometry:Life.getRoutePolyline,progressIndex:Life.getLastSnappedRouteIndex,options:Compare.getRouteOptions,setOptions:Compare.setRouteOptions,index:Compare.getSelectedRouteIndex,setIndex:Compare.setSelectedRouteIndex,
 stopLive:options=>Life.stopTurnByTurnNavigation(options),startLive:Life.startTurnByTurnNavigation,stopGps:jest.fn(),getFix:()=>fix,acceptPosition:p=>{fix={lat:p.coords.latitude,lon:p.coords.longitude,accuracy:p.coords.accuracy,timestamp:p.timestamp};return true;},
 map:()=>ctx.map,helpers:()=>ctx.mapHelpers,showStatus:ctx.status,buildRequest:()=>({avoid_caz:false}),fetch:jest.fn(async()=>({ok:false})),resolveDestination:jest.fn(),simulationMarker:()=>marker().addTo(),
 confirmPlanReplacement:confirm,persistPreviousJourney:OffApp.persistJourneySnapshot,stagePlanningJourney:route=>OffApp.stageActiveRoute(route,{planning:true}),clearJourneyPersistence:OffApp.clearJourneyPersistence};
 Modes.bind(modeRt);global.VoyagrGpsOrchestration={getAcceptedOriginFix:()=>fix};navigator.geolocation.getCurrentPosition=jest.fn(ok=>ok({timestamp:Date.now(),coords:{latitude:53.0015,longitude:-1,accuracy:5}}));
 ctx.mapHelpers.createCircleMarker=jest.fn(()=>marker());let startMarker=null,endMarker=null;
 calcRt={routingRequest:()=>require('../modules/navigation/routing-request.js'),routeSelection:()=>require('../modules/navigation/route-selection.js'),geocodingLocations:()=>require('../modules/navigation/geocoding-locations.js'),routeSharing:()=>require('../modules/navigation/route-sharing.js'),routeProgress:()=>require('../modules/navigation/route-progress.js'),
 getRouteInProgress:Life.getRouteInProgress,getIsGeocoding:()=>false,getCurrentRoutingMode:()=> 'auto',getCurrentVehicleType:()=> 'petrol_diesel',getIsTrackingActive:()=>true,getTrackingHistory:()=>[{}],getCurrentLat:()=>53.0015,getCurrentLon:()=>-1,
 getMap:()=>ctx.map,getMapLibreHelpers:()=>ctx.mapHelpers,getRouteOptions:Compare.getRouteOptions,setRouteOptions:Compare.setRouteOptions,getSelectedRouteIndex:Compare.getSelectedRouteIndex,setSelectedRouteIndex:Compare.setSelectedRouteIndex,
 getRouteLayer:ctx.runtime.getRouteLayer,setRouteLayer:ctx.runtime.setRouteLayer,getRoutePolyline:Life.getRoutePolyline,setRoutePolyline:Life.setRoutePolyline,getStartMarker:()=>startMarker,setStartMarker:x=>{startMarker=x;},getEndMarker:()=>endMarker,setEndMarker:x=>{endMarker=x;},
 call:{showStatus:ctx.status,geocodeLocations:jest.fn(async()=>({start:'54,-1',end:'54.01,-1'})),getViaPoints:()=>[],getStops:()=>[],getRouteCostParams:()=>({}),isAvoidTollsEnabled:()=>false,getRoutePreferences:()=>({}),decodePolyline:require('../modules/navigation/polyline-codec.js').decodePolyline,convertDistance:String,getDistanceUnit:()=> 'km',getCurrencySymbol:()=> 'GBP',updateTripInfo:jest.fn(),showRoutePreview:jest.fn(),updateARButtonVisibility:jest.fn(),updateRoadReportFabVisibility:jest.fn(),sendNotification:jest.fn(),recordRecentDestination:jest.fn(),displayMultiDropLegs:jest.fn(),displayHazardMarkers:jest.fn()}};
 Calc.bind(calcRt);Geo.bind({call:{showStatus:ctx.status,recordRecentDestination:()=>{}}});Location.bind({call:{showStatus:ctx.status},getStartMarker:()=>null,getEndMarker:()=>null,getRouteLayer:()=>null});
 jest.spyOn(global,'fetch').mockImplementation(async()=>({ok:true,status:200,headers:{get:()=> 'application/json'},json:async()=>({success:true,source:'GraphHopper',routes:[JSON.parse(JSON.stringify(next))],geometry:next.geometry,geometry_precision:6,distance:'1 km',time:'2 minutes'})}));
 timers=jest.spyOn(global,'setTimeout');
});
afterEach(()=>{Modes.exit();Life.setRouteInProgress(false);AI.invalidate();timers.mock.results.forEach(result=>{if(result.type==='return')clearTimeout(result.value);});jest.restoreAllMocks();global.indexedDB=priorIDB;delete global.VoyagrJourneyModes;delete global.VoyagrGpsOrchestration;delete global.VoyagrServiceWorkerOrchestration;});
function stopRequests(){return modeRt.fetch.mock.calls.map(call=>JSON.parse(call[1].body).stops.map(stop=>stop.name));}

test.each(['validation','missing-endpoint','geocoding','routing','assessment','candidate','cancelled'])('R5 failed %s planning retains active context and completed-stop continuation',async kind=>{
 if(kind==='validation')calcRt.getIsGeocoding=()=>true;
 if(kind==='missing-endpoint')document.getElementById('end').value='';
 if(kind==='geocoding')calcRt.call.geocodeLocations.mockResolvedValue(null);
 if(kind==='routing')global.fetch.mockResolvedValue({ok:false,status:503,headers:{get:()=> 'application/json'},text:async()=> 'unavailable'});
 if(kind==='assessment')next.avoidance_assessment.automatic_selection_allowed=false;
 if(kind==='candidate')next.maneuvers=[];
 if(kind==='cancelled')calcRt.call.geocodeLocations.mockImplementation(async()=>{Modes.endpointChanged('end');return {start:'54,-1',end:'54.01,-1'};});
 const before=ctx.snapshot();await Calc.calculateRoute();expect(ctx.snapshot()).toBe(before);expect(confirm).not.toHaveBeenCalled();
 for(let i=0;i<2;i++)expect(await Modes.navigateFromGPS()).toBe(false);expect(stopRequests()).toEqual([['pending'],['pending']]);
});
test('R5 successful UI calculation commits the new manual plan, retires old continuation and keeps persisted restoration inspection-only',async()=>{
 expect(await Calc.calculateRoute()).toBe(true);expect(confirm).toHaveBeenCalledTimes(1);expect(Life.getRouteInProgress()).toBe(false);expect(window.lastCalculatedRoute.id).toBe('planned');expect(Life.getRoutePolyline()).toEqual(next.polyline);
 const record=await Off.loadActiveRouteRecord(idb);expect(record.routeData.id).toBe('planned');expect(record.planning_pending).toBeUndefined();expect(Modes.getContinuation(modeRt.selected())).toBeNull();
 const restored=require('../modules/navigation/route-selection.js').buildRoutePayloadFromPersisted(record,require('../modules/navigation/polyline-codec.js').encodePolyline);expect(AI.prepareNavigationCandidate(restored)).toBeNull();
 expect(JSON.parse(global.fetch.mock.calls[0][1].body).start).toBe('54,-1');
});
test('R5 declining deliberate replacement leaves durable and active continuation intact',async()=>{
 confirm.mockReturnValue(false);const before=ctx.snapshot();await Calc.calculateRoute();expect(ctx.snapshot()).toBe(before);expect(Modes.getContinuation(old).intent.stops.map(s=>s.name)).toEqual(['pending']);
});
test('R5 unfinalized planning journal reads previous continuation; rollback cannot delete a newer owner',async()=>{
 const oldRecord=Off.buildActiveRoutePersistRecord({routeData:old,polyline:old.polyline,steps:old.maneuvers,continuation:Modes.getContinuation(old)});await Off.persistActiveRouteRecord(idb,oldRecord);
 const pending=await Off.stageActiveRouteRecord(idb,Off.buildActiveRoutePersistRecord({routeData:next,polyline:next.polyline,steps:next.maneuvers}),{planning:true});expect(await pending.commit(()=>true)).toBe(true);
 expect((await Off.loadActiveRouteRecord(idb)).routeData.id).toBe('old');
 const restored=require('../modules/navigation/route-selection.js').buildRoutePayloadFromPersisted(await Off.loadActiveRouteRecord(idb),require('../modules/navigation/polyline-codec.js').encodePolyline);Life.stopTurnByTurnNavigation();window.lastCalculatedRoute=restored;Compare.setRouteOptions([restored]);Modes.bind({...modeRt,selected:()=>restored});
 expect(Modes.getContinuation(restored).intent.stops.map(s=>s.name)).toEqual(['pending']);
 await Off.persistActiveRouteRecord(idb,Off.buildActiveRoutePersistRecord({routeData:{...next,id:'newer'},polyline:next.polyline}));expect(await pending.rollback(()=>true)).toBe(false);expect((await Off.loadActiveRouteRecord(idb)).routeData.id).toBe('newer');
});

function liveResponse(){const route=JSON.parse(JSON.stringify(next));route.geometry=require('../modules/navigation/polyline-codec.js').encodePolyline([[53.0015,-1],[53.002,-1],[53.01,-1]],6);route.polyline=AI.geometryPoints(route);route.destination='53.01,-1';route.journey_context=continuationContext(route,[old.journey_context.ordered_stops[1]]);route.leg_geometry_ranges=[{begin_shape_index:0,end_shape_index:1},{begin_shape_index:1,end_shape_index:2}];route.avoidance_assessment.origin_integrity.requested_origin=[53.0015,-1];route.avoidance_assessment.geometry_binding=AI.geometryBinding(route);return {ok:true,json:async()=>({success:true,routes:[route]})};}
function edit(){Geo.selectAutocompleteResult('end',55,-2,'Newest destination','searched');}
test.each(['gps','routing','assessment','staging','mount','paired-setter'])('R6 destination change during %s cancels the captured generation and preserves reversible guidance',async phase=>{
 modeRt.fetch.mockImplementation(async()=>liveResponse());let release;
 if(phase==='gps')navigator.geolocation.getCurrentPosition.mockImplementationOnce(ok=>{release=()=>ok({timestamp:Date.now(),coords:{latitude:53.0015,longitude:-1,accuracy:5}});});
 if(phase==='routing')modeRt.fetch.mockImplementationOnce(()=>new Promise(resolve=>{release=()=>resolve(liveResponse());}));
 if(phase==='assessment')modeRt.fetch.mockImplementationOnce(async()=>({ok:true,json:()=>new Promise(resolve=>{release=async()=>resolve(await liveResponse().json());})}));
 if(phase==='staging'){
  const stage=OffApp.stageActiveRoute;OffApp.stageActiveRoute=route=>new Promise(resolve=>{release=async()=>resolve(await stage(route));});
 }
 if(phase==='mount'){ctx.addPolyline.mockImplementationOnce((...args)=>{edit();return window.MapLibreHelpers.addPolyline(...args);});}
 if(phase==='paired-setter'){const original=ctx.runtime.setCurrentRouteSteps;ctx.runtime.setCurrentRouteSteps=value=>{original(value);if(value!==old.maneuvers)edit();};}
 const before=ctx.snapshot(),token=Modes.captureIntent();const pending=Modes.navigateFromGPS();await flush();
 if(release){edit();await release();}
 expect(await pending).toBe(false);expect(Modes.intentCurrent(token)).toBe(false);expect(window.lastCalculatedRoute).toBe(old);expect(Life.getRouteInProgress()).toBe(true);expect(Life.getLastSnappedRouteIndex()).toBe(1);expect(ctx.snapshot()).toBe(before);expect(document.getElementById('end').value).toBe('Newest destination');
});
test('R6 cancellation aborts an owned pending IndexedDB promotion and cannot promote after the edit',async()=>{
 modeRt.fetch.mockImplementation(async()=>liveResponse());const original=OffApp.stageActiveRoute;let release,handle;
 OffApp.stageActiveRoute=async route=>{handle=await original(route);const commit=handle.commit;handle.commit=guard=>new Promise(resolve=>{release=async()=>resolve(await commit(guard));});return handle;};
 const pending=Modes.navigateFromGPS();for(let i=0;i<30&&!release;i++)await new Promise(resolve=>setTimeout(resolve,1));expect(release).toBeDefined();edit();await release();expect(await pending).toBe(false);expect(Life.getRouteInProgress()).toBe(false);expect((await Off.loadActiveRouteRecord(idb))?.routeData.id).not.toBe('planned');
});
test('R6 old request tickets cannot adopt a newer endpoint generation',()=>{
 const ticket=AI.begin(localStorage),token=Modes.captureIntent();edit();expect(Modes.intentCurrent(token)).toBe(false);expect(AI.current(ticket,localStorage)).toBe(false);const data={routes:[next]};AI.tag(data,ticket);expect(AI.responseCurrent(data,localStorage)).toBe(false);expect(data.avoidance_intent_token).toBe(token);
});
test.each(['stage','promotion','finalization'])('R5 %s failure retains durable canonical pending visits',async phase=>{
 const original=modeRt.stagePlanningJourney;modeRt.stagePlanningJourney=async route=>{
  if(phase==='stage')throw Error('stage failed');const handle=await original(route);handle[phase==='promotion'?'commit':'finalize']=async()=>false;return handle;
 };
 expect(await Calc.calculateRoute()).not.toBe(true);expect((await Off.loadActiveRouteRecord(idb)).continuation.intent.stops.map(s=>s.name)).toEqual(['pending']);expect(Modes.getContinuation(old).intent.stops.map(s=>s.name)).toEqual(['pending']);
 modeRt.fetch.mockResolvedValue({ok:false});expect(await Modes.navigateFromGPS()).toBe(false);expect(stopRequests().at(-1)).toEqual(['pending']);
});
test('R5 deliberate abandonment is distinct, confirmed, and clears durable continuation only on success',async()=>{
 await OffApp.persistJourneySnapshot(old,Modes.getContinuation(old));confirm.mockReturnValue(false);expect(await Modes.abandonJourney()).toBe(false);expect(Life.getRouteInProgress()).toBe(true);
 confirm.mockReturnValue(true);const stop=modeRt.stopLive;modeRt.stopLive=jest.fn(stop);const clear=modeRt.clearJourneyPersistence;modeRt.clearJourneyPersistence=async()=>{throw Error('storage unavailable');};expect(await Modes.abandonJourney()).toBe(false);expect(Modes.getContinuation(old).intent.stops.map(s=>s.name)).toEqual(['pending']);
 expect(modeRt.stopLive).toHaveBeenCalledWith({preservePersistedJourney:true});expect((await Off.loadActiveRouteRecord(idb)).continuation.intent.stops.map(s=>s.name)).toEqual(['pending']);
 modeRt.clearJourneyPersistence=clear;expect(await Modes.abandonJourney()).toBe(true);expect(await Off.loadActiveRouteRecord(idb)).toBeNull();expect(Modes.getContinuation(old)).toBeNull();
});
test('R5 progress crossing a stop during pending planning cannot resurrect it in memory or durable continuation',async()=>{
 const original=modeRt.stagePlanningJourney;modeRt.stagePlanningJourney=async route=>{const handle=await original(route);Life.setLastSnappedRouteIndex(2);return handle;};
 expect(await Calc.calculateRoute()).not.toBe(true);expect(Life.getRouteInProgress()).toBe(true);expect(window.lastCalculatedRoute).toBe(old);expect(Modes.getContinuation(old).intent.stops).toEqual([]);expect((await Off.loadActiveRouteRecord(idb)).continuation.intent.stops).toEqual([]);
});
test.each(['map','searched','coordinates','swap','saved-restore'])('R6 %s endpoint path invalidates a routing intent before its old response',async kind=>{
 let release;modeRt.fetch.mockImplementationOnce(()=>new Promise(resolve=>{release=()=>resolve(liveResponse());}));const pending=Modes.navigateFromGPS();await flush();expect(release).toBeDefined();
 if(kind==='map'||kind==='searched')Geo.selectAutocompleteResult('end',55,-2,'New destination',kind);
 if(kind==='coordinates'){const el=document.getElementById('end');el.value='55,-2';el.dispatchEvent(new Event('input',{bubbles:true}));}
 if(kind==='swap')Location.swapStartAndDestination();
 if(kind==='saved-restore'){const Preview=require('../app/route-preview-orchestration.js');Preview.bind({getRouteInProgress:Life.getRouteInProgress});expect(Preview.showRestoredRoutePreview({navigation_resume_requires_fresh_gps:true})).toBe(false);}
 release();expect(await pending).toBe(false);expect(window.lastCalculatedRoute).toBe(old);expect(Life.getRouteInProgress()).toBe(true);
});
test.each(['lifecycle','renderer'])('R6 mixed legacy %s intent implementation cannot authorize a replacement',async part=>{
 modeRt.fetch.mockImplementation(async()=>liveResponse());delete (part==='lifecycle'?Life:global.VoyagrRerouteMapOrchestration).INTENT_OWNERSHIP_PROTOCOL;const before=ctx.snapshot();expect(await Modes.navigateFromGPS()).toBe(false);expect(ctx.snapshot()).toBe(before);
});
test('R5 legacy mode coordinator cannot destructively begin a new planning transaction',async()=>{
 const before=ctx.snapshot(),legacy={beforePlanning:jest.fn()};global.VoyagrJourneyModes=legacy;await Calc.calculateRoute();expect(legacy.beforePlanning).not.toHaveBeenCalled();expect(ctx.snapshot()).toBe(before);global.VoyagrJourneyModes=Modes;
});
test('R6 initial live startup rechecks the generation after delayed persistence',async()=>{
 Life.stopTurnByTurnNavigation();modeRt.fetch.mockImplementation(async()=>liveResponse());let release;
 const {bindStart}=require('./fixtures/navigation-transition.cjs');bindStart(ctx,{setInitialETAMovementRetries:()=>{},call:{persistActiveRoute:()=>new Promise(resolve=>{release=()=>resolve(true);})}});
 const pending=Modes.navigateFromGPS();await flush();expect(release).toBeDefined();edit();release();expect(await pending).toBe(false);expect(Life.getRouteInProgress()).toBe(false);expect(Life.getRouteStarted()).toBe(false);
});
test('R5 stale manual response after endpoint edits cannot commit or erase durable continuation',async()=>{
 await OffApp.persistJourneySnapshot(old,Modes.getContinuation(old));let release;global.fetch.mockImplementationOnce(()=>new Promise(resolve=>{release=()=>resolve({ok:true,headers:{get:()=> 'application/json'},json:async()=>({success:true,routes:[next]})});}));
 const pending=Calc.calculateRoute();await flush();expect(release).toBeDefined();edit();release();expect(await pending).not.toBe(true);expect(window.lastCalculatedRoute).toBe(old);expect(Life.getRouteInProgress()).toBe(true);expect((await Off.loadActiveRouteRecord(idb)).continuation.intent.stops.map(s=>s.name)).toEqual(['pending']);expect(confirm).not.toHaveBeenCalled();
});
test('R6 rapid edits and overlapping requests cannot let an old response replace the newer journey',async()=>{
 let release;modeRt.fetch.mockImplementationOnce(()=>new Promise(resolve=>{release=()=>resolve(liveResponse());})).mockImplementation(async()=>liveResponse());
 const stale=Modes.navigateFromGPS();await flush();edit();Geo.selectAutocompleteResult('end',56,-3,'Latest selection','map');
 expect(await Modes.navigateFromGPS()).toBe(true);const committed=window.lastCalculatedRoute;release();expect(await stale).toBe(false);expect(window.lastCalculatedRoute).toBe(committed);expect(Life.getRouteInProgress()).toBe(true);expect(Life.getRoutePolyline()).toEqual(AI.geometryPoints(committed));
});
test('R5 offline failure then online retry preserves only canonical pending visits',async()=>{
 const online=jest.spyOn(navigator,'onLine','get').mockReturnValue(false);expect(await Modes.navigateFromGPS()).toBe(false);expect(modeRt.fetch).not.toHaveBeenCalled();online.mockReturnValue(true);modeRt.fetch.mockResolvedValue({ok:false});expect(await Modes.navigateFromGPS()).toBe(false);expect(stopRequests()).toEqual([['pending']]);expect(Life.getRouteInProgress()).toBe(true);
});

let owner,Integrity,HA,route,fetchMock;
function response(target=route,overrides={}){
 const key=Integrity.geometryBinding(target),coverage={};
 for(const kind of ['traffic_light','railway_crossing','cameras'])coverage[kind]={geometry_binding:key,query_scope:'SELECTED_ROUTE_CORRIDOR',status:'AVAILABLE',route_scan:'ALL_SEGMENTS_QUERIED',retrieved_at:Date.now()/1000,dataset_completeness_verified:false};
 return {ok:true,json:async()=>({success:true,geometry_binding:key,warning_coverage:coverage,
  hazards:[{type:'camera_speed',lat:53.501,lon:-1.2},{type:'traffic_light',lat:53.501,lon:-1.2},{type:'railway_crossing',lat:53.501,lon:-1.2}],...overrides})};
}
beforeEach(()=>{
 jest.resetModules();jest.useFakeTimers();document.body.innerHTML='<p id="routeHazardDataStatus"></p>';
 jest.spyOn(navigator,'onLine','get').mockReturnValue(true);
 Integrity=require('../modules/navigation/avoidance-integrity');HA=require('../modules/navigation/hazard-alerts');
 window.VoyagrAvoidanceIntegrity=Integrity;window.VoyagrHazardAlerts=HA;
 window.VoyagrNavigationLifecycleOrchestration={getNavigationStarting:jest.fn(()=>false),getRouteInProgress:()=>true};
 window.VoyagrOfflineNavigationOrchestration={getIsOffline:()=>false,schedulePersistRoute:jest.fn()};
 window.VoyagrJourneyModes={isSimulating:()=>false};window.displayHazardMarkers=jest.fn();
 route={geometry:[[53.5,-1.2],[53.502,-1.2]],geometry_precision:6,hazards:[{type:'accident',lat:53.501,lon:-1.2},{type:'camera_speed',lat:53.5005,lon:-1.2}]};
 window.lastCalculatedRoute=route;global.fetch=fetchMock=jest.fn();
 owner=require('../app/route-warnings')(window);window.VoyagrRouteWarnings=owner;
});
afterEach(()=>{
 owner.destroy();jest.restoreAllMocks();jest.useRealTimers();
 for(const key of ['VoyagrRouteWarnings','VoyagrAvoidanceIntegrity','VoyagrHazardAlerts','VoyagrNavigationLifecycleOrchestration','VoyagrOfflineNavigationOrchestration','VoyagrJourneyModes','displayHazardMarkers','lastCalculatedRoute','VoyagrRouteComparisonOrchestration'])delete window[key];
 delete global.fetch;
});
test('whole route result updates only warning data, keeps incidents and persists through existing owner',async()=>{
 const geometry=route.geometry;fetchMock.mockResolvedValue(response());
 expect(await owner.observe(route)).toBe(true);
 expect(route.geometry).toBe(geometry);expect(route.hazards.map(h=>h.type)).toEqual(['accident','camera_speed','traffic_light','railway_crossing']);
 expect(window.displayHazardMarkers).toHaveBeenCalledTimes(1);
 expect(window.VoyagrOfflineNavigationOrchestration.schedulePersistRoute).toHaveBeenCalledTimes(1);
 expect(document.getElementById('routeHazardDataStatus').textContent).toContain('all selected-route sections queried');
 expect(document.getElementById('routeHazardDataStatus').textContent).toContain('Cameras: all selected-route sections queried. Camera dataset age is unverified.');
 expect(fetchMock.mock.calls[0][0]).toBe('/api/route-warning-observations');
 expect(JSON.parse(fetchMock.mock.calls[0][1].body).geometry).toEqual(geometry);
 await owner.observe(route);expect(fetchMock).toHaveBeenCalledTimes(1);
});
test('failed or limited lookup retains earlier observations and remains retryable',async()=>{
 const original=JSON.stringify(route);fetchMock.mockRejectedValue(new Error('offline'));
 expect(await owner.observe(route)).toBe(false);expect(JSON.stringify(route)).toBe(original);
 expect(HA.describeWarningCoverage(route)).toContain('earlier observations retained');
 fetchMock.mockResolvedValue(response(route,{warning_coverage:Object.fromEntries(['traffic_light','railway_crossing','cameras'].map(kind=>[kind,{geometry_binding:Integrity.geometryBinding(route),query_scope:'SELECTED_ROUTE_CORRIDOR',status:'PARTIAL',route_scan:'LIMITED',reason:'result_limit'}]))}));
 expect(await owner.refresh(route)).toBe(true);
 expect(route.hazards.some(h=>h.lat===53.5005)).toBe(true);
 expect(HA.describeWarningCoverage(route)).toContain('result limit');
});
test('late response from replaced or mutated geometry cannot update route or markers',async()=>{
 let finish;fetchMock.mockReturnValue(new Promise(resolve=>{finish=resolve;}));
 const pending=owner.observe(route),old=route.hazards;
 route.geometry=[[54,-2],[54.1,-2]];finish(response({geometry:[[53.5,-1.2],[53.502,-1.2]],geometry_precision:6}));
 expect(await pending).toBe(false);expect(route.hazards).toBe(old);expect(window.displayHazardMarkers).not.toHaveBeenCalled();
});
test('optional lookup cannot mutate a route during navigation startup',async()=>{
 let finish;fetchMock.mockReturnValue(new Promise(resolve=>{finish=resolve;}));const pending=owner.observe(route),original=JSON.stringify(route);
 window.VoyagrNavigationLifecycleOrchestration.getNavigationStarting.mockReturnValue(true);finish(response());
 expect(await pending).toBe(false);expect(JSON.stringify(route)).toBe(original);
});
test('offline and simulation modes do not start lookups or clear stored warnings',async()=>{
 window.VoyagrOfflineNavigationOrchestration.getIsOffline=()=>true;await owner.observe(route);
 window.VoyagrOfflineNavigationOrchestration.getIsOffline=()=>false;window.VoyagrJourneyModes.isSimulating=()=>true;await owner.observe(route);
 expect(fetchMock).not.toHaveBeenCalled();expect(route.hazards).toHaveLength(2);
});
test('timeouts abort once without losing the existing plan',async()=>{
 fetchMock.mockImplementation((_url,options)=>new Promise((_resolve,reject)=>options.signal.addEventListener('abort',()=>reject(new Error('aborted')))));
 const pending=owner.observe(route);jest.advanceTimersByTime(11000);expect(await pending).toBe(false);
 expect(route.hazards).toHaveLength(2);expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
});
test('stale stored results remain visibly stale, not complete fresh coverage',async()=>{
 fetchMock.mockResolvedValue(response());await owner.observe(route);jest.advanceTimersByTime(301000);
 expect(HA.describeWarningCoverage(route)).toContain('stale');
});
test('distant whole-route observations are filtered before expensive along-route work',()=>{
 const line=new Proxy([[53.5,-1.2],[53.502,-1.2]],{get:()=>{throw Error('Distant warnings must not scan route geometry');}});
 const hazards=Array.from({length:5000},(_,i)=>({type:'traffic_light',lat:55+i*.00001,lon:-2,route_corridor_observation:true}));
 expect(HA.collectHazardsToAnnounce({lat:53.5,lon:-1.2,route:{hazards},routePolyline:line,cameraAlertDistanceM:500,generalHazardDistanceM:500})).toEqual([]);
});

test('selected option retains the scan through later route synchronization without altering permissions',async()=>{
 const selected=JSON.parse(JSON.stringify(route)),permission={automatic_selection_allowed:false};selected.avoidance_assessment=permission;
 window.VoyagrRouteComparisonOrchestration={getRouteOptions:()=>[selected],getSelectedRouteIndex:()=>0};
 fetchMock.mockResolvedValue(response());await owner.observe(route);
 const Selection=require('../modules/navigation/route-selection');
 const restored=Selection.mergeLastCalculatedRouteFromSelection(route,selected);
 expect(restored.warning_coverage.traffic_light.route_scan).toBe('ALL_SEGMENTS_QUERIED');
 expect(restored.hazards.some(h=>h.type==='railway_crossing')).toBe(true);
 expect(selected.avoidance_assessment).toBe(permission);
});

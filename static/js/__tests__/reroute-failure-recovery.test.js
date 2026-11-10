/* Real GPS watcher, request guards and map/lifecycle owner; synthetic device/network. */
let GPS,RD,AI,Life,Compare,Reroute,SG,RG,RM,fixture,ctx,state,old,deliver,classification,auto,destination;
let priorFetch,priorPrefs,priorClear,online,notify;
const BASE=1800000000000;
const settle=async()=>{for(let i=0;i<16;i++)await Promise.resolve();};
function fix(lat=53.005,lon=-1.003,accuracy=5){return {timestamp:Date.now(),coords:{latitude:lat,longitude:lon,accuracy,speed:5,heading:0}};}
function setOnline(value){online=value;}
function reconnect(){setOnline(true);window.dispatchEvent(new Event('online'));}
function nextFix(...args){jest.advanceTimersByTime(1000);deliver(fix(...args));}
function replacement(origin){const r=fixture.makeRoute('recovered',[origin,[53.005,-1.002],[53.01,-1]]);r.name='Optimised';r.source='GraphHopper';r.avoidance_assessment.automatic_selection_allowed=true;r.avoidance_assessment.origin_integrity.requested_origin=origin;r.avoidance_assessment.geometry_binding=AI.geometryBinding(r);return r;}
beforeEach(()=>{
 jest.resetModules();jest.useFakeTimers();jest.setSystemTime(BASE);localStorage.clear();sessionStorage.clear();delete global.VoyagrJourneyModes;
 AI=require('../modules/navigation/avoidance-integrity');GPS=require('../app/gps-orchestration');RD=require('../modules/navigation/reroute-decision');Life=require('../app/navigation-lifecycle-orchestration');Compare=require('../app/route-comparison-orchestration');Reroute=require('../app/reroute-map-orchestration');SG=require('../modules/navigation/speed-gps');RG=require('../modules/navigation/route-geometry');RM=require('../modules/navigation/road-matching');fixture=require('./fixtures/navigation-transition.cjs');
 old=fixture.makeRoute('old');old.name='Optimised';old.source='GraphHopper';window.lastCalculatedRoute=old;
 Life.setRouteInProgress(true);Life.setRouteStarted(true);Life.setRoutePolyline(old.polyline);Life.setCurrentRouteSteps(old.maneuvers);Compare.setRouteOptions([old]);Compare.setSelectedRouteIndex(0);ctx=fixture.bindTransition({gps:true});global.VoyagrAvoidanceIntegrity=AI;
 state={routeInProgress:true,routePolyline:old.polyline,lastSnappedRouteIndex:0,routeJoinConfirmedForDeviation:true,lastRerouteTime:0,lastRerouteAttemptTime:0,postRerouteGraceUntil:0,rerouteInProgress:false,rerouteFailureRetryCount:0,currentLat:53.005,currentLon:-1.003};
 notify=jest.fn();auto=true;destination=old.destination;classification='OFF_ROUTE';global.VoyagrRoadMatching=RM;global.VoyagrRoadMatchOrchestration={observe:()=>({context_available:true,evidence_status:classification==='OFF_ROUTE'?'PROBABLE':'UNMATCHED',attributes_allowed:classification==='OFF_ROUTE',route_relation:classification==='OFF_ROUTE'?'DIFFERENT':'UNVERIFIED',match_timestamp_ms:Date.now(),source_acquired_at_ms:Date.now()}),invalidate:()=>{}};
 priorFetch=global.fetch;priorPrefs=global._routePrefs;global._routePrefs=()=>({});online=true;jest.spyOn(navigator,'onLine','get').mockImplementation(()=>online);
 GPS.bind({g:k=>state[k],s:(k,v)=>{state[k]=v;},m:{speedGps:()=>SG,rerouteDecision:()=>RD,routeGeometry:()=>RG},call:{resolveNavigationDestination:()=>destination,buildRouteRequest:(lat,lon)=>({start:lat+','+lon,end:destination,is_reroute:true}),showStatus:ctx.status,updateRouteOnMap:r=>Reroute.updateRouteOnMap(r),convertDistance:String,getDistanceUnit:()=> 'km',sendNotification:notify,getAutoRerouteOnDeviationEnabled:()=>auto,getRoutePreferences:()=>({})}});
 ctx.runtime.call.clearRerouteFailureRetries=()=>GPS.clearRerouteFailureRetries();
 priorClear=navigator.geolocation.clearWatch;navigator.geolocation.clearWatch=()=>{};navigator.geolocation.watchPosition=jest.fn(ok=>{deliver=ok;return 23;});GPS.ensureGPSTracking({forceRestart:true,documentVisible:true});
 global.fetch=jest.fn(async(_url,options)=>({json:async()=>({success:true,routes:[replacement(JSON.parse(options.body).start.split(',').map(Number))]})}));
 deliver(fix());
});
afterEach(()=>{GPS.clearRerouteFailureRetries();AI.invalidate();jest.clearAllTimers();jest.useRealTimers();jest.restoreAllMocks();Life.setRouteInProgress(false);navigator.geolocation.clearWatch=priorClear;global.fetch=priorFetch;global._routePrefs=priorPrefs;delete global.VoyagrRoadMatching;delete global.VoyagrRoadMatchOrchestration;delete global.VoyagrJourneyModes;delete window.lastCalculatedRoute;});
async function defer(){setOnline(false);await GPS.triggerAutomaticRerouteWithHazardHandling(53.005,-1.003);}
test('offline wait spends no failure retries and retains route, instructions and mounted layer',async()=>{
 const before=ctx.snapshot();await defer();jest.advanceTimersByTime(120000);await settle();
 expect(global.fetch).not.toHaveBeenCalled();expect(state.rerouteFailureRetryCount).toBe(0);expect(state.rerouteFailureRetryTimer).toBeFalsy();expect(ctx.snapshot()).toBe(before);expect(window.lastCalculatedRoute).toBe(old);
 expect(ctx.status).toHaveBeenCalledWith('Offline — rerouting will resume when connected. Current route retained.','warning');
});
test('reconnection with a recent off-route fix resumes once and commits through the real map owner',async()=>{
 await defer();nextFix(53.006,-1.004);reconnect();window.dispatchEvent(new Event('online'));expect(global.fetch).toHaveBeenCalledTimes(1);await settle();
 const request=JSON.parse(global.fetch.mock.calls[0][1].body);expect(request.start).toBe('53.006,-1.004');expect(request.is_reroute).toBe(true);
 expect(window.lastCalculatedRoute.id).toBe('recovered');expect(Life.getRoutePolyline()).toEqual(AI.geometryPoints(window.lastCalculatedRoute));expect(Life.getCurrentRouteSteps()).toEqual(window.lastCalculatedRoute.maneuvers);expect(Life.getRouteInProgress()).toBe(true);expect(state.rerouteFailureRetryCount).toBe(0);
 expect(ctx.mapHelpers.isPolylineLayerRemoved(ctx.map,ctx.oldLayer)).toBe(true);expect(ctx.mapHelpers.isPolylineLayerMounted(ctx.map,ctx.runtime.getRouteLayer(),Life.getRoutePolyline())).toBe(true);
});
test('stale GPS on reconnect waits for the next accepted fix and uses its coordinates',async()=>{
 await defer();jest.advanceTimersByTime(16000);reconnect();expect(global.fetch).not.toHaveBeenCalled();nextFix(53.006,-1.004);expect(global.fetch).toHaveBeenCalledTimes(1);expect(JSON.parse(global.fetch.mock.calls[0][1].body).start).toBe('53.006,-1.004');await settle();
});
test.each(['unknown','inaccurate','invalid'])('%s GPS cannot resume an offline request',async kind=>{
 await defer();jest.advanceTimersByTime(1000);if(kind==='unknown')classification='UNKNOWN';const p=fix();if(kind==='inaccurate')p.coords.accuracy=100;if(kind==='invalid')p.coords.latitude=NaN;deliver(p);reconnect();expect(global.fetch).not.toHaveBeenCalled();classification='OFF_ROUTE';nextFix();expect(global.fetch).toHaveBeenCalledTimes(1);await settle();
});
test.each(['ended','disabled','route','destination','preferences','intent','cleared'])('%s context cancels deferred recovery',async kind=>{
 await defer();if(kind==='ended')state.routeInProgress=false;if(kind==='disabled')auto=false;if(kind==='route')window.lastCalculatedRoute={...old,id:'other'};if(kind==='destination')destination='54,-2';if(kind==='preferences')localStorage.setItem('pref_cameras','false');if(kind==='intent'){
 // Install a real captured token before deferring a second request.
 GPS.clearRerouteFailureRetries();let epoch=1;global.VoyagrJourneyModes={isSimulating:()=>false,captureIntent:()=>epoch,intentCurrent:token=>token===epoch};await defer();epoch++;
 }if(kind==='cleared')GPS.clearRerouteFailureRetries();
 reconnect();expect(global.fetch).not.toHaveBeenCalled();await settle();expect(ctx.runtime.getRouteLayer()).toBe(ctx.oldLayer);
 // A later event must not revive this cancelled request.
 state.routeInProgress=true;auto=true;window.lastCalculatedRoute=old;destination=old.destination;localStorage.clear();window.dispatchEvent(new Event('online'));expect(global.fetch).not.toHaveBeenCalled();
});
test('returning to the route cancels the deferred attempt',async()=>{
 await defer();nextFix(53.005,-1);reconnect();expect(global.fetch).not.toHaveBeenCalled();nextFix();expect(global.fetch).not.toHaveBeenCalled();
});
test('network failure keeps the route until a successful scheduled retry replaces it',async()=>{
 const before=ctx.snapshot();global.fetch.mockRejectedValueOnce(new TypeError('network unavailable'));await GPS.triggerAutomaticRerouteWithHazardHandling(53.005,-1.003);
 expect(ctx.snapshot()).toBe(before);expect(state.rerouteInProgress).toBe(false);expect(state.rerouteFailureRetryCount).toBe(1);expect(global.fetch).toHaveBeenCalledTimes(1);
 jest.advanceTimersByTime(3999);expect(global.fetch).toHaveBeenCalledTimes(1);jest.advanceTimersByTime(1);await settle();expect(global.fetch).toHaveBeenCalledTimes(2);expect(window.lastCalculatedRoute.id).toBe('recovered');expect(state.rerouteFailureRetryCount).toBe(0);
});
test('losing connectivity during a retry suspends it without draining the remaining budget',async()=>{
 global.fetch.mockRejectedValueOnce(new TypeError('network unavailable'));await GPS.triggerAutomaticRerouteWithHazardHandling(53.005,-1.003);setOnline(false);jest.advanceTimersByTime(4000);await settle();jest.advanceTimersByTime(120000);await settle();expect(global.fetch).toHaveBeenCalledTimes(1);expect(state.rerouteFailureRetryCount).toBe(1);nextFix();reconnect();await settle();expect(global.fetch).toHaveBeenCalledTimes(2);expect(window.lastCalculatedRoute.id).toBe('recovered');
});

test('persistent network failure stops the four timed retries while retaining the current route',async()=>{
 const before=ctx.snapshot();global.fetch.mockRejectedValue(new TypeError('network unavailable'));await GPS.triggerAutomaticRerouteWithHazardHandling(53.005,-1.003);
 for(const delay of [4000,6500,10000,14000]){jest.advanceTimersByTime(delay);await settle();}
 expect(global.fetch).toHaveBeenCalledTimes(5);expect(state.rerouteInProgress).toBe(false);expect(state.rerouteFailureRetryTimer).toBeNull();expect(ctx.snapshot()).toBe(before);expect(notify).toHaveBeenCalledWith('❌ Rerouting failed',expect.stringMatching(/several tries/),'error');
 jest.advanceTimersByTime(60000);await settle();expect(global.fetch).toHaveBeenCalledTimes(5);
});
test('a stalled request times out without removing the route, then retries successfully',async()=>{
 const before=ctx.snapshot();global.fetch.mockImplementationOnce((_url,options)=>new Promise((_resolve,reject)=>{options.signal.addEventListener('abort',()=>reject(new DOMException('Timed out','AbortError')));}));
 const attempt=GPS.triggerAutomaticRerouteWithHazardHandling(53.005,-1.003);jest.advanceTimersByTime(34999);await settle();expect(state.rerouteInProgress).toBe(true);expect(ctx.snapshot()).toBe(before);jest.advanceTimersByTime(1);await attempt;expect(state.rerouteInProgress).toBe(false);expect(ctx.snapshot()).toBe(before);expect(state.rerouteFailureRetryCount).toBe(1);
 // Deliver current GPS before the scheduled retry; the accepted-origin gate stays active.
 nextFix();jest.advanceTimersByTime(3000);await settle();expect(global.fetch).toHaveBeenCalledTimes(2);expect(window.lastCalculatedRoute.id).toBe('recovered');
});

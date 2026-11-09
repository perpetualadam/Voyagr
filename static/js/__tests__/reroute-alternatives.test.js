/* Actual GPS -> selection -> map/lifecycle replacement, synthetic renderer/network. */
let AI,GPS,RD,Life,Compare,Reroute,fixture,ctx,state,priorFetch,priorPrefs,gpsRuntime,old;
beforeEach(()=>{
 jest.resetModules();localStorage.clear();sessionStorage.clear();delete global.VoyagrJourneyModes;
 AI=require('../modules/navigation/avoidance-integrity');GPS=require('../app/gps-orchestration');RD=require('../modules/navigation/reroute-decision');Life=require('../app/navigation-lifecycle-orchestration');Compare=require('../app/route-comparison-orchestration');Reroute=require('../app/reroute-map-orchestration');fixture=require('./fixtures/navigation-transition.cjs');
 old=fixture.makeRoute('old');old.name='Optimised';old.source='GraphHopper';window.lastCalculatedRoute=old;
 Life.setRouteInProgress(true);Life.setRouteStarted(true);Life.setRoutePolyline(old.polyline);Life.setCurrentRouteSteps(old.maneuvers);
 Compare.setRouteOptions([old]);Compare.setSelectedRouteIndex(0);ctx=fixture.bindTransition({gps:true});global.VoyagrAvoidanceIntegrity=AI;
 state={routeInProgress:true,rerouteInProgress:false,lastRerouteAttemptTime:0,postRerouteGraceUntil:0,currentLat:53,currentLon:-1};priorFetch=global.fetch;priorPrefs=global._routePrefs;global._routePrefs=()=>({});
 GPS.bind(gpsRuntime={g:k=>state[k],s:(k,v)=>{state[k]=v;},m:{rerouteDecision:()=>RD},call:{resolveNavigationDestination:()=>old.destination,buildRouteRequest:()=>({start:'53,-1',end:old.destination,is_reroute:true}),showStatus:ctx.status,updateRouteOnMap:r=>Reroute.updateRouteOnMap(r),convertDistance:String,getDistanceUnit:()=> 'km',sendNotification:()=>{},getAutoRerouteOnDeviationEnabled:()=>false,getRoutePreferences:()=>({})}});
});
afterEach(()=>{AI.invalidate();Life.setRouteInProgress(false);global.fetch=priorFetch;global._routePrefs=priorPrefs;jest.restoreAllMocks();});
function candidate(id,source='GraphHopper',name='Optimised'){
 const r=fixture.makeRoute(id,[[53,-1],[53.005,-1.002],[53.01,-1]]);r.source=source;r.name=name;r.avoidance_assessment.automatic_selection_allowed=true;return r;
}
async function reroute(routes){global.fetch=jest.fn(async()=>({json:async()=>({success:true,routes})}));await GPS.triggerAutomaticRerouteWithHazardHandling(53,-1);}
function refused(){const r=candidate('refused','Valhalla','Fastest');Object.assign(r.avoidance_assessment,{status:'VIOLATED',automatic_selection_allowed:false,requires_acceptance:true});r.avoidance_assessment.requirements[0].status='VIOLATED';return r;}
test('refused first route no longer blocks a permitted GraphHopper alternative from real map replacement',async()=>{
 const gh=candidate('gh');await reroute([refused(),gh]);
 expect(window.lastCalculatedRoute.id).toBe('gh');expect(window.lastCalculatedRoute.source).toBe('GraphHopper');expect(Life.getCurrentRouteSteps()).toEqual(gh.maneuvers);expect(Life.getRoutePolyline()).toEqual(AI.geometryPoints(gh));
 expect(ctx.mapHelpers.isPolylineLayerMounted(ctx.map,ctx.runtime.getRouteLayer(),AI.geometryPoints(gh))).toBe(true);expect(ctx.mapHelpers.isPolylineLayerRemoved(ctx.map,ctx.oldLayer)).toBe(true);expect(Life.getRouteInProgress()).toBe(true);expect(ctx.status).not.toHaveBeenCalledWith(expect.stringMatching(/Known conflict/),'warning');
});
test.each(['geometry','instructions','missing','null'])('malformed %s candidate cannot block a complete later alternative',async kind=>{
 let bad=candidate('bad');if(kind==='geometry')bad.avoidance_assessment.geometry_binding='invalid';if(kind==='instructions')bad.maneuvers=[];if(kind==='missing')delete bad.avoidance_assessment;if(kind==='null')bad=null;
 await reroute([bad,candidate('good')]);expect(window.lastCalculatedRoute.id).toBe('good');expect(Life.getRouteInProgress()).toBe(true);
});
test('all refused candidates retain the old geometry, instructions and layer',async()=>{
 const before=ctx.snapshot();await reroute([refused(),refused()]);expect(ctx.snapshot()).toBe(before);expect(window.lastCalculatedRoute).toBe(old);expect(state.rerouteInProgress).toBe(false);expect(ctx.status).toHaveBeenCalledWith(expect.stringMatching(/Known conflict/),'warning');
});
test('a malformed preferred GraphHopper candidate cannot hide an eligible same-response alternative',async()=>{
 const bad=candidate('bad');bad.maneuvers=[];await reroute([bad,candidate('valid','Valhalla','Fastest')]);expect(window.lastCalculatedRoute.id).toBe('valid');
});
test('existing name and engine preference still selects GraphHopper from eligible alternatives',async()=>{
 await reroute([candidate('vh','Valhalla','Fastest'),candidate('gh')]);expect(window.lastCalculatedRoute.id).toBe('gh');
});
test('preference changes while awaiting a response prevent any route replacement',async()=>{
 let reply;global.fetch=jest.fn(()=>new Promise(resolve=>{reply=resolve;}));const before=ctx.snapshot();const pending=GPS.triggerAutomaticRerouteWithHazardHandling(53,-1);localStorage.setItem('pref_cameras','false');reply({json:async()=>({success:true,routes:[candidate('gh')]})});await pending;expect(ctx.snapshot()).toBe(before);expect(window.lastCalculatedRoute).toBe(old);
});

test('all malformed routes retain the active layer and return a usable refusal message',async()=>{
 const invalid=candidate('invalid');invalid.maneuvers=[];const before=ctx.snapshot();await reroute([null,invalid]);
 expect(ctx.snapshot()).toBe(before);expect(state.rerouteInProgress).toBe(false);expect(ctx.status).toHaveBeenCalledWith('No usable recalculated route. Current route retained.','warning');
});
test('the map owner independently refuses a preference change after candidate filtering',async()=>{
 const before=ctx.snapshot();gpsRuntime.call.updateRouteOnMap=r=>{localStorage.setItem('pref_cameras','false');return Reroute.updateRouteOnMap(r);};
 await reroute([refused(),candidate('gh')]);expect(ctx.snapshot()).toBe(before);expect(window.lastCalculatedRoute).toBe(old);expect(Life.getRouteInProgress()).toBe(true);
});

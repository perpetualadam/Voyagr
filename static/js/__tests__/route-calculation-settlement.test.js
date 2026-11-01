/** Real request tickets, calculation/selection/assessment and planning coordinator;
 * map/network/terminal UI are boundary doubles. No navigation gate is replaced. */
const Calculate=require('../app/calculate-route-orchestration.js');
const AI=require('../modules/navigation/avoidance-integrity.js');
const RS=require('../modules/navigation/route-selection.js');
const RR=require('../modules/navigation/routing-request.js');
const RP=require('../modules/navigation/route-progress.js');
const GL=require('../modules/navigation/geocoding-locations.js');
const Plan=require('../modules/navigation/journey-plan.js');
const Codec=require('../modules/navigation/polyline-codec.js');
const captured=require('./fixtures/sheffield-doncaster-20261101.json');
let Modes,options,selected,layer,start,end,map,previewCalls,statuses,finish,originalFetch,geocode;
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const body=()=>JSON.parse(JSON.stringify(captured));
const response=(data=body())=>({status:200,ok:true,headers:{get:()=> 'application/json'},json:async()=>data});
const visible=()=>document.getElementById('routeProgressContainer')?.style.display==='block';
async function fetched(count){for(let i=0;i<50&&global.fetch.mock.calls.length<count;i++)await Promise.resolve();expect(global.fetch.mock.calls.length).toBe(count);}
function bind({ready=false,presentationFailure=false}={}){
 map={isStyleLoaded:()=>ready};
 const helpers={addPolyline:()=>({remove(){}}),isPolylineLayerMounted:()=>true,isPolylineLayerRemoved:()=>true,createCircleMarker:()=>({addTo(){return this;},bindPopup(){},remove(){},getElement:()=>({isConnected:true})}),fitMapBounds(){}};
 Modes.bind({selected:()=>selected,isLive:()=>false,showStatus:m=>statuses.push(m)});
 Calculate.bind({routingRequest:()=>RR,routeProgress:()=>RP,routeSelection:()=>RS,geocodingLocations:()=>GL,routeSharing:()=>({parseSharedRouteDurationMinutes:()=>0}),getIsGeocoding:()=>false,getCurrentRoutingMode:()=> 'auto',getCurrentVehicleType:()=> 'petrol_diesel',getRouteInProgress:()=>false,getIsTrackingActive:()=>false,getTrackingHistory:()=>[],getCurrentLat:()=>null,getCurrentLon:()=>null,getMap:()=>map,getMapLibreHelpers:()=>helpers,getRouteOptions:()=>options,setRouteOptions:v=>options=v,getRouteLayer:()=>layer,setRouteLayer:v=>layer=v,getStartMarker:()=>start,setStartMarker:v=>start=v,getEndMarker:()=>end,setEndMarker:v=>end=v,
 call:{geocodeLocations:(...args)=>geocode(...args),showStatus:m=>statuses.push(m),getViaPoints:()=>[],getStops:()=>[],getRouteCostParams:()=>({}),isAvoidTollsEnabled:()=>false,getRoutePreferences:()=>({}),decodePolyline:Codec.decodePolyline,convertDistance:n=>n,getDistanceUnit:()=> 'km',getCurrencySymbol:()=> '£',updateTripInfo(){if(presentationFailure)throw Error('display failed');},showRoutePreview(){previewCalls++;document.getElementById('routePreviewTab').style.display='block';},displayHazardMarkers(){},updateRoadReportFabVisibility(){},updateARButtonVisibility(){},sendNotification(){},recordRecentDestination(){}}});
}
beforeEach(()=>{
 jest.useFakeTimers();jest.spyOn(Date,'now').mockReturnValue((captured.routes[0].avoidance_assessment.checked_at+1)*1000);
 jest.spyOn(console,'log').mockImplementation(()=>{});jest.spyOn(console,'error').mockImplementation(()=>{});
 localStorage.clear();AI.invalidate();global.VoyagrAvoidanceIntegrity=AI;global.VoyagrJourneyPlan=Plan;
 jest.isolateModules(()=>{Modes=require('../app/journey-modes.js');});global.VoyagrJourneyModes=Modes;
 // Endpoint capability setup is outside settlement; do not fabricate an epoch.
 jest.spyOn(Modes,'beforePlanning').mockReturnValue(true);
 geocode=async()=>({start:'53.3806626,-1.4702278',end:'53.5227681,-1.1335312'});
 options=[];selected=null;layer=start=end=null;previewCalls=0;statuses=[];
 delete window.lastCalculatedRoute;delete window.lastRouteApiResponse;
 document.body.innerHTML='<input id="start" value="Sheffield"><input id="end" value="Doncaster"><div id="routePreviewTab" style="display:none"></div>';
 originalFetch=global.fetch;global.fetch=jest.fn().mockResolvedValue(response());finish=jest.spyOn(AI,'finish');bind();
});
afterEach(()=>{jest.restoreAllMocks();AI.invalidate();global.fetch=originalFetch;delete global.VoyagrJourneyModes;delete global.VoyagrJourneyPlan;delete window.lastCalculatedRoute;delete window.lastRouteApiResponse;jest.useRealTimers();});

test('map failure resolves false, retains the previous journey and retires only settled progress',async()=>{
 selected=RS.buildRouteOptionsFromApiResponse(body(),Codec.decodePolyline)[0];window.lastCalculatedRoute=selected;options=[selected];const previousOptions=options;
 const result=await Calculate.calculateRoute();
 expect(result).toBe(false);expect(statuses).toContain('Map not ready; current journey retained.');
 expect(window.lastCalculatedRoute).toBe(selected);expect(options).toBe(previousOptions);expect(previewCalls).toBe(0);expect(visible()).toBe(false);expect(finish).toHaveBeenCalledTimes(1);
});
test('a settled commit-false result without an exception clears progress',async()=>{
 jest.spyOn(Modes,'commitPlanning').mockResolvedValue(false);
 expect(await Calculate.calculateRoute()).toBe(false);expect(window.lastCalculatedRoute).toBeUndefined();expect(visible()).toBe(false);expect(finish.mock.calls[0][0].timer).toBeNull();
});
test('legitimately pending JSON/commit stays visible until the owning calculation settles',async()=>{
 const json=deferred(),commit=deferred();global.fetch.mockResolvedValue({...response(),json:()=>json.promise});jest.spyOn(Modes,'commitPlanning').mockReturnValue(commit.promise);
 const work=Calculate.calculateRoute();await fetched(1);expect(visible()).toBe(true);
 json.resolve(body());for(let i=0;i<20&&!Modes.commitPlanning.mock.calls.length;i++)await Promise.resolve();expect(Modes.commitPlanning).toHaveBeenCalledTimes(1);expect(visible()).toBe(true);expect(finish).not.toHaveBeenCalled();
 commit.resolve(false);await work;expect(visible()).toBe(false);
});
test.each(['fulfilled','rejected'])('obsolete %s fetch cannot clear newer pending progress or publish old state',async outcome=>{
 const old=deferred(),next=deferred();global.fetch.mockReturnValueOnce(old.promise).mockReturnValueOnce(next.promise);
 const first=Calculate.calculateRoute();await fetched(1);const signal=global.fetch.mock.calls[0][1].signal;
 const second=Calculate.calculateRoute();await fetched(2);expect(signal.aborted).toBe(true);
 outcome==='fulfilled'?old.resolve(response()):old.reject(Error('obsolete request failed'));
 await first;expect(visible()).toBe(true);expect(window.lastCalculatedRoute).toBeUndefined();expect(previewCalls).toBe(0);
 next.resolve(response({success:false,error:'new request failed'}));await second;expect(visible()).toBe(false);
});
test('newer request may finish first; an old late callback cannot overwrite its refused planning preview',async()=>{
 bind({ready:true});const old=deferred(),next=deferred();global.fetch.mockReturnValueOnce(old.promise).mockReturnValueOnce(next.promise);
 const first=Calculate.calculateRoute();await fetched(1);const second=Calculate.calculateRoute();await fetched(2);
 next.resolve(response());expect(await second).toBe(true);const committed=window.lastCalculatedRoute;const committedOptions=options;
 expect(visible()).toBe(false);await jest.advanceTimersByTimeAsync(300);expect(previewCalls).toBe(1);
 old.resolve(response());await first;expect(window.lastCalculatedRoute).toBe(committed);expect(options).toBe(committedOptions);expect(previewCalls).toBe(1);
});
test.each(['network','json','candidate','commit','request_plan','synchronous_fetch'])('%s failure does not strand progress or a timer',async kind=>{
 if(kind==='network')global.fetch.mockRejectedValue(Error('network failure'));
 if(kind==='json')global.fetch.mockResolvedValue({...response(),json:async()=>{throw Error('malformed JSON');}});
 if(kind==='candidate'){const data=body();data.routes[0].avoidance_assessment.geometry_binding='wrong';global.fetch.mockResolvedValue(response(data));}
 if(kind==='commit')jest.spyOn(Modes,'commitPlanning').mockRejectedValue(Error('unexpected commit rejection'));
 if(kind==='request_plan')jest.spyOn(RR,'buildCalculateRouteApiOrchestrationPlan').mockImplementation(()=>{throw Error('request plan failed');});
 if(kind==='synchronous_fetch')global.fetch.mockImplementation(()=>{throw Error('fetch setup failed');});
 await Calculate.calculateRoute().catch(()=>{});expect(visible()).toBe(false);expect(window.lastCalculatedRoute).toBeUndefined();expect(finish).toHaveBeenCalledTimes(1);expect(jest.getTimerCount()).toBe(0);
});
test('presentation failure after a committed plan still retires progress and grants no navigation',async()=>{
 bind({ready:true,presentationFailure:true});expect(await Calculate.calculateRoute()).toBe(true);
 expect(window.lastCalculatedRoute).toBeDefined();expect(AI.decision(window.lastCalculatedRoute).allowed).toBe(false);expect(previewCalls).toBe(0);expect(visible()).toBe(false);
});
test('valid refused planning success stores five independently refused alternatives and schedules preview',async()=>{
 bind({ready:true});expect(await Calculate.calculateRoute()).toBe(true);expect(visible()).toBe(false);expect(options).toHaveLength(5);
 options.forEach((r,i)=>{expect(AI.geometryBinding(r)).toBe(captured.routes[i].avoidance_assessment.geometry_binding);expect(AI.decision(r).allowed).toBe(false);});
 expect(previewCalls).toBe(0);await jest.advanceTimersByTimeAsync(300);expect(previewCalls).toBe(1);expect(document.getElementById('routePreviewTab').style.display).toBe('block');expect(Modes.liveStartPermitted(window.lastCalculatedRoute)).toBe(false);
});
test('stale delayed preview callback cannot reopen details after a newer request begins',async()=>{
 bind({ready:true});await Calculate.calculateRoute();const published=window.lastCalculatedRoute;
 const pending=deferred();global.fetch.mockReturnValue(pending.promise);const next=Calculate.calculateRoute();await fetched(2);
 await jest.advanceTimersByTimeAsync(300);expect(previewCalls).toBe(0);expect(window.lastCalculatedRoute).toBe(published);expect(visible()).toBe(true);
 pending.resolve(response({success:false,error:'new response'}));await next;expect(visible()).toBe(false);
});
test('settings invalidation discards a response and clears only the still-latest request progress',async()=>{
 const pending=deferred();global.fetch.mockReturnValue(pending.promise);const work=Calculate.calculateRoute();await fetched(1);
 localStorage.setItem('pref_avoidance_mode','mandatory');pending.resolve(response());await work;
 expect(window.lastCalculatedRoute).toBeUndefined();expect(previewCalls).toBe(0);expect(visible()).toBe(false);expect(finish).toHaveBeenCalledTimes(1);
});
test('ticket timer is finished even if the progress renderer itself throws during final cleanup',async()=>{
 jest.spyOn(Modes,'commitPlanning').mockResolvedValue(false);
 jest.spyOn(RP,'buildRouteProgressHideOrchestrationPlan').mockImplementation(()=>{throw Error('progress renderer unavailable');});
 await expect(Calculate.calculateRoute()).rejects.toThrow('progress renderer unavailable');expect(finish).toHaveBeenCalledTimes(1);expect(jest.getTimerCount()).toBe(0);
});
test.each(['preflight','geocode_false','geocode_rejection'])('a newer %s exit retires superseded progress even before another fetch starts',async kind=>{
 const pending=deferred();global.fetch.mockReturnValue(pending.promise);const first=Calculate.calculateRoute();await fetched(1);expect(visible()).toBe(true);
 if(kind==='preflight')document.getElementById('end').value='';
 if(kind==='geocode_false')geocode=async()=>null;
 if(kind==='geocode_rejection')geocode=async()=>{throw Error('geocoder failed');};
 await Calculate.calculateRoute().catch(()=>{});expect(visible()).toBe(false);expect(global.fetch).toHaveBeenCalledTimes(1);expect(window.lastCalculatedRoute).toBeUndefined();
 pending.resolve(response());await first;expect(visible()).toBe(false);expect(window.lastCalculatedRoute).toBeUndefined();
});
test('older settlement does not clear progress while the newer request is legitimately awaiting geocoding',async()=>{
 const old=deferred();global.fetch.mockReturnValue(old.promise);const first=Calculate.calculateRoute();await fetched(1);
 const lookup=deferred();geocode=()=>lookup.promise;const next=Calculate.calculateRoute();old.resolve(response());await first;
 expect(visible()).toBe(true);lookup.resolve(null);await next;expect(visible()).toBe(false);expect(window.lastCalculatedRoute).toBeUndefined();
});
// P2: post-response settlement must obey the same real ticket ownership as fetches.
test.each([['reject','success'],['reject','failure'],['false','success'],['false','failure']])('A commit %s cannot retire pending B, which later ends in %s',async(outcome,newOutcome)=>{
 bind({ready:true});
 const aCommit=deferred(),bFetch=deferred();jest.spyOn(Modes,'commitPlanning').mockReturnValueOnce(aCommit.promise);
 const a=Calculate.calculateRoute();await fetched(1);for(let n=0;n<40&&!Modes.commitPlanning.mock.calls.length;n++)await Promise.resolve();expect(Modes.commitPlanning).toHaveBeenCalledTimes(1);
 global.fetch.mockReturnValueOnce(bFetch.promise);const b=Calculate.calculateRoute();await fetched(2);expect(visible()).toBe(true);const count=statuses.length;
 outcome==='reject'?aCommit.reject(Error('obsolete commit failed')):aCommit.resolve(false);await a;
 expect(visible()).toBe(true);expect(statuses.length).toBe(count);expect(window.lastCalculatedRoute).toBeUndefined();
 bFetch.resolve(newOutcome==='success'?response():response({success:false,error:'current request finished'}));await b;expect(visible()).toBe(false);await jest.advanceTimersByTimeAsync(300);expect(previewCalls).toBe(newOutcome==='success'?1:0);expect(jest.getTimerCount()).toBe(0);
});
test.each([['success','reject'],['success','false'],['failure','reject'],['failure','false']])('B %s remains authoritative after A commit %s',async(outcome,oldOutcome)=>{
 bind({ready:true});const aCommit=deferred(),bFetch=deferred();jest.spyOn(Modes,'commitPlanning').mockReturnValueOnce(aCommit.promise);
 const a=Calculate.calculateRoute();await fetched(1);for(let n=0;n<40&&!Modes.commitPlanning.mock.calls.length;n++)await Promise.resolve();expect(Modes.commitPlanning).toHaveBeenCalledTimes(1);
 global.fetch.mockReturnValueOnce(bFetch.promise);const b=Calculate.calculateRoute();await fetched(2);bFetch.resolve(outcome==='success'?response():response({success:false,error:'current request failed'}));await b;
 const route=window.lastCalculatedRoute,currentOptions=options,statusCount=statuses.length;expect(visible()).toBe(false);
 oldOutcome==='reject'?aCommit.reject(Error('obsolete commit failed')):aCommit.resolve(false);await a;expect(visible()).toBe(false);expect(window.lastCalculatedRoute).toBe(route);expect(options).toBe(currentOptions);expect(statuses.length).toBe(statusCount);
 await jest.advanceTimersByTimeAsync(300);expect(previewCalls).toBe(outcome==='success'?1:0);expect(jest.getTimerCount()).toBe(0);
});

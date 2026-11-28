/** Actual UK Start and replacement transactions; synthetic baseline authority only. */
const fs=require('fs'),path=require('path');
const AI=require('../modules/navigation/avoidance-integrity.js');
const Plan=require('../modules/navigation/journey-plan.js');
const Policy=require('../modules/navigation/strict-route-policy.js');
const Life=require('../app/navigation-lifecycle-orchestration.js');
const Compare=require('../app/route-comparison-orchestration.js');
const Selection=require('../modules/navigation/route-selection.js');
const Reroute=require('../app/reroute-map-orchestration.js');
const Host=require('../../../prototypes/graphhopper11/host_journey_adapter.js');
const Evidence=require('../../../prototypes/graphhopper11/journey_evidence.js');
const Speed=require('../modules/navigation/speed-gps.js');
const {makeRoute,bindTransition,bindStart}=require('./fixtures/navigation-transition.cjs');
const template=fs.readFileSync(path.join(__dirname,'../../../templates/index.html'),'utf8');
let Modes,Gps,transition,calls,runtime,baseline,host,guard;
const context=()=>({graph_version:'a'.repeat(64),source_version:'b'.repeat(64),policy_version:'c'.repeat(64),request_binding:'d'.repeat(64),scope:'navigation_verified',navigation_authorized:true,issued_at_ms:Date.now()-1000,valid_until_ms:Date.now()+300000,requirements:[{category:'tolls',enabled:true,mode:'mandatory'}]});
const selected=()=>Selection.mergeNavigationRouteFromSelected(window.lastCalculatedRoute,Compare.getRouteOptions(),Compare.getSelectedRouteIndex());
beforeEach(async()=>{
 jest.useFakeTimers();localStorage.clear();
 document.body.innerHTML=['navigationEntry','journeyModeChooser','simulationControls'].map(id=>template.match(new RegExp('<section id="'+id+'"[\\s\\S]*?<\\/section>'))[0]).join('')+'<p id="routeAvoidanceNotice"></p><p id="navigationStartExplanation"></p>';
 Life.setRouteInProgress(false);Life.setRouteStarted(false);Life.setRoutePolyline(null);Life.setCurrentRouteSteps([]);
 global.VOYAGR_STRICT_ROUTING=true;global.VoyagrStrictRoutePolicy=Policy.create(context());global.VoyagrAvoidanceIntegrity=AI;global.VoyagrJourneyPlan=Plan;
 jest.isolateModules(()=>{Modes=require('../app/journey-modes.js');Gps=require('../app/gps-orchestration.js');});global.VoyagrJourneyModes=Modes;
 transition=bindTransition();calls=bindStart(transition,{setInitialETAMovementRetries:jest.fn()}).call;
 Gps.bind({m:{speedGps:()=>Speed}});Gps.acceptOriginPosition({timestamp:Date.now(),coords:{latitude:53,longitude:-1,accuracy:5}});
 runtime={selected,options:Compare.getRouteOptions,setOptions:Compare.setRouteOptions,index:Compare.getSelectedRouteIndex,setIndex:Compare.setSelectedRouteIndex,
  map:()=>transition.map,helpers:()=>transition.mapHelpers,showStatus:transition.status,isLive:Life.getRouteInProgress,progressIndex:Life.getLastSnappedRouteIndex,activeGeometry:Life.getRoutePolyline,
  stopLive:()=>Life.stopTurnByTurnNavigation(),startLive:jest.fn((route,options)=>Life.startTurnByTurnNavigation(route,options)),stopGps:jest.fn(),getFix:Gps.getAcceptedOriginFix,
  buildRequest:jest.fn(()=>({avoid_caz:false})),fetch:jest.fn(()=>{throw Error('No engine request permitted in this boundary test');})};
 Modes.bind(runtime);global.VoyagrServiceWorkerOrchestration={getUpdatePending:()=>false};
 baseline=makeRoute('synthetic-authorized-baseline');baseline.navigation_allowed=true;baseline.routing_context={...context(),checked_at_ms:Date.now()};
 baseline.journey_context={version:1,purpose:'planning',origin:{kind:'searched',coordinates:[53,-1]},destination:{kind:'searched',coordinates:[53.01,-1]},ordered_stops:[]};
 window.lastCalculatedRoute=baseline;Compare.setRouteOptions([baseline]);Compare.setSelectedRouteIndex(0);Modes.onPreview();
 expect(await Modes.startNavigation()).toBe(true);expect(Modes.getState()).toBe('LIVE');expect(Life.getRouteInProgress()).toBe(true);
 host=Host.create({owner:{capture:()=>({owner:'guest',epoch:0}),current:token=>token.owner==='guest'&&token.epoch===0},modes:Modes,lifecycle:Life,gps:Gps,eventTarget:window});
 guard=Evidence.create({...host,validator:Speed});
});
afterEach(()=>{
 host?.close();guard?.close();Modes.exit();Life.setRouteInProgress(false);Life.setRouteStarted(false);AI.invalidate();
 jest.clearAllTimers();jest.useRealTimers();jest.restoreAllMocks();
 for(const name of ['VOYAGR_STRICT_ROUTING','VoyagrStrictRoutePolicy','VoyagrJourneyModes','VoyagrJourneyPlan','VoyagrGpsOrchestration','VoyagrServiceWorkerOrchestration'])delete global[name];
});
function preview(id='gh11-preview'){
 const route=makeRoute(id,[[53,-1],[53.004,-1.002],[53.01,-1]]);
 route.source='GraphHopper 11.1 isolated preview';route.navigation_allowed=false;route.automatic_selection_allowed=false;
 route.routing_context={graph_version:'a'.repeat(64),source_version:'b'.repeat(64),policy_version:'c'.repeat(64),request_binding:'d'.repeat(64),scope:'selected_fixture_graph_checks_only'};
 route.avoidance_assessment.status='UNVERIFIED';route.avoidance_assessment.requirements.forEach(rule=>{rule.status='UNVERIFIED';});
 route.avoidance_assessment.automatic_selection_allowed=false;route.avoidance_assessment.claim='selected_fixture_graph_checks_only';
 route.leg_geometry_ranges=[{leg_index:0,begin_shape_index:0,end_shape_index:1,preview_only:true},{leg_index:1,begin_shape_index:1,end_shape_index:2,preview_only:true}];
 return route;
}
function retained(before,persisted){
 expect(transition.snapshot()).toBe(before);expect(Modes.getState()).toBe('LIVE');expect(Life.getRouteInProgress()).toBe(true);
 expect(calls.persistActiveRoute).toHaveBeenCalledTimes(persisted);expect(runtime.startLive).toHaveBeenCalledTimes(1);expect(runtime.fetch).not.toHaveBeenCalled();
 expect(guard.current(guard.capture())).toBe(true);
}
test('real explicit Start establishes the synthetic baseline and an unmocked LIVE host context',()=>{
 expect(runtime.startLive).toHaveBeenCalledTimes(1);expect(calls.persistActiveRoute).toHaveBeenCalledTimes(1);
 expect(selected().id).toBe('synthetic-authorized-baseline');expect(guard.current(guard.capture())).toBe(true);
});
test.each(['primary','forged_permission','saved_restore','missing_leg_evidence','changed_rules'])('GH11 %s cannot start or reroute over the active journey',kind=>{
 const candidate=preview();
 if(kind==='forged_permission')candidate.navigation_allowed=true;
 if(kind==='saved_restore')candidate.navigation_resume_requires_fresh_gps=true;
 if(kind==='missing_leg_evidence')delete candidate.leg_geometry_ranges;
 if(kind==='changed_rules')candidate.avoidance_assessment.requirements=[];
 const before=transition.snapshot(),persisted=calls.persistActiveRoute.mock.calls.length;
 expect(Life.startTurnByTurnNavigation(candidate,kind==='saved_restore'?{fromPersistedResume:true}:undefined)).toBe(false);
 expect(Reroute.updateRouteOnMap(candidate)).toMatchObject({ok:false});retained(before,persisted);
});
test('each of three preview alternatives is refused without changing live geometry or selection',()=>{
 const alternatives=[preview('one'),preview('two'),preview('three')];Compare.setRouteOptions([selected(),...alternatives]);
 const before=transition.snapshot(),persisted=calls.persistActiveRoute.mock.calls.length;
 for(let i=1;i<=3;i++){expect(Compare.selectRoute(i)).toBe(false);expect(Compare.useRoute(i)).toBe(false);retained(before,persisted);}
});
test('offline preview replacement cannot use cached claims to displace the active journey',()=>{
 const candidate=JSON.parse(JSON.stringify(preview()));jest.spyOn(navigator,'onLine','get').mockReturnValue(false);
 const before=transition.snapshot(),persisted=calls.persistActiveRoute.mock.calls.length;
 expect(Reroute.updateRouteOnMap(candidate)).toMatchObject({ok:false});retained(before,persisted);
});
test('a GPS replacement request cannot promote the isolated preview into the live owner transaction',async()=>{
 const before=transition.snapshot(),persisted=calls.persistActiveRoute.mock.calls.length;
 expect(await Life.startTurnByTurnNavigation(preview(),{gpsReplacement:true})).toBe(false);retained(before,persisted);
});
test('the same active-preview refusal holds without the isolated strict bootstrap',()=>{
 delete global.VOYAGR_STRICT_ROUTING;delete global.VoyagrStrictRoutePolicy;
 const candidate=preview(),before=transition.snapshot(),persisted=calls.persistActiveRoute.mock.calls.length;
 expect(Life.startTurnByTurnNavigation(candidate)).toBe(false);expect(Reroute.updateRouteOnMap(candidate)).toMatchObject({ok:false});retained(before,persisted);
});
test('a legitimate current-route redraw is still accepted',()=>{
 const id=window.lastCalculatedRoute.id,persisted=calls.persistActiveRoute.mock.calls.length;
 expect(Life.startTurnByTurnNavigation(window.lastCalculatedRoute)).toBe(true);expect(window.lastCalculatedRoute.id).toBe(id);
 expect(Modes.getState()).toBe('LIVE');expect(Life.getRouteInProgress()).toBe(true);expect(calls.persistActiveRoute).toHaveBeenCalledTimes(persisted);
});

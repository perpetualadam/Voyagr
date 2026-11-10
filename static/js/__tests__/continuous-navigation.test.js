// Accepted device fixes through production GPS, marker/follow planners and ETA DOM rendering.
let GPS,RG,Summary,SG,state,runtime,deliver,roadState,unit,oldClear;
const BASE=1800000000000;
function read(lat,lon=-1,accuracy=5,speed=10){jest.advanceTimersByTime(1000);deliver({timestamp:Date.now(),coords:{latitude:lat,longitude:lon,accuracy,speed,heading:0}});}
beforeEach(()=>{
 jest.resetModules();jest.useFakeTimers();jest.setSystemTime(BASE);localStorage.clear();delete global.VoyagrJourneyModes;
 GPS=require('../app/gps-orchestration');RG=require('../modules/navigation/route-geometry');SG=require('../modules/navigation/speed-gps');Summary=require('../app/journey-summary-orchestration');
 state={routeInProgress:true,routePolyline:[[53,-1],[53.01,-1],[53.02,-1]],currentRouteSteps:[{type:1,instruction:'Continue north',begin_shape_index:0,end_shape_index:2}],currentStepIndex:0,lastSnappedRouteIndex:0,voiceAnnouncementsEnabled:true,announcedTurnThresholds:new Set(),announcedExitThresholds:new Set(),announcedKeepThresholds:new Set(),zoomAndFollowEnabled:true,mapFollowingActive:true};
 state.map={getBearing:()=>0,easeTo:jest.fn(),getContainer:()=>({clientWidth:400,clientHeight:800}),getCanvas:()=>({clientWidth:400,clientHeight:800})};
 window.lastCalculatedRoute={id:'selected',polyline:state.routePolyline,destination:'53.02,-1',duration_minutes:20};roadState='UNKNOWN';unit='mi';
 global.VoyagrRoadMatching=require('../modules/navigation/road-matching');global.VoyagrRoadMatchOrchestration={observe:()=>roadState==='THROW'?(()=>{throw Error('unavailable');})():({context_available:true,evidence_status:roadState==='OFF_ROUTE'?'PROBABLE':'UNMATCHED',attributes_allowed:roadState==='OFF_ROUTE',route_relation:roadState==='OFF_ROUTE'?'DIFFERENT':'UNVERIFIED',match_timestamp_ms:Date.now(),source_acquired_at_ms:Date.now()}),invalidate:()=>{}};
 document.body.innerHTML='<div id="journeySummaryBar" style="display:none"><span id="remainingDistance"></span><span id="remainingTime"></span><span id="etaTime"></span></div>';
 Summary.bind({eta:()=>require('../modules/navigation/eta'),routeGeometry:()=>RG,movementDetection:()=>require('../modules/navigation/movement-detection'),units:()=>require('../modules/navigation/units'),getTrackingHistory:()=>GPS.getTrackingHistory(),getRouteInProgress:()=>state.routeInProgress,getRoutePolyline:()=>state.routePolyline,getCurrentLat:()=>state.currentLat,getCurrentLon:()=>state.currentLon,getLastSnappedRouteIndex:()=>state.lastSnappedRouteIndex,getDistanceUnit:()=>unit,call:{applyTrafficRatioToBaseRemaining:x=>x}});
 runtime=require('./fixtures/gps-presentation.cjs').completeGpsRuntime({g:k=>state[k],s:(k,v)=>{state[k]=v;},m:{speedGps:()=>SG,routeGeometry:()=>RG,rerouteDecision:()=>require('../modules/navigation/reroute-decision')},call:{getAutoRerouteOnDeviationEnabled:()=>false,getDistanceUnit:()=>unit,showStatus:jest.fn(),sendNotification:jest.fn(),updateJourneySummaryBar:()=>Summary.updateJourneySummaryBar(),detectUpcomingTurn:()=>({direction:'straight',distance:100,type:1,maneuverIndex:0}),getTurnDirectionText:()=> 'Continue straight'}});
 GPS.bind(runtime);oldClear=navigator.geolocation.clearWatch;navigator.geolocation.clearWatch=jest.fn();navigator.geolocation.watchPosition=jest.fn(ok=>{deliver=ok;return 26;});GPS.ensureGPSTracking({forceRestart:true,documentVisible:true});
});
afterEach(()=>{Summary.hideJourneySummaryBar();GPS.clearRerouteFailureRetries();jest.clearAllTimers();jest.useRealTimers();jest.restoreAllMocks();navigator.geolocation.clearWatch=oldClear;delete window.lastCalculatedRoute;delete global.VoyagrRoadMatching;delete global.VoyagrRoadMatchOrchestration;delete global._turnInstructions;delete global.updateLaneGuidance;delete global.VoyagrSmartZoomOrchestration;});
test.each(['UNKNOWN','OFF_ROUTE','THROW'])('%s road enrichment cannot freeze coordinates, marker, follow camera, turns or countdown',kind=>{
 roadState=kind;read(53.001,-1.001);const first=GPS.getSmoothDisplayLat();read(53.004,-1.001);const second=GPS.getSmoothDisplayLat();
 expect(state.currentLat).toBe(53.004);expect(state.currentLon).toBe(-1.001);expect(second).toBeGreaterThan(first);expect(runtime.marker.setLngLat).toHaveBeenCalled();expect(state.map.easeTo).toHaveBeenCalled();expect(runtime.call.updateTurnWidgetFromPosition).toHaveBeenLastCalledWith(53.004,-1.001,expect.any(Object));
 expect(document.getElementById('journeySummaryBar').style.display).toBe('flex');expect(document.getElementById('remainingDistance').textContent).toMatch(/mi/);expect(document.getElementById('remainingTime').textContent).not.toBe('');expect(document.getElementById('etaTime').textContent).not.toBe('');expect(GPS.getNavigationRemainingDistanceMeters(53.004,-1.001)).toBeLessThan(RG.totalPolylineLengthMeters(state.routePolyline));
 expect(runtime.call.showStatus).not.toHaveBeenCalledWith(expect.stringMatching(/paused/),'warning');
});
test.each(['mi','km'])('%s countdown decreases with GPS progress and does not reset at a stop',selectedUnit=>{
 unit=selectedUnit;read(53.001);const first=document.getElementById('remainingDistance').textContent;const firstTime=document.getElementById('remainingTime').textContent;read(53.01);const next=document.getElementById('remainingDistance').textContent;
 expect(parseFloat(next)).toBeLessThan(parseFloat(first));expect(document.getElementById('remainingTime').textContent).not.toBe(firstTime);expect(next).toMatch(selectedUnit==='mi'?/mi/:/km/);
 jest.advanceTimersByTime(60000);read(53.01,-1,5,0);expect(document.getElementById('remainingDistance').textContent).toBe(next);
});
test('coarse GPS still moves the observed marker without snapping it onto a supposed road',()=>{
 read(53.002,-1.001,500);read(53.003,-1.001,900);expect(state.currentLat).toBe(53.003);expect(GPS.getLastGpsFixAtMs()).toBe(Date.now());expect(GPS.resolveGpsRouteSnapForTick(53.003,-1.001,10)).toBeNull();expect(runtime.marker.setLngLat).toHaveBeenCalled();
});
test('invalid or stale readings cannot fabricate movement or reset the displayed journey',()=>{
 read(53.005);const coords=runtime.marker.setLngLat.mock.calls.length;const distance=document.getElementById('remainingDistance').textContent;
 deliver({timestamp:Date.now()-20000,coords:{latitude:54,longitude:-2,accuracy:5}});deliver({timestamp:Date.now()+1,coords:{latitude:NaN,longitude:-2,accuracy:5}});
 expect(state.currentLat).toBe(53.005);expect(runtime.marker.setLngLat).toHaveBeenCalledTimes(coords);expect(document.getElementById('remainingDistance').textContent).toBe(distance);expect(state.routeInProgress).toBe(true);
});
test('restores a hidden summary for active navigation and leaves it hidden after ending',()=>{
 read(53.005);Summary.hideJourneySummaryBar();Summary.updateJourneySummaryBar();expect(document.getElementById('journeySummaryBar').style.display).toBe('flex');state.routeInProgress=false;Summary.hideJourneySummaryBar();Summary.updateJourneySummaryBar();expect(document.getElementById('journeySummaryBar').style.display).toBe('none');
});

let GPS,RD,SG,RG,RM,state,deliver,geoError,classification,originalClear,originalFetch;
const BASE=1800000000000;
function position(time=Date.now(),accuracy=5){return {timestamp:time,coords:{latitude:53.005,longitude:-1.003,accuracy,speed:5,heading:0}};}
beforeEach(()=>{
 jest.resetModules();jest.useFakeTimers();jest.setSystemTime(BASE);localStorage.clear();delete global.VoyagrJourneyModes;
 GPS=require('../app/gps-orchestration');RD=require('../modules/navigation/reroute-decision');SG=require('../modules/navigation/speed-gps');RG=require('../modules/navigation/route-geometry');RM=require('../modules/navigation/road-matching');
 state={routeInProgress:true,routePolyline:[[53,-1],[53.02,-1]],lastSnappedRouteIndex:0,deviationStartTimeCheck:BASE-10000,deviationOffRouteStreak:3,routeJoinConfirmedForDeviation:true,lastRerouteTime:123,lastRerouteAttemptTime:456,postRerouteGraceUntil:0,rerouteInProgress:false,rerouteAttemptCount:0,rerouteFailureRetryCount:0};
 window.lastCalculatedRoute={id:'active',geometry:state.routePolyline,destination:'53.02,-1',source:'GraphHopper'};
 classification='OFF_ROUTE';global.VoyagrRoadMatching=RM;global.VoyagrRoadMatchOrchestration={observe:()=>({context_available:true,evidence_status:classification==='OFF_ROUTE'?'PROBABLE':'UNMATCHED',attributes_allowed:classification==='OFF_ROUTE',route_relation:classification==='OFF_ROUTE'?'DIFFERENT':'UNVERIFIED',match_timestamp_ms:Date.now(),source_acquired_at_ms:Date.now()}),invalidate:()=>{}};
 GPS.bind({g:k=>state[k],s:(k,v)=>{state[k]=v;},m:{speedGps:()=>SG,rerouteDecision:()=>RD,routeGeometry:()=>RG},call:{showStatus:()=>{},getAutoRerouteOnDeviationEnabled:()=>true,getDistanceUnit:()=> 'km',sendNotification:()=>{},resolveNavigationDestination:()=> '53.02,-1',buildRouteRequest:()=>({start:'53.005,-1.003',end:'53.02,-1'})}});
 originalClear=navigator.geolocation.clearWatch;navigator.geolocation.clearWatch=()=>{};
 navigator.geolocation.watchPosition=jest.fn((ok,error)=>{deliver=ok;geoError=error;return 19;});
 originalFetch=global.fetch;global.fetch=jest.fn(async()=>({json:async()=>({success:false})}));
 GPS.ensureGPSTracking({forceRestart:true,documentVisible:true});
});
afterEach(()=>{jest.clearAllTimers();jest.useRealTimers();jest.restoreAllMocks();navigator.geolocation.clearWatch=originalClear;global.fetch=originalFetch;delete global.VoyagrRoadMatching;delete global.VoyagrRoadMatchOrchestration;delete window.lastCalculatedRoute;});
function seed(){state.deviationStartTimeCheck=BASE-10000;state.deviationOffRouteStreak=3;}
function expectReset(){expect(state.deviationStartTimeCheck).toBeNull();expect(state.deviationOffRouteStreak).toBe(0);expect(state.lastRerouteTime).toBe(123);expect(state.lastRerouteAttemptTime).toBe(456);expect(state.routeJoinConfirmedForDeviation).toBe(true);expect(state.lastSnappedRouteIndex).toBe(0);}
test('watch restart clears only confirmation history, preserving cooldown, join and progress',()=>{expectReset();expect(global.fetch).not.toHaveBeenCalled();});
test.each(['stale','invalid','inaccurate'])('%s fix clears the old confirmation without moving the last reliable position',kind=>{
 seed();GPS.setLastGpsFixAtMs(BASE-1000);const p=position();if(kind==='stale')p.timestamp=BASE-20000;if(kind==='invalid')p.coords.latitude=NaN;if(kind==='inaccurate')p.coords.accuracy=200;
 deliver(p);expectReset();expect(GPS.getLastGpsFixAtMs()).toBe(BASE-1000);expect(global.fetch).not.toHaveBeenCalled();
});
test('unknown road association clears confirmation; recovered known deviation starts with one reading',()=>{
 seed();classification='UNKNOWN';deliver(position());expectReset();classification='OFF_ROUTE';jest.advanceTimersByTime(1000);deliver(position());
 expect(state.deviationOffRouteStreak).toBe(1);expect(state.deviationStartTimeCheck).toBeNull();expect(global.fetch).not.toHaveBeenCalled();
});
test('continuous known off-route evidence still reaches the normal dwell and fetch',async()=>{
 for(let i=0;i<=12;i++){if(i)jest.advanceTimersByTime(1000);deliver(position());}
 expect(global.fetch).toHaveBeenCalledTimes(1);expect(state.rerouteInProgress).toBe(true);
 for(let i=0;i<8;i++)await Promise.resolve();
});
test('watch error clears old evidence before retrying location acquisition',()=>{seed();geoError({code:2,message:'unavailable'});expectReset();expect(global.fetch).not.toHaveBeenCalled();});
test('a silent gap longer than the existing freshness window starts a new confirmation episode',()=>{
 deliver(position());seed();jest.advanceTimersByTime(16000);deliver(position());expect(state.deviationOffRouteStreak).toBe(1);expect(state.deviationStartTimeCheck).toBeNull();expect(global.fetch).not.toHaveBeenCalled();
});
test('untrusted deviation accuracy clears helper history without changing attempt timestamps',()=>{
 const r=RD.decideRouteDeviation({autoRerouteEnabled:true,hasRoute:true,remainingToDest:5000,accuracy:100,minDistance:200,routeJoinConfirmed:true,deviationStartTime:BASE-20000,offRouteStreak:4,lastRerouteTime:123,lastRerouteAttemptTime:456,now:BASE});
 expect(r.action).toBe('untrusted-accuracy');expect(r.offRouteStreak).toBe(0);expect(r.deviationStartTime).toBeNull();expect(r.lastRerouteAttemptTime).toBe(456);expect(r.shouldReroute).toBe(false);
});

test('a fresh but delayed receiver reading after a silent gap cannot borrow old confirmation time',()=>{
 deliver(position());seed();jest.advanceTimersByTime(16000);deliver(position(Date.now()-10000));
 expect(state.deviationOffRouteStreak).toBe(1);expect(state.deviationStartTimeCheck).toBeNull();expect(global.fetch).not.toHaveBeenCalled();
});

test('unknown geometry association also clears the window before a known off-route reading',()=>{
 delete global.VoyagrRoadMatchOrchestration;seed();deliver(position(Date.now(),50));expectReset();
 jest.advanceTimersByTime(1000);deliver(position());expect(state.deviationOffRouteStreak).toBe(1);expect(state.deviationStartTimeCheck).toBeNull();expect(global.fetch).not.toHaveBeenCalled();
});
test('known geometry-only off-route readings still accumulate to a reroute',async()=>{
 delete global.VoyagrRoadMatchOrchestration;
 for(let i=0;i<=12;i++){if(i)jest.advanceTimersByTime(1000);deliver(position());}
 expect(global.fetch).toHaveBeenCalledTimes(1);for(let i=0;i<8;i++)await Promise.resolve();
});

test('watch restart preserves nonzero navigation progress and outstanding visits',()=>{
 state.lastSnappedRouteIndex=1;state.remainingVisits=[{name:'Unfinished stop'}];const visits=state.remainingVisits;seed();
 GPS.ensureGPSTracking({forceRestart:true,documentVisible:true});expect(state.lastSnappedRouteIndex).toBe(1);expect(state.remainingVisits).toBe(visits);
 expect(state.deviationStartTimeCheck).toBeNull();expect(state.deviationOffRouteStreak).toBe(0);expect(state.lastRerouteAttemptTime).toBe(456);
});

test('a confirmed new deviation after success fetches at 31 seconds and clears grace before the trigger',async()=>{
 state.lastRerouteTime=BASE;state.lastRerouteAttemptTime=BASE;state.postRerouteGraceUntil=BASE+90000;
 for(let i=0;i<=30;i++){if(i)jest.advanceTimersByTime(1000);deliver(position());}
 expect(global.fetch).not.toHaveBeenCalled();expect(state.postRerouteGraceUntil).toBe(BASE+90000);
 jest.advanceTimersByTime(1000);deliver(position());expect(global.fetch).toHaveBeenCalledTimes(1);expect(state.postRerouteGraceUntil).toBe(0);expect(state.lastRerouteAttemptTime).toBe(BASE+31000);
 // A duplicate tick while this request is unresolved cannot start another one.
 jest.advanceTimersByTime(1000);deliver(position());expect(global.fetch).toHaveBeenCalledTimes(1);
 for(let i=0;i<8;i++)await Promise.resolve();
 // The normal first failure retry remains allowed after confirmed grace exit.
 jest.advanceTimersByTime(4000);expect(global.fetch).toHaveBeenCalledTimes(2);
 for(let i=0;i<8;i++)await Promise.resolve();
});
test('a direct request inside grace stays suppressed until new evidence confirms deviation',async()=>{
 state.postRerouteGraceUntil=BASE+90000;await GPS.triggerAutomaticRerouteWithHazardHandling(53.005,-1.003);
 expect(global.fetch).not.toHaveBeenCalled();expect(state.postRerouteGraceUntil).toBe(BASE+90000);
});

test('uncertainty inside grace requires a fresh full confirmation even after debounce has elapsed',async()=>{
 state.lastRerouteTime=BASE;state.lastRerouteAttemptTime=BASE;state.postRerouteGraceUntil=BASE+90000;
 for(let i=0;i<3;i++){if(i)jest.advanceTimersByTime(1000);deliver(position());}
 jest.advanceTimersByTime(19000);classification='UNKNOWN';deliver(position());classification='OFF_ROUTE';
 for(let elapsed=22;elapsed<=33;elapsed++){jest.advanceTimersByTime(1000);deliver(position());}
 expect(global.fetch).not.toHaveBeenCalled();expect(state.postRerouteGraceUntil).toBe(BASE+90000);
 jest.advanceTimersByTime(1000);deliver(position());expect(global.fetch).toHaveBeenCalledTimes(1);expect(state.postRerouteGraceUntil).toBe(0);
 for(let i=0;i<8;i++)await Promise.resolve();
});

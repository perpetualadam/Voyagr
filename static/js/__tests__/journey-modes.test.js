const AI=require('../modules/navigation/avoidance-integrity.js');
const Plan=require('../modules/navigation/journey-plan.js');
const Life=require('../app/navigation-lifecycle-orchestration.js');
const Compare=require('../app/route-comparison-orchestration.js');
const RS=require('../modules/navigation/route-selection.js');
const Sharing=require('../modules/navigation/route-sharing.js');
const {makeRoute,bindTransition,bindStart}=require('./fixtures/navigation-transition.cjs');
const fs=require('fs'),path=require('path');
const template=fs.readFileSync(path.join(__dirname,'../../../templates/index.html'),'utf8');
let Modes,context,runtime,calls,fix,locations,markerEl;
function position(lat=53,accuracy=5,stamp=Date.now()){return {timestamp:stamp,coords:{latitude:lat,longitude:-1,accuracy}};}
function contextFor(route){return {version:1,purpose:'planning',origin:{kind:'searched',coordinates:[53,-1]},destination:{kind:'searched',coordinates:Plan.coordinate(route.destination)},ordered_stops:[]};}
function selected(){return RS.mergeNavigationRouteFromSelected(window.lastCalculatedRoute,Compare.getRouteOptions(),Compare.getSelectedRouteIndex());}
function preview(route){window.lastCalculatedRoute=route;Compare.setRouteOptions([route]);Compare.setSelectedRouteIndex(0);Modes.onPreview();}
function response(route=makeRoute('newGPS')){route.journey_context=contextFor(route);return {ok:true,json:async()=>({success:true,routes:[route]})};}
beforeEach(()=>{
    localStorage.clear();jest.useFakeTimers();
    document.body.innerHTML='<div id="map"></div>'+template.match(/<section id="journeyModeChooser"[\s\S]*?<\/section>/)[0]+template.match(/<section id="simulationControls"[\s\S]*?<\/section>/)[0];
    Life.setRouteInProgress(false);Life.setRouteStarted(false);Life.setRoutePolyline(null);Life.setCurrentRouteSteps([]);
    global.VoyagrJourneyModes=undefined;global.VoyagrJourneyPlan=Plan;global.VoyagrAvoidanceIntegrity=AI;
    delete require.cache[require.resolve('../app/journey-modes.js')];
    // isolateModules gives each test an independent private mode clock/epoch.
    jest.isolateModules(()=>{Modes=require('../app/journey-modes.js');});
    context=bindTransition();calls=bindStart(context,{setInitialETAMovementRetries:jest.fn()}).call;
    global.VoyagrServiceWorkerOrchestration={getUpdatePending:()=>false};
    fix=null;locations=[];
    navigator.geolocation.getCurrentPosition=jest.fn((ok,fail)=>{const p=locations.shift();p instanceof Error?fail(p):ok(p||position());});
    runtime={selected,options:Compare.getRouteOptions,setOptions:Compare.setRouteOptions,index:Compare.getSelectedRouteIndex,setIndex:Compare.setSelectedRouteIndex,
        map:()=>context.map,helpers:()=>context.mapHelpers,showStatus:context.status,isLive:Life.getRouteInProgress,progressIndex:Life.getLastSnappedRouteIndex,activeGeometry:Life.getRoutePolyline,
        stopLive:jest.fn(()=>Life.stopTurnByTurnNavigation()),startLive:jest.fn(r=>Life.startTurnByTurnNavigation(r)),stopGps:jest.fn(),getFix:()=>fix,
        acceptPosition:jest.fn(p=>{fix={lat:p.coords.latitude,lon:p.coords.longitude,accuracy:p.coords.accuracy,timestamp:p.timestamp};return true;}),
        buildRequest:jest.fn(()=>({avoid_caz:false})),fetch:jest.fn(async()=>response()),resolveDestination:jest.fn(),addStop:jest.fn(),
        simulationMarker:jest.fn(()=>{markerEl=document.createElement('i');document.body.append(markerEl);return {setLngLat:jest.fn(),remove:()=>markerEl.remove(),getElement:()=>markerEl};})};
    Modes.bind(runtime);global.VoyagrJourneyModes=Modes;
    global.VoyagrGpsOrchestration={getAcceptedOriginFix:()=>fix};
    const r=makeRoute('planned');r.journey_context=contextFor(r);preview(r);
});
afterEach(()=>{
    Modes.exit();Life.setRouteInProgress(false);Life.setRouteStarted(false);AI.invalidate();
    delete global.VoyagrJourneyModes;delete global.VoyagrJourneyPlan;delete global.VoyagrGpsOrchestration;delete global.VOYAGR_JOURNEY_PROTOCOL;delete global.VoyagrServiceWorkerOrchestration;
    jest.restoreAllMocks();jest.useRealTimers();
});

test.each(['searched','map','gps','saved','coordinates'])('planning preserves %s provenance without consulting GPS',kind=>{
    const start=document.createElement('input');start.dataset.journeySource=kind;start.value='Sheffield';
    const end=document.createElement('input');end.dataset.journeySource='searched';
    expect(Plan.requestContext({start:'53,-1',end:'53.01,-1',stops:[]},start,end)).toMatchObject({purpose:'planning',origin:{kind,coordinates:[53,-1]},destination:{kind:'searched',coordinates:[53.01,-1]}});
    expect(navigator.geolocation.getCurrentPosition).not.toHaveBeenCalled();
});
test('manual coordinate text is explicit coordinates, never presumed GPS',()=>{
    expect(Plan.endpoint({value:'53,-1',dataset:{}},'53,-1').kind).toBe('coordinates');
    expect(Plan.coordinate([true,-1])).toBeNull();
});
test('elsewhere/manual displaced origin remains inspectable and never authorizes live guidance',()=>{
    const r=selected();r.avoidance_assessment.origin_integrity.navigation_allowed=false;r.avoidance_assessment.origin_integrity.origin_displacement_m=23.7;preview(r);
    expect(Modes.choose()).toBe(true);expect(document.getElementById('journeyModeStatus').textContent).toMatch(/refused/i);
    const before={route:window.lastCalculatedRoute,polyline:Life.getRoutePolyline(),steps:Life.getCurrentRouteSteps()};
    expect(Modes.startSimulation()).toBe(true);expect(document.getElementById('simulationIndicator').hidden).toBe(false);
    expect(document.getElementById('journeyModeChooser').hidden).toBe(true);
    expect(Life.getRouteInProgress()).toBe(false);expect(Modes.liveStartPermitted(r)).toBe(false);expect(Life.startTurnByTurnNavigation(r)).toBe(false);
    jest.advanceTimersByTime(1000);expect(document.getElementById('simulationProgress').textContent).toMatch(/remaining; simulated ETA/);
    expect(window.lastCalculatedRoute).toBe(before.route);expect(Life.getRoutePolyline()).toBe(before.polyline);expect(Life.getCurrentRouteSteps()).toBe(before.steps);
    expect(runtime.acceptPosition).not.toHaveBeenCalled();expect(runtime.fetch).not.toHaveBeenCalled();expect(calls.persistCompletedTrip).not.toHaveBeenCalled();
});
test('simulation pause/resume/speed/restart and owned cleanup leave live resources intact',()=>{
    const initial=context.layers.size;expect(Modes.startSimulation()).toBe(true);const marker=runtime.simulationMarker.mock.results[0].value;
    expect(context.layers.size).toBe(initial+1);jest.advanceTimersByTime(1000);const moving=marker.setLngLat.mock.calls.at(-1);
    Modes.pause();jest.advanceTimersByTime(3000);expect(marker.setLngLat.mock.calls.at(-1)).toEqual(moving);
    expect(Modes.setSpeed(10)).toBe(true);expect(Modes.setSpeed(999)).toBe(false);expect(Modes.resume()).toBe(true);jest.advanceTimersByTime(1000);
    expect(marker.setLngLat.mock.calls.at(-1)).not.toEqual(moving);expect(Modes.restart()).toBe(true);expect(marker.setLngLat.mock.calls.at(-1)[0]).toEqual([-1,53]);
    expect(Modes.exit()).toBe(true);expect(context.layers.size).toBe(initial);expect(markerEl.isConnected).toBe(false);expect(Modes.getState()).toBe('PLANNING');
});

test('compact player exposes named icon actions and transfers keyboard focus between play and pause',()=>{
    const pause=document.getElementById('simulationPause'),resume=document.getElementById('simulationResume');
    expect(Modes.startSimulation()).toBe(true);
    expect(pause.hidden).toBe(false);expect(resume.hidden).toBe(true);
    for(const id of ['simulationPause','simulationResume','simulationRestart','simulationExit']){
        const button=document.getElementById(id);
        expect(button.getAttribute('aria-label')).toMatch(/route preview/);
        expect(button.querySelector('svg').getAttribute('aria-hidden')).toBe('true');
    }
    pause.focus();Modes.pause();
    expect(pause.hidden).toBe(true);expect(resume.hidden).toBe(false);
    expect(document.activeElement).toBe(resume);
    expect(document.getElementById('simulationState').textContent).toBe('Paused');
    Modes.resume();expect(document.activeElement).toBe(pause);
    expect(document.getElementById('simulationState').textContent).toBe('Playing');
    Modes.seek(100);
    expect(resume.disabled).toBe(true);
    expect(document.activeElement).toBe(document.getElementById('simulationRestart'));
    expect(document.getElementById('simulationState').textContent).toBe('Preview complete');
    Modes.restart();expect(pause.hidden).toBe(false);expect(pause.disabled).toBe(false);
    expect(runtime.acceptPosition).not.toHaveBeenCalled();expect(calls.persistCompletedTrip).not.toHaveBeenCalled();
});

test('compact player keeps recovery feedback outside collapsed details and disables playback until exit succeeds',()=>{
    Modes.startSimulation();context.mapHelpers.isPolylineLayerRemoved=()=>false;
    expect(Modes.exit()).toBe(false);
    const recovery=document.getElementById('simulationRecovery');
    expect(recovery.hidden).toBe(false);expect(recovery.closest('details')).toBeNull();
    expect(document.getElementById('simulationIndicator').hidden).toBe(false);
    expect(document.getElementById('simulationState').textContent).toBe('Recovery required');
    for(const id of ['simulationPause','simulationResume','simulationRestart','simulationSpeed','simulationPosition','simulationFollow'])expect(document.getElementById(id).disabled).toBe(true);
    expect(document.getElementById('simulationExit').disabled).toBe(false);
    context.mapHelpers.isPolylineLayerRemoved=()=>true;
    expect(Modes.exit()).toBe(true);expect(document.getElementById('simulationControls').hidden).toBe(true);
    expect(runtime.acceptPosition).not.toHaveBeenCalled();
});

test('route preview follows synthetic positions, supports seeking and restores the captured camera',()=>{
    const view={center:[-1.4,53.2],zoom:11,bearing:20,pitch:0};
    runtime.captureSimulationView=jest.fn(()=>view);
    runtime.moveSimulationCamera=jest.fn();runtime.restoreSimulationView=jest.fn();runtime.showSimulationMap=jest.fn();runtime.stopSimulationCamera=jest.fn();
    expect(Modes.startSimulation()).toBe(true);
    expect(runtime.moveSimulationCamera).toHaveBeenCalledWith(expect.objectContaining({lat:53,lon:-1,heading_deg:expect.any(Number)}),true);
    expect(runtime.showSimulationMap).toHaveBeenCalledTimes(1);
    expect(Modes.setSpeed(100)).toBe(true);
    expect(document.getElementById('simulationSpeed').value).toBe('100');
    expect(Modes.seek(50)).toBe(true);
    expect(document.getElementById('simulationPercent').textContent).toBe('50%');
    expect(document.getElementById('simulationTiming').textContent).toContain('100×');
    Modes.setFollow(false);runtime.moveSimulationCamera.mockClear();
    expect(runtime.stopSimulationCamera).toHaveBeenCalledTimes(1);
    Modes.pause();Modes.seek(25);jest.advanceTimersByTime(1000);
    expect(runtime.moveSimulationCamera).not.toHaveBeenCalled();
    expect(document.getElementById('simulationPercent').textContent).toBe('25%');
    Modes.setFollow(true);expect(runtime.moveSimulationCamera).toHaveBeenCalledTimes(1);
    expect(Modes.seek(100)).toBe(true);
    expect(Modes.getState()).toBe('SIMULATION_PAUSED');
    expect(document.getElementById('simulationResume').disabled).toBe(true);
    expect(document.getElementById('simulationNextTurn').textContent).toContain('preview complete');
    Modes.seek(50);expect(document.getElementById('simulationResume').disabled).toBe(false);
    expect(Modes.seek(-1)).toBe(false);expect(Modes.seek(Infinity)).toBe(false);expect(Modes.seek(101)).toBe(false);
    expect(Modes.exit()).toBe(true);expect(runtime.restoreSimulationView).toHaveBeenCalledWith(view);
    expect(runtime.stopSimulationCamera).toHaveBeenCalledTimes(2);
    expect(runtime.acceptPosition).not.toHaveBeenCalled();expect(runtime.fetch).not.toHaveBeenCalled();
    expect(calls.persistCompletedTrip).not.toHaveBeenCalled();
});

test('camera failure during preview startup cleans owned resources without entering navigation',()=>{
    const initial=context.layers.size;
    runtime.captureSimulationView=()=>({center:[-1,53],zoom:12,bearing:0,pitch:0});
    runtime.moveSimulationCamera=()=>{throw Error('Camera unavailable');};
    runtime.restoreSimulationView=jest.fn();
    expect(Modes.startSimulation()).toBe(false);
    expect(context.layers.size).toBe(initial);expect(markerEl.isConnected).toBe(false);
    expect(runtime.restoreSimulationView).toHaveBeenCalledTimes(1);
    expect(Life.getRouteInProgress()).toBe(false);expect(runtime.acceptPosition).not.toHaveBeenCalled();
});

test('backgrounding pauses playback and a failed layer cleanup does not restore over owned resources',()=>{
    runtime.captureSimulationView=()=>({center:[-1,53],zoom:12,bearing:0,pitch:0});
    runtime.moveSimulationCamera=jest.fn();runtime.restoreSimulationView=jest.fn();
    Modes.startSimulation();
    const hidden=jest.spyOn(document,'hidden','get').mockReturnValue(true);
    document.dispatchEvent(new Event('visibilitychange'));
    expect(Modes.getState()).toBe('SIMULATION_PAUSED');
    const cameraCalls=runtime.moveSimulationCamera.mock.calls.length;
    jest.advanceTimersByTime(10000);expect(runtime.moveSimulationCamera).toHaveBeenCalledTimes(cameraCalls);
    hidden.mockRestore();
    context.mapHelpers.isPolylineLayerRemoved=()=>false;
    expect(Modes.exit()).toBe(false);expect(runtime.restoreSimulationView).not.toHaveBeenCalled();
    const beforeRecovery=runtime.moveSimulationCamera.mock.calls.length;
    Modes.setSpeed(20);Modes.setFollow(true);expect(Modes.seek(50)).toBe(false);
    expect(runtime.moveSimulationCamera).toHaveBeenCalledTimes(beforeRecovery);
    context.mapHelpers.isPolylineLayerRemoved=()=>true;
    expect(Modes.exit()).toBe(true);expect(runtime.restoreSimulationView).toHaveBeenCalledTimes(1);
});

test('playback computes route-relative headings, upcoming maneuvers and the final arrival',()=>{
    const p=Plan.inspection({geometry:[[53,-1],[53.001,-1],[53.001,-.999]],duration_minutes:2,
        maneuvers:[{begin_shape_index:0,instruction:'Head north'},{begin_shape_index:1,instruction:'Turn right'},
            {begin_shape_index:2,instruction:'Arrive'}]},AI);
    const start=Plan.position(p,0),afterTurn=Plan.position(p,p.lengths[1]+1),end=Plan.position(p,p.total);
    expect(start.heading_deg).toBeCloseTo(0,1);expect(start.next_instruction).toBe('Turn right');
    expect(start.next_maneuver_m).toBeGreaterThan(100);
    expect(afterTurn.heading_deg).toBeCloseTo(90,1);expect(afterTurn.next_instruction).toBe('Arrive');
    expect(end).toMatchObject({lat:53.001,lon:-.999,complete:true,progress:1,instruction:'Arrive',next_instruction:null});
});

test('phone preview framing keeps the vehicle above playback controls without changing map padding',()=>{
    const position={lat:53,lon:-1,heading_deg:90};
    for(const height of [360,700]){
        const frame={top:0,left:0,width:360,height},panel={left:12,right:348,top:height-80-height*.45};
        const camera=Plan.previewCamera(position,true,frame,panel);
        expect(height/2+camera.offset[1]+20).toBeLessThan(panel.top);
        expect(camera).toMatchObject({center:[-1,53],bearing:90,zoom:16,pitch:45});
        expect(camera.padding).toBeUndefined();
    }
    const desktop=Plan.previewCamera(position,false,{top:0,left:0,width:1200,height:700},{left:12,right:432,top:300});
    expect(desktop.offset).toEqual([0,0]);expect(desktop.zoom).toBeUndefined();expect(desktop.pitch).toBeUndefined();
});
test('unconfirmed map cleanup blocks live mode and obtains no GPS fix',async()=>{
    Modes.startSimulation();context.mapHelpers.isPolylineLayerRemoved=()=>false;
    expect(await Modes.navigateFromGPS()).toBe(false);expect(Modes.getState()).toBe('RECOVERY_REQUIRED');expect(navigator.geolocation.getCurrentPosition).not.toHaveBeenCalled();
    context.mapHelpers.isPolylineLayerRemoved=()=>true;
});
test.each([
    {geometry_complete:false},
    {geometry:[[53,-1],[NaN,-1]]},
    {leg_geometry_ranges:[{begin_shape_index:0,end_shape_index:8}]},
    {maneuvers:[{instruction:'Turn',begin_shape_index:6}]},
])('inconsistent geometry cannot be animated: %j',patch=>{
    preview({...selected(),...patch});expect(Modes.startSimulation()).toBe(false);expect(runtime.simulationMarker).not.toHaveBeenCalled();
});
test.each([
    ['permission',Object.assign(new Error('denied'),{code:1}),/permission denied/],
    ['accuracy',position(53,80),/accuracy/],
    ['stale',position(53,5,Date.now()-20000),/stale/],
    ['invalid',position(NaN),/stale/],
])('GPS %s refuses visibly and never substitutes planned origin',async(_,p,message)=>{
    locations=[p];expect(await Modes.navigateFromGPS()).toBe(false);expect(context.status.mock.calls.at(-1)[0]).toMatch(message);
    expect(runtime.fetch).not.toHaveBeenCalled();expect(runtime.startLive).not.toHaveBeenCalled();expect(Modes.getState()).toBe('CHOOSING');
});
test('offline mode refuses fresh start and leaves simulation available',async()=>{
    jest.spyOn(navigator,'onLine','get').mockReturnValue(false);
    expect(await Modes.navigateFromGPS()).toBe(false);expect(runtime.fetch).not.toHaveBeenCalled();expect(navigator.geolocation.getCurrentPosition).not.toHaveBeenCalled();
    expect(Modes.startSimulation()).toBe(true);
});
test('fresh GPS makes a new assessed request and enters the actual lifecycle transaction',async()=>{
    const planned=selected();planned.avoidance_assessment.origin_integrity.navigation_allowed=false;preview(planned);
    expect(await Modes.navigateFromGPS()).toBe(true);
    const [url,options]=runtime.fetch.mock.calls[0],body=JSON.parse(options.body);
    expect(url).toBe('/api/route');expect(body).toMatchObject({start:'53,-1',end:'53.01,-1',force_refresh:true,is_reroute:false,journey_context:{purpose:'live_gps',origin:{kind:'gps'}},stops:[]});
    expect(navigator.geolocation.getCurrentPosition).toHaveBeenCalledTimes(2);expect(runtime.acceptPosition).toHaveBeenCalledTimes(2);
    expect(Life.getRouteInProgress()).toBe(true);expect(Modes.getState()).toBe('LIVE');expect(window.lastCalculatedRoute.id).toBe('newGPS');expect(calls.persistActiveRoute).toHaveBeenCalledTimes(1);
});
test.each(['mandatory','displacement','stale','binding'])('new GPS route %s failure cannot borrow planned assessment',async failure=>{
    const r=makeRoute('bad');if(failure==='mandatory')r.avoidance_assessment.requirements[0].status='VIOLATED';
    if(failure==='displacement')r.avoidance_assessment.origin_integrity.navigation_allowed=false;
    if(failure==='stale')r.avoidance_assessment.checked_at-=700;
    if(failure==='binding')r.avoidance_assessment.geometry_binding='invalid';
    runtime.fetch.mockResolvedValue(response(r));
    expect(await Modes.navigateFromGPS()).toBe(false);expect(runtime.startLive).not.toHaveBeenCalled();expect(Life.getRouteInProgress()).toBe(false);expect(selected().id).toBe('planned');
});
test('actual location movement over two metres after response requires another calculation',async()=>{
    locations=[position(),position(53.0001)];expect(await Modes.navigateFromGPS()).toBe(false);
    expect(context.status.mock.calls.at(-1)[0]).toMatch(/location changed/);expect(runtime.startLive).not.toHaveBeenCalled();
});
test.each(['selection','preferences','cancel'])('late response cannot overwrite newer %s',async change=>{
    let resolve;runtime.fetch.mockImplementation(()=>new Promise(r=>{resolve=r;}));
    const pending=Modes.navigateFromGPS();await Promise.resolve();await Promise.resolve();
    expect(runtime.fetch).toHaveBeenCalledTimes(1);
    if(change==='selection')preview(makeRoute('other'));
    if(change==='preferences')localStorage.setItem('pref_cameras','false');
    if(change==='cancel')Modes.exit();
    resolve(response());expect(await pending).toBe(false);expect(runtime.startLive).not.toHaveBeenCalled();expect(Life.getRouteInProgress()).toBe(false);
});
test('mode switches remove simulation resources before real authorization and stop live before simulation',async()=>{
    Modes.startSimulation();expect(await Modes.navigateFromGPS()).toBe(true);expect(markerEl.isConnected).toBe(false);expect(document.getElementById('simulationControls').hidden).toBe(true);
    expect(Modes.startSimulation()).toBe(true);expect(runtime.stopLive).toHaveBeenCalledTimes(1);expect(Life.getRouteInProgress()).toBe(false);expect(Modes.isSimulating()).toBe(true);
});
test('direct start requires an actual fresh fix at the origin and private authorization phase',async()=>{
    expect(Life.startTurnByTurnNavigation(selected())).toBe(false);expect(await Modes.startHere()).toBe(false);
    runtime.acceptPosition(position());expect(await Modes.startHere()).toBe(true);expect(Life.getRouteInProgress()).toBe(true);
});
test('new HTML with missing mode code fails closed before map mutation',()=>{
    delete global.VoyagrJourneyModes;global.VOYAGR_JOURNEY_PROTOCOL=1;
    const before=context.snapshot();expect(Life.startTurnByTurnNavigation(makeRoute())).toBe(false);expect(context.snapshot()).toBe(before);
    global.VoyagrJourneyModes=Modes;
});
test('multi-stop simulation follows all contiguous legs and live preserves remaining visit order',async()=>{
    const r=makeRoute('multi',[[53,-1],[53.001,-1],[53.002,-1],[53.01,-1]]);r.journey_context=contextFor(r);
    r.journey_context.ordered_stops=[{coordinates:[53.001,-1],kind:'map',name:'first',duration_minutes:3},{coordinates:[53.002,-1],kind:'saved',name:'second'}];
    r.leg_geometry_ranges=[{begin_shape_index:0,end_shape_index:1},{begin_shape_index:1,end_shape_index:2},{begin_shape_index:2,end_shape_index:3}];preview(r);
    const p=Plan.inspection(r,AI);expect(Plan.position(p,p.total).completedStops).toBe(2);
    expect(Plan.liveIntent(r,true,1).stops).toEqual([{lat:53.002,lon:-1,name:'second',duration:0,original_index:1,provenance:'saved'}]);
    expect(await Modes.navigateFromGPS()).toBe(true);
    expect(runtime.fetch.mock.calls[0][0]).toBe('/api/route');const b=JSON.parse(runtime.fetch.mock.calls[0][1].body);
    expect(b.stops.map(s=>s.name)).toEqual(['first','second']);expect(b.preserve_stop_order).toBe(true);expect(b.optimize_stop_order).toBe(false);
});
test('ambiguous or missing multi-stop context is refused without silently skipping visits',()=>{
    expect(()=>Plan.liveIntent({...selected(),multi_drop:true},false,0)).toThrow(/Stop order/);
    const missing={...selected(),journey_context:undefined,multi_drop:true};expect(()=>Plan.liveIntent(missing,false,0)).toThrow(/Stop order/);
    expect(()=>Plan.liveIntent({...selected(),journey_context:{destination:{coordinates:[53.01,-1]},ordered_stops:[{}]}},false,0)).toThrow(/without skipping/);
});
test('saved route retains geometry, instructions and provenance but never old permission',()=>{
    const r=selected();const restored=Sharing.buildUseSavedRoutePlan(r.id,[{...r,start:'Sheffield',end:'Doncaster'}]).lastCalculatedRoutePatch;
    expect(restored.journey_context.origin).toMatchObject({kind:'saved',source_kind:'searched'});expect(restored.maneuvers).toEqual(r.maneuvers);expect(restored.avoidance_assessment).toBeUndefined();
    expect(AI.prepareNavigationCandidate(restored)).toBeNull();expect(Plan.liveIntent(restored,false,0).destination).toBe('53.01,-1');
    expect(()=>Plan.liveIntent({...restored,journey_context:undefined},false,0)).toThrow(/Replan/);
});
test('automatic reroute preserves canonical remaining stops including pass-throughs',()=>{
    window.lastCalculatedRoute={...selected(),journey_context:{...selected().journey_context,ordered_stops:[{coordinates:[53.005,-1],kind:'map',name:'via'}]},leg_geometry_ranges:[{begin_shape_index:0,end_shape_index:1},{begin_shape_index:1,end_shape_index:2}]};
    Life.setLastSnappedRouteIndex(0);const b=AI.augment({is_reroute:true,start:'53,-1'},localStorage);
    expect(b.stops).toEqual([{lat:53.005,lon:-1,name:'via',duration:0,original_index:0,provenance:'map'}]);expect(b.via_points).toEqual([]);
});
test('template explicitly separates mode selection and live permission; worker caches both modules',()=>{
    expect(template).toContain('window.VOYAGR_JOURNEY_PROTOCOL=1');expect(template).toContain('data-journey-choose');
    expect(document.getElementById('simulationIndicator').textContent).toContain('SIMULATION — NOT LIVE GPS');
    const worker=fs.readFileSync(path.join(__dirname,'../../../service-worker.js'),'utf8');
    expect(worker).toContain('/static/js/modules/navigation/journey-plan.js');expect(worker).toContain('/static/js/app/journey-modes.js');
});

test('GPS timeout provides retry feedback and leaves live route inactive',async()=>{
    navigator.geolocation.getCurrentPosition.mockImplementation(()=>{});
    const pending=Modes.navigateFromGPS();jest.advanceTimersByTime(12000);
    expect(await pending).toBe(false);expect(context.status.mock.calls.at(-1)[0]).toMatch(/timed out.*Retry/);
    expect(runtime.fetch).not.toHaveBeenCalled();expect(Life.getRouteInProgress()).toBe(false);
});
test('route selection during GPS permission prompt cancels before provider request',async()=>{
    let callback;navigator.geolocation.getCurrentPosition.mockImplementation(ok=>{callback=ok;});
    const pending=Modes.navigateFromGPS();preview(makeRoute('newer'));callback(position());
    expect(await pending).toBe(false);expect(runtime.fetch).not.toHaveBeenCalled();expect(selected().id).toBe('newer');
});
test('production GPS start and community submit paths refuse during simulation',async()=>{
    Modes.startSimulation();
    const GPS=require('../app/gps-orchestration.js');GPS.bind({call:{showStatus:context.status}});
    expect(()=>GPS.startGPSTracking()).not.toThrow();expect(context.status.mock.calls.at(-1)[0]).toMatch(/simulation/i);
    const Report=require('../app/road-report-orchestration.js');const planner=jest.fn();Report.bind({roadReport:planner,call:{showStatus:context.status}});
    Report.openRoadReportModal();expect(await Report.submitRoadReport()).toBe(false);expect(planner).not.toHaveBeenCalled();
    expect(runtime.fetch).not.toHaveBeenCalled();
    await GPS.triggerAutomaticReroute(53,-1);await GPS.triggerAutomaticRerouteWithHazardHandling(53,-1);
    expect(()=>GPS.processNavigationHazardAlerts(53,-1)).not.toThrow();
    const before=context.snapshot();const Reroute=require('../app/reroute-map-orchestration.js');
    expect(Reroute.updateRouteOnMap(makeRoute('forbidden')).ok).toBe(false);expect(context.snapshot()).toBe(before);
});
test('actual accepted GPS storage rejects stale or invalid positions without changing tracking history',()=>{
    const GPS=require('../app/gps-orchestration.js');const SG=require('../modules/navigation/speed-gps.js');
    GPS.bind({m:{speedGps:()=>SG}});const history=GPS.getTrackingHistory();
    expect(GPS.acceptOriginPosition(position())).toBe(true);const before=GPS.getAcceptedOriginFix();
    expect(GPS.acceptOriginPosition(position(0,5,Date.now()-20000))).toBe(false);
    expect(GPS.acceptOriginPosition(position(NaN))).toBe(false);expect(GPS.getAcceptedOriginFix()).toEqual(before);expect(GPS.getTrackingHistory()).toBe(history);
});
test('GPS-selected destination and endpoint swaps retain explicit provenance',()=>{
    const Location=require('../app/location-orchestration.js');document.body.innerHTML+='<input id="start" value="Sheffield"><input id="end">';
    const start=document.getElementById('start');start.dataset.journeySource='searched';
    Location.bind({call:{showStatus:context.status}});Location.setCurrentLocation('end');
    expect(document.getElementById('end').dataset.journeySource).toBe('gps');
    // Coordinate provenance is attached to the requested endpoint, not inferred from physical proximity.
    expect(Plan.requestContext({start:'53.02,-1',end:'53,-1'},start,document.getElementById('end'))).toMatchObject({origin:{kind:'searched'},destination:{kind:'gps'}});
});

test('late auto-GPS callback cannot overwrite a newly chosen manual origin',()=>{
    const Auto=require('../app/auto-gps-orchestration.js');document.body.innerHTML+='<input id="start" value="Current Location">';
    const start=document.getElementById('start');start.dataset.lat='53';start.dataset.lon='-1';
    Auto.bind({call:{showStatus:context.status},setCurrentLat:jest.fn(),setCurrentLon:jest.fn()});
    let done;navigator.geolocation.getCurrentPosition.mockImplementation(callback=>{done=callback;});
    Auto.setAutoGpsEnabled(true);Auto.updateAutoGpsLocation();Auto.setAutoGpsEnabled(false);Auto.stopAutoGpsLocation();
    start.value='Sheffield';start.dataset.journeySource='searched';done(position(54));
    expect(start.value).toBe('Sheffield');expect(start.dataset.journeySource).toBe('searched');
    delete global.VoyagrAutoGpsOrchestration;
});

test('remaining stops cannot be taken from an alternative unrelated to active progress',async()=>{
    expect(await Modes.navigateFromGPS()).toBe(true);const active=window.lastCalculatedRoute;
    const other=makeRoute('other',[[53,-1],[53.02,-1]]);other.journey_context=contextFor(other);
    runtime.selected=()=>other;runtime.fetch.mockClear();
    expect(await Modes.navigateFromGPS()).toBe(false);expect(runtime.fetch).not.toHaveBeenCalled();expect(runtime.stopLive).not.toHaveBeenCalled();
    expect(window.lastCalculatedRoute).toBe(active);expect(context.status.mock.calls.at(-1)[0]).toMatch(/differs from active progress/);
});

test('unindexed maneuvers do not fabricate timed turn instructions',()=>{
    const r=selected();r.maneuvers=[{instruction:'Turn somewhere without shape evidence'}];
    const inspected=Plan.inspection(r,AI);expect(Plan.position(inspected,0).instruction).toMatch(/instructions unavailable/);
});

test('journey chooser displays endpoint gaps and preserves the selected planning locations',()=>{
    const route=selected();
    Object.assign(route.avoidance_assessment.origin_integrity,{
        navigation_allowed:false,status:'UNVERIFIED',reason:'material_endpoint_relocation',
        origin_displacement_m:23.651,destination_displacement_m:22.793
    });
    preview(route);
    const before=JSON.stringify(window.lastCalculatedRoute);
    expect(Modes.choose()).toBe(true);
    const message=document.getElementById('journeyModeStatus').textContent;
    expect(message).toContain('start: about 24 m');
    expect(message).toContain('destination: about 23 m');
    expect(message).toContain('separate driving arrival point');
    expect(message).toContain('actual GPS location');
    expect(JSON.stringify(window.lastCalculatedRoute)).toBe(before);
    expect(Modes.liveStartPermitted(route)).toBe(false);
    expect(runtime.fetch).not.toHaveBeenCalled();
    expect(navigator.geolocation.getCurrentPosition).not.toHaveBeenCalled();
});

test('GPS recalculation carries the explicit arrival and retained city as distinct context',async()=>{
    const route=selected();
    route.journey_context.arrival_choice={version:1,target:Plan.coordinate(route.destination),requested_destination:{coordinates:[53.5227681,-1.1335312],kind:'searched',label:'Doncaster'}};
    preview(route);
    expect(await Modes.navigateFromGPS()).toBe(true);
    const body=JSON.parse(runtime.fetch.mock.calls[0][1].body);
    expect(body.end).toBe(route.destination);
    expect(body.journey_context.arrival_choice.requested_destination.label).toBe('Doncaster');
    expect(body.journey_context.arrival_choice.target).toEqual(Plan.coordinate(route.destination));
    expect(body.journey_context.purpose).toBe('live_gps');
});

test.each(['roadside','vehicle_entrance'])('preview-only %s intent does not start GPS acquisition or replace the journey',async mode=>{
    const route=selected();route.journey_context.arrival_intent={version:1,mode,target:Plan.coordinate(route.destination)};preview(route);
    expect(await Modes.navigateFromGPS()).toBe(false);
    expect(navigator.geolocation.getCurrentPosition).not.toHaveBeenCalled();
    expect(runtime.fetch).not.toHaveBeenCalled();expect(runtime.startLive).not.toHaveBeenCalled();
    expect(context.status.mock.calls.at(-1)[0]).toContain('preview only');
});
test('default versioned intent survives the existing fresh-GPS recalculation protocol',async()=>{
    const route=selected();route.journey_context.arrival_intent={version:1,mode:'place',status:'DECLARED',target:Plan.coordinate(route.destination)};preview(route);
    expect(await Modes.navigateFromGPS()).toBe(true);
    const body=JSON.parse(runtime.fetch.mock.calls[0][1].body);
    expect(body.journey_context.arrival_intent).toEqual(route.journey_context.arrival_intent);
    expect(Life.getRouteInProgress()).toBe(true);
});
